import base64,json,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from unittest.mock import patch
from runner import core

class InlineImageTransport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.received=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                body=json.loads(self.rfile.read(int(self.headers['Content-Length'])));cls.received.append(body)
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
                if self.path=='/messages':
                    events=[{'type':'message_start','message':{'usage':{'input_tokens':100}}},{'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':'1份'}},{'type':'message_delta','delta':{'stop_reason':'end_turn'},'usage':{'output_tokens':10}},{'type':'message_stop'}]
                else:events=[{'choices':[{'delta':{'content':'1份'}}]},{'choices':[{'delta':{},'finish_reason':'stop'}],'usage':{'prompt_tokens':100,'completion_tokens':10,'completion_tokens_details':{'reasoning_tokens':0}}}]
                for e in events:self.wfile.write(('data: '+json.dumps(e,ensure_ascii=False)+'\n\n').encode())
                if self.path!='/messages':self.wfile.write(b'data: [DONE]\n\n')
                self.wfile.flush()
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=2)
    def model(self,adapter):return {'id':'fixture','apiModel':'fixture','adapter':adapter,'endpoint':f'http://127.0.0.1:{self.server.server_port}/'+('messages' if adapter=='anthropic-messages' else 'chat'),'inputPrice':0,'outputPrice':0}
    def test_both_adapters_send_original_inline_bytes_and_plain_question(self):
        image={'mediaType':'image/png','base64':base64.b64encode(b'\x89PNG\r\n\x1a\nlocal-fixture-only').decode()}
        for adapter in ['openai-compatible','anthropic-messages']:
            result=core.request_once(self.model(adapter),{'prompt':'请告诉我这个账单，辣椒炒肉有几份？'},{'simulation':True,'timeoutSeconds':3},256,input_image=image)
            self.assertEqual(result['status'],'success');self.assertEqual(result['output'],'1份')
            parts=self.received[-1]['messages'][0]['content'];self.assertEqual(parts[0]['text'],'请告诉我这个账单，辣椒炒肉有几份？')
            if adapter=='openai-compatible':self.assertEqual(parts[1]['image_url']['url'],'data:image/png;base64,'+image['base64'])
            else:self.assertEqual(parts[1]['source']['data'],image['base64'])
    def test_malformed_or_remote_image_rejected_before_network(self):
        with patch('socket.socket',side_effect=AssertionError('must not send invalid image')):
            for image in [{'url':'https://example.test/x.png'},{'mediaType':'image/png','base64':'not base64'},{'mediaType':'image/png','base64':base64.b64encode(b'wrong-header').decode()}]:
                with self.assertRaises(core.ConfigError):core.request_once(self.model('openai-compatible'),{'prompt':'x'},{'simulation':True},256,input_image=image)
    def test_explicit_unlimited_wait_never_starts_a_deadline_timer(self):
        model=self.model('openai-compatible');model['reasoningEffort']='high'
        with patch('runner.core.threading.Timer',side_effect=AssertionError('No total deadline requested')):
            r=core.request_once(model,{'prompt':'fixture'},{'simulation':True,'timeoutSeconds':None},131072)
        self.assertEqual(r['status'],'success');self.assertEqual(r['output'],'1份')
        self.assertEqual(self.received[-1]['reasoning_effort'],'high');self.assertEqual(self.received[-1]['max_completion_tokens'],131072)
    def test_opted_in_kimi_history_retains_reasoning_without_changing_other_models(self):
        history=[{'role':'user','content':'first'},{'role':'assistant','content':'answer','reasoning_content':'original reasoning'},{'role':'user','content':'next'}]
        m=self.model('openai-compatible')
        with self.assertRaises(core.ConfigError):core.request_once(m,{'prompt':'next'},{'simulation':True},65536,messages=history)
        m['preserveReasoningHistory']=True
        r=core.request_once(m,{'prompt':'next'},{'simulation':True,'timeoutSeconds':None},65536,messages=history)
        self.assertEqual(r['status'],'success');self.assertEqual(self.received[-1]['messages'],history)
