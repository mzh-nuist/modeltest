import base64,copy,io,json,tempfile,unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
from runner import core
from runner.checkup import ROOT
from runner.commandcode_effort_matrix import run,SELECTION,OUTPUT_CAP
from scripts.build_effort_matrix import build
from tests.test_effort_matrix import FakeGuard

class EffortExportTests(unittest.TestCase):
    def setUp(self):
        p=ROOT/'results/effort-export-tests';p.mkdir(exist_ok=True);self.tmp=tempfile.TemporaryDirectory(dir=p);self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        def request(model,task,config,cap,key,messages=None,input_image=None):
            history=copy.deepcopy(messages)
            if input_image:history[-1]['content']=[{'type':'text','text':task['prompt']},{'type':'image_url','image_url':{'url':'data:image/png;base64,'+input_image['base64']}}]
            return {'status':'success','error':None,'output':'synthetic offline fixture','metrics':{'inputTokens':100,'outputTokens':10,'reasoningTokens':0},
                '_raw':{'httpStatus':200,'reasoningOutput':'private fixture reasoning','request':{'model':model['apiModel'],'reasoning_effort':model['reasoningEffort'],'max_completion_tokens':cap,'messages':history}}}
        with redirect_stdout(io.StringIO()):run(self.root,requester=request,guard=FakeGuard(),selection=SELECTION[:1])
    def export(self):
        with patch('scripts.build_effort_matrix.SELECTION',SELECTION[:1]):return build(self.root,self.root/'public.json')
    def test_whitelist_excludes_streams_images_and_reasoning_and_rejects_wrong_effort(self):
        self.assertEqual(self.export()['requests'],39);public=(self.root/'public.json').read_text(encoding='utf8')
        for forbidden in ['reasoningOutput','private fixture reasoning','data:image/png','_raw']:self.assertNotIn(forbidden,public)
        path=self.root/SELECTION[0][0]/'low/purpose.json';raw=core.load_json(path);raw['attempts'][0]['_raw']['request']['reasoning_effort']='high';core.write_json(path,raw)
        with self.assertRaisesRegex(ValueError,'conditions'):self.export()
    def test_multi_turn_history_is_bound_to_actual_payload(self):
        path=self.root/SELECTION[0][0]/'low/memory.json';raw=core.load_json(path);raw['attempts'][1]['_raw']['request']['messages'][1]['content']='fabricated prior answer';core.write_json(path,raw)
        with self.assertRaisesRegex(ValueError,'history'):self.export()
    def test_changing_one_image_byte_invalidates_the_receipt_evidence(self):
        path=self.root/SELECTION[0][0]/'low/receipt.json';raw=core.load_json(path);block=raw['attempts'][0]['_raw']['request']['messages'][0]['content'][1]['image_url']
        image=bytearray(base64.b64decode(block['url'].split(',',1)[1]));image[-1]^=1;block['url']='data:image/png;base64,'+base64.b64encode(image).decode('ascii');core.write_json(path,raw)
        with self.assertRaisesRegex(ValueError,'original image'):self.export()
    def test_in_progress_turn_is_pending_and_not_falsely_complete(self):
        path=self.root/SELECTION[0][0]/'low/edit.json';raw=core.load_json(path);raw['attempts']=raw['attempts'][:1];raw['outputs'][1]=None;core.write_json(path,raw)
        self.export();item=core.load_json(self.root/'public.json')['models'][0]['profiles'][0]['items'][2]
        self.assertEqual(item['measurement']['status'],'incomplete');self.assertIsNone(item['score'])
