import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from scripts.audit_evidence import audit
from runner.core import ConfigError
from runner.reprocess import reprocess

ROOT=Path(__file__).resolve().parents[1]


class EvidenceAuditTests(unittest.TestCase):
    """Synthetic SSE fixture assembled around a public short-answer record; no API."""
    def setUp(self):
        data=json.loads((ROOT/'dist/data/measured.json').read_text(encoding='utf-8'))
        run=next(r for r in data['runs'] if r['status']=='success' and r['metrics']['outputTps'] is None and r['metrics']['charsPerSec'] is None)
        model=next(m for m in data['models'] if m['id']==run['modelId'])
        task=next(t for t in data['tasks'] if t['id']==run['taskId'])
        batch=next(b for b in data['batches'] if b['id']==run['batchId'])
        batch['modelIds']=[model['id']];batch['taskIds']=[task['id']]
        self.document={**data,'models':[model],'tasks':[task],'runs':[run],'batches':[batch]}
        self.raw={'runId':run['id'],'taskSha256':hashlib.sha256(task['prompt'].encode()).hexdigest(),
                  'request':{'model':model['version'].split(' · ')[0],'messages':[{'role':'user','content':task['prompt']}],
                             'max_tokens':min(model['maxOutputTokens'],task['maxOutputTokens'])},
                  'streamDone':True,'finishSeen':True,
                  'events':[{'elapsedMs':1000,'data':{'choices':[{'delta':{'content':run['output']}}]}}]}
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.path=Path(self.temporary.name)/'fixture.json'

    def save(self,raw=None):
        self.path.write_text(json.dumps(raw or self.raw),encoding='utf-8')
        return self.path

    def test_matching_fixture_yields_hashes_without_raw_text(self):
        result=audit(self.document,[self.save()])
        self.assertEqual(result['attemptedRecords'],1)
        self.assertEqual(result['successBodiesAndRatesChecked'],1)
        self.assertEqual(len(result['records'][0]['requestSha256']),64)
        self.assertNotIn('request',result['records'][0])

    def test_changed_request_alias_prompt_or_cap_blocks_audit(self):
        for field,value in [('model','other'),('messages',[{'role':'user','content':'other'}]),('max_tokens',1)]:
            with self.subTest(field=field):
                raw=copy.deepcopy(self.raw);raw['request'][field]=value
                with self.assertRaises(ValueError):audit(self.document,[self.save(raw)])

    def test_missing_duplicate_or_incomplete_evidence_blocks_audit(self):
        with self.assertRaises(ValueError):audit(self.document,[])
        path=self.save()
        with self.assertRaises(ValueError):audit(self.document,[path,path])
        raw=copy.deepcopy(self.raw);raw['streamDone']=False
        with self.assertRaises(ValueError):audit(self.document,[self.save(raw)])

    def test_fabricated_rate_cannot_pass_original_timing_audit(self):
        document=copy.deepcopy(self.document);document['runs'][0]['metrics']['outputTps']=100000
        with self.assertRaises(ValueError):audit(document,[self.save()])

    def test_reprocessing_cannot_claim_review_without_successful_raw_evidence(self):
        with self.assertRaisesRegex(ConfigError,'requires matching raw'):
            reprocess(self.document,Path(self.temporary.name))
        path=Path(self.temporary.name)/(self.raw['runId']+'.json')
        raw=copy.deepcopy(self.raw);raw['finishSeen']=False
        path.write_text(json.dumps(raw),encoding='utf-8')
        with self.assertRaisesRegex(ConfigError,'stream completion'):
            reprocess(self.document,Path(self.temporary.name))


if __name__=='__main__':unittest.main()
