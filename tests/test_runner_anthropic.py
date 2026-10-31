import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from runner.anthropic import MessagesStream
from runner.core import ConfigError, execute, make_plan, public_export, validate_document
from runner.mock_server import MockServer


class MessagesAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=MockServer()
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=2)

    def setUp(self):
        scratch=Path(__file__).resolve().parent/'.runner-tmp';scratch.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=scratch)
        def cleanup():
            Path(self.tmp.name).resolve().relative_to(scratch.resolve())
            self.tmp.cleanup()
        self.addCleanup(cleanup)
        self.task={'id':'message-task','title':'Messages fixture','category':'math','difficulty':'easy','prompt':'模拟请求：回答 答案：42','reference':'答案：42','rubric':['答案一致'],'maxOutputTokens':32,'grader':{'type':'exact','expected':'答案：42'},'source':'fixture'}
        self.config={'simulation':True,'budgetUsd':.1,'repeats':1,'timeoutSeconds':2,'models':[{'id':'messages-fixture','name':'Messages fixture','provider':'Local','adapter':'anthropic-messages','apiModel':'fixture','endpoint':f'http://127.0.0.1:{self.server.server_port}/messages','inputPrice':1,'outputPrice':2,'maxInputTokens':4096,'maxOutputTokens':64,'maxTokensParameter':'max_tokens','outputLimitIncludesReasoning':True}]}

    def run_case(self,suffix=''):
        self.config['models'][0]['endpoint']+=suffix
        return execute(self.config,[self.task],Path(self.tmp.name)/'out')

    def test_messages_stream_measures_body_thinking_and_nominal_usage(self):
        d=self.run_case();r=d['runs'][0]
        self.assertEqual(r['status'],'success')
        self.assertEqual(r['output'],'答案：42')
        self.assertEqual(r['grading']['status'],'passed')
        self.assertLess(r['metrics']['ttftMs'],r['metrics']['ttfaMs'])
        self.assertEqual(r['metrics']['inputTokens'],25)
        self.assertEqual(r['metrics']['outputTokens'],8)
        self.assertIsNone(r['metrics']['reasoningTokens'])
        self.assertIsNone(r['metrics']['outputTps'])
        self.assertAlmostEqual(r['metrics']['cost'],.000041)
        self.assertEqual(r['provenance']['adapter'],'anthropic-messages')
        request=self.server.received[-1]
        self.assertIn('max_tokens',request)
        self.assertNotIn('stream_options',request)
        self.assertNotIn('max_completion_tokens',request)
        self.assertFalse(validate_document(public_export(d)))

    def test_messages_output_limit_keeps_failed_evidence(self):
        r=self.run_case('-length')['runs'][0]
        self.assertEqual(r['status'],'error')
        self.assertEqual(r['error'],'output_limit_reached')
        self.assertEqual(r['output'],'答案：42')
        self.assertEqual(r['grading']['status'],'not_applicable')
        self.assertIsNotNone(r['metrics']['cost'])

    def test_messages_partial_is_not_success_and_cost_unknown(self):
        r=self.run_case('-partial')['runs'][0]
        self.assertEqual(r['status'],'error')
        self.assertEqual(r['output'],'答')
        self.assertIsNone(r['metrics']['cost'])

    def test_usage_deltas_are_cumulative_not_summed(self):
        n=MessagesStream();n.normalize({'type':'message_start','message':{'usage':{'input_tokens':10}}})
        n.normalize({'type':'message_delta','delta':{},'usage':{'output_tokens':5}})
        event,_=n.normalize({'type':'message_delta','delta':{'stop_reason':'end_turn'},'usage':{'output_tokens':8}})
        self.assertEqual(event['usage']['completion_tokens'],8)

    def test_tool_and_fallback_blocks_are_rejected(self):
        for kind in ['tool_use','server_tool_use','fallback']:
            with self.assertRaises(ValueError):
                MessagesStream().normalize({'type':'content_block_start','content_block':{'type':kind}})

    def test_unimplemented_effort_is_rejected_before_network(self):
        self.config['models'][0]['reasoningEffort']='high'
        with self.assertRaises(ConfigError):make_plan(self.config,[self.task])

    def test_explicit_adaptive_high_uses_messages_protocol_fields(self):
        self.config['models'][0].update(reasoningEffort='high',anthropicEffortProtocol='adaptive-v1')
        result=self.run_case()
        self.assertEqual(result['runs'][0]['status'],'success')
        request=self.server.received[-1]
        self.assertEqual(request['thinking'],{'type':'adaptive'})
        self.assertEqual(request['output_config'],{'effort':'high'})
        self.assertNotIn('reasoning_effort',request)
        self.assertIn('max_tokens',request)
