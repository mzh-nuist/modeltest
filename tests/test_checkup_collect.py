import copy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from runner import core
from runner.checkup import ROOT,load_bank,read,assess_report,validate_report
from runner.checkup_collect import make_plan,collect,main
from runner.checkup_http_fixture import fixture_server,simulation_config


class EverydayTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank=load_bank();cls.server_context=fixture_server(cls.bank);cls.server=cls.server_context.__enter__()

    @classmethod
    def tearDownClass(cls):cls.server_context.__exit__(None,None,None)

    def setUp(self):
        scratch=ROOT/'results/checkup-transport-tests';scratch.mkdir(parents=True,exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=scratch);self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.server.received.clear();self.server.errors.clear()
        self.config=simulation_config(self.server)

    def test_both_transports_send_every_prior_real_turn_and_isolate_tasks(self):
        for adapter in ['openai-compatible','anthropic-messages']:
            self.server.received.clear()
            report,summary=collect(simulation_config(self.server,adapter),self.bank,self.root/adapter)
            self.assertEqual(summary['modelApiCalls'],0);self.assertEqual(summary['loopbackRequests'],11)
            self.assertEqual([r['status'] for r in report['runs']],['complete']*6)
            self.assertEqual([r['verdict'] for r in assess_report(report,self.bank)],['review','review','normal','review','review','review'])
            memory=[r for r in self.server.received if r['taskId']=='memory']
            self.assertEqual([len(r['body']['messages']) for r in memory],[1,3,5,7,9])
            self.assertEqual(memory[-1]['body']['messages'][1]['content'],report['runs'][3]['outputs'][0])
            self.assertEqual(len(next(r for r in self.server.received if r['taskId']=='honesty')['body']['messages']),1)
            if adapter=='anthropic-messages':
                self.assertIn('max_tokens',memory[0]['body']);self.assertNotIn('stream_options',memory[0]['body'])
            else:self.assertIn('max_completion_tokens',memory[0]['body'])
            self.assertEqual(self.server.errors,[])

    def test_partial_sse_retains_partial_answer_and_stops_remaining_turns(self):
        config=simulation_config(self.server,scenario='partial')
        report,summary=collect(config,self.bank,self.root/'partial')
        row=report['runs'][3]
        self.assertEqual(row['status'],'incomplete');self.assertTrue(row['outputs'][1]);self.assertEqual(row['outputs'][2:],[None]*3)
        self.assertEqual([r['step'] for r in self.server.received if r['taskId']=='memory'],[1,2])
        self.assertEqual(summary['loopbackRequests'],8)
        self.assertEqual(report['runs'][4]['status'],'complete')

    def test_first_request_error_is_preserved_without_retry_or_fake_success(self):
        report,_=collect(simulation_config(self.server,scenario='http-error'),self.bank,self.root/'http-error')
        self.assertEqual(report['runs'][0]['status'],'incomplete');self.assertEqual(report['runs'][0]['outputs'],[None])
        self.assertIn('http_503',report['runs'][0]['note'])
        self.assertEqual(assess_report(report,self.bank)[0]['verdict'],'review')
        self.assertEqual(len([r for r in self.server.received if r['taskId']=='purpose']),1)

    def test_usage_above_reservation_stops_the_entire_batch(self):
        report,summary=collect(simulation_config(self.server,scenario='overshoot'),self.bank,self.root/'overshoot')
        self.assertEqual(summary['halted'],'provider_usage_exceeds_reservation');self.assertEqual(len(self.server.received),1)
        self.assertEqual(report['runs'][0]['status'],'incomplete');self.assertTrue(all(r['status']=='not_run' for r in report['runs'][1:]))

    def test_unknown_usage_does_not_become_zero_cost_or_release_reservation(self):
        config=simulation_config(self.server,scenario='no-usage');config['budgetUsd']=1
        config['models'][0].update(inputPrice=1,outputPrice=2)
        _,summary=collect(config,self.bank,self.root/'unknown')
        self.assertEqual(summary['unknownCostAttempts'],11);self.assertIsNone(summary['totalEstimatedCostUsd'])
        self.assertAlmostEqual(summary['reservedUsd'],11*(32768+8192)/1000000)

    def test_dynamic_input_bound_stops_without_cutting_conversation(self):
        report,_=collect(simulation_config(self.server,scenario='context-overflow'),self.bank,self.root/'context')
        row=report['runs'][3];self.assertEqual(row['status'],'incomplete');self.assertEqual(len(row['outputs'][0]),40000)
        self.assertEqual(row['outputs'][1:],[None]*4);self.assertIn('未裁剪历史',row['note'])
        self.assertEqual([r['step'] for r in self.server.received if r['taskId']=='memory'],[1])

    def test_redirects_are_not_followed(self):
        report,summary=collect(simulation_config(self.server,scenario='redirect'),self.bank,self.root/'redirect')
        self.assertEqual(summary['loopbackRequests'],6)
        self.assertTrue(all(r['status']=='incomplete' for r in report['runs']))

    def test_planning_and_run_without_execute_never_open_a_socket(self):
        path=self.root/'config.json';path.write_text(json.dumps(self.config),encoding='utf-8')
        with patch('socket.socket',side_effect=AssertionError('planning must not connect')),redirect_stdout(io.StringIO()):
            self.assertEqual(main(['plan','--config',str(path),'--out',str(self.root/'plan.json')]),0)
            self.assertEqual(main(['run','--config',str(path),'--out',str(self.root/'run-plan.json')]),0)
        self.assertEqual(read(self.root/'plan.json')['plannedRequests'],11)
        config=copy.deepcopy(self.config);config['includeVisual']=False
        self.assertEqual(make_plan(config,self.bank)['plannedRequests'],10)

    def test_real_execution_guards_unknown_prices_and_zero_budget_before_transport(self):
        config=copy.deepcopy(self.config);config.update(simulation=False,budgetUsd=1)
        config['models'][0].update(endpoint='https://example.invalid/v1/chat/completions',apiKeyEnv='DAILY_FAKE_KEY')
        with patch('runner.core.request_once',side_effect=AssertionError('must not call a real model')):
            with self.assertRaises(core.ConfigError):collect(config,self.bank,self.root/'no-opt-in')
            config['budgetUsd']=0
            with self.assertRaises(core.ConfigError):collect(config,self.bank,self.root/'zero-budget',True)
            config['budgetUsd']=1;config['models'][0]['inputPrice']=None
            with self.assertRaises(core.ConfigError):collect(config,self.bank,self.root/'unknown-price',True)
        self.assertEqual(self.server.received,[])

    def test_private_credential_echo_is_removed_from_all_saved_files(self):
        config=copy.deepcopy(self.config);config.update(simulation=False,budgetUsd=1)
        secret='fake-local-credential-only-for-redaction-test'
        config['models'][0].update(endpoint='https://example.invalid/v1/chat/completions',apiKeyEnv='DAILY_FAKE_KEY')
        result={'status':'error','error':'connection_error','output':secret,'metrics':{k:None for k in core.METRICS},'_raw':{'request':{'messages':[{'role':'assistant','content':secret}]},'events':[]}}
        with patch.dict(os.environ,{'DAILY_FAKE_KEY':secret}),patch('runner.core.request_once',return_value=result) as request:
            report,_=collect(config,self.bank,self.root/'echo',True)
        self.assertEqual(request.call_count,6)
        for p in (self.root/'echo').rglob('*.json'):self.assertNotIn(secret,p.read_text(encoding='utf-8'))
        validate_report(report,self.bank)

    def test_transport_refuses_forged_roles_and_existing_evidence_is_not_overwritten(self):
        with self.assertRaises(core.ConfigError):core.request_once(self.config['models'][0],{'prompt':'x'},self.config,100,messages=[{'role':'system','content':'x'}])
        path=self.root/'existing';path.mkdir();(path/'keep.txt').write_text('keep',encoding='utf-8')
        with self.assertRaises(core.ConfigError):collect(self.config,self.bank,path)
        self.assertEqual((path/'keep.txt').read_text(),'keep')


if __name__=='__main__':unittest.main()
