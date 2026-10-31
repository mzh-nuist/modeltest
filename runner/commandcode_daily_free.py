"""One six-check pass on a verified free route. No paid opt-in or automatic retries."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import urllib.request
from . import core
from .checkup import SUITE, load_bank
from .checkup_collect import collect, make_plan, validate_commandcode_free
from .commandcode_free import configuration as legacy_configuration, ENV_NAME

BASE = 'https://api.commandcode.ai/provider/v1'
TERMS_URL = 'https://commandcode.ai/docs/resources/pricing-limits'
FREE_ROUTES = {
    'glyph': (0, 'stealth/glyph-cluster:free', 'Glyph Cluster', 'glyph-cluster-free', '**Glyph Cluster is a free stealth preview.**'),
    'beam': (1, 'reflection/beam:free', 'Beam 1.0', 'beam-free', '**Beam 1.0 is free while capacity lasts.**'),
    'laguna': (2, 'poolside/laguna-s-2.1-free', 'Laguna S 2.1', 'laguna-free', '**Laguna S 2.1 is free while capacity lasts.**'),
}


def configuration(selection='beam'):
    index,_,name,anchor,_ = FREE_ROUTES[selection]
    model = legacy_configuration()['models'][index]
    model.update(maxInputTokens=32768, maxOutputTokens=8192,
                 sourceUrl=TERMS_URL+'#'+anchor, sourceDate=dt.date.today().isoformat())
    return {'suiteId':SUITE, 'title':name+' 免费型号六项真实体检', 'simulation':False,
            'includeVisual':True, 'budgetUsd':0, 'concurrency':1, 'repeats':1,
            'maxRetries':0, 'timeoutSeconds':120,
            'region':'本机 Windows 客户端；网络出口位置未核验', 'models':[model]}


def verify_live(key, selection='beam'):
    """Read only: fail closed if the catalog or current free wording changes."""
    opener=urllib.request.build_opener(core.NoRedirect())
    request=urllib.request.Request(BASE+'/models',headers={
        'Authorization':'Bearer '+key,'User-Agent':'ZhufengEval/1.0','Accept':'application/json'})
    with opener.open(request,timeout=40) as response:
        catalog=json.loads(response.read(2000000).decode('utf-8'))
    _,api,_,anchor,heading = FREE_ROUTES[selection]
    matches=[m for m in catalog['data'] if m.get('id')==api]
    if len(matches)!=1 or '/chat/completions' not in matches[0].get('supported_endpoints',[]):
        raise core.ConfigError('The selected free chat route is not currently advertised')
    # Public terms only; no local key is ever sent to the reader service.
    with opener.open('https://r.jina.ai/'+TERMS_URL,timeout=40) as response:
        body=response.read(2000000).decode('utf-8')
    start=body.find(heading)
    end=body.find('[DEAL ',start) if start>=0 else -1
    section=body[start:end if end>=0 else len(body)] if start>=0 else ''
    required=['Requests cost no credits', 'Input, output, and cache reads are all `$0.00`',
              "Free requests cost $0, so they don't draw down your per-model allowances"]
    if not section or any(s not in section for s in required):
        raise core.ConfigError('Current official terms do not confirm zero credits for this free route')
    return {'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),
            'sourceUrl':TERMS_URL+'#'+anchor,'model':matches[0], 'termsExcerpt':section.strip(),
            'budgetUsd':0,'paidFallback':False,'retries':0,
            'billingEvidence':'Official zero-credit terms, not an independently verified account ledger.'}


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',required=True);p.add_argument('--execute',action='store_true')
    p.add_argument('--model',choices=FREE_ROUTES,default='beam')
    a=p.parse_args(argv);config=configuration(a.model);bank=load_bank();plan=make_plan(config,bank)
    validate_commandcode_free(config,plan)
    if not a.execute:
        print(json.dumps({'state':'planned','requests':plan['plannedRequests'],
                          'budgetUsd':0,'networkCalls':0}));return 0
    destination=Path(a.out)
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise core.ConfigError('Use a new output directory')
    provider=core.load_json(Path.home()/'.opencodex/config.json').get('providers',{}).get('commandcode',{})
    key=provider.get('apiKey')
    if provider.get('baseUrl','').rstrip('/')!=BASE or not isinstance(key,str) or len(key)<8:
        raise core.ConfigError('Existing local CommandCode configuration does not match the verified service')
    proof=verify_live(key,a.model)
    previous=os.environ.get(ENV_NAME);os.environ[ENV_NAME]=key
    try:
        print('Starting at most 11 requests to '+config['models'][0]['apiModel']+'; zero budget; no fallback or retry.',flush=True)
        _,summary=collect(config,bank,destination,commandcode_free=True)
        core.write_json(destination/'free-route-evidence.json',core.clean(proof,[key]))
        print(json.dumps(summary,ensure_ascii=False));return 0
    finally:
        if previous is None:os.environ.pop(ENV_NAME,None)
        else:os.environ[ENV_NAME]=previous


if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,TypeError,KeyError,StopIteration):
        print('免费采集停止：配置、免费条款或服务不可用；未启用付费回退。');raise SystemExit(2)
