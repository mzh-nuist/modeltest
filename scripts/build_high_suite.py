"""Publish high-only answers and explicit blocked states, never reuse lower efforts."""
import argparse,base64,datetime as dt,hashlib
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner import core
from runner.checkup import ROOT
from runner.commandcode_daily_selected import SELECTION
from scripts.record_effort_review import missing_finish_only

def build(source,target=None):
    source=Path(source);plan=core.load_json(source/'plan.json');suite=core.load_json(ROOT/'dist/data/completed-suite.json');bank=core.load_json(ROOT/'dist/data/checkup.json')
    if plan['effort']!='high' or plan['timeoutSeconds'] is not None or plan['outputPolicy'] not in ('service-declared-maximum','per-model-recorded') or plan['tasks']!=suite['tasks']:raise ValueError('High-only protocol drift')
    review_file=source/'assistant-review.json';review=core.load_json(review_file) if review_file.exists() else {'profiles':[]}
    reviews={p['modelId']:{x['taskId']:x for x in p['items']} for p in review['profiles'] if p['effort']=='high'}
    models=[];total=successful=0
    for limit,selected in zip(plan['models'],SELECTION):
        ident,name,api,*_=selected;items=[];digests=[];dates=[];calls=ok=0
        if limit['modelId']!=ident or limit['apiModel']!=api:raise ValueError('Limits do not match model')
        cap=limit['maxOutputTokens']
        policy=plan.get('modelOutputPolicies',{}).get(ident,'service-declared-maximum');bounded=policy=='budget-bounded-output'
        if policy not in ('service-declared-maximum','budget-bounded-output') or bounded and ident not in ('kimi-k31-pro','kimi-k3'):raise ValueError('Unexpected output budget policy')
        for task in suite['tasks']:
            path=source/ident/'high'/(task['id']+'.json');mark=reviews.get(ident,{}).get(task['id'])
            if not path.exists():items.append({'taskId':task['id'],'score':None,'reason':'尚未采集本项high答卷。' if cap else limit['note'],'measurement':None});continue
            raw=core.load_json(path);digest=hashlib.sha256(path.read_bytes()).hexdigest();digests.append(digest);dates.append(raw['checkedAt']);attempts=raw['attempts']
            if raw['effort']!='high' or raw['apiModel']!=api or raw['maxOutputTokens']!=cap or raw['timeoutSeconds'] is not None:raise ValueError('Actual model or high settings differ')
            if raw.get('outputPolicy','service-declared-maximum')!=policy:raise ValueError('Output budget policy changed')
            history=[]
            for j,a in enumerate(attempts):
                history.append({'role':'user','content':task['prompts'][j]});request=a['_raw']['request']
                actual_cap=request.get('max_completion_tokens')
                valid_cap=isinstance(actual_cap,int) and not isinstance(actual_cap,bool) and 8192<=actual_cap<=cap if bounded else actual_cap==cap
                if request['model']!=api or request.get('reasoning_effort')!='high' or not valid_cap:raise ValueError('Request was not high at the declared output settings')
                if task['id']=='receipt':
                    actual=request['messages'][0]['content'];image=base64.b64decode(actual[1]['image_url']['url'].split(',',1)[1])
                    if actual[0]!={'type':'text','text':task['prompts'][0]} or hashlib.sha256(image).hexdigest()!=task['imageSha256']:raise ValueError('Receipt image or question changed')
                elif request['messages']!=history:raise ValueError('Real conversation history changed')
                if a['status']=='success':
                    assistant={'role':'assistant','content':a['output']}
                    if bounded:assistant['reasoning_content']=a['_raw']['reasoningOutput']
                    history.append(assistant)
            calls+=len(attempts);ok+=sum(a['status']=='success' for a in attempts)
            measurement={k:raw[k] for k in ['status','error','outputs','checkedAt','apiModel','provider','condition','maxOutputTokens','timeoutSeconds','effort']}
            if measurement['status']=='success' and any(o is None for o in raw['outputs']):measurement['status']='incomplete'
            measurement.update(output=raw['outputs'][-1] or '',sourceDigest=digest,outputPolicy=policy,
                attempts=[{'step':a['step'],'status':a['status'],'error':a['error'],'httpStatus':a['_raw']['httpStatus'],'streamDone':a['_raw'].get('streamDone'),'finishSeen':a['_raw'].get('finishSeen'),'maxOutputTokens':a['_raw']['request']['max_completion_tokens'],'tokenUsage':{k:a['metrics'].get(k) for k in ['inputTokens','outputTokens','reasoningTokens']}} for a in attempts])
            if bounded:measurement['condition']='high；按预算分配输出，各轮实际额度：'+('、'.join(str(a['maxOutputTokens']) for a in measurement['attempts']) or '尚未发送')+' token；不设客户端总时长；无自动重试。'
            if task['id']=='receipt':measurement['imageSha256']=raw['imageSha256']
            score=None;reason=limit['note'] if cap is None else '已采集，等待按实际答卷初评。'
            if not attempts and cap is not None:
                reason='按最大输出预留费用后超过原20%剩余预算，尚未发送，保留未测。' if raw['error']=='original_twenty_percent_budget_exhausted' else '尚未发送：'+str(raw['error'] or '等待采集')
            if any(a['status']!='success' for a in attempts):score=0;reason='本次high未完整交付（'+str(raw['error'])+'），按交付失败计0；不据此断言总体能力错误。'
            failed=[a for a in attempts if a['status']!='success']
            if failed and all(a['_raw'].get('streamDone') and not a['_raw'].get('finishSeen') and a['output'].strip() for a in failed):
                reason='接口已返回正文和数据流结束标记，但没有标准完成原因；按既有交付规则计0，不能据此认定正文答案错误。原回答完整保留供复核。'
            elif measurement['status']=='success' and task['id']=='edit' and raw['outputs'][-1].strip()==bank['tasks'][2]['exactAnswer'].strip():score=2;reason='最终句与目标句逐字一致，仅忽略首尾空白。'
            if mark:
                owner_exception=(task['id']=='purpose' and mark.get('reviewer')=='site-owner' and mark.get('adjudication')=='owner-accepted-content-missing-finish' and missing_finish_only(raw))
                if mark['sourceDigest']!=digest or raw['status']!='success' and not owner_exception:raise ValueError('Review not bound to completed actual evidence')
                score=mark['score'];reason=mark['reason']
            item={'taskId':task['id'],'score':score,'reason':reason,'reviewer':'rule' if task['id']=='edit' and score==2 and not mark else mark.get('reviewer','assistant-first-pass') if mark else 'delivery-rule','measurement':measurement}
            if mark and 'adjudication' in mark:item['adjudication']=mark['adjudication']
            if mark and 'criteriaScores' in mark:item['criteriaScores']=mark['criteriaScores']
            items.append(item)
        models.append({'modelId':ident,'name':name,'apiModel':api,'provider':'CommandCode','effort':'high','maxOutputTokens':cap,'limitStatus':limit['limitStatus'],
            'limitSource':limit.get('limitSource',plan['limitSource']),'limitSourceDigest':limit.get('limitSourceDigest',plan['limitSourceDigest']),'limitAuthority':limit.get('limitAuthority','service'),
            'limitNote':'原厂上限是能力资料；本轮实际输出额度按原20%剩余预算逐次计算，未独立验证CommandCode内部上限。' if bounded else limit['note'],'outputPolicy':policy,'checkedAt':dt.datetime.fromisoformat(max(dates).replace('Z','+00:00')).isoformat(timespec='milliseconds') if dates else None,
            'requests':calls,'successfulRequests':ok,'sourceDigest':hashlib.sha256(''.join(digests).encode()).hexdigest(),'items':items})
        total+=calls;successful+=ok
    result={'schemaVersion':'daily-high-v1','suiteId':suite['suiteId'],'scoreVersion':'high-only-100-v1','origin':'publisher-local-high-only-collection',
        'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),'effort':'high','timeoutSeconds':None,'automaticRetries':0,'outputPolicy':plan['outputPolicy'],
        'limitSource':plan['limitSource'],'limitSourceDigest':plan['limitSourceDigest'],'totalRequests':total,'successfulRequests':successful,'tasks':suite['tasks'],'models':models,
        'previousCollection':{'label':'已停止的16k多档历史，不参与本轮high成绩','recordedModelCalls':115,'responseNotRecoveredCalls':1,'download':'data/effort-matrix.json'}}
    core.write_json(target or ROOT/'dist/data/high-suite.json',result);return {'requests':total,'successes':successful,'modelsAttempted':sum(m['requests']>0 for m in models),'reviewedItems':sum(i['score'] is not None for m in models for i in m['items'])}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',default='results/effort-high-20261026');a=p.parse_args();print(build(ROOT/a.source))
