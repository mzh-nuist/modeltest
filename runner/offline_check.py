"""One-command local SSE → measurement → scoring → public export acceptance. Zero external calls."""
import argparse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
from .core import execute,public_export,write_json,validate_document
from .core_suite import build_suite,SUITE


def run_check(destination, task_ids=None):
    tasks,answers=build_suite()
    if task_ids is not None:
        wanted=set(task_ids);tasks=[t for t in tasks if t['id'] in wanted]
        if not tasks or len(tasks)!=len(wanted): raise ValueError('Unknown/empty fixture task selection')
    task_map={t['id']:t for t in tasks}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_): pass
        def do_POST(self):
            try:
                size=int(self.headers.get('Content-Length','0'))
                if size>200000: self.send_error(413);return
                body=json.loads(self.rfile.read(size));ident=body['messages'][0]['content'].split('\n')[0].split('：',1)[1]
                task=task_map[ident];scenario=body['model'];answer=answers[ident]
                if scenario=='broken' and ident=='core-m01': self.send_error(503);return
                if scenario=='format' and task['grader']['kind']=='json': answer='```json\n'+answer+'\n```'
                elif scenario=='format' and task['grader']['kind']=='number': answer='结果为 '+answer
                elif scenario=='broken' and task['grader']['kind']=='number': answer='-999'
                elif scenario=='broken' and task['grader']['kind']=='json': answer='{}'
                elif scenario=='broken' and task['grader']['kind']=='text_rules': answer='不符合约束'
                self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
                def event(value):
                    self.wfile.write(('data: '+json.dumps(value,ensure_ascii=False)+'\n\n').encode());self.wfile.flush()
                a=len(answer)//3;b=2*len(answer)//3;pieces=[answer[:a],answer[a:b],answer[b:]];seen=0
                for piece in pieces:
                    if not piece: continue
                    seen+=len(piece)
                    event({'choices':[{'index':0,'delta':{'content':piece}}],
                           'usage':{'prompt_tokens':100,'completion_tokens':seen,'completion_tokens_details':{'reasoning_tokens':0}}})
                    time.sleep(.27 if ident=='core-i02' else .003)
                event({'choices':[{'index':0,'delta':{},'finish_reason':'stop'}],
                       'usage':{'prompt_tokens':100,'completion_tokens':seen,'completion_tokens_details':{'reasoning_tokens':0}}})
                self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
            except (BrokenPipeError,ConnectionResetError): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.daemon_threads=True
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    configuration={'simulation':True,'budgetUsd':.01,'metricProtocol':'core-client-v1','suiteId':SUITE,
                   'title':'核心协议离线验收 · 非模型实测','region':'loopback fixture; no external network',
                   'concurrency':1,'repeats':1,'maxRetries':0,'timeoutSeconds':5,'models':[]}
    for ident,name in [('correct','本地模拟 · 合规样例'),('format','本地模拟 · 格式违规'),('broken','本地模拟 · 错答与请求失败')]:
        configuration['models'].append({'id':'fixture-'+ident,'name':name,'provider':'本机模拟SSE服务','family':'离线验收',
            'version':'toy-character-counter-v1','apiModel':ident,'endpoint':f'http://127.0.0.1:{server.server_port}/fixture',
            'inputPrice':0,'outputPrice':0,'maxInputTokens':32768,'maxOutputTokens':4096,'outputLimitIncludesReasoning':True,
            'streamUsageMode':'cumulative_visible_fixture','usageSemantics':'includes_reasoning','currency':'USD','tags':['模拟','零外部调用'],
            'description':'程序预设输出；token按字符计数的玩具计数器，仅验证公式和链路，不代表模型tokenizer或性能。'})
    try:
        result=execute(configuration,tasks,destination)
        result['meta']['description']='本机程序预设答案与玩具token计数器的SSE验收；所有输出与指标仅验证系统。不是模型能力、速度或费用实测。'
        result['batches'][0]['description']=result['meta']['description']
        result=public_export(result)
        if validate_document(result): raise ValueError('Offline acceptance result failed validation')
        write_json(Path(destination)/'public.json',result)
        report={'externalApiCalls':0,'dataKind':'demo','taskCount':len(tasks),'runs':len(result['runs']),
                'success':sum(r['status']=='success' for r in result['runs']),
                'pending':sum(r['grading']['status']=='pending' for r in result['runs']),
                'strictTpsSamples':sum(r.get('measurement',{}).get('bodyTps') is not None for r in result['runs'])}
        write_json(Path(destination)/'acceptance.json',report)
        return result,report
    finally:
        server.shutdown();server.server_close();thread.join(timeout=2)


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);a=p.parse_args(argv)
    try:
        _,report=run_check(a.out);print(json.dumps(report,ensure_ascii=False));return 0
    except (ValueError,TypeError,OSError,KeyError):
        print('Offline check could not complete; retain evidence and inspect inputs.');return 2


if __name__=='__main__': raise SystemExit(main())
