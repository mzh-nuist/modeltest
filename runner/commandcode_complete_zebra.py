"""Missing zebra SVG task for existing models, sharing the original fixed cap."""
import argparse,datetime as dt,json
from decimal import Decimal
from pathlib import Path
from . import core
from .receipt import ROOT
from .commandcode_daily_selected import SELECTION,configuration,BASE
from .commandcode_complete_receipt import OriginalCreditGuard
def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);p.add_argument('--execute',action='store_true');a=p.parse_args(argv)
    task=core.load_json(ROOT/'dist/data/zebra-test.json');jobs=[]
    for row in SELECTION:
        m=configuration(row)['models'][0];m.update(reasoningEffort='low',maxOutputTokens=16384,maxInputTokens=4096,sourceDate='2026-10-26')
        r=(Decimal(str(m['inputPrice']))*4096+Decimal(str(m['outputPrice']))*16384)/Decimal(1000000)*4;jobs.append((m,r))
    if not a.execute:print(json.dumps({'requests':len(jobs),'accountCreditReserve':str(sum(r for m,r in jobs)),'networkCalls':0}));return 0
    destination=Path(a.out)
    if destination.exists():raise core.ConfigError('Use new evidence directory, no overwrite')
    provider=core.load_json(Path.home()/'.opencodex/config.json')['providers']['commandcode']
    if provider.get('baseUrl','').rstrip('/')!=BASE+'/provider/v1':raise core.ConfigError('Unexpected service')
    key=provider['apiKey'];destination.mkdir(parents=True);guard=OriginalCreditGuard(key,destination)
    if guard.check('preflight',sum(r for m,r in jobs)):raise core.ConfigError('Does not fit original budget')
    core.write_json(destination/'plan.json',{'task':task,'models':[m for m,r in jobs],'accountCreditReserve':str(sum(r for m,r in jobs)),'originalBudget':'results/daily-selected-five-20261025/credit-ledger.json','pricingSource':'https://commandcode.ai/docs/plans/goat'})
    results=[]
    for model,reserve in jobs:
        if guard.check('before',reserve):break
        print('ZEBRA '+model['name'],flush=True)
        result=core.request_once(model,{'prompt':task['prompt']},{'simulation':False,'timeoutSeconds':180},16384,key)
        metrics=result['metrics'];guard.check('after',reserve,metrics.get('inputTokens') is None or metrics.get('outputTokens') is None)
        if metrics.get('inputTokens') is not None and metrics['inputTokens']>4096:guard.halted='reported_usage_exceeds_input_reservation';guard.save()
        record={'taskId':'zebra','modelId':model['id'],'name':model['name'],'apiModel':model['apiModel'],'provider':'CommandCode','checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),'condition':'low reasoning; cap16384; timeout180; one attempt; no retries',**result}
        core.write_json(destination/(model['id']+'.json'),core.clean(record,[key]));results.append({k:record[k] for k in ['modelId','status','error','checkedAt']})
        core.write_json(destination/'summary.json',{'kind':'measured','modelApiCalls':len(results),'runs':results,'halted':guard.halted})
        print(json.dumps({'model':model['name'],'status':result['status'],'error':result['error'],'bodyChars':len(result['output'])},ensure_ascii=False),flush=True)
        if guard.halted or result['error']=='request_interrupted':break
    guard.check('final');return 0
if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,KeyError,TypeError):print('Zebra run stopped; inspect private evidence. No credentials logged.');raise SystemExit(2)
