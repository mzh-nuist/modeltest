"""One explicitly separate low-effort visual condition, sharing the original 20% cap."""
import argparse
from decimal import Decimal
import json
from pathlib import Path
import urllib.request
from . import core
from .checkup import load_bank,previewable_svg
from .commandcode_daily_selected import BASE,SELECTION,configuration,CreditGuard,read_balance,ACCOUNT_CREDIT_FACTOR


def make_visual_plan(initial):
    bank=load_bank();task=bank['tasks'][-1]
    configs=[configuration(row) for row in SELECTION]
    models=[]
    for config in configs:
        model=config['models'][0];model.update(reasoningEffort='low',maxInputTokens=4096,maxOutputTokens=32768)
        models.append(model)
    cap=(Decimal(initial['totalUsd'])*Decimal('.20')).quantize(Decimal('.01'),rounding='ROUND_DOWN')
    config={'simulation':False,'budgetUsd':float(cap),'repeats':1,'maxRetries':0,'timeoutSeconds':180,'models':models}
    projected={'id':'visual-low','title':task['title'],'category':'instruction','difficulty':'easy',
               'prompt':task['prompts'][0],'maxOutputTokens':32768,'grader':{'type':'manual'}}
    return config,projected,core.make_plan(config,[projected])


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--original',required=True);p.add_argument('--execute',action='store_true')
    a=p.parse_args(argv);original=Path(a.original);ledger=core.load_json(original/'credit-ledger.json');initial=ledger['events'][0]
    config,task,plan=make_visual_plan(initial)
    if not a.execute:
        print(json.dumps({'requests':plan['plannedRequests'],'networkCalls':0,'nominalUpperBoundUsd':plan['reservedUpperBoundUsd'],
                          'accountCreditReservation':str(Decimal(str(plan['reservedUpperBoundUsd']))*ACCOUNT_CREDIT_FACTOR)}));return 0
    destination=original/'visual-low'
    if destination.exists():raise core.ConfigError('Do not overwrite an existing supplementary condition')
    provider=core.load_json(Path.home()/'.opencodex/config.json')['providers']['commandcode'];key=provider.get('apiKey')
    if provider.get('baseUrl','').rstrip('/')!=BASE+'/provider/v1' or not isinstance(key,str) or len(key)<8:raise core.ConfigError('Unexpected service')
    current=read_balance(key);floor=Decimal(ledger['minimumRemainingUsd'])
    reserve=Decimal(str(plan['reservedUpperBoundUsd']))*ACCOUNT_CREDIT_FACTOR
    if Decimal(current['totalUsd'])-reserve<floor:raise core.ConfigError('Supplement does not fit the original fixed account budget')
    destination.mkdir();guard=CreditGuard(key,initial,destination)
    core.write_json(destination/'plan.json',{'condition':'low effort, 32768 output tokens, one visual request per model',
        'sharedOriginalBudgetFile':'../credit-ledger.json','originalMinimumRemainingUsd':str(floor),'accountCreditReservation':str(reserve),'plan':plan})
    results=[]
    for model,job in zip(config['models'],plan['jobs']):
        if guard('before',job['reservedUsdPerAttempt']):break
        print('LOW VISUAL '+model['name'],flush=True)
        result=core.request_once(model,task,config,32768,key)
        guard('after',job['reservedUsdPerAttempt'])
        row={'modelId':model['id'],'modelName':model['name'],'apiModel':model['apiModel'],
             'condition':'low effort; output cap32768; timeout180s; one request; no retries',
             'status':result['status'],'error':result['error'],'output':result['output'],'metrics':result['metrics'],'raw':result.get('_raw',{}),
             'previewable':result['status']=='success' and previewable_svg(result['output'])}
        row=core.clean(row,[key]);results.append(row);core.write_json(destination/(model['id']+'.json'),row)
        core.write_json(destination/'results.json',{'kind':'measured','sharedOriginalBudget':True,'runs':results,'halted':guard.stopped})
        if row['previewable']:
            out=original/'preview';out.mkdir(exist_ok=True);ident=model['id']+'-low'
            (out/(ident+'.svg')).write_bytes(row['output'].encode('utf-8'))
            import html
            name=html.escape(model['name'])
            (out/(ident+'.html')).write_text('<!doctype html><html lang="zh"><meta charset="utf-8"><title>'+name+' · 低推理档画图</title><style>body{margin:24px;background:#f4f2ec;color:#222;font:18px sans-serif}img{width:800px;max-width:100%;display:block}p{max-width:900px}</style><h1>'+name+' · 低推理档补测</h1><p>同一道鹈鹕题；低推理档，输出上限32768。原始图形未修改；与默认档首轮分开记录。</p><img src="'+ident+'.svg" alt="模型实际生成的鹈鹕骑自行车"></html>',encoding='utf-8')
        print(json.dumps({'model':model['name'],'status':row['status'],'error':row['error'],'previewable':row['previewable']},ensure_ascii=False),flush=True)
        if row['error']=='request_interrupted':guard.stopped='request_interrupted';guard.save();break
    guard('final',0);return 0


if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,KeyError,TypeError):
        print('Visual supplement stopped; original records preserved, no credentials logged.');raise SystemExit(2)
