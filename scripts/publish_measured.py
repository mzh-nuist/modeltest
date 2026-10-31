"""Curate reviewed local batches into the static measured dataset, never raw logs."""
import copy
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner.core import public_export, validate_document, now

ROOT=Path(__file__).resolve().parents[1]
SOURCES=[ROOT/'results/commandcode-free-first/public-rate-reviewed.json',ROOT/'results/commandcode-free-speed/public.json',ROOT/'results/commandcode-goat-six/public.json',ROOT/'results/commandcode-goat-breadth/public.json',ROOT/'results/commandcode-goat-repeat-speed/public.json']


def merge(documents):
    result={'schemaVersion':'1.0','meta':{'title':'CommandCode 端点 · 首批真实小样本','updatedAt':now(),'kind':'measured','description':''},'models':[],'tasks':[],'runs':[],'batches':[]}
    seen_tasks={}
    seen_models={}
    for source in documents:
        document=public_export(source)
        if document['meta']['kind']!='measured':raise ValueError('Only measured source permitted')
        mapping={}
        for m in document['models']:
            model=copy.deepcopy(m);cap=model['maxOutputTokens'];new_id=model['id']+f'-cap{cap}'
            mapping[model['id']]=new_id;model['id']=new_id;model['name']+=f' · 上限{cap}'
            model['tags']=['起步样本' if tag=='单次样本' else tag for tag in model['tags']]
            model['description']+=' 输出上限为本次请求配置，不代表模型标称最大输出。'
            if new_id in seen_models and model!=seen_models[new_id]:raise ValueError('Conflicting model identity')
            if new_id not in seen_models:result['models'].append(model);seen_models[new_id]=model
        for task in document['tasks']:
            if task['id'] in seen_tasks and task!=seen_tasks[task['id']]:raise ValueError('Conflicting task identity')
            if task['id'] not in seen_tasks:result['tasks'].append(task);seen_tasks[task['id']]=task
        for run in document['runs']:
            run['modelId']=mapping[run['modelId']]
            result['runs'].append(run)
        for batch in document['batches']:
            batch['modelIds']=[mapping[x] for x in batch['modelIds']]
            result['batches'].append(batch)
    result['meta']['description']=f"{len(result['runs'])}次真实请求，{len(result['batches'])}个不同目的批次；重复次数详见各批次配置，不增加独立题目数。包含免费与GOAT计价端点，错误、超时及速率不可测项全部保留。请按批次和相同任务比较，不是总体模型排名。服务商默认推理；上游模型身份未独立核验；费用按服务商报价名义估算，非账单回读。"
    errors=validate_document(result)
    if errors:raise ValueError('; '.join(errors))
    return result


if __name__=='__main__':
    data=merge([json.loads(p.read_text(encoding='utf-8')) for p in SOURCES])
    out=ROOT/'dist/data/measured.json';out.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'models':len(data['models']),'tasks':len(data['tasks']),'runs':len(data['runs']),'successes':sum(r['status']=='success' for r in data['runs']),'eligibleTps':sum(r['metrics']['outputTps'] is not None for r in data['runs'])}))
