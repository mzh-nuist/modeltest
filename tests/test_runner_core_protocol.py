import copy
import json
from pathlib import Path
import tempfile
import unittest
from runner.measurement import measure,validate_measurement
from runner.scoring import assess,strict_json,validate_spec
from runner.core_suite import build_suite,contract,check
from runner.core import make_plan,public_export,validate_document,ConfigError
from runner.offline_check import run_check
from runner.rubric_review import apply_review
from runner.svg_check import check_svg


class CoreScoringTests(unittest.TestCase):
    def test_numeric_equivalence_does_not_fake_format_compliance(self):
        spec=contract('number',[check('n','2/5')])
        for text in ('0.4','0.40','2/5','4e-1'):
            self.assertEqual(assess(text,spec)['status'],'passed')
        r=assess('答案：0.40',spec)
        self.assertEqual(r['assessment']['contentScore'],1)
        self.assertEqual(r['assessment']['formatState'],'failed');self.assertFalse(r['assessment']['qualified'])
        self.assertEqual(assess('可能0.4，也可能0.5',spec)['assessment']['contentScore'],0)

    def test_json_content_and_format_and_types_are_distinct(self):
        spec=contract('json',[check('value',{'n':2,'ok':False})])
        r=assess('```json\n{"n":2,"ok":false}\n```',spec)
        self.assertEqual(r['assessment']['contentScore'],1);self.assertEqual(r['status'],'failed')
        for text in ('{"n":2,"ok":0}','{"n":true,"ok":false}','{"n":"2","ok":false}','{"n":2,"ok":false,"extra":1}'):
            self.assertEqual(assess(text,spec)['assessment']['contentScore'],0)

    def test_partial_credit_and_declared_tolerance(self):
        spec=contract('json',[check('a',.25,['a'],30,.001),check('b',2,['b'],70)])
        r=assess('{"a":0.2501,"b":3}',spec)
        self.assertEqual(r['assessment']['contentScore'],.3);self.assertEqual(r['status'],'failed')

    def test_decimal_numeric_reference_and_invalid_contracts(self):
        spec=contract('number',[check('n',.4)])
        self.assertEqual(assess('0.4',spec)['status'],'passed')
        for expected in (True, '1/0', 'not-a-number', float('inf'), {'value': 1}):
            with self.subTest(expected=expected), self.assertRaises(ValueError):
                validate_spec(contract('number',[check('n',expected)]))
        bad=contract('number',[check('n',1)])
        bad['constraints']=[{'id':'output-shape','type':'contains','text':'1'}]
        with self.assertRaises(ValueError):validate_spec(bad)

    def test_strict_json_rejects_duplicate_and_nonfinite_numbers(self):
        for text in ('{"a":1,"a":2}','{"a":NaN}','{"a":Infinity}','{"a":1e9999}'):
            with self.assertRaises(ValueError):strict_json(text)

    def test_pilot_answers_pass_all_automatic_contracts(self):
        tasks,answers=build_suite();self.assertEqual(len(tasks),24)
        automatic=[t for t in tasks if t['grader']['kind']!='manual'];self.assertEqual(len(automatic),18)
        for task in tasks:
            with self.subTest(task=task['id']):
                r=assess(answers[task['id']],task['grader'])
                self.assertEqual(r['status'],'pending' if task['grader']['kind']=='manual' else 'passed')
                self.assertEqual(r['assessment']['formatState'],'passed')
        self.assertEqual(next(t for t in tasks if t['id']=='core-m01')['grader']['checks'][0]['expected'],'12')
        self.assertEqual(json.loads(answers['core-d05'])['mean'],7.6)

    def test_constraints_report_independent_failures(self):
        task=next(t for t in build_suite()[0] if t['id']=='core-i02')
        r=assess('边界保证\n边界',task['grader'])
        self.assertEqual(r['assessment']['contentState'],'not_applicable')
        failed={c['id'] for c in r['assessment']['constraints'] if not c['passed']}
        self.assertEqual(failed,{'paragraphs','length','forbidden'})

    def test_each_line_requires_one_distinct_identifier(self):
        task=next(t for t in build_suite()[0] if t['id']=='core-i03')
        valid='ID-D：核验\nID-B：输出\nID-A：输入\nID-C：计时'
        for output in (valid, valid+'\n', valid.replace('\n','\r\n')):
            with self.subTest(output=output):self.assertEqual(assess(output,task['grader'])['status'],'passed')
        invalid=[
            'ID-A ID-B ID-C ID-D\n输入\n输出\n核验',
            'ID-A\n\nID-B\nID-C\nID-D',
            'ID-A ID-B\n  \nID-C\nID-D',
            '\n'+valid,
            valid+'\n\n',
            'ID-A\nID-B\nID-C\nID-C',
        ]
        for output in invalid:
            with self.subTest(output=output):
                result=assess(output,task['grader'])
                constraint=next(c for c in result['assessment']['constraints'] if c['id']=='one-id-per-line')
                self.assertFalse(constraint['passed']);self.assertEqual(result['status'],'failed')

    def test_one_per_line_contract_requires_valid_identifier_list(self):
        for texts in (None,[],['A','A'],['A',None],['A',''],['A','   '],['A']*101):
            spec=contract('text_rules',constraints=[{'id':'lines','type':'one_per_line','texts':texts}])
            with self.subTest(texts=texts), self.assertRaises(ValueError):validate_spec(spec)
        task=next(t for t in build_suite()[0] if t['id']=='core-i03')
        document={'schemaVersion':'1.0','meta':{'kind':'catalog','title':'fixture','updatedAt':'2026-10-25','description':'offline'},
                  'models':[],'tasks':[task],'runs':[],'batches':[]}
        exported=public_export(document)
        constraint=next(c for c in exported['tasks'][0]['grader']['constraints'] if c['id']=='one-id-per-line')
        self.assertEqual(constraint['texts'],['ID-A','ID-B','ID-C','ID-D'])

    def test_incomplete_answer_keeps_ungraded_quality(self):
        task=build_suite()[0][0];r=assess('12',task['grader'],'timeout')
        self.assertIsNone(r['score']);self.assertEqual(r['status'],'not_applicable');self.assertFalse(r['assessment']['qualified'])

    def test_manual_reviews_require_every_anchored_decision(self):
        t=next(t for t in build_suite()[0] if t['id']=='core-m05')
        review={'reviewer':'fixture-reviewer','reviewedAt':'2026-10-25T00:00:00Z','items':[{'id':c['id'],'awarded':c['points'],'reason':'test-only evidence'} for c in t['grader']['criteria']]}
        r=apply_review('测试用证明正文',t['grader'],review)
        self.assertEqual(r['score'],1);self.assertTrue(r['assessment']['qualified'])
        for mutate in (lambda x:x['items'].pop(),lambda x:x['items'][0].update(awarded=29),lambda x:x['items'][0].update(reason='')):
            bad=copy.deepcopy(review);mutate(bad)
            with self.assertRaises(ValueError):apply_review('正文',t['grader'],bad)
        review['items'][1]['awarded']=0
        self.assertFalse(apply_review('正文',t['grader'],review)['assessment']['qualified'])

    def test_svg_checker_never_grades_visual_quality(self):
        self.assertTrue(check_svg('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="2" cy="2" r="1"/></svg>')['valid'])
        for svg in ('<svg><script>1</script></svg>','<svg onload="x()"/>','<svg><image href="https://example.com/a"/></svg>','<!DOCTYPE svg><svg/>','<svg><foreignObject/></svg>'):
            self.assertFalse(check_svg(svg)['valid'])


class CoreMeasurementTests(unittest.TestCase):
    def test_first_chunk_is_removed_from_tps_numerator(self):
        m=measure('success',[(1,'a'*30),(1.5,'b'*35),(2,'c'*35)],100,3,30)
        self.assertEqual(m['bodyTps'],70);self.assertAlmostEqual(m['endToEndTps'],100/3,places=5)
        self.assertEqual(m['charsPerSec'],70);self.assertEqual(m['chunkGapP95Ms'],500)
        validate_measurement(m,'success',3000)

    def test_unknown_first_chunk_never_uses_total_to_inflate_generation_rate(self):
        m=measure('success',[(1,'a'*30),(1.5,'b'*35),(2,'c'*35)],100,3)
        self.assertIsNone(m['bodyTps']);self.assertEqual(m['bodyTpsState'],'unknown_first_chunk')
        self.assertIsNotNone(m['endToEndTps']);self.assertEqual(m['charsPerSec'],70)

    def test_unknown_tokens_short_bursts_and_failure_keep_rates_unknown(self):
        chunks=[(1,'a'*40),(1.00001,'b'*40),(1.00002,'c'*40)]
        for status,tokens,first in [('success',None,None),('success',120,40),('timeout',120,40)]:
            m=measure(status,chunks,tokens,2,first);self.assertIsNone(m['bodyTps'])
            if status!='success':self.assertIsNone(m['endToEndTps']);self.assertIsNone(m['chunkGapP95Ms'])

    def test_measurement_rejects_invalid_order_and_contradictory_import(self):
        with self.assertRaises(ValueError):measure('success',[(2,'a'),(1,'b')],10,3,3)
        with self.assertRaises(ValueError):measure('success',[(1,'a')],10,3,11)
        m=measure('success',[(1,'a'*30),(1.5,'b'*35),(2,'c'*35)],100,3,30);m['bodyTps']=100
        with self.assertRaises(ValueError):validate_measurement(m,'success',3000)

    def test_measurement_availability_and_chunk_evidence_cannot_contradict(self):
        original=measure('success',[(1,'a'*30),(1.5,'b'*35),(2,'c'*35)],100,3,30)
        mutations=[{'bodyTpsState':'unknown_tokens','bodyTps':None}, {'chunkCount':None},
                   {'endToEndTps':None}, {'sampleSeconds':None}, {'chunkGapP50Ms':600},
                   {'chunkGapP95Ms':None}]
        for mutation in mutations:
            m=copy.deepcopy(original);m.update(mutation)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):validate_measurement(m,'success',3000)
        with self.assertRaises(ValueError):measure('success',[(.1,'a')],1,True,1)
        with self.assertRaises(ValueError):measure('success',[],1,1,1)

    def test_measurement_boundary_uses_serialized_time_precision(self):
        # The same public microsecond timestamps must keep eligibility stable.
        m=measure('success',[(1.123456,'a'*30),(1.4,'b'*35),(1.623456,'c'*35)],100,3,30)
        self.assertEqual(m['bodyTpsState'],'measured')
        validate_measurement(m,'success',3000)


class CoreOfflineIntegrationTests(unittest.TestCase):
    def test_actual_loopback_stream_scoring_export_and_tamper_detection(self):
        scratch=Path(__file__).resolve().parent/'.runner-tmp';scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as tmp:
            d,report=run_check(Path(tmp)/'batch',['core-m01','core-i02','core-i04','core-m05'])
            self.assertEqual(report['externalApiCalls'],0);self.assertEqual(report['runs'],12)
            self.assertEqual(report['dataKind'],'demo');self.assertEqual(report['strictTpsSamples'],2)
            self.assertEqual(validate_document(d),[])
            fmt=next(r for r in d['runs'] if r['modelId']=='fixture-format' and r['taskId']=='core-i04')
            self.assertEqual(fmt['grading']['assessment']['contentScore'],1);self.assertEqual(fmt['grading']['status'],'failed')
            bad=copy.deepcopy(d);bad['runs'][0]['grading']['assessment']['qualified']=True
            # Force a contradiction independent of shuffled model order.
            bad['runs'][0]['grading']['assessment']['formatState']='failed'
            self.assertTrue(validate_document(bad))
            for mutation in ('mirror','usage','mode','kind','missing'):
                bad=copy.deepcopy(d);r=next(r for r in bad['runs'] if r['measurement']['bodyTps'] is not None)
                if mutation=='mirror':r['metrics']['outputTps']+=1
                elif mutation=='usage':r['measurement']['visibleTokens']+=1
                elif mutation=='mode':r['provenance']['streamUsageMode']=None
                elif mutation=='kind':r['dataKind']='measured'
                else:r.pop('measurement')
                with self.subTest(mutation=mutation):self.assertTrue(validate_document(bad))
            d['runs'][0]['measurement']['privateExtension']='not public'
            self.assertNotIn('privateExtension',json.dumps(public_export(d)))
            with self.assertRaises(ConfigError):run_check(Path(tmp)/'batch',['core-m01'])


if __name__=='__main__':unittest.main()
