"""Small bounded comparison using the user's existing GOAT service.

No recharge, subscription changes or client configuration mutation. Prices are
nominal service quotes, not a readback of the account invoice.
"""
import argparse
import json
import os
from pathlib import Path
import urllib.request
from .core import ConfigError, NoRedirect, execute, load_json, make_plan, public_export, write_json

ROOT=Path(__file__).resolve().parents[1]
KEY_ENV='ZHUFENG_EVAL_COMMANDCODE_API_KEY'
SOURCE='https://commandcode.ai/docs/plans/goat'
SELECTION=[
 ('goat-claude-sonnet55','Claude Sonnet 5.5','claude-sonnet-5-5','Claude',2,10,'anthropic-messages',1000000),
 ('goat-deepseek-flash','DeepSeek V4 Flash','deepseek/deepseek-v4-flash','DeepSeek',.15,.6,'openai-compatible',1000000),
 ('goat-qwen38-max','Qwen 3.8 Max','Qwen/Qwen3.8-Max','Qwen',2,6,'openai-compatible',1000000),
 ('goat-gemini38-flash','Gemini 3.8 Flash','google/gemini-3.8-flash','Gemini',1.5,7.5,'openai-compatible',1000000),
 ('goat-glm53','GLM 5.3','zai-org/GLM-5.3','GLM',1.4,4.4,'openai-compatible',1000000),
 ('goat-mistral4','Mistral Large 4','mistral/mistral-large-4','Mistral',1.36,4.18,'openai-compatible',524288),
]


def configuration(suite='starter'):
    config={'schemaVersion':'1.0','title':'CommandCode GOAT 六配置起步比较','simulation':False,
            'region':'本机Windows客户端；网络出口位置未独立核验','concurrency':1,'repeats':1,
            'timeoutSeconds':60,'maxRetries':0,'budgetUsd':.5,
            'taskIds':['math-01','data-01','speed-copy'],
            'models':[{'id':ident,'name':name,'family':family,'provider':'CommandCode GOAT',
                       'adapter':adapter,'endpoint':'https://api.commandcode.ai/provider/v1/'+('messages' if adapter=='anthropic-messages' else 'chat/completions'),
                       'apiModel':api,'apiKeyEnv':KEY_ENV,'version':api+' · 服务商别名',
                       'reasoning':'服务商默认，未指定推理档位','reasoningEffort':None,'temperature':None,
                       'maxInputTokens':8192,'maxOutputTokens':1536,'outputLimitIncludesReasoning':True,
                       'maxTokensParameter':'max_tokens' if adapter=='anthropic-messages' else 'max_completion_tokens',
                       'usageSemantics':'includes_reasoning','contextWindow':context,'currency':'USD',
                       'inputPrice':inp,'outputPrice':out,'cachedInputPrice':None,
                       'sourceUrl':SOURCE,'sourceDate':'2026-10-24','tags':['起步实测','第三方端点','单次样本'],
                       'description':'当前服务商声明型号；未独立核验上游身份。最大输出为请求上限。DeepSeek采用当前离峰报价；其他为该页标准报价，均非账单。'}
                      for ident,name,api,family,inp,out,adapter,context in SELECTION]}
    if suite=='breadth':
        config.update(title='CommandCode GOAT 多场景补充采集',budgetUsd=.45,
                      taskIds=['math-02','math-06','data-03','chinese-03','chinese-04','code-02'])
        for model in config['models']:model['maxInputTokens']=2048
    elif suite=='repeat-speed':
        config.update(title='CommandCode GOAT 同题速度重复采样',budgetUsd=.3,repeats=3,taskIds=['speed-copy'])
        for model in config['models']:model['maxInputTokens']=4096
    return config


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',required=True);p.add_argument('--execute',action='store_true')
    p.add_argument('--suite',choices=['starter','breadth','repeat-speed'],default='starter')
    a=p.parse_args(argv);config=configuration(a.suite)
    tasks=load_json(ROOT/'datasets/tasks.json')+load_json(ROOT/'datasets/speed_tasks.json')
    plan=make_plan(config,tasks)
    expected=36 if a.suite=='breadth' else 18
    if plan['plannedRequests']!=expected or not plan['fitsBudget']:
        raise ConfigError('Comparison must fit the fixed request count and nominal budget cap')
    if not a.execute:
        print(json.dumps({k:v for k,v in plan.items() if k!='jobs'},ensure_ascii=True,indent=2));return 0
    provider=load_json(Path.home()/'.opencodex/config.json').get('providers',{}).get('commandcode',{})
    if provider.get('baseUrl','').rstrip('/')!='https://api.commandcode.ai/provider/v1':
        raise ConfigError('Unexpected local endpoint')
    key=provider.get('apiKey')
    if not isinstance(key,str) or len(key)<8:raise ConfigError('Missing local API credential')
    req=urllib.request.Request('https://api.commandcode.ai/provider/v1/models',headers={'Authorization':'Bearer '+key,'Accept':'application/json','User-Agent':'ZhufengEval/1.0'})
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=20) as response:catalog=json.load(response)
    entries={m['id']:m for m in catalog.get('data',[]) if isinstance(m,dict) and 'id' in m}
    for m in config['models']:
        path='/messages' if m['adapter']=='anthropic-messages' else '/chat/completions'
        if path not in entries.get(m['apiModel'],{}).get('supported_endpoints',[]):
            raise ConfigError('Selected endpoint is not advertised by current model catalogue')
    previous=os.environ.get(KEY_ENV);os.environ[KEY_ENV]=key
    try:
        print(f'Starting {expected} bounded requests using existing GOAT credits; nominal cap USD {config["budgetUsd"]}; no retries or recharge.',flush=True)
        result=execute(config,tasks,a.out,allow_paid=True)
        result['meta']['description']+=' 起步小样本，不能推断总体能力；不同模型采用各自服务商默认推理。'
        result['batches'][0]['description']=result['meta']['description']
        write_json(Path(a.out)/'results.json',result)
        write_json(Path(a.out)/'public.json',public_export(result))
        print(json.dumps({'runs':len(result['runs']),'successes':sum(r['status']=='success' for r in result['runs']),
                          'nominalKnownCostUsd':result['batches'][0]['knownCostUsd'],
                          'unknownCostCount':result['batches'][0]['unknownCostCount']},ensure_ascii=True))
    finally:
        if previous is None:os.environ.pop(KEY_ENV,None)
        else:os.environ[KEY_ENV]=previous
    return 0


if __name__=='__main__':
    try:raise SystemExit(main())
    except (ConfigError,OSError,ValueError,TypeError,KeyError):
        print('GOAT comparison could not proceed; inspect local configuration and preserved evidence. No credentials logged.')
        raise SystemExit(2)
