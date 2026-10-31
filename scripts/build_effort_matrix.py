"""Export whitelisted three-effort evidence; semantic scores require saved review."""
import argparse,base64,datetime as dt,hashlib,json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner import core
from runner.checkup import ROOT
from runner.commandcode_daily_selected import SELECTION
from runner.commandcode_effort_matrix import EFFORTS,OUTPUT_CAP,TIMEOUT

def build(source,target=None):
    source=Path(source);plan=core.load_json(source/'plan.json');suite=core.load_json(ROOT/'dist/data/completed-suite.json');bank=core.load_json(ROOT/'dist/data/checkup.json')
    if plan['tasks']!=suite['tasks'] or plan['conditions']!={'maxOutputTokens':OUTPUT_CAP,'timeoutSeconds':TIMEOUT,'retries':0,'temperature':None}:raise ValueError('Plan drift')
    review_path=source/'assistant-review.json';review=core.load_json(review_path) if review_path.exists() else {'profiles':[]}
    reviews={(x['modelId'],x['effort']):{i['taskId']:i for i in x['items']} for x in review['profiles']}
    models=[];total=successful=0
    for ident,name,api,*_ in SELECTION:
      profiles=[]
      for effort in EFFORTS:
        items=[];digests=[];accepted=False;dates=[];calls=successes=0
        for task in suite['tasks']:
            path=source/ident/effort/(task['id']+'.json');mark=reviews.get((ident,effort),{}).get(task['id'])
            if not path.exists():items.append({'taskId':task['id'],'score':None,'reason':'尚未采集本档本项。','measurement':None});continue
            raw=core.load_json(path);attempts=raw['attempts'];digest=hashlib.sha256(path.read_bytes()).hexdigest();digests.append(digest);dates.append(raw['checkedAt'])
            if raw['modelId']!=ident or raw['apiModel']!=api or raw['effort']!=effort or len(attempts)>len(task['prompts']):raise ValueError('Model/effort/task mismatch')
            history=[]
            for j,a in enumerate(attempts):
                history.append({'role':'user','content':task['prompts'][j]});request=a['_raw']['request'];actual=request['messages']
                if request['model']!=api or request.get('reasoning_effort')!=effort or request.get('max_completion_tokens')!=OUTPUT_CAP or request.get('temperature') is not None:raise ValueError('Actual request conditions differ')
                if task['id']=='receipt':
                    if actual[0]['content'][0]!={'type':'text','text':task['prompts'][0]}:raise ValueError('Image prompt changed')
                    image=base64.b64decode(actual[0]['content'][1]['image_url']['url'].split(',',1)[1]);image_hash=hashlib.sha256(image).hexdigest()
                    if image_hash!=task['imageSha256']:raise ValueError('Wrong original image')
                elif actual!=history:raise ValueError('Conversation history changed')
                accepted|=a['_raw']['httpStatus']==200
                if a['status']=='success':history.append({'role':'assistant','content':a['output']})
            calls+=len(attempts);successes+=sum(a['status']=='success' for a in attempts)
            measurement={k:raw[k] for k in ['status','error','outputs','checkedAt','apiModel','provider','condition']}
            if measurement['status']=='success' and any(o is None for o in raw['outputs']):measurement['status']='incomplete'
            measurement.update(output=raw['outputs'][-1] or '',sourceDigest=digest,effort=effort,
                attempts=[{'step':a['step'],'status':a['status'],'error':a['error'],'output':a['output'],'httpStatus':a['_raw']['httpStatus'],
                    'tokenUsage':{k:a['metrics'].get(k) for k in ['inputTokens','outputTokens','reasoningTokens']}} for a in attempts])
            if task['id']=='receipt':measurement['imageSha256']=raw['imageSha256']
            score=None;reason='已采集，等待按实际答卷初评。'
            # A missing/blocked turn is pending. An attempted delivery failure stays explicit.
            if any(a['status']!='success' for a in attempts):score=0;reason='本档规定条件下未完整交付（'+str(raw['error'])+'），本次交付计0分；不据此断言内容或总体能力错误。'
            elif measurement['status']=='success' and task['id']=='edit' and raw['outputs'][-1].strip()==bank['tasks'][2]['exactAnswer'].strip():score=2;reason='最终句与目标句逐字一致，仅忽略首尾空白。'
            if mark is not None:
                if mark.get('sourceDigest')!=digest:raise ValueError('Review not bound to exact evidence')
                score=mark['score'];reason=mark['reason']
                if not isinstance(score,(float,int)) or isinstance(score,bool) or not 0<=score<=2:raise ValueError('Invalid reviewed score')
            item={'taskId':task['id'],'score':score,'reason':reason,'reviewer':'rule' if task['id']=='edit' and mark is None and score==2 else 'assistant-first-pass' if mark else 'delivery-rule','measurement':measurement}
            if mark and 'criteriaScores' in mark:item['criteriaScores']=mark['criteriaScores']
            items.append(item)
        profiles.append({'effort':effort,'parameterAccepted':accepted if calls else None,'upstreamEffortVerified':False,'sourceDigest':hashlib.sha256(''.join(digests).encode()).hexdigest(),
            'checkedAt':dt.datetime.fromisoformat(max(dates).replace('Z','+00:00')).isoformat(timespec='milliseconds') if dates else None,'requests':calls,'successfulRequests':successes,'items':items})
        total+=calls;successful+=successes
      models.append({'modelId':ident,'name':name,'apiModel':api,'provider':'CommandCode','profiles':profiles})
    result={'schemaVersion':'daily-effort-v1','suiteId':suite['suiteId'],'scoreVersion':'weighted-100-effort-v1','updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),
        'origin':'publisher-local-api-effort-matrix','selectionPolicy':'max-whole-suite','tieBreak':list(EFFORTS),'requestedEfforts':list(EFFORTS),
        'conditions':plan['conditions'],'plannedRequests':plan['maxRequests'],'totalRequests':total,'successfulRequests':successful,'tasks':suite['tasks'],'models':models}
    core.write_json(target or ROOT/'dist/data/effort-matrix.json',result)
    return {'requests':total,'successes':successful,'reviewedItems':sum(i['score'] is not None for m in models for p in m['profiles'] for i in p['items'])}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',default='results/effort-three-20261026');a=p.parse_args();print(json.dumps(build(ROOT/a.source)))
