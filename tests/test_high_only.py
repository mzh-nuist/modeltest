import copy,io,tempfile,unittest
from pathlib import Path
from contextlib import redirect_stdout
from unittest.mock import patch
from runner import core
from runner.checkup import ROOT
from runner.commandcode_high import run,main,high_plan
from tests.test_effort_matrix import FakeGuard
from scripts.build_high_suite import build

class HighOnlyTests(unittest.TestCase):
    def setUp(self):
        p=ROOT/'results/high-only-tests';p.mkdir(exist_ok=True);self.tmp=tempfile.TemporaryDirectory(dir=p);self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
    def test_unknown_maximum_never_spends_and_every_sent_call_is_high_without_deadline(self):
        seen=[]
        plan=high_plan()
        for m in plan['models']:
            if m['modelId']!='glm53-flash':m.update(maxOutputTokens=None,limitStatus='unverified')
        def request(model,task,config,cap,key,messages=None,input_image=None):
            seen.append((model['id'],model['reasoningEffort'],cap,config['timeoutSeconds'],input_image))
            history=copy.deepcopy(messages)
            if input_image:history[-1]['content']=[{'type':'text','text':task['prompt']},{'type':'image_url','image_url':{'url':'data:image/png;base64,'+input_image['base64']}}]
            return {'status':'success','error':None,'output':'offline fixture','metrics':{'inputTokens':100,'outputTokens':20},'_raw':{'httpStatus':200,'request':{'model':model['apiModel'],'reasoning_effort':model['reasoningEffort'],'max_completion_tokens':cap,'messages':history}}}
        with redirect_stdout(io.StringIO()):run(self.root,requester=request,guard=FakeGuard(),plan=plan)
        self.assertEqual(len(seen),13);self.assertTrue(all(x[:4]==('glm53-flash','high',131072,None) for x in seen));self.assertEqual(sum(bool(x[4]) for x in seen),1)
        raw=core.load_json(self.root/'kimi-k3/high/purpose.json');self.assertEqual(raw['status'],'not_run');self.assertEqual(raw['error'],'maximum_output_limit_unverified');self.assertEqual(raw['attempts'],[])
        self.assertEqual(build(self.root,self.root/'published.json')['requests'],13)
        public=core.load_json(self.root/'published.json');self.assertTrue(all(x['score'] is None for x in public['models'][2]['items']))
        path=self.root/'glm53-flash/high/purpose.json';changed=core.load_json(path);changed['attempts'][0]['_raw']['request']['reasoning_effort']='low';core.write_json(path,changed)
        with self.assertRaisesRegex(ValueError,'not high'):build(self.root,self.root/'published.json')
    def test_zero_network_plan_and_budget_stop_before_paid_request(self):
        with patch('socket.socket',side_effect=AssertionError('offline')),redirect_stdout(io.StringIO()):self.assertEqual(main(['--out','unused']),0)
        with redirect_stdout(io.StringIO()):run(self.root,requester=lambda *a,**k:self.fail('No spending'),guard=FakeGuard(stop=0))
        raw=core.load_json(self.root/'deepseek-v41-flash/high/purpose.json');self.assertIsNone(raw['outputs'][0]);self.assertEqual(raw['error'],'original_twenty_percent_budget_exhausted')
    def test_selected_order_does_not_repeat_previously_finished_model(self):
        with redirect_stdout(io.StringIO()):run(self.root,requester=lambda *a,**k:self.fail('No spending'),guard=FakeGuard(stop=0),model_ids=['minimax-m31-flash','kimi-k3'])
        self.assertFalse((self.root/'glm53-flash').exists())
        self.assertTrue((self.root/'minimax-m31-flash/high/purpose.json').exists())
        with self.assertRaisesRegex(core.ConfigError,'duplicate'):run(self.root,guard=FakeGuard(),model_ids=['kimi-k3','kimi-k3'])
