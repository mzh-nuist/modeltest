"""Explicit 2026-11-01 authorized pilot. No retries or account mutations."""
import argparse
import hashlib
import json
import subprocess
import urllib.request
from decimal import Decimal
from pathlib import Path
from runner import core
from runner.commandcode_daily_selected import BASE, SELECTION, configuration, read_balance
from runner.commandcode_extended_high import specs
from runner.commandcode_expansion import ExpansionGuard, cost, input_bound

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'results/short-challenges-20261101'
CAP = 16384
BUDGET = Decimal('25')


def models():
    selected = []
    for row in SELECTION:
        m = configuration(row)['models'][0]
        m.update(reasoningEffort='high', temperature=None)
        selected.append(m)
    selected.extend(specs())
    for m in selected:
        m.update(maxOutputTokens=CAP, creditFactor=7)
    return selected


def run(historical_ledger):
    if (DEST/'frozen-plan.json').exists():
        raise core.ConfigError('This batch was frozen already; never restart or replay it')
    p=core.load_json(Path.home()/'.opencodex/config.json')['providers']['commandcode']
    if p['baseUrl'].rstrip('/') != BASE+'/provider/v1':
        raise core.ConfigError('Unexpected endpoint')
    key=p['apiKey']; initial=read_balance(key)
    bank_path=ROOT/'dist/data/short-challenges.json'; bank_bytes=bank_path.read_bytes(); bank=json.loads(bank_bytes)
    grader_path=ROOT/'dist'/('short-challenge-grading.js' if bank['scoreVersion']=='short-rubric-v2' else 'short-challenge-engine.js')
    selected=models(); requests=sum(len(t['cases']) for t in bank['tasks'])*len(selected)
    if requests != 40: raise core.ConfigError('Unexpected request count')
    old=core.load_json(Path(historical_ledger))
    if old.get('inflight') or old.get('halted'):raise core.ConfigError('Unresolved historical batch')
    historical=Decimal(old['historicalUnknownAndUnsettledCredits'])
    if Decimal(initial['totalUsd'])-historical <= BUDGET:raise core.ConfigError('Insufficient existing credits')
    req=urllib.request.Request(BASE+'/provider/v1/models',headers={'Authorization':'Bearer '+key,'User-Agent':'ZhufengEval/1.0','Accept':'application/json'})
    with urllib.request.build_opener(core.NoRedirect()).open(req,timeout=30) as r: catalog=json.load(r)
    entries={m['id']:m for m in catalog['data']}
    for m in selected:
        route='/messages' if m['adapter']=='anthropic-messages' else '/chat/completions'
        if route not in entries.get(m['apiModel'],{}).get('supported_endpoints',[]):raise core.ConfigError('Route unavailable')
    jobs=[(m,t,c) for m in selected for t in bank['tasks'] for c in t['cases']]
    worst=sum(cost(m,input_bound([{'role':'user','content':c['prompt']}]),CAP) for m,t,c in jobs)
    if worst+Decimal('.05') > BUDGET:raise core.ConfigError('Fixed batch reservation exceeds cap')
    plan={'authorization':'user-approved-two-short-challenges-20261101','suiteId':bank['suiteId'],
        'bankSha256':hashlib.sha256(bank_bytes).hexdigest(),
        'graderSha256':hashlib.sha256(grader_path.read_bytes()).hexdigest(),
        'models':selected,'tasks':bank['tasks'],'requests':requests,'maxOutputTokens':CAP,'effort':'high',
        'repeatsPerCase':1,'timeoutSeconds':None,'automaticRetries':0,'fixedCreditCap':str(BUDGET),
        'maximumReservationCredits':str(worst),'historicalReserveCredits':str(historical),
        'accountFactor':7,'note':'Conservative factor 7 for all routes; real token usage and observed debit tracked separately. No recharge or plan change.',
        'frozenAt':core.now()}
    core.write_json(DEST/'frozen-plan.json',plan)
    anchor={'originalCapCredits':str(BUDGET),'conservativeHeadroomCredits':str(BUDGET),'withinOriginalCap':True,
        'pastUnknownReserveCredits':str(historical),'extraConservativeReserveCredits':'0'}
    floor=Decimal(initial['totalUsd'])-historical-BUDGET
    guard=ExpansionGuard(key,DEST,anchor=anchor,old={'originalMinimumRemainingCredits':str(floor)})
    records=[]
    print(json.dumps({'requests':requests,'maximumReservationCredits':str(worst),'fixedCap':str(BUDGET)}),flush=True)
    for m,t,c in jobs:
        if guard.state['halted']:break
        if bank_path.read_bytes()!=bank_bytes:raise core.ConfigError('Frozen bank changed')
        if hashlib.sha256(grader_path.read_bytes()).hexdigest()!=plan['graderSha256']:raise core.ConfigError('Frozen grader changed')
        target=DEST/'raw'/m['id']/(c['id']+'.json')
        if target.exists():raise core.ConfigError('Never replay a request')
        history=[{'role':'user','content':c['prompt']}]; bound=input_bound(history)
        if guard.before(m['id']+'/'+c['id'],m,bound,CAP) is None:break
        core.write_json(target,{'status':'sending','modelId':m['id'],'caseId':c['id'],'at':core.now()})
        print(f"REQUEST {guard.state['callsSent']}/40 {m['id']} {c['id']}",flush=True)
        result=core.request_once(m,{'prompt':c['prompt']},{'simulation':False,'timeoutSeconds':None},CAP,key,messages=history)
        core.write_json(target,core.clean(result,[key]));guard.after(m,result['metrics'])
        digest=hashlib.sha256(target.read_bytes()).hexdigest()
        rec={'modelId':m['id'],'name':m['name'],'apiModel':m['apiModel'],'provider':'CommandCode','taskId':t['id'],'caseId':c['id'],
            'status':result['status'],'error':result.get('error'),'output':result.get('output') or '',
            'checkedAt':core.now(),'sourceDigest':digest,'effort':'high','maxOutputTokens':CAP,
            'tokenUsage':{k:result['metrics'].get(k) for k in ['inputTokens','outputTokens','reasoningTokens']}}
        records.append(core.clean(rec,[key]));core.write_json(DEST/'collected.json',records)
        print(json.dumps({'done':len(records),'model':m['id'],'case':c['id'],'status':rec['status'],'outputLength':len(rec['output'])}),flush=True)
        if result.get('httpStatus') in (401,402,403,404,429):
            guard.state['halted']='provider_rejected_route';guard.save();break
    audit=guard.close();audit['closingBalance']=read_balance(key);audit['halted']=guard.state['halted'];core.write_json(DEST/'closing-credit-audit.json',audit)
    subprocess.run(['node','scripts/grade_short_batch.mjs',str(DEST/'collected.json'),str(DEST/'graded.json')],cwd=ROOT,check=True)
    graded=core.load_json(DEST/'graded.json')
    public={'schemaVersion':'short-results-v1','suiteId':bank['suiteId'],'scoreVersion':bank['scoreVersion'],
        'bankSha256':plan['bankSha256'],'graderSha256':plan['graderSha256'],'updatedAt':core.now(),
        'modelCalls':guard.state['callsSent'],'successfulRequests':sum(r['status']=='success' for r in graded),
        'plannedRequests':40,'effort':'high','maxOutputTokens':CAP,'repeatsPerCase':1,'automaticRetries':0,
        'identityNote':'型号按第三方服务商声明，未独立核验上游身份。','records':graded}
    core.write_json(ROOT/'dist/data/short-challenge-results.json',public)
    print(json.dumps({'complete':len(graded),'successes':public['successfulRequests'],'spentBound':audit['newSpentBoundCredits'],'halted':audit['halted']}),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--execute',action='store_true');parser.add_argument('--historical-ledger');args=parser.parse_args()
    if not args.execute:print(json.dumps({'models':len(models()),'requests':40,'networkCalls':0}))
    else:
        try:
            if not args.historical_ledger:raise core.ConfigError('An explicit historical ledger is required')
            run(args.historical_ledger)
        except Exception as e:
            print('Short batch stopped: '+type(e).__name__,flush=True);raise SystemExit(2)
