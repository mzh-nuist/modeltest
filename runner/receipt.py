"""Offline-only image request preparation. This command never calls a model API."""
import argparse,base64,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def prepare(model,adapter='openai-compatible'):
    if not isinstance(model,str) or not model.strip() or len(model)>200:raise ValueError('A model identifier is required')
    if adapter not in ('openai-compatible','anthropic-messages'):raise ValueError('Unsupported adapter')
    task=json.loads((ROOT/'dist/data/receipt-test.json').read_text(encoding='utf8'))
    body=(ROOT/'dist'/task['image']).read_bytes();digest=hashlib.sha256(body).hexdigest()
    if digest!=task['imageSha256'] or not body.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Original image hash or PNG header mismatch')
    encoded=base64.b64encode(body).decode()
    image=({'type':'image_url','image_url':{'url':'data:image/png;base64,'+encoded}} if adapter=='openai-compatible' else {'type':'image','source':{'type':'base64','media_type':'image/png','data':encoded}})
    payload={'model':model,'messages':[{'role':'user','content':[{'type':'text','text':task['prompt']},image]}],'stream':True}
    payload['max_completion_tokens' if adapter=='openai-compatible' else 'max_tokens']=2048
    return {'suiteId':task['suiteId'],'mode':'offline-only','modelApiCalls':0,'imageSha256':digest,'imageBytes':len(body),'adapter':adapter,'note':'Only constructs a request. Endpoint image support and cost are unverified. The reference answer is not sent to the model.'},payload
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--model',required=True);p.add_argument('--adapter',choices=['openai-compatible','anthropic-messages'],default='openai-compatible');p.add_argument('--out-request');a=p.parse_args();plan,body=prepare(a.model,a.adapter)
    if a.out_request:
        dest=Path(a.out_request);dest.parent.mkdir(parents=True,exist_ok=True)
        with dest.open('x',encoding='utf8') as f:json.dump(body,f,ensure_ascii=False)
        plan['requestFile']=str(dest)
    print(json.dumps(plan,ensure_ascii=False,indent=2))
