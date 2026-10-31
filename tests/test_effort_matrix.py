import copy,io,json,tempfile,unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
from decimal import Decimal
from runner import core
from runner.commandcode_effort_matrix import run,main,matrix_plan,SELECTION,OUTPUT_CAP,TIMEOUT,MatrixGuard
from runner.checkup import ROOT

class FakeGuard:
    def __init__(self,stop=None):self.calls=0;self.halted=None;self.stop=stop;self.reserves=[]
    def save(self):pass
    def check(self,phase,reserve=0,unknown=False):
        if phase=='before':
            if self.stop is not None and self.calls>=self.stop:self.halted='original_twenty_percent_budget_exhausted'
            if not self.halted:self.calls+=1
        self.reserves.append((phase,reserve,unknown));return self.halted

class EffortMatrixTests(unittest.TestCase):
    def setUp(self):
        p=ROOT/'results/effort-matrix-tests';p.mkdir(exist_ok=True);self.temp=tempfile.TemporaryDirectory(dir=p);self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
    def test_offline_plan_has_195_requests_and_never_calls_network(self):
        with patch('socket.socket',side_effect=AssertionError('no network')),redirect_stdout(io.StringIO()):self.assertEqual(main(['--out','unused']),0)
        self.assertEqual(matrix_plan()['maxRequests'],195)
    def test_all_efforts_preserve_conversations_and_original_image_without_retries(self):
        seen=[]
        def request(model,task,config,cap,key,messages=None,input_image=None):
            self.assertEqual(cap,OUTPUT_CAP);self.assertEqual(config['timeoutSeconds'],TIMEOUT)
            seen.append((model['reasoningEffort'],task['prompt'],len(messages),input_image))
            return {'status':'success','error':None,'output':'fixture answer','metrics':{'inputTokens':100,'outputTokens':10,'reasoningTokens':0},'_raw':{'request':{'reasoning_effort':model['reasoningEffort']}}}
        guard=FakeGuard()
        with redirect_stdout(io.StringIO()):run(self.root,requester=request,guard=guard,selection=SELECTION[:1])
        self.assertEqual(guard.calls,39)
        for effort in ('low','medium','high'):
            rows=[r for r in seen if r[0]==effort];self.assertEqual(len(rows),13)
            self.assertEqual([r[2] for r in rows],[1,1,1,3,1,3,5,7,9,1,1,1,1])
            images=[r[3] for r in rows if r[3]];self.assertEqual(len(images),1);self.assertTrue(images[0]['base64'].startswith('iVBOR'))
        with redirect_stdout(io.StringIO()):run(self.root,requester=request,guard=guard,selection=SELECTION[:1])
        self.assertEqual(guard.calls,39)
    def test_budget_stop_inside_multiturn_never_marks_partial_as_success(self):
        def request(*args,**kwargs):return {'status':'success','error':None,'output':'fixture','metrics':{'inputTokens':100,'outputTokens':10},'_raw':{}}
        with redirect_stdout(io.StringIO()):run(self.root,requester=request,guard=FakeGuard(stop=3),selection=SELECTION[:1])
        row=core.load_json(self.root/SELECTION[0][0]/'low/edit.json');self.assertEqual(row['status'],'incomplete');self.assertEqual(row['outputs'],['fixture',None])
        self.assertFalse((self.root/SELECTION[0][0]/'high/zebra.json').exists())
        seen=[]
        def resumed(*args,**kwargs):seen.append(copy.deepcopy(kwargs['messages']));return request(*args,**kwargs)
        with redirect_stdout(io.StringIO()):run(self.root,requester=resumed,guard=FakeGuard(),selection=SELECTION[:1])
        self.assertEqual(len(seen),36);self.assertEqual(len(seen[0]),3);self.assertEqual(seen[0][1],{'role':'assistant','content':'fixture'})
    def test_timeout_holds_reservation_and_does_not_retry(self):
        def request(*args,**kwargs):return {'status':'timeout','error':'request_timeout','output':'','metrics':{'inputTokens':None,'outputTokens':None},'_raw':{}}
        guard=FakeGuard(stop=1)
        with redirect_stdout(io.StringIO()):run(self.root,requester=request,guard=guard,selection=SELECTION[:1])
        self.assertEqual(guard.calls,1);self.assertTrue(any(unknown for phase,r,unknown in guard.reserves if phase=='after'))
    def test_resume_preserves_own_unknown_reservation_and_original_cap(self):
        saved={'thisRunInitial':{'totalUsd':'60'},'newUnknownUsageReserveCredits':'.4','callsSent':7,'events':[]}
        core.write_json(self.root/'credit-ledger.json',saved)
        def load(path):
            path=Path(path)
            if path==self.root/'credit-ledger.json':return saved
            if path.name=='closing-credit-audit.json':return {'unknownUsageFullAccountCreditReservation':'2'}
            return {'minimumRemainingUsd':'50','fixedBudgetUsd':'12','newUnknownUsageReserveCredits':'0'}
        with patch('runner.commandcode_complete_receipt.core.load_json',side_effect=load),patch('runner.commandcode_complete_receipt.read_balance',return_value={'totalUsd':'60'}):
            guard=MatrixGuard('fixture',self.root);self.assertEqual(guard.calls,7);self.assertEqual(guard.newUnknown,Decimal('.4'));self.assertEqual(guard.fixedCap,Decimal('12'))
            self.assertEqual(guard.check('before',Decimal('9')),'original_twenty_percent_budget_exhausted');self.assertEqual(guard.calls,7)
