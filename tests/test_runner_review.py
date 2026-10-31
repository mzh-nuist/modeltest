import copy
import json
from pathlib import Path
import unittest
from runner.core import ConfigError, public_export, validate_document
from runner.review import review

ROOT = Path(__file__).resolve().parents[1]


class HumanReviewTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / 'dist/data/demo.json').read_text(encoding='utf-8'))
        self.run = next(r for r in self.data['runs'] if r['status'] == 'success' and r['grading']['status'] == 'pending')

    def test_review_retains_evidence_and_pending_source(self):
        before = copy.deepcopy(self.data)
        out = review(self.data, self.run['id'], 'passed', '已检查关键条件与推理过程。', 'editor')
        run = next(r for r in out['runs'] if r['id'] == self.run['id'])
        self.assertEqual(self.data, before)
        self.assertEqual(run['grading']['status'], 'passed')
        self.assertEqual(run['output'], self.run['output'])
        self.assertEqual(run['grading']['reviews'][0]['previousStatus'], 'pending')
        self.assertFalse(validate_document(out))

    def test_revision_keeps_both_decisions(self):
        a = review(self.data, self.run['id'], 'passed', '初次复核', 'editor')
        b = review(a, self.run['id'], 'failed', '复查发现遗漏必要条件', 'reviewer2')
        r = next(r for r in b['runs'] if r['id'] == self.run['id'])
        self.assertEqual(len(r['grading']['reviews']), 2)
        self.assertEqual(r['grading']['reviews'][1]['previousStatus'], 'passed')
        self.assertEqual(r['grading']['score'], 0)

    def test_failure_and_incomplete_review_are_rejected(self):
        failed = next(r for r in self.data['runs'] if r['status'] == 'error')
        for run_id, reason, alias in [(failed['id'], '理由', 'e'), (self.run['id'], '', 'e'), ('missing', '理由', 'e'), (self.run['id'], '理由', '')]:
            with self.assertRaises(ConfigError):
                review(self.data, run_id, 'passed', reason, alias)

    def test_review_export_removes_unknown_fields(self):
        a = review(self.data, self.run['id'], 'passed', '人工复核依据', 'editor')
        r = next(r for r in a['runs'] if r['id'] == self.run['id'])
        r['grading']['reviews'][0]['privateExtra'] = 'private'
        exported = public_export(a)
        self.assertNotIn('privateExtra', next(r for r in exported['runs'] if r['id'] == self.run['id'])['grading']['reviews'][0])

    def test_invalid_review_history_is_rejected(self):
        self.run['grading']['reviews'] = ['bad']
        self.assertTrue(validate_document(self.data))


if __name__ == '__main__':
    unittest.main()
