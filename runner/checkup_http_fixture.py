"""Loopback-only SSE acceptance for the everyday collector; all answers are synthetic."""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import copy
import json
import threading
from .checkup import load_bank, demos
from .checkup_collect import collect

PREVIEW_FIXTURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#f7f6ee"/><text x="80" y="120" font-size="26">本机预设图形，仅验收显示，不是模型画作</text><circle cx="260" cy="370" r="80" fill="none" stroke="#285c50" stroke-width="7"/><circle cx="550" cy="370" r="80" fill="none" stroke="#285c50" stroke-width="7"/><path d="M260 370 L360 220 L450 370 Z M360 220 L500 220 L550 370 M450 370 L500 220" fill="none" stroke="#285c50" stroke-width="7"/></svg>'


def expected_outputs(bank):
    rows=demos(bank)['previous']['runs']
    answers={r['taskId']:copy.deepcopy(r['outputs']) for r in rows}
    answers['visual']=[PREVIEW_FIXTURE]
    return answers


@contextmanager
def fixture_server(bank=None):
    bank=bank or load_bank();answers=expected_outputs(bank);first={t['prompts'][0]:t for t in bank['tasks']}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_):pass
        def do_POST(self):
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=300000:self.send_error(413);return
                body=json.loads(self.rfile.read(n));messages=body['messages'];task=first[messages[0]['content']]
                step=(len(messages)-1)//2
                wanted=[]
                for i in range(step):wanted.extend([{'role':'user','content':task['prompts'][i]},{'role':'assistant','content':answers[task['id']][i]}])
                wanted.append({'role':'user','content':task['prompts'][step]})
                if messages!=wanted:
                    self.server.errors.append('conversation_history_mismatch');self.send_error(400);return
                self.server.received.append({'taskId':task['id'],'step':step+1,'body':body})
                scenario=self.path.rsplit('/',1)[-1]
                if scenario=='http-error' and task['id']=='purpose':self.send_error(503);return
                if scenario=='redirect':
                    self.send_response(307);self.send_header('Location',f'http://127.0.0.1:{self.server.server_port}/must-not-follow');self.end_headers();return
                output=answers[task['id']][step]
                if scenario=='context-overflow' and task['id']=='memory' and step==0:output='合成'*20000
                partial=scenario=='partial' and task['id']=='memory' and step==1
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
                def event(value):
                    self.wfile.write(('data: '+json.dumps(value,ensure_ascii=False)+'\n\n').encode('utf-8'));self.wfile.flush()
                is_messages=self.path.startswith('/messages/')
                if is_messages:
                    event({'type':'message_start','message':{'usage':{'input_tokens':100}}})
                    event({'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}})
                pieces=[output[:max(1,len(output)//2)],output[max(1,len(output)//2):]]
                for i,piece in enumerate(pieces):
                    if piece:
                        event({'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':piece}} if is_messages else {'choices':[{'index':0,'delta':{'content':piece}}]})
                    if partial and i==0:return
                if is_messages:
                    event({'type':'content_block_stop','index':0})
                    event({'type':'message_delta','delta':{'stop_reason':'end_turn'},'usage':{'output_tokens':32}})
                    event({'type':'message_stop'})
                else:
                    value={'choices':[{'index':0,'delta':{},'finish_reason':'stop'}]}
                    if scenario!='no-usage':value['usage']={'prompt_tokens':40000 if scenario=='overshoot' else 100,'completion_tokens':32,'completion_tokens_details':{'reasoning_tokens':0}}
                    event(value);self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
            except (BrokenPipeError,ConnectionResetError):pass
            except (ValueError,KeyError,IndexError,TypeError):self.server.errors.append('bad_fixture_request');self.send_error(400)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.daemon_threads=True
    server.received=[];server.errors=[]
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:yield server
    finally:server.shutdown();server.server_close();thread.join(timeout=2)


def simulation_config(server,adapter='openai-compatible',scenario='normal',include_visual=True):
    route='messages' if adapter=='anthropic-messages' else 'chat'
    return {'suiteId':'zhufeng-daily-six-v1','simulation':True,'budgetUsd':0,'repeats':1,'maxRetries':0,'timeoutSeconds':3,
            'region':'loopback fixture','includeVisual':include_visual,'models':[{
                'id':'daily-fixture','name':'本机模拟接口（自动采集演示）','provider':'本机模拟','adapter':adapter,
                'endpoint':f'http://127.0.0.1:{server.server_port}/{route}/{scenario}','apiModel':'fixture-only',
                'inputPrice':0,'outputPrice':0,'maxInputTokens':32768,'maxOutputTokens':4096,
                'outputLimitIncludesReasoning':True,'usageSemantics':'includes_reasoning'}]}


def run_offline(destination,adapter='openai-compatible',scenario='normal'):
    bank=load_bank()
    with fixture_server(bank) as server:
        report,summary=collect(simulation_config(server,adapter,scenario),bank,destination)
        if server.errors:raise ValueError('Local conversation replay failed')
        summary['validatedHttpRequests']=len(server.received)
        return report,summary


def public_collection_demo(report,bank):
    report=copy.deepcopy(report)
    report.update(modelLabel='本机模拟接口（自动采集演示）',conditions='本机loopback模拟接口；固定预设回答；没有真实模型API')
    return report


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);p.add_argument('--adapter',choices=['openai-compatible','anthropic-messages'],default='openai-compatible');p.add_argument('--scenario',default='normal',choices=['normal','partial','http-error','overshoot','no-usage','context-overflow','redirect']);a=p.parse_args()
    _,summary=run_offline(a.out,a.adapter,a.scenario);print(json.dumps(summary,ensure_ascii=False))
