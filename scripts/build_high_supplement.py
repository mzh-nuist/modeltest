"""Export a separate high supplement; never rewrite the original five results."""
import argparse,base64,hashlib,json,sys
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner import core
ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'results/expansion-20261031/preflight-public'
SPECS=[('qwen38-max','Qwen 3.8 Max','Qwen/Qwen3.8-Max','high-unlisted','当前服务商声明的档位不含 high，保留待测。'),
       ('claude-sonnet55','Claude Sonnet 5.5','claude-sonnet-5-5','eligible','本轮预算不足，保留待测。'),
       ('gpt61-sol','GPT-6.1 Sol','gpt-6.1-sol','plan-restricted','当前 GOAT 套餐未开放，保留待测。')]

def timestamp(value=None):
    moment=datetime.fromisoformat(value.replace('Z','+00:00')) if value else datetime.now(timezone.utc)
    return moment.isoformat(timespec='milliseconds').replace('+00:00','Z')
def build(source,target):
    source=Path(source);base=core.load_json(ROOT/'dist/data/high-suite.json');spec=core.load_json(PUBLIC/'preflight-summary.json')
    source_hash=hashlib.sha256((PUBLIC/'preflight-summary.json').read_bytes()).hexdigest()
    models=[];total=successful=0
    for ident,name,api,eligible,reason in SPECS:
        items=[];digests=[];n=ok=0
        sonnet=ident=='claude-sonnet55';limit=128000 if sonnet else None
        for task in base['tasks']:
            path=source/ident/'high'/(task['id']+'.json');measurement=None
            if path.exists():
                raw=core.load_json(path);digest=hashlib.sha256(path.read_bytes()).hexdigest();digests.append(digest)
                if raw['effort']!='high' or raw['apiModel']!=api or raw['timeoutSeconds'] is not None:raise ValueError('Supplement protocol drift')
                # No inferred score; a separate source-bound review is required for real answers.
                history=[]
                for k,a in enumerate(raw['attempts']):
                    request=a['_raw']['request'];history.append({'role':'user','content':task['prompts'][k]})
                    if request.get('model')!=api or request.get('thinking')!={'type':'adaptive'} or request.get('output_config')!={'effort':'high'} or not 8192<=request.get('max_tokens',0)<=limit:raise ValueError('Not explicit bounded high')
                    if task['id']!='receipt' and request['messages']!=history:raise ValueError('Conversation changed')
                    if task['id']=='receipt':
                        messages=request['messages'];content=messages[0]['content']
                        if len(messages)!=1 or messages[0]['role']!='user' or len(content)!=2:raise ValueError('Receipt prompt changed')
                        images=[b for b in content if b.get('type')=='image'];texts=[b for b in content if b.get('type')=='text']
                        if len(images)!=1 or len(texts)!=1 or texts[0].get('text')!=task['prompts'][0]:raise ValueError('Receipt prompt changed')
                        image=images[0]['source']
                        if image.get('type')!='base64' or image.get('media_type')!='image/png' or hashlib.sha256(base64.b64decode(image['data'],validate=True)).hexdigest()!=task['imageSha256']:raise ValueError('Receipt image changed')
                    history.append({'role':'assistant','content':a['output']})
                n+=len(raw['attempts']);ok+=sum(a['status']=='success' for a in raw['attempts'])
                measurement={k:raw[k] for k in ['status','error','outputs','checkedAt','apiModel','provider','condition','maxOutputTokens','timeoutSeconds','effort','outputPolicy']}
                measurement['checkedAt']=timestamp(measurement['checkedAt'])
                measurement.update(output=raw['outputs'][-1] or '',sourceDigest=digest,attempts=[{'step':a['step'],'status':a['status'],'error':a['error'],'maxOutputTokens':a['_raw']['request']['max_tokens'],'tokenUsage':{k:a['metrics'].get(k) for k in ['inputTokens','outputTokens','reasoningTokens']}} for a in raw['attempts']])
                if task['id']=='receipt':measurement['imageSha256']=raw['imageSha256']
            items.append({'taskId':task['id'],'score':None,'reason':reason if not measurement or not measurement['attempts'] else '答卷已保存，等待按本期规则复核。','reviewer':'unreviewed','measurement':measurement})
        limit_source=spec['sources']['native_sonnet_overview'] if sonnet else spec['current_constants_url']
        snapshot=PUBLIC/('sonnet-5-5-overview-jina.md' if sonnet else 'constants-J_jdvA11.js')
        models.append({'modelId':ident,'name':name,'apiModel':api,'provider':'CommandCode','effort':'high','eligibility':eligible,'eligibilityReason':reason,
            'maxOutputTokens':limit,'limitStatus':'declared' if sonnet else 'unverified','limitSource':limit_source,'limitSourceDigest':hashlib.sha256(snapshot.read_bytes()).hexdigest(),
            'limitAuthority':'model-publisher' if sonnet else 'service','limitNote':'原厂输出上限仅作参考，实际请求额度受剩余预算约束。' if sonnet else reason,
            'outputPolicy':'budget-bounded-output' if sonnet else 'service-declared-maximum','checkedAt':timestamp(),'requests':n,'successfulRequests':ok,
            'sourceDigest':hashlib.sha256((''.join(digests)+source_hash).encode()).hexdigest(),'items':items})
        total+=n;successful+=ok
    doc={'schemaVersion':'daily-high-supplement-v1','suiteId':base['suiteId'],'scoreVersion':base['scoreVersion'],'effort':'high','timeoutSeconds':None,'automaticRetries':0,
         'updatedAt':timestamp(),'tasks':base['tasks'],'models':models,'totalRequests':total,'successfulRequests':successful,'preflightSource':spec['current_constants_url']}
    core.write_json(target,doc);return {'models':len(models),'requests':total,'successes':successful,'scoresAdded':0}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='results/effort-expansion-sonnet-20261031');p.add_argument('--out',default='dist/data/high-supplement.json');a=p.parse_args();print(build(ROOT/a.source,ROOT/a.out))
