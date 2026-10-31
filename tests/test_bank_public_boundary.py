"""Public/source boundary checks independent from score calculations."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from runner.challenge_bank import public_catalog
from scripts.audit_challenge_assets import ensure_public_tree
from scripts.backup_challenge_private import backup


def sample_bank():
    grader={'version':'challenge-rubric-v2','kind':'json','format':'json_only','checks':[{'id':'answer','label':'answer','path':['answer'],'op':'number','expected':7,'points':100,'critical':True}], 'constraints':[],'criteria':[]}
    task={'id':'v2-m01','title':'public fixture','category':'math','familyId':'public-fixture','pool':'development','difficulty':'candidate-medium','status':'uncalibrated','prompt':'Return JSON answer=7.','reference':'7',
      'source':{'name':'local test','url':None,'note':'Synthetic boundary test, not a benchmark task.'},'rubric':['Answer correctness'], 'grader':grader,
      'verification':{'method':'test fixture','notes':'No model calls.','independentCheck':False},
      'fixtures':[{'name':'good','output':'{"answer":7}','expect':{'contentScore':100,'formatPassed':True,'strictPassed':True,'contentState':'scored'}},{'name':'bad','output':'{"answer":6}','expect':{'contentScore':0,'formatPassed':True,'strictPassed':False,'contentState':'scored'}}]}
    sealed=copy.deepcopy(task);sealed.update(id='v2-m07',familyId='sealed-fixture',pool='sealed',prompt='SYNTHETIC PRIVATE TEST PAYLOAD. '+('Unique unreleased question material. '*8),reference='SYNTHETIC PRIVATE REFERENCE. '+('Unique unreleased answer material. '*8))
    return {'schemaVersion':'challenge-bank-v2','suiteId':'zhufeng-challenge-v2','protocolId':'challenge-rubric-v2','tasks':[task,sealed]}


class PublicBoundaryTests(unittest.TestCase):
    def setUp(self):
        # Keep temporary data in the authorized workspace, not a restricted OS temp.
        parent=Path(__file__).resolve().parents[1]/'results/test-tmp';parent.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=parent);self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.bank=sample_bank()
        (self.root/'dist/data').mkdir(parents=True)
        (self.root/'dist/data/challenge.json').write_text(json.dumps(public_catalog(self.bank),ensure_ascii=False),encoding='utf-8')

    def test_public_projection_is_metadata_only_and_audits(self):
        report=ensure_public_tree(self.root,self.bank)
        self.assertEqual(report['state'],'passed');self.assertEqual(report['sealedMetadataOnly'],1)
        doc=json.loads((self.root/'dist/data/challenge.json').read_text(encoding='utf-8'))
        sealed=next(t for t in doc['tasks'] if t['pool']=='sealed')
        self.assertFalse({'prompt','reference','grader','fixtures','assets'} & set(sealed))

    def test_hidden_content_in_ordinary_asset_is_rejected(self):
        (self.root/'dist/accidental.txt').write_text(json.dumps(self.bank['tasks'][1]['prompt']),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'Sealed prompt'):ensure_public_tree(self.root,self.bank)

    def test_complete_sealed_bank_cannot_be_disguised_as_public_dataset(self):
        (self.root/'datasets').mkdir()
        (self.root/'datasets/accidental.json').write_text(json.dumps(self.bank),encoding='utf-8')
        with self.assertRaises(ValueError):ensure_public_tree(self.root,self.bank)

    def test_catalog_cannot_be_tampered_after_build(self):
        p=self.root/'dist/data/challenge.json';d=json.loads(p.read_text(encoding='utf-8'));d['tasks'][0]['reference']='tampered'
        p.write_text(json.dumps(d),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'projection'):ensure_public_tree(self.root,self.bank)

    def test_private_backup_has_separate_label_and_hashes(self):
        private=self.root/'private/challenge-v2';private.mkdir(parents=True)
        (private/'bank.json').write_text(json.dumps(self.bank),encoding='utf-8')
        target=self.root/'deliveries/bank-private.zip'
        result=backup(self.root,target)
        self.assertEqual(result['fileCount'],1);self.assertEqual(len(result['sha256']),64)
        with self.assertRaises(ValueError):backup(self.root,self.root/'dist/private.zip')
        with self.assertRaises(ValueError):backup(self.root,self.root/'public.zip')
        with self.assertRaises(FileExistsError):backup(self.root,target)


if __name__=='__main__':unittest.main()
