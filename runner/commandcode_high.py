"""High only, recorded per-model output policy, no client deadline, original budget."""
import argparse,base64,hashlib,json
from decimal import Decimal
from pathlib import Path
from . import core
from .checkup import ROOT
from .commandcode_daily_selected import BASE,SELECTION,configuration
from .commandcode_effort_matrix import MatrixGuard

def high_plan():
    suite=core.load_json(ROOT/'dist/data/completed-suite.json');limits=core.load_json(ROOT/'dist/data/high-model-limits.json')
    return {'schemaVersion':'high-only-plan-v1','effort':'high','timeoutSeconds':None,'automaticRetries':0,
        'outputPolicy':'service-declared-maximum','budgetPolicy':'original-fixed-twenty-percent','tasks':suite['tasks'],
        'models':limits['models'],'maxRequests':sum(len(t['prompts']) for t in suite['tasks'])*len(SELECTION),
        'limitSource':limits['source'],'limitSourceDigest':limits['sourceDigest']}

def reserve_for(model,task_id,cap):
    input_cap=65536 if task_id=='receipt' else 16384
    return (Decimal(str(model['inputPrice']))*input_cap+Decimal(str(model['outputPrice']))*cap)/Decimal(1000000)*4

def run(destination,key='',requester=core.request_once,guard=None,plan=None,model_ids=None):
    destination=Path(destination);plan=plan or high_plan();plan_path=destination/'plan.json'
    if plan_path.exists() and core.load_json(plan_path)!=plan:raise core.ConfigError('Existing high protocol changed; use a new evidence directory')
    core.write_json(plan_path,plan);guard=guard or MatrixGuard(key,destination)
    image=(ROOT/'dist/assets/receipt-chilli-pork.png').read_bytes()
    if hashlib.sha256(image).hexdigest()!=plan['tasks'][6]['imageSha256']:raise core.ConfigError('Original image changed')
    encoded=base64.b64encode(image).decode('ascii')
    pairs=list(zip(plan['models'],SELECTION))
    if model_ids is not None:
        known={m['modelId'] for m in plan['models']}
        if len(set(model_ids))!=len(model_ids) or not set(model_ids)<=known:raise core.ConfigError('Unknown or duplicate selected models')
        pairs=sorted((p for p in pairs if p[0]['modelId'] in model_ids),key=lambda p:model_ids.index(p[0]['modelId']))
    for model_limit,selected in pairs:
        if model_limit['modelId']!=selected[0] or model_limit['apiModel']!=selected[2]:raise core.ConfigError('Model limits mismatched')
        cap=model_limit['maxOutputTokens'];model=configuration(selected)['models'][0];model.update(reasoningEffort='high',maxOutputTokens=cap,maxInputTokens=16384)
        policy=plan.get('modelOutputPolicies',{}).get(model['id'],'service-declared-maximum');bounded=policy=='budget-bounded-output'
        if bounded:model['preserveReasoningHistory']=True
        for task in plan['tasks']:
            path=destination/model['id']/'high'/(task['id']+'.json');record=None;start=0
            if path.exists():
                record=core.load_json(path)
                if record['status']=='success' or any(a['status']!='success' for a in record['attempts']):continue
                start=len(record['attempts'])
                if start>=len(task['prompts']):continue
            if record is None:record={'taskId':task['id'],'modelId':model['id'],'name':model['name'],'apiModel':model['apiModel'],'provider':'CommandCode',
                'effort':'high','maxOutputTokens':cap,'timeoutSeconds':None,'condition':f'high; service max output {cap}; no total timeout; no automatic retries',
                'checkedAt':core.now(),'status':'not_run','error':None,'outputs':[None]*len(task['prompts']),'attempts':[]}
            if task['id']=='receipt':record['imageSha256']=hashlib.sha256(image).hexdigest()
            if bounded:record.update(outputPolicy=policy,condition='high; output cap derived from original remaining budget before each request; no total timeout; no automatic retries')
            if cap is None:record['error']='maximum_output_limit_unverified';core.write_json(path,record);continue
            if guard.halted:record['error']=guard.halted;core.write_json(path,record);continue
            history=[]
            for j in range(start):
                assistant={'role':'assistant','content':record['outputs'][j]}
                if bounded:assistant['reasoning_content']=record['attempts'][j]['_raw']['reasoningOutput']
                history.extend([{'role':'user','content':task['prompts'][j]},assistant])
            reservation=reserve_for(model,task['id'],cap)
            for step in range(start,len(task['prompts'])):
                prompt=task['prompts'][step];history.append({'role':'user','content':prompt})
                if len(json.dumps(history,ensure_ascii=False).encode('utf8'))+1024>16384:record['error']='input_reservation_exceeded';break
                actual_cap=guard.allocate_output_cap(model,task['id'],cap) if bounded else cap
                if actual_cap is None:record['error']=guard.halted;break
                reservation=reserve_for(model,task['id'],actual_cap)
                if guard.check('before',reservation):record['error']=guard.halted;break
                print(f"HIGH {guard.calls}: {model['name']} / {task['id']} / {step+1} / cap {actual_cap} / no deadline",flush=True)
                result=requester(model,{'prompt':prompt},{'simulation':False,'timeoutSeconds':None},actual_cap,key,messages=history,
                    input_image={'mediaType':'image/png','base64':encoded} if task['id']=='receipt' else None)
                metrics=result['metrics'];guard.check('after',reservation,metrics.get('inputTokens') is None or metrics.get('outputTokens') is None)
                if bounded:guard.record_usage(model,metrics,reservation)
                if metrics.get('inputTokens') is not None and metrics['inputTokens']>(65536 if task['id']=='receipt' else 16384) or metrics.get('outputTokens') is not None and metrics['outputTokens']>actual_cap:
                    guard.halted='reported_usage_exceeds_reservation';guard.save()
                record['attempts'].append({'step':step+1,**result});record['status']=result['status'];record['error']=result['error'];record['checkedAt']=core.now()
                if result['output'].strip():record['outputs'][step]=result['output']
                core.write_json(path,core.clean(record,[key]))
                if result['error']=='request_interrupted':guard.halted='request_interrupted';guard.save()
                if result['status']!='success' or guard.halted:break
                assistant={'role':'assistant','content':result['output']}
                if bounded:assistant['reasoning_content']=result['_raw']['reasoningOutput']
                history.append(assistant)
            if record['status']=='success' and any(o is None for o in record['outputs']):record['status']='incomplete'
            if guard.halted and record['status']!='success':record['error']=record['error'] or guard.halted
            core.write_json(path,core.clean(record,[key]));core.write_json(destination/'summary.json',{'kind':'measured','effort':'high','callsSent':guard.calls,'halted':guard.halted})
            print(json.dumps({'model':model['name'],'task':task['id'],'status':record['status'],'error':record['error']},ensure_ascii=False),flush=True)
    guard.check('final')

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);p.add_argument('--execute',action='store_true');p.add_argument('--resume',action='store_true');p.add_argument('--models',nargs='+');p.add_argument('--budget-aware',action='store_true');a=p.parse_args(argv)
    plan=high_plan()
    if a.budget_aware:
        if not a.models or not set(a.models)<={'kimi-k31-pro','kimi-k3'}:raise core.ConfigError('Budget-aware supplement is limited to the two Kimi models')
        plan.update(outputPolicy='per-model-recorded',modelOutputPolicies={m['modelId']:'budget-bounded-output' if m['modelId'] in a.models else 'service-declared-maximum' for m in plan['models']})
    if not a.execute:print(json.dumps({'effort':'high','timeoutSeconds':None,'maxRequests':plan['maxRequests'],'models':[{k:m[k] for k in ('modelId','maxOutputTokens','limitStatus')} for m in plan['models']],'networkCalls':0},ensure_ascii=False));return 0
    destination=Path(a.out)
    if destination.exists() and not a.resume:raise core.ConfigError('Use a new evidence directory or explicit resume')
    provider=core.load_json(Path.home()/'.opencodex/config.json')['providers']['commandcode']
    if provider['baseUrl'].rstrip('/')!=BASE+'/provider/v1':raise core.ConfigError('Unexpected service')
    destination.mkdir(parents=True,exist_ok=True)
    if a.budget_aware:
        from .budget_high import BudgetHighGuard
        guard=BudgetHighGuard(provider['apiKey'],destination)
    else:guard=None
    run(destination,key=provider['apiKey'],model_ids=a.models,plan=plan,guard=guard);return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,TypeError,KeyError):print('High-only run stopped; inspect private evidence. No credentials logged.');raise SystemExit(2)
