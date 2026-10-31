import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest

from runner.core import load_json, validate_document, write_json
from runner.core_audit import audit, main as audit_main
from runner.offline_check import run_check
from runner.rubric_review import main as review_main


class CoreReplayAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = Path(__file__).resolve().parent / '.runner-tmp'
        scratch.mkdir(exist_ok=True)
        cls.temporary = tempfile.TemporaryDirectory(dir=scratch)
        cls.root = Path(cls.temporary.name)
        cls.batch = cls.root / 'batch'
        cls.document, _ = run_check(cls.batch, ['core-m01', 'core-i02', 'core-i04', 'core-m05'])
        cls.raw_dir = cls.batch / 'raw'

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def run_for(self, task='core-i04', model='fixture-correct'):
        return next(r for r in self.document['runs'] if r['taskId'] == task and r['modelId'] == model)

    def reject_raw_change(self, mutate, run=None):
        run = run or self.run_for()
        path = self.raw_dir / (run['id'] + '.json')
        original = path.read_bytes()
        try:
            raw = load_json(path)
            mutate(raw)
            write_json(path, raw)
            with self.assertRaises(ValueError):
                audit(self.document, self.raw_dir)
        finally:
            path.write_bytes(original)

    def test_complete_replay_includes_http_failure_and_pending_manual(self):
        report = audit(self.document, self.raw_dir)
        self.assertEqual(report['checkedRuns'], 12)
        self.assertEqual(report['dataKind'], 'demo')
        self.assertEqual(report['externalApiCalls'], 0)
        self.assertEqual(len({r['runId'] for r in report['records']}), 12)
        self.assertNotIn(self.run_for()['output'], json.dumps(report, ensure_ascii=False))

    def test_request_prompt_alias_cap_and_stream_tampering_are_rejected(self):
        mutations = [
            lambda raw: raw['request']['messages'][0].update(content='different prompt'),
            lambda raw: raw['request'].update(model='another-model'),
            lambda raw: raw['request'].update(max_completion_tokens=7),
            lambda raw: raw['request'].update(stream=False),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                self.reject_raw_change(mutate)

    def test_response_body_usage_and_finish_tampering_are_rejected(self):
        def body(raw):
            raw['events'][0]['data']['choices'][0]['delta']['content'] += 'tampered'
        def usage(raw):
            raw['events'][-1]['data']['usage']['completion_tokens'] += 1
        def finish(raw):
            raw['events'][-1]['data']['choices'][0]['finish_reason'] = 'length'
        for mutate in (body, usage, finish, lambda raw: raw.update(finishSeen=False), lambda raw: raw.update(streamDone=False)):
            with self.subTest(mutate=mutate):
                self.reject_raw_change(mutate)

    def test_malformed_raw_fields_are_rejected_as_validation_errors(self):
        for mutate in (lambda raw: raw.update(request=[]), lambda raw: raw.update(events={}),
                       lambda raw: raw['events'][0].update(data=None)):
            with self.subTest(mutate=mutate):
                self.reject_raw_change(mutate)

    def test_raw_duration_and_first_content_timing_are_required(self):
        self.reject_raw_change(lambda raw: raw.pop('durationMs'))
        self.reject_raw_change(lambda raw: raw.update(durationMs=raw['durationMs'] + 1))
        self.reject_raw_change(lambda raw: raw['events'][0].update(elapsedMs=0))

    def test_cumulative_meter_must_match_recorded_first_chunk(self):
        self.reject_raw_change(lambda raw: raw['events'][0]['data']['usage'].update(completion_tokens=0), self.run_for('core-i02'))

    def test_http_failure_status_is_replayed(self):
        self.reject_raw_change(lambda raw: raw.update(httpStatus=401), self.run_for('core-m01', 'fixture-broken'))

    def test_public_duration_cannot_be_changed_with_its_derived_rate(self):
        changed = copy.deepcopy(self.document)
        run = next(r for r in changed['runs'] if r['id'] == self.run_for()['id'])
        run['metrics']['durationMs'] *= 2
        run['measurement']['endToEndTps'] /= 2
        self.assertEqual(validate_document(changed), [])
        with self.assertRaisesRegex(ValueError, 'duration'):
            audit(changed, self.raw_dir)

    def test_public_cost_or_assessment_tampering_is_rejected(self):
        for mutate in (lambda r: r['metrics'].update(cost=.1),
                       lambda r: r['metrics'].update(cost=None),
                       lambda r: r['grading']['assessment'].update(contentScore=.5)):
            changed = copy.deepcopy(self.document)
            run = next(r for r in changed['runs'] if r['id'] == self.run_for()['id'])
            mutate(run)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                audit(changed, self.raw_dir)

    def test_missing_raw_evidence_is_not_silently_skipped(self):
        with self.assertRaises(OSError):
            audit(self.document, self.root / 'missing')

    def test_cli_audit_writes_hash_receipt_and_never_overwrites(self):
        out = self.root / 'audit.json'
        args = [str(self.batch / 'public.json'), '--raw-dir', str(self.raw_dir), '--out', str(out)]
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(audit_main(args), 0)
            self.assertEqual(audit_main(args), 2)
        self.assertEqual(load_json(out)['checkedRuns'], 12)

    def test_review_cli_roundtrip_keeps_source_and_rejects_re_review(self):
        source = self.batch / 'public.json'
        original = source.read_bytes()
        run = self.run_for('core-m05')
        task = next(t for t in self.document['tasks'] if t['id'] == run['taskId'])
        review = {'reviewer': 'fixture-reviewer', 'items': [
            {'id': c['id'], 'awarded': 0, 'reason': '离线工作流测试：此样例没有提供该项证明。'}
            for c in task['grader']['criteria']]}
        review_file = self.root / 'review.json'
        write_json(review_file, review)
        out = self.root / 'reviewed.json'
        args = [str(source), '--run-id', run['id'], '--review', str(review_file), '--out', str(out)]
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(review_main(args), 0)
            self.assertEqual(review_main(args), 2)
            again = [str(out), '--run-id', run['id'], '--review', str(review_file), '--out', str(self.root / 'again.json')]
            self.assertEqual(review_main(again), 2)
        self.assertEqual(source.read_bytes(), original)
        reviewed = load_json(out)
        self.assertEqual(validate_document(reviewed), [])
        self.assertEqual(audit(reviewed, self.raw_dir)['checkedRuns'], 12)
        result = next(r for r in reviewed['runs'] if r['id'] == run['id'])
        self.assertEqual(result['grading']['status'], 'failed')
        self.assertEqual(result['grading']['score'], 0)
        self.assertTrue(result['grading']['rubricReview']['reviewedAt'])

    def test_review_cli_rejects_missing_criteria_and_failed_requests(self):
        review_file = self.root / 'invalid-review.json'
        write_json(review_file, {'reviewer': 'fixture-reviewer', 'items': []})
        for task, model in [('core-m05', 'fixture-correct'), ('core-m01', 'fixture-broken')]:
            run = self.run_for(task, model)
            out = self.root / ('invalid-' + task + '.json')
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(review_main([str(self.batch / 'public.json'), '--run-id', run['id'], '--review', str(review_file), '--out', str(out)]), 2)
            self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
