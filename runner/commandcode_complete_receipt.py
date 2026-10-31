"""Run the missing receipt once per existing model, under the ORIGINAL account cap."""
import argparse,datetime as dt,json
from decimal import Decimal
from pathlib import Path
import urllib.request
from . import core
from .receipt import prepare,ROOT
from .commandcode_daily_selected import SELECTION,configuration,BASE,read_balance

PAST=ROOT/'results/daily-selected-five-20261025'
class OriginalCreditGuard:
    def __init__(self,key,destination):
        self.key=key;self.destination=destination;self.events=[];self.calls=0;self.halted=None
        old=core.load_json(PAST/'credit-ledger.json');closing=core.load_json(PAST/'closing-credit-audit.json')
        self.originalFloor=Decimal(old['minimumRemainingUsd']);self.fixedCap=Decimal(old['fixedBudgetUsd'])
        self.unknownReserve=Decimal(closing['unknownUsageFullAccountCreditReservation']);self.newUnknown=Decimal(0)
        # Carry unknown charges from other completed supplement batches as well.
        for other in (ROOT/'results').glob('completion-*/credit-ledger.json'):
            if other.resolve()!=(destination/'credit-ledger.json').resolve():
                self.unknownReserve+=Decimal(core.load_json(other).get('newUnknownUsageReserveCredits','0'))
        self.initial=read_balance(key);self.save()
    def save(self):
        core.write_json(self.destination/'credit-ledger.json',{'originalFixedCapCredits':str(self.fixedCap),'originalMinimumRemainingCredits':str(self.originalFloor),'pastUnknownUsageReserveCredits':str(self.unknownReserve),'newUnknownUsageReserveCredits':str(self.newUnknown),'thisRunInitial':self.initial,'callsSent':self.calls,'halted':self.halted,'events':self.events})
    def check(self,phase,reserve=Decimal(0),unknown=False):
        try:
            balance=read_balance(self.key);current=Decimal(balance['totalUsd'])
            if unknown:self.newUnknown+=reserve
            floor=self.originalFloor+self.unknownReserve+self.newUnknown
            self.events.append({'phase':phase,'requestedAccountCreditReservation':str(reserve),**balance})
            if current<floor or phase in ('before','preflight') and current-reserve<floor:self.halted='original_twenty_percent_budget_exhausted'
            if phase=='before' and not self.halted:self.calls+=1
        except (ValueError,OSError,KeyError,TypeError):self.halted='account_balance_unavailable'
        self.save();return self.halted

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);p.add_argument('--execute',action='store_true');a=p.parse_args(argv)
    jobs=[]
    for row in SELECTION:
        model=configuration(row)['models'][0];model.update(maxInputTokens=65536,maxOutputTokens=8192,sourceDate='2026-10-26')
        reserve=(Decimal(str(model['inputPrice']))*65536+Decimal(str(model['outputPrice']))*8192)/Decimal(1000000)*4
        jobs.append((model,reserve))
    if not a.execute:
        print(json.dumps({'requests':len(jobs),'accountCreditReserve':str(sum(r for m,r in jobs)),'networkCalls':0,'scope':'existing five, receipt only; original cap reused'}));return 0
    destination=Path(a.out)
    if destination.exists():raise core.ConfigError('Use a new evidence directory, no overwrite')
    provider=core.load_json(Path.home()/'.opencodex/config.json')['providers']['commandcode']
    if provider.get('baseUrl','').rstrip('/')!=BASE+'/provider/v1':raise core.ConfigError('Unexpected local service')
    key=provider['apiKey'];destination.mkdir(parents=True);guard=OriginalCreditGuard(key,destination)
    if guard.check('preflight',sum(r for m,r in jobs)):raise core.ConfigError('Batch does not fit original budget')
    req=urllib.request.Request(BASE+'/provider/v1/models',headers={'Authorization':'Bearer '+key,'Accept':'application/json','User-Agent':'ZhufengEval/1.0'})
    with urllib.request.build_opener(core.NoRedirect()).open(req,timeout=30) as response:catalog=json.load(response)
    available={m['id']:m for m in catalog['data']}
    if any('/chat/completions' not in available.get(m['apiModel'],{}).get('supported_endpoints',[]) for m,r in jobs):raise core.ConfigError('Selected route no longer advertised')
    task=core.load_json(ROOT/'dist/data/receipt-test.json');results=[]
    core.write_json(destination/'plan.json',{'taskId':'receipt','models':[m for m,r in jobs],'accountCreditReserve':str(sum(r for m,r in jobs)),'conditions':'default reasoning; cap8192; timeout180; one image request; no retries','pricingSource':'https://commandcode.ai/docs/plans/goat','reservationFactor':4,'inputReserveNote':'65536 image+text input tokens reserved; stop on reported usage beyond bounds.','originalBudget':'results/daily-selected-five-20261025/credit-ledger.json'})
    for model,reserve in jobs:
        if guard.check('before',reserve):break
        _,payload=prepare(model['apiModel']);encoded=payload['messages'][0]['content'][1]['image_url']['url'].split(',',1)[1]
        print('RECEIPT '+model['name'],flush=True)
        result=core.request_once(model,{'prompt':task['prompt']},{'simulation':False,'timeoutSeconds':180},8192,key,input_image={'mediaType':'image/png','base64':encoded})
        metrics=result['metrics'];unknown=metrics.get('inputTokens') is None or metrics.get('outputTokens') is None
        guard.check('after',reserve,unknown)
        if metrics.get('inputTokens') is not None and metrics['inputTokens']>65536:guard.halted='reported_usage_exceeds_input_reservation';guard.save()
        record={'taskId':'receipt','modelId':model['id'],'name':model['name'],'apiModel':model['apiModel'],'provider':'CommandCode','checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),'imageSha256':task['imageSha256'],'condition':'default reasoning; maxOutputTokens8192; timeout180; no retries',**result}
        core.write_json(destination/(model['id']+'.json'),core.clean(record,[key]));results.append({k:record[k] for k in ['modelId','status','error','checkedAt']})
        core.write_json(destination/'summary.json',{'kind':'measured','modelApiCalls':len(results),'runs':results,'halted':guard.halted})
        print(json.dumps({'model':model['name'],'status':result['status'],'error':result['error'],'bodyChars':len(result['output'])},ensure_ascii=False),flush=True)
        if guard.halted or result['error']=='request_interrupted':break
    guard.check('final');return 0
if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,KeyError,TypeError):print('Receipt run stopped; inspect private evidence or account connectivity. No credentials logged.');raise SystemExit(2)
