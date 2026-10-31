import copy,io,tempfile,unittest
from contextlib import redirect_stdout
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from runner import core
from runner.checkup import ROOT
from runner.budget_high import BudgetHighGuard
from runner.commandcode_high import high_plan,run,reserve_for
from runner.commandcode_daily_selected import configuration,SELECTION
from scripts.build_high_suite import build
from scripts.record_effort_review import record_marks

class BudgetHighTests(unittest.TestCase):
    def setUp(self):
        scratch=ROOT/'results/budget-high-tests';scratch.mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=scratch);self.root=Path(self.temp.name)
        self.root.resolve().relative_to(scratch.resolve());self.addCleanup(self.temp.cleanup)
        past=self.root/'past';core.write_json(past/'credit-ledger.json',{'minimumRemainingUsd':'50','fixedBudgetUsd':'12'});core.write_json(past/'closing-credit-audit.json',{'unknownUsageFullAccountCreditReservation':'2'})
        for name,value in [('runner.commandcode_complete_receipt.PAST',past),('runner.commandcode_complete_receipt.ROOT',self.root),('runner.commandcode_effort_matrix.ROOT',self.root)]:
            context=patch(name,value);context.start();self.addCleanup(context.stop)
    def guard(self):
        self.balance=patch('runner.commandcode_complete_receipt.read_balance',return_value={'totalUsd':'60','checkedAt':core.now()});self.balance.start();self.addCleanup(self.balance.stop)
        return BudgetHighGuard('fixture',self.root)
    def test_cap_fits_original_remaining_budget_and_does_not_assume_full_usage(self):
        g=self.guard();m=configuration(SELECTION[1])['models'][0]
        cap=g.allocate_output_cap(m,'purpose',1048576)
        self.assertGreater(cap,8192);self.assertLess(cap,1048576)
        self.assertLessEqual(reserve_for(m,'purpose',cap)+g.BUFFER,Decimal('60')-g.originalFloor-g.unknownReserve)
        reserve=reserve_for(m,'purpose',cap);g.record_usage(m,{'inputTokens':100,'outputTokens':200},reserve)
        self.assertEqual(g.spentBound,Decimal('.0088'));self.assertLess(g.spentBound,reserve)
        self.assertLessEqual(g.allocate_output_cap(m,'purpose',1048576),cap)
    def test_delayed_billing_and_resume_cannot_reuse_already_consumed_budget(self):
        g=self.guard();m=configuration(SELECTION[2])['models'][0]
        cap=g.allocate_output_cap(m,'purpose',1048576);reserve=reserve_for(m,'purpose',cap)
        g.record_usage(m,{'inputTokens':16384,'outputTokens':cap},reserve)
        self.assertIsNone(g.allocate_output_cap(m,'purpose',1048576))
        again=BudgetHighGuard('fixture',self.root)
        self.assertEqual(again.spentBound,g.spentBound);self.assertIsNone(again.allocate_output_cap(m,'purpose',1048576))
    def test_full_high_suite_uses_recorded_caps_and_preserves_reasoning_history(self):
        g=self.guard();plan=high_plan();plan.update(outputPolicy='per-model-recorded',modelOutputPolicies={'kimi-k31-pro':'budget-bounded-output'})
        seen=[]
        def request(model,task,config,cap,key,messages=None,input_image=None):
            seen.append((cap,copy.deepcopy(messages)));history=copy.deepcopy(messages)
            if input_image:history[-1]['content']=[{'type':'text','text':task['prompt']},{'type':'image_url','image_url':{'url':'data:image/png;base64,'+input_image['base64']}}]
            return {'status':'success','error':None,'output':'fixture answer','metrics':{'inputTokens':100,'outputTokens':100},'_raw':{'httpStatus':200,'reasoningOutput':'fixture reasoning','request':{'model':model['apiModel'],'reasoning_effort':'high','max_completion_tokens':cap,'messages':history}}}
        with redirect_stdout(io.StringIO()):run(self.root,requester=request,guard=g,plan=plan,model_ids=['kimi-k31-pro'])
        self.assertEqual(len(seen),13);self.assertTrue(all(8192<=c<1048576 for c,h in seen));self.assertEqual(seen[3][1][1]['reasoning_content'],'fixture reasoning')
        self.assertEqual(build(self.root,self.root/'public.json')['requests'],13)
        record_marks(self.root,'kimi-k31-pro','high',{'receipt':(None,'Ambiguous offline receipt fixture; leave for human review.')})
        build(self.root,self.root/'public.json');public=core.load_json(self.root/'public.json')
        self.assertIsNone(public['models'][1]['items'][6]['score']);self.assertIn('human review',public['models'][1]['items'][6]['reason'])
        with self.assertRaises(ValueError):record_marks(self.root,'kimi-k31-pro','high',{'purpose':(None,'Do not silently null any other score')})
        purpose=self.root/'kimi-k31-pro/high/purpose.json';reviewable=core.load_json(purpose)
        reviewable.update(status='error',error='invalid_or_incomplete_stream')
        reviewable['attempts'][0].update(status='error',error='invalid_or_incomplete_stream')
        reviewable['attempts'][0]['_raw'].update(streamDone=True,finishSeen=False)
        core.write_json(purpose,reviewable)
        with self.assertRaises(ValueError):record_marks(self.root,'kimi-k31-pro','high',{'purpose':(2,'Assistant cannot approve failed delivery')})
        record_marks(self.root,'kimi-k31-pro','high',{'purpose':(2,'Explicit owner content approval')},reviewer='site-owner',accept_missing_finish=True)
        build(self.root,self.root/'public.json');approved=core.load_json(self.root/'public.json')['models'][1]['items'][0]
        self.assertEqual(approved['score'],2);self.assertEqual(approved['measurement']['status'],'error');self.assertEqual(approved['reviewer'],'site-owner')
        reviewable['attempts'][0]['_raw']['streamDone']=False;core.write_json(purpose,reviewable)
        with self.assertRaises(ValueError):record_marks(self.root,'kimi-k31-pro','high',{'purpose':(2,'Not a completed stream')},reviewer='site-owner',accept_missing_finish=True)
        raw=core.load_json(self.root/'kimi-k31-pro/high/purpose.json');raw['attempts'][0]['_raw']['request']['max_completion_tokens']=1048577;core.write_json(self.root/'kimi-k31-pro/high/purpose.json',raw)
        with self.assertRaises(ValueError):build(self.root,self.root/'public.json')
    def test_next_batch_preserves_unsettled_cost_bound_without_private_account_files(self):
        self.guard()
        first=BudgetHighGuard('fixture',self.root/'results/effort-first')
        m=configuration(SELECTION[1])['models'][0];first.record_usage(m,{'inputTokens':100,'outputTokens':200},Decimal('1'))
        second=BudgetHighGuard('fixture',self.root/'results/effort-second')
        self.assertEqual(second.unknownReserve,Decimal('2.0088'))
