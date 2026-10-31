"""Five user-selected daily checks, bounded by 20% of a fresh account credit balance."""
import argparse
import datetime as dt
from decimal import Decimal, ROUND_DOWN
import json
import os
from pathlib import Path
import urllib.request
from . import core
from .checkup import SUITE, load_bank
from .checkup_collect import collect, make_plan

BASE='https://api.commandcode.ai'
BALANCE_URL=BASE+'/alpha/billing/credits'
SOURCE='https://commandcode.ai/docs/plans/goat'
ENV_NAME='ZHUFENG_DAILY_SELECTED_COMMANDCODE_KEY'
# GOAT's official client defines a 70-credit pool; each selected model's
# published allowance is >=20. Round 70/20 upward to reserve safely in pool units.
ACCOUNT_CREDIT_FACTOR=Decimal('4')
SELECTION=[
 ('deepseek-v41-flash','DeepSeek V4.1 Flash','deepseek/deepseek-v4.1-flash',.30,1.20),
 ('kimi-k31-pro','Kimi K3.1 Pro','moonshotai/Kimi-K3.1-Pro',2,10),
 ('kimi-k3','Kimi K3','moonshotai/Kimi-K3',3,15),
 ('glm53-flash','GLM-5.3 Flash','z-ai/glm-5.3-flash',.15,.50),
 ('minimax-m31-flash','MiniMax M3.1 Flash','minimax/minimax-m3.1-flash',.15,.60),
]


def configuration(row):
    ident,name,api,inp,out=row
    return {'suiteId':SUITE,'title':name+' 六项真实体检','simulation':False,'includeVisual':True,
            'budgetUsd':0,'concurrency':1,'repeats':1,'maxRetries':0,'timeoutSeconds':180,
            'region':'本机 Windows 客户端；网络出口位置未独立核验',
            'models':[{'id':ident,'name':name,'provider':'CommandCode GOAT','adapter':'openai-compatible',
                       'endpoint':BASE+'/provider/v1/chat/completions','apiModel':api,'apiKeyEnv':ENV_NAME,
                       'temperature':None,'reasoningEffort':None,'maxInputTokens':32768,'maxOutputTokens':8192,
                       'maxTokensParameter':'max_completion_tokens','outputLimitIncludesReasoning':True,
                       'usageSemantics':'includes_reasoning','inputPrice':inp,'outputPrice':out,
                       'cachedInputPrice':None,'currency':'USD','sourceUrl':SOURCE,
                       'sourceDate':'2026-10-25'}]}


def read_balance(key):
    req=urllib.request.Request(BALANCE_URL,headers={'Authorization':'Bearer '+key,
        'User-Agent':'ZhufengEval/1.0','Accept':'application/json'},method='GET')
    with urllib.request.build_opener(core.NoRedirect()).open(req,timeout=30) as response:
        data=json.loads(response.read(1000000).decode('utf-8'),parse_float=Decimal)
    values={k:Decimal(str(data['credits'][k])) for k in ['monthlyCredits','purchasedCredits','freeCredits']}
    if any(not v.is_finite() or v<0 for v in values.values()):raise core.ConfigError('Invalid current credit balance')
    return {'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),
            **{k:str(v) for k,v in values.items()},'totalUsd':str(sum(values.values()))}


class CreditGuard:
    def __init__(self,key,initial,destination):
        self.key=key;self.initial=Decimal(initial['totalUsd']);self.cap=(self.initial*Decimal('.20')).quantize(Decimal('.01'),rounding=ROUND_DOWN)
        self.floor=self.initial-self.cap;self.destination=Path(destination);self.events=[{'phase':'initial',**initial}]
        self.stopped=None;self.calls=0;self.save()

    def save(self):
        core.write_json(self.destination/'credit-ledger.json',{'initialBalanceUsd':str(self.initial),
            'approvedFraction':'.20','fixedBudgetUsd':str(self.cap),'minimumRemainingUsd':str(self.floor),
            'nominalToAccountCreditReservationFactor':str(ACCOUNT_CREDIT_FACTOR),
            'callsSent':self.calls,'stopped':self.stopped,'events':self.events,
            'note':'Account balance changes can include concurrent activity. Model token-price estimates are recorded separately.'})

    def __call__(self,phase,reserve):
        if self.stopped:return self.stopped
        try:
            balance=read_balance(self.key);current=Decimal(balance['totalUsd'])
            account_reserve=Decimal(str(reserve))*ACCOUNT_CREDIT_FACTOR
            self.events.append({'phase':phase,'nominalReserveUsd':str(reserve),'accountCreditReserve':str(account_reserve),**balance})
            if current<self.floor or (phase=='before' and current-account_reserve<self.floor):
                self.stopped='account_twenty_percent_limit'
            if phase=='before' and not self.stopped:
                self.calls+=1;print('Sending request '+str(self.calls)+'; verified account balance '+str(current)+' credits.',flush=True)
        except (ValueError,OSError,TypeError,KeyError):
            self.stopped='account_balance_unavailable'
        self.save();return self.stopped


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);p.add_argument('--execute',action='store_true')
    a=p.parse_args(argv);bank=load_bank();configs=[configuration(row) for row in SELECTION]
    plans=[make_plan(c,bank) for c in configs];upper=sum(Decimal(str(p['reservedUpperBoundUsd'])) for p in plans)
    if not a.execute:
        print(json.dumps({'models':len(configs),'requests':sum(p['plannedRequests'] for p in plans),
                          'reservedUpperBoundUsd':str(upper),'networkCalls':0}));return 0
    destination=Path(a.out)
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):raise core.ConfigError('Use a new evidence directory')
    provider=core.load_json(Path.home()/'.opencodex/config.json').get('providers',{}).get('commandcode',{})
    key=provider.get('apiKey')
    if provider.get('baseUrl','').rstrip('/')!=BASE+'/provider/v1' or not isinstance(key,str) or len(key)<8:
        raise core.ConfigError('Unexpected local service or credential unavailable')
    initial=read_balance(key);cap=(Decimal(initial['totalUsd'])*Decimal('.20')).quantize(Decimal('.01'),rounding=ROUND_DOWN)
    if cap<=0 or upper>cap:raise core.ConfigError('Full pass does not fit 20% of the verified remaining credits')
    req=urllib.request.Request(BASE+'/provider/v1/models',headers={'Authorization':'Bearer '+key,'User-Agent':'ZhufengEval/1.0','Accept':'application/json'})
    with urllib.request.build_opener(core.NoRedirect()).open(req,timeout=30) as response:catalog=json.load(response)
    entries={m['id']:m for m in catalog['data']}
    if any('/chat/completions' not in entries.get(c['models'][0]['apiModel'],{}).get('supported_endpoints',[]) for c in configs):
        raise core.ConfigError('Selected route no longer advertised')
    destination.mkdir(parents=True,exist_ok=False);guard=CreditGuard(key,initial,destination)
    core.write_json(destination/'batch-plan.json',{'models':[{**c,'budgetUsd':float(pl['reservedUpperBoundUsd'])} for c,pl in zip(configs,plans)],
        'plannedRequests':sum(pl['plannedRequests'] for pl in plans),'reservedUpperBoundUsd':str(upper),'fixedAccountBudgetUsd':str(cap),
        'nominalToAccountCreditReservationFactor':str(ACCOUNT_CREDIT_FACTOR),
        'maximumAccountReservationIfEveryCallHitsItsCap':str(upper*ACCOUNT_CREDIT_FACTOR),
        'accountBudgetPolicy':'Reserve each call in account-credit units; stop before a call if it cannot fit the fixed remaining budget.',
        'balanceEndpointSource':'CommandCode official public client constants-CMRL4Ro5.js: BILLING.CREDITS',
        'pricingSource':SOURCE,'pricingNote':'DeepSeek uses the higher published peak rates. No cached-input discount assumed.'})
    previous=os.environ.get(ENV_NAME);os.environ[ENV_NAME]=key;summaries=[]
    try:
        print('Fixed cap '+str(cap)+' credits; full reservation '+str(upper)+'; no recharge, model fallback or retries.',flush=True)
        for config,plan in zip(configs,plans):
            if guard.stopped:break
            config['budgetUsd']=float(plan['reservedUpperBoundUsd'])+1e-10
            print('MODEL '+config['models'][0]['name'],flush=True)
            _,summary=collect(config,bank,destination/config['models'][0]['id'],allow_paid=True,budget_guard=guard)
            if summary['halted'] in ('provider_usage_exceeds_reservation','budget_reservation_exhausted'):
                guard.stopped=summary['halted'];guard.save()
            summaries.append({'modelId':config['models'][0]['id'],**summary})
            core.write_json(destination/'batch-summary.json',{'models':summaries,'halted':guard.stopped})
        guard('final',0);print(json.dumps({'modelsAttempted':len(summaries),'requests':sum(s['modelApiCalls'] for s in summaries),'halted':guard.stopped},ensure_ascii=False))
    finally:
        if previous is None:os.environ.pop(ENV_NAME,None)
        else:os.environ[ENV_NAME]=previous
    return 0


if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,TypeError,KeyError):
        print('Selected-model collection stopped: check configuration, balance or service availability. No secrets logged.');raise SystemExit(2)
