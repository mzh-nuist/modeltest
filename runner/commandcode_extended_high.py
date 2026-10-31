"""Explicitly authorized 2026-10-31 high supplement, bounded by existing credits."""
import argparse,base64,hashlib,json,sys
from decimal import Decimal
from pathlib import Path
from runner import core
from runner.commandcode_daily_selected import read_balance,BASE
from runner.commandcode_expansion import ExpansionGuard,cost,input_bound

ROOT=Path(__file__).resolve().parents[1]
MODELS=[
 ('claude-sonnet55','Claude Sonnet 5.5','claude-sonnet-5-5','Claude','anthropic-messages',128000,4,10,7,'https://platform.claude.com/docs/en/models/sonnet-5-5/overview','model-publisher'),
 ('claude-haiku55','Claude Haiku 5.5','claude-haiku-5-5','Claude','anthropic-messages',128000,.2,.5,3.5,'https://platform.claude.com/docs/en/models/haiku-5-5/overview','model-publisher'),
 ('gpt6-luna','GPT-6 Luna','gpt-6-luna','GPT','openai-compatible',128000,.125,.5,3.5,'https://developers.openai.com/api/docs/models/gpt-6-luna','model-publisher'),
 ('gemini38-flash','Gemini 3.8 Flash','google/gemini-3.8-flash','Gemini','openai-compatible',65536,1.5,7.5,1.75,'https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash','model-publisher'),
 ('mistral-large4','Mistral Large 4','mistral/mistral-large-4','Mistral','openai-compatible',262144,1.36,4.18,3.5,'https://commandcode.ai/assets/constants-J_jdvA11.js','service'),
]

def specs():
 result=[]
 for ident,name,api,family,adapter,limit,inp,out,factor,source,authority in MODELS:
  m={'id':ident,'name':name,'apiModel':api,'family':family,'provider':'CommandCode','adapter':adapter,
     'endpoint':BASE+('/provider/v1/messages' if adapter=='anthropic-messages' else '/provider/v1/chat/completions'),
     'reasoningEffort':'high','temperature':None,'usageSemantics':'includes_reasoning','maxOutputTokens':limit,
     'maxTokensParameter':'max_tokens' if adapter=='anthropic-messages' else 'max_completion_tokens',
     'inputPrice':inp,'outputPrice':out,'creditFactor':factor,'limitSource':source,'limitAuthority':authority}
  if adapter=='anthropic-messages':m['anthropicEffortProtocol']='adaptive-v1'
  result.append(m)
 return result

class AuthorizedGuard(ExpansionGuard):
 def __init__(self,key,destination,balance_reader=read_balance,initial=None,historical_reserve=None):
  initial=initial or balance_reader(key)
  if historical_reserve is None:
   old=core.load_json(ROOT/'results/effort-high-kimi-budget-20261026/closing-credit-audit.json')
   historical_reserve=Decimal(old['pastUnknownReserveCredits'])+Decimal(old['extraConservativeReserveCredits'])
  reserve=Decimal(historical_reserve);available=Decimal(initial['totalUsd'])-reserve
  if available<=0:raise core.ConfigError('No existing credits after unresolved historical reserves')
  anchor={'originalCapCredits':str(available),'conservativeHeadroomCredits':str(available),'withinOriginalCap':True,
          'pastUnknownReserveCredits':str(reserve),'extraConservativeReserveCredits':'0'}
  super().__init__(key,destination,balance_reader,anchor,{'originalMinimumRemainingCredits':'0'})
  self.state.update(authorization='user-approved-existing-credits-20261031',oldTwentyPercentCapSuperseded=True,
                    noRecharge=True,noPlanChange=True,maximumRequests=65)
  self.save()

def run(destination,key,models=None,guard=None,requester=core.request_once):
 destination=Path(destination);tasks=core.load_json(ROOT/'dist/data/high-suite.json')['tasks']
 selected=models or specs();guard=guard or AuthorizedGuard(key,destination)
 plan={'authorization':'user-approved-existing-credits-20261031','effort':'high','timeoutSeconds':None,
       'automaticRetries':0,'maxRequests':sum(len(t['prompts']) for t in tasks)*len(selected),'models':selected,'tasks':tasks,
       'budgetPolicy':'Use only the fixed existing balance minus unresolved historical reserves; prior 20% cap superseded by explicit user authorization.',
       'outputPolicy':'budget-bounded-output','noRecharge':True,'noPlanChange':True,'checkedAt':core.now()}
 core.write_json(destination/'plan.json',plan)
 image=(ROOT/'dist/assets/receipt-chilli-pork.png').read_bytes()
 for model in selected:
  if guard.state['halted']:break
  for task in tasks:
   if guard.state['halted']:break
   path=destination/model['id']/'high'/(task['id']+'.json')
   if path.exists():raise core.ConfigError('Never overwrite or replay an attempted task')
   rec={'taskId':task['id'],'modelId':model['id'],'name':model['name'],'apiModel':model['apiModel'],'provider':'CommandCode',
        'effort':'high','maxOutputTokens':model['maxOutputTokens'],'timeoutSeconds':None,'outputPolicy':'budget-bounded-output',
        'condition':'high; recorded per-call output cap; no total deadline; no automatic retries; user-approved existing-credit batch',
        'checkedAt':core.now(),'status':'not_run','error':None,'outputs':[None]*len(task['prompts']),'attempts':[]}
   if task['id']=='receipt':
    rec['imageSha256']=hashlib.sha256(image).hexdigest()
    if rec['imageSha256']!=task['imageSha256']:raise core.ConfigError('Receipt image changed')
   history=[]
   for step,prompt in enumerate(task['prompts']):
    history.append({'role':'user','content':prompt});bound=input_bound(history,task['id']=='receipt')
    if bound>100000:rec['error']='input_reservation_tier_limit';break
    cap=guard.allocate(model,bound)
    if cap is None:rec['error']='authorized_existing_credit_budget_exhausted';break
    reservation=guard.before(f"{model['id']}/{task['id']}/{step+1}",model,bound,cap)
    if reservation is None:rec['error']='authorized_existing_credit_budget_exhausted';break
    core.write_json(path,rec)
    print(f"HIGH {guard.state['callsSent']}/65 {model['name']} {task['id']} {step+1}/{len(task['prompts'])} cap={cap}",flush=True)
    result=requester(model,{'prompt':prompt},{'simulation':False,'timeoutSeconds':None},cap,key,messages=history,
      input_image={'mediaType':'image/png','base64':base64.b64encode(image).decode('ascii')} if task['id']=='receipt' else None)
    rec['attempts'].append({'step':step+1,**result});rec['outputs'][step]=result['output'] or None
    rec.update(status=result['status'],error=result['error'],checkedAt=core.now())
    core.write_json(path,core.clean(rec,[key]));guard.after(model,result['metrics'])
    if result['status']!='success' or guard.state['halted']:break
    history.append({'role':'assistant','content':result['output']})
   if rec['status']=='success' and any(x is None for x in rec['outputs']):rec['status']='incomplete'
   core.write_json(path,core.clean(rec,[key]))
   core.write_json(destination/'progress.json',{'callsSent':guard.state['callsSent'],'model':model['name'],'task':task['id'],'status':rec['status'],'halted':guard.state['halted'],'at':core.now()})
   print(json.dumps({'model':model['id'],'task':task['id'],'status':rec['status'],'error':rec['error']},ensure_ascii=False),flush=True)
   # A rejected model/route should not cost seven more probes.
   if rec['attempts'] and rec['attempts'][-1].get('httpStatus') in (401,402,403,404,429):break
 result=guard.close();result.update(authorization=plan['authorization'],oldTwentyPercentCapSuperseded=True)
 core.write_json(destination/'closing-credit-audit.json',result)
 print(json.dumps({'callsSent':result['callsSent'],'newSpentBoundCredits':result['newSpentBoundCredits'],'remainingConservativeCredits':result['remainingConservativeCredits'],'halted':guard.state['halted']}),flush=True)

def main():
 p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--execute',action='store_true');a=p.parse_args()
 if not a.execute:print(json.dumps({'models':specs(),'maxRequests':65,'networkCalls':0}));return
 dest=Path(a.out).resolve()
 if not dest.is_relative_to(ROOT/'results') or dest.exists():raise core.ConfigError('Use a fresh private results directory')
 provider=core.load_json(Path.home()/'.opencodex/config.json')['providers']['commandcode']
 if provider['baseUrl'].rstrip('/')!=BASE+'/provider/v1':raise core.ConfigError('Unexpected endpoint')
 dest.mkdir(parents=True);run(dest,provider['apiKey'])
if __name__=='__main__':
 try:main()
 except Exception as e:print('Extended high batch stopped:',type(e).__name__,flush=True);sys.exit(2)
