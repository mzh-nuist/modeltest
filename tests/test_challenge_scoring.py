import copy
from pathlib import Path
import tempfile
import unittest
from runner.challenge_scoring import PROTOCOL, assess, apply_review, validate_grader, strict_json, validate_assessment


def json_grader():
    return {'version': PROTOCOL, 'kind': 'json', 'format': 'json_only',
            'checks': [{'id': 'number', 'label': '精确比率', 'path': ['ratio'], 'op': 'number', 'expected': '1/3', 'points': 60, 'critical': True},
                       {'id': 'set', 'label': '全部成员', 'path': ['members'], 'op': 'set', 'expected': ['A', 'B'], 'points': 30, 'critical': True},
                       {'id': 'aux', 'label': '辅助判断', 'path': ['aux'], 'op': 'equals', 'expected': False, 'points': 10, 'critical': False}],
            'constraints': [{'id': 'keys', 'label': '只用声明字段', 'type': 'json_keys', 'keys': ['ratio', 'members', 'aux'], 'exact': True, 'required': True}], 'criteria': []}


def manual_grader(kind='manual', fmt='text'):
    return {'version': PROTOCOL, 'kind': kind, 'format': fmt, 'checks': [],
            'constraints': [{'id': 'fence', 'label': '不带围栏', 'type': 'no_fence', 'required': True}],
            'criteria': [{'id': 'facts', 'label': '事实正确', 'points': 80, 'anchors': ['捏造结论', '关键错误', '缺重要事实', '核心正确次要缺漏', '全部事实正确'], 'criticalLevel': 3},
                         {'id': 'style', 'label': '表达', 'points': 20, 'anchors': ['不可读', '冗长', '基本可读', '清楚', '清楚简洁'], 'criticalLevel': None}]}


def review(level=3, style=1):
    return {'reviewer': 'fixture-reviewer', 'reviewedAt': '2026-10-25T00:00:00Z', 'synthetic': True,
            'items': [{'id': 'facts', 'level': level, 'evidence': '合成样例：核心事实正确，仅缺背景说明。'},
                      {'id': 'style', 'level': style, 'evidence': '合成样例：表达重复。'}]}


class ChallengeScoringTests(unittest.TestCase):
    def setUp(self):
        self.g = json_grader()
        self.correct = '{"ratio":"2/6","members":["B","A"],"aux":false}'

    def test_rational_equivalence_set_order_and_full_score(self):
        r = assess(self.correct, self.g, 'v2-m01')
        self.assertEqual(r['contentScore'], 100); self.assertTrue(r['strictPassed'])
        self.assertEqual(r['status'], 'passed'); validate_assessment(r, self.correct, self.g)

    def test_one_fence_preserves_content_but_fails_output_contract(self):
        r = assess('```json\n' + self.correct + '\n```', self.g, 'v2-m01')
        self.assertEqual(r['contentScore'], 100)
        self.assertFalse(r['formatPassed']); self.assertFalse(r['strictPassed'])
        self.assertEqual(assess('答案：' + self.correct, self.g, 'v2-m01')['contentState'], 'unscorable')

    def test_partial_credit_core_and_noncore_are_distinct(self):
        r = assess(self.correct.replace('false', '0'), self.g, 'v2-m01')
        self.assertEqual(r['contentScore'], 90); self.assertTrue(r['strictPassed'])
        r = assess(self.correct.replace('2/6', '1/2'), self.g, 'v2-m01')
        self.assertEqual(r['contentScore'], 40); self.assertFalse(r['strictPassed'])

    def test_duplicate_members_missing_and_null_do_not_pass(self):
        self.assertEqual(assess(self.correct.replace('["B","A"]', '["A","A"]'), self.g, 'v2-m01')['contentScore'], 70)
        self.assertEqual(assess('{"ratio":null,"members":[],"aux":false}', self.g, 'v2-m01')['contentScore'], 10)
        self.assertEqual(assess('{}', self.g, 'v2-m01')['contentScore'], 0)

    def test_malformed_json_is_unscorable_not_zero_or_repaired(self):
        for output in ('', '{"ratio":1,"ratio":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e400}', '{"x":9007199254740993}', '{"x":1e20}', '{"__proto__":{}}'):
            with self.subTest(output=output):
                r = assess(output, self.g, 'v2-m01')
                self.assertEqual(r['contentState'], 'unscorable'); self.assertIsNone(r['contentScore']); self.assertFalse(r['strictPassed'])

    def test_declared_tolerance_only_numeric_check(self):
        self.g['checks'][0]['absTolerance'] = .0001
        self.assertEqual(assess(self.correct.replace('"2/6"', '0.3333'), self.g, 'v2-m01')['contentScore'], 100)
        self.g['checks'][1]['absTolerance'] = .1
        with self.assertRaises(ValueError): validate_grader(self.g)

    def test_numeric_extremes_fail_safely(self):
        for value in ('1e9999999999', '1/0', ' 1/3 ', 'NaN', '1e-9999999'):
            self.assertEqual(assess(self.correct.replace('2/6', value), self.g, 'v2-m01')['contentScore'], 40)

    def test_boolean_never_numeric(self):
        self.g['checks'][0]['expected'] = 1
        self.assertEqual(assess(self.correct.replace('"2/6"', 'true'), self.g, 'v2-m01')['contentScore'], 40)

    def test_optional_constraints_report_without_gating(self):
        self.g['constraints'].append({'id': 'advice', 'label': '可选字符建议', 'type': 'contains', 'text': '不存在', 'required': False})
        r = assess(self.correct, self.g, 'v2-m01')
        self.assertTrue(r['formatPassed']); self.assertFalse(r['constraints'][-1]['passed'])

    def test_nested_keys_and_array_length_are_format_contracts(self):
        self.g['constraints'].append({'id': 'length', 'label': '恰好两个成员', 'type': 'json_length', 'path': ['members'], 'min': 2, 'max': 2, 'required': True})
        self.assertTrue(assess(self.correct, self.g, 'v2-m01')['formatPassed'])
        result = assess(self.correct.replace('["B","A"]', '["B","A","C"]'), self.g, 'v2-m01')
        self.assertFalse(result['formatPassed']); self.assertEqual(result['contentScore'], 70)
        self.assertFalse(assess(self.correct.replace('["B","A"]', '"BA"'), self.g, 'v2-m01')['formatPassed'])
        g = manual_grader(fmt='json_only')
        g['constraints'].append({'id': 'nested', 'label': '嵌套字段', 'type': 'json_keys', 'path': ['record'], 'keys': ['answer'], 'exact': True, 'required': True})
        self.assertTrue(assess('{"record":{"answer":1}}', g, 'v2-m01')['formatPassed'])
        self.assertFalse(assess('{"record":{"answer":1,"extra":2}}', g, 'v2-m01')['formatPassed'])

    def test_transport_failure_has_no_quality(self):
        for status in ('error', 'timeout', 'truncated', 'unsupported', 'skipped', 'infrastructure_error'):
            r = assess(self.correct, self.g, 'v2-m01', status)
            self.assertEqual(r['contentState'], 'not_applicable'); self.assertIsNone(r['contentScore'])
            self.assertFalse(r['strictPassed']); self.assertEqual(r['checks'], [])

    def test_manual_pending_and_five_anchor_review(self):
        g = manual_grader(); initial = assess('样例正文', g, 'v2-w01')
        self.assertIsNone(initial['contentScore']); self.assertIsNone(initial['strictPassed'])
        r = apply_review('样例正文', g, 'v2-w01', review())
        self.assertEqual(r['contentScore'], 65); self.assertTrue(r['strictPassed'])
        validate_assessment(r, '样例正文', g)
        self.assertFalse(apply_review('样例正文', g, 'v2-w01', review(2, 4))['strictPassed'])

    def test_review_cannot_hide_format_failure_or_invalid_evidence(self):
        g = manual_grader()
        self.assertFalse(apply_review('正文```围栏', g, 'v2-w01', review(4, 4))['strictPassed'])
        for mutate in (lambda r: r['items'][0].update(level=True), lambda r: r['items'][0].update(level=2.5), lambda r: r['items'][0].update(evidence=''), lambda r: r.update(reviewedAt='2026-10-25'), lambda r: r['items'][1].update(id='facts')):
            r = review(); mutate(r)
            with self.assertRaises(ValueError): apply_review('正文', g, 'v2-w01', r)

    def test_code_is_never_executed_or_unblocked_by_review(self):
        g = manual_grader('code', 'code_only')
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            target = Path(folder) / 'must-not-exist'
            code = 'from pathlib import Path\nPath(' + repr(str(target)) + ').write_text("unsafe")'
            r = assess(code, g, 'v2-c01')
            self.assertEqual(r['contentState'], 'blocked'); self.assertIsNone(r['strictPassed']); self.assertFalse(target.exists())
            with self.assertRaises(ValueError): apply_review(code, g, 'v2-c01', review(4, 4))

    def test_svg_format_is_static_structure_not_visual_quality(self):
        g = manual_grader(fmt='svg_only')
        good = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="a"/></defs><rect fill="url(#a)"/></svg>'
        r = assess(good, g, 'v2-v01')
        self.assertTrue(r['formatPassed']); self.assertEqual(r['contentState'], 'pending')
        for bad in ('<svg><script/></svg>', '<svg onload="x"/>', '<svg><use href="https://example.test/x"/></svg>', '<svg><rect style="fill:red"/></svg>', '<!DOCTYPE svg><svg/>', '<svg xmlns="urn:evil"/>'):
            self.assertFalse(assess(bad, g, 'v2-v01')['formatPassed'])

    def test_constraints_count_unicode_and_entire_text(self):
        g = manual_grader()
        g['constraints'] += [{'id': 'characters', 'label': '字符数', 'type': 'characters', 'min': 3, 'max': 3, 'required': True}, {'id': 'paragraphs', 'label': '两段', 'type': 'paragraphs', 'min': 2, 'max': 2, 'required': True}]
        self.assertTrue(assess('甲😀\n\n乙', g, 'v2-w01')['formatPassed'])
        self.assertFalse(assess('甲😀\n\n乙```', g, 'v2-w01')['formatPassed'])

    def test_each_paragraph_length_is_separate_from_manual_content(self):
        g = manual_grader()
        g['constraints'].extend([{'id': 'first-length', 'label': '第一段长度', 'type': 'paragraph_characters', 'index': 0, 'min': 2, 'max': 2, 'required': True},
                                 {'id': 'second-length', 'label': '第二段长度', 'type': 'paragraph_characters', 'index': 1, 'min': 1, 'max': 1, 'required': True}])
        correct = assess(' 甲😀 \n\n 乙 ', g, 'v2-w01')
        self.assertTrue(correct['formatPassed']); self.assertIsNone(correct['contentScore'])
        wrong = apply_review('甲\n\n乙乙', g, 'v2-w01', review(4, 4))
        self.assertEqual(wrong['contentScore'], 100); self.assertFalse(wrong['formatPassed']); self.assertFalse(wrong['strictPassed'])
        self.assertFalse(assess('甲😀', g, 'v2-w01')['formatPassed'])
        g['constraints'][-1]['index'] = True
        with self.assertRaises(ValueError): validate_grader(g)

    def test_schema_rejects_misweighted_or_ambiguous_contracts(self):
        mutations = [lambda g: g['checks'][0].update(points=59), lambda g: g['checks'][0].update(critical=1), lambda g: g['checks'][0].update(path=[True]), lambda g: g['checks'][0].update(op='eval'), lambda g: g['checks'][1].update(id='number'), lambda g: g.update(format='text'), lambda g: g.update(extra='private')]
        for mutate in mutations:
            g = json_grader(); mutate(g)
            with self.assertRaises(ValueError): validate_grader(g)

    def test_tampered_score_or_checks_rejected_on_recompute(self):
        original = assess(self.correct, self.g, 'v2-m01')
        for mutate in (lambda r: r.update(contentScore=99), lambda r: r.update(strictPassed=False), lambda r: r['checks'][0].update(earned=0), lambda r: r['constraints'][0].update(passed=False), lambda r: r.update(extra='private')):
            r = copy.deepcopy(original); mutate(r)
            with self.assertRaises(ValueError): validate_assessment(r, self.correct, self.g)

    def test_deep_or_credential_json_rejected(self):
        for text in ('{"api_key":"do-not-load"}', '[' * 45 + '0' + ']' * 45):
            with self.assertRaises(ValueError): strict_json(text)


if __name__ == '__main__': unittest.main()
