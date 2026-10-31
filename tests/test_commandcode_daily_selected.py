from decimal import Decimal
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from runner.checkup import ROOT,load_bank
from runner.checkup_collect import make_plan,collect
from runner.checkup_http_fixture import fixture_server,simulation_config
from runner.commandcode_daily_selected import CreditGuard,SELECTION,configuration
from runner import core
from runner.commandcode_visual_low import make_visual_plan,main as visual_main


class SelectedDailyTests(unittest.TestCase):
    def setUp(self):
        p=ROOT/'results/selected-budget-tests';p.mkdir(parents=True,exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=p);self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)

    def test_five_frozen_models_fit_the_verified_twenty_percent_cap(self):
        plans=[make_plan(configuration(row),load_bank()) for row in SELECTION]
        self.assertEqual(sum(p['plannedRequests'] for p in plans),55)
        upper=sum(Decimal(str(p['reservedUpperBoundUsd'])) for p in plans)
        guard=CreditGuard('fake',{'totalUsd':'63.5672867785'},self.root)
        self.assertEqual(guard.cap,Decimal('12.71'));self.assertLess(upper,guard.cap)

    def test_visual_supplement_reuses_original_balance_and_plans_offline(self):
        initial={'totalUsd':'63.5672867785'}
        config,task,plan=make_visual_plan(initial)
        self.assertEqual(config['budgetUsd'],12.71);self.assertEqual(plan['plannedRequests'],5)
        self.assertTrue(all(m['reasoningEffort']=='low' and m['maxOutputTokens']==32768 for m in config['models']))
        path=self.root/'credit-ledger.json';path.write_text(json.dumps({'events':[initial]}),encoding='utf-8')
        with patch('socket.socket',side_effect=AssertionError('plan must not connect')),redirect_stdout(io.StringIO()):
            self.assertEqual(visual_main(['--original',str(self.root)]),0)

    def test_balance_floor_blocks_the_next_request_before_spending(self):
        guard=CreditGuard('fake',{'totalUsd':'10'},self.root)
        with patch('runner.commandcode_daily_selected.read_balance',return_value={'totalUsd':'8.1'}):
            self.assertEqual(guard('before',.2),'account_twenty_percent_limit')
        self.assertEqual(guard.calls,0)

    def test_balance_failure_stops_instead_of_using_stale_approval(self):
        guard=CreditGuard('fake',{'totalUsd':'10'},self.root)
        with patch('runner.commandcode_daily_selected.read_balance',side_effect=OSError('offline')):
            self.assertEqual(guard('before',.1),'account_balance_unavailable')
        self.assertEqual(guard.calls,0)

    def test_goat_pool_conversion_is_reserved_before_a_request(self):
        guard=CreditGuard('fake',{'totalUsd':'10'},self.root)
        with patch('runner.commandcode_daily_selected.read_balance',return_value={'totalUsd':'8.5'}):
            self.assertEqual(guard('before',.2),'account_twenty_percent_limit')
        self.assertEqual(guard.calls,0)

    def test_reasoning_only_output_cap_is_not_misreported_as_broken_stream(self):
        events=[{'choices':[{'index':0,'delta':{'reasoning_content':'fixture reasoning'}}]},
                {'choices':[{'index':0,'delta':{},'finish_reason':'length'}],
                 'usage':{'prompt_tokens':10,'completion_tokens':32,'completion_tokens_details':{'reasoning_tokens':32}}}]
        body=''.join('data: '+json.dumps(e)+'\n\n' for e in events)+'data: [DONE]\n\n'
        response=io.BytesIO(body.encode());response.status=200;response.headers={'Content-Type':'text/event-stream'}
        with patch('runner.core.urllib.request.build_opener') as opener:
            opener.return_value.open.return_value=response
            result=core.request_once(configuration(SELECTION[0])['models'][0],{'prompt':'fixture'},{'simulation':False,'timeoutSeconds':2},32)
        self.assertEqual(result['error'],'output_limit_reached');self.assertEqual(result['output'],'')
        self.assertEqual(result['metrics']['reasoningTokens'],32);self.assertTrue(result['_raw']['streamDone'])

    def test_live_guard_failure_preserves_actual_first_answer_and_stops_batch(self):
        bank=load_bank()
        with fixture_server(bank) as server:
            def check(phase,reserve):return 'account_balance_unavailable' if phase=='after' else None
            report,summary=collect(simulation_config(server),bank,self.root/'batch',budget_guard=check)
            self.assertEqual(len(server.received),1)
        self.assertEqual(summary['halted'],'account_balance_unavailable')
        self.assertTrue(report['runs'][0]['outputs'][0]);self.assertEqual(report['runs'][0]['status'],'incomplete')
        self.assertTrue(all(r['status']=='not_run' for r in report['runs'][1:]))


if __name__=='__main__':unittest.main()
