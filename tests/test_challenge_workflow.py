import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from runner.challenge_bank import SUITE, ROOT, load_bank, validate_bank, validate_public_catalog, public_catalog, public_manifest, development_bank, write_json
from runner.challenge_scoring import PROTOCOL
from runner.challenge_offline import run_check, validate_report
from runner.challenge import grade_responses, validate_results, export_results, review_results, _safe_result_destination, main
from test_challenge_scoring import json_grader, manual_grader, review


CORRECT = '{"ratio":"2/6","members":["B","A"],"aux":false}'


def task(ident='v2-m01', sealed=False, manual=False):
    return {'id': ident, 'title': '合成评分器测试任务', 'category': 'math', 'familyId': ident,
            'pool': 'sealed' if sealed else 'development', 'difficulty': 'candidate-hard', 'status': 'uncalibrated',
            'prompt': '合成数据，仅测试评分器。返回ratio、members、aux。', 'reference': 'private-sentinel-reference' if sealed else 'ratio=1/3，members=A/B，aux=false',
            'source': {'name': '自编测试', 'url': None, 'note': 'private-sentinel-source' if sealed else '不是模型实测'},
            'rubric': ['private-sentinel-rubric' if sealed else '核心数字60分，集合30分，辅助10分'],
            'verification': {'method': 'fixture', 'notes': 'private-sentinel-notes' if sealed else '局部验证，不代表区分度', 'independentCheck': False},
            'grader': manual_grader() if manual else json_grader(),
            'fixtures': ([{'name': 'pending', 'output': '样例正文', 'expect': {'contentScore': None, 'formatPassed': True, 'strictPassed': None, 'contentState': 'pending'}},
                          {'name': 'synthetic-review', 'output': '样例正文', 'review': review(), 'expect': {'contentScore': 65, 'formatPassed': True, 'strictPassed': True, 'contentState': 'scored'}}] if manual else
                         [{'name': 'correct', 'output': CORRECT, 'expect': {'contentScore': 100, 'formatPassed': True, 'strictPassed': True, 'contentState': 'scored'}},
                          {'name': 'fence', 'output': '```json\n' + CORRECT + '\n```', 'expect': {'contentScore': 100, 'formatPassed': False, 'strictPassed': False, 'contentState': 'scored'}}])}


def bank(*tasks):
    return {'schemaVersion': 'challenge-bank-v2', 'suiteId': SUITE, 'protocolId': PROTOCOL, 'tasks': list(tasks) or [task()]}


class ChallengeWorkflowTests(unittest.TestCase):
    def test_public_projection_has_no_sealed_payload(self):
        private = bank(task(), task('v2-m07', True))
        private['tasks'][1]['extraHiddenAnswer'] = 'private-sentinel-extra'
        public = public_catalog(private)
        encoded = json.dumps(public)
        self.assertNotIn('private-sentinel', encoded)
        self.assertNotIn('fixtures', encoded)
        sealed = next(t for t in public['tasks'] if t['pool'] == 'sealed')
        for key in ('prompt', 'reference', 'grader', 'assets', 'messages'): self.assertNotIn(key, sealed)
        validate_public_catalog(public)

    def test_public_catalog_tampering_is_rejected(self):
        public = public_catalog(bank(task(), task('v2-m07', True)))
        for mutate in (lambda d: d['tasks'][1].update(prompt='leaked'), lambda d: d['tasks'][1]['verification'].update(notes='leaked'),
                       lambda d: d['counts'].update(total=999), lambda d: d['meta'].update(kind='measured')):
            changed = copy.deepcopy(public); mutate(changed)
            with self.assertRaises(ValueError): validate_public_catalog(changed)

    def test_fallback_development_bank_can_rebuild_metadata(self):
        private = bank(task(), task('v2-m07', True))
        fallback = development_bank(private)
        public = public_catalog(fallback, public_manifest(private))
        self.assertEqual(public['counts']['total'], 2)
        self.assertEqual(public['counts']['sealed'], 1)
        self.assertEqual(len(fallback['tasks']), 1)
        self.assertIn('fixtures', fallback['tasks'][0])

    def test_bank_rejects_pool_mismatch_duplicates_and_unsafe_assets(self):
        for mutate in (lambda d: d['tasks'][0].update(pool='sealed'), lambda d: d['tasks'].append(copy.deepcopy(d['tasks'][0])),
                       lambda d: d['tasks'][0].update(assets=[{'path': '../outside.py', 'content': 'text'}]),
                       lambda d: d['tasks'][0]['source'].update(url='javascript:evil'),
                       lambda d: d['tasks'][0]['source'].update(url='https://name:pass@example.test')):
            changed = bank(); mutate(changed)
            with self.assertRaises(ValueError): validate_bank(changed)
        with self.assertRaises(ValueError): validate_bank(bank(), require_complete=True)

    def test_offline_acceptance_does_not_use_network_and_redacts_sealed(self):
        private = bank(task(), task('v2-m07', True))
        with patch('socket.socket', side_effect=AssertionError('No sockets allowed')):
            report = run_check(private)
        self.assertEqual(report['summary']['fixturesChecked'], 4)
        self.assertEqual(report['summary']['passed'], 4)
        self.assertEqual(report['summary']['sealedFixtures'], 2)
        self.assertEqual(len(report['results']), 2)
        self.assertEqual(report['externalApiCalls'], 0)
        self.assertTrue(all(r['taskId'] == 'v2-m01' for r in report['results']))
        validate_report(report, private)

    def test_fixture_contract_failure_is_reported_not_erased(self):
        private = bank(); private['tasks'][0]['fixtures'][0]['expect']['contentScore'] = 90
        report = run_check(private)
        self.assertEqual(report['summary']['failed'], 1)
        self.assertFalse(report['results'][0]['passed'])

    def test_frozen_fixture_evidence_and_score_recomputation(self):
        private = bank(); original = run_check(private)
        mutations = [lambda d: d['results'][0]['assessment'].update(contentScore=90), lambda d: d['results'][0].update(passed=False),
                     lambda d: d['results'][0].update(output='{}'), lambda d: d['results'].pop(),
                     lambda d: d['summary'].update(passed=999), lambda d: d['results'][0].update(taskId='v2-m07')]
        for mutate in mutations:
            changed = copy.deepcopy(original); mutate(changed)
            with self.assertRaises(ValueError): validate_report(changed, private)

    def test_synthetic_manual_review_is_explicit(self):
        private = bank(task(manual=True)); report = run_check(private)
        self.assertTrue(report['results'][1]['assessment']['review']['synthetic'])
        self.assertEqual(report['summary']['passed'], 2)
        private['tasks'][0]['fixtures'][1]['review'].pop('synthetic')
        with self.assertRaises(ValueError): validate_bank(private)

    def test_transport_fixture_retains_request_status(self):
        private = bank()
        private['tasks'][0]['fixtures'].append({'name': 'timeout', 'output': '', 'status': 'timeout', 'expect': {'contentScore': None, 'formatPassed': False, 'strictPassed': False, 'contentState': 'not_applicable'}})
        report = run_check(private); validate_report(report, private)
        self.assertEqual(report['results'][-1]['requestStatus'], 'timeout')
        self.assertEqual(report['summary']['passed'], 3)

    def test_outputs_are_new_files_and_originals_preserved(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            target = Path(directory) / 'result.json'
            write_json(target, {'value': 1})
            with self.assertRaises(FileExistsError): write_json(target, {'value': 2})
            self.assertEqual(json.loads(target.read_text())['value'], 1)
            run_check(bank(), Path(directory) / 'acceptance')
            with self.assertRaises(FileExistsError): run_check(bank(), Path(directory) / 'acceptance')

    def test_saved_answers_import_and_safe_export(self):
        private = bank(task(), task('v2-m07', True))
        responses = {'schemaVersion': 'challenge-responses-v2', 'responses': [{'id': 'a', 'taskId': 'v2-m01', 'output': CORRECT}, {'id': 'b', 'taskId': 'v2-m07', 'output': CORRECT}]}
        result = grade_responses(private, responses); validate_results(result, private)
        self.assertEqual(result['dataKind'], 'imported')
        self.assertEqual(len(export_results(result, private)['results']), 1)
        with self.assertRaises(ValueError): _safe_result_destination(ROOT / 'dist/leak.json', result, private)
        self.assertEqual(_safe_result_destination(ROOT / 'private/local.json', result, private), ROOT / 'private/local.json')

    def test_saved_response_tampering_and_unknown_ids_rejected(self):
        private = bank()
        responses = {'schemaVersion': 'challenge-responses-v2', 'responses': [{'id': 'a', 'taskId': 'v2-m01', 'output': CORRECT}]}
        result = grade_responses(private, responses)
        result['results'][0]['assessment']['strictPassed'] = False
        with self.assertRaises(ValueError): validate_results(result, private)
        responses['responses'][0]['taskId'] = 'v2-m99'
        with self.assertRaises(ValueError): grade_responses(private, responses)

    def test_review_adds_evidence_to_new_copy_and_rejects_repeat(self):
        private = bank(task(manual=True))
        raw = {'schemaVersion': 'challenge-responses-v2', 'responses': [{'id': 'essay', 'taskId': 'v2-m01', 'output': '样例正文'}]}
        before = grade_responses(private, raw)
        after = review_results(before, private, 'essay', review())
        self.assertNotIn('review', before['results'][0]['assessment'])
        self.assertEqual(after['results'][0]['assessment']['contentScore'], 65)
        with self.assertRaises(ValueError): review_results(after, private, 'essay', review())

    def test_cli_grade_and_offline_without_paid_path(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory); bpath = root / 'bank.json'; rpath = root / 'answers.json'; output = root / 'result.json'
            write_json(bpath, bank()); write_json(rpath, {'schemaVersion': 'challenge-responses-v2', 'responses': [{'id': 'a', 'taskId': 'v2-m01', 'output': CORRECT}]})
            self.assertEqual(main(['grade', '--bank', str(bpath), '--responses', str(rpath), '--out', str(output)]), 0)
            self.assertEqual(main(['validate-results', '--bank', str(bpath), '--results', str(output)]), 0)
            self.assertEqual(main(['offline', '--bank', str(bpath), '--out', str(root / 'check')]), 0)


if __name__ == '__main__': unittest.main()
