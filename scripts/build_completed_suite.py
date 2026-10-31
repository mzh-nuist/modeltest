"""Publish whitelisted completion evidence into the eight-task 100-point suite."""
import argparse,hashlib,json,datetime as dt
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def build(receipt_root,zebra_root):
    old=read(ROOT/'dist/data/daily-scores.json');prior=read(ROOT/'dist/data/weighted-suite.json');zebra=read(ROOT/'dist/data/zebra-test.json')
    weights=[10,10,10,10,15,10,20,15];tasks=[dict(t) for t in prior['tasks']]
    for task,weight in zip(tasks,weights):task['weight']=weight
    tasks.append({'id':'zebra','name':'斑马绘画','title':zebra['title'],'weight':15,'prompts':[zebra['prompt']],'full':'能安全预览，按斑马特征5、奔跑姿态4、草原环境3、画面交付3分别计分。','partial':'按四项实际完成程度累加，不固定为一半分。','zero':zebra['deliveryGate'],'allowPartial':True,'rubricType':'criteria','criteria':zebra['criteria'],'image':None,'imageSha256':None})
    roots={'receipt':Path(receipt_root),'zebra':Path(zebra_root)};reviews={}
    for task,root in roots.items():
        path=root/'assistant-review.json';reviews[task]={x['modelId']:x for x in read(path)['models']} if path.exists() else {}
    models=[];new_requests=0;successes=0
    for model in old['models']:
        items=[dict(x) for x in model['items']]
        if model['modelId']=='deepseek-v41-flash':items[4]['weightedNote']='三项待办和事实正确，未编造；负责人写“未定”而非指定的“未说明”。本项部分完成，得7.5/15分。'
        for task in ('receipt','zebra'):
            path=roots[task]/(model['modelId']+'.json');review=reviews[task].get(model['modelId'])
            if not path.exists():items.append({'taskId':task,'score':None,'reason':'尚未发送本项测试。','measurement':None});continue
            raw=read(path);new_requests+=1;successes+=raw['status']=='success'
            if review is None:score=None;reason='已采集答卷，等待按原文或实际图形初评。'
            else:score=review['score'];reason=review['reason']
            measurement={k:raw[k] for k in ['status','error','output','checkedAt','condition','apiModel','provider']}
            measurement['sourceDigest']=hashlib.sha256(path.read_bytes()).hexdigest();measurement['tokenUsage']={k:raw['metrics'][k] for k in ['inputTokens','outputTokens','reasoningTokens']}
            if task=='receipt':measurement['imageSha256']=raw['imageSha256']
            item={'taskId':task,'score':score,'reason':reason,'reviewer':'assistant-first-pass','measurement':measurement}
            if review and task=='zebra':item['criteriaScores']=review.get('criteriaScores',[])
            items.append(item)
        models.append({'modelId':model['modelId'],'sourceDigest':model['sourceDigest'],'items':items})
    result={'schemaVersion':'daily-weighted-v3','suiteId':'zhufeng-daily-eight-v3','scoreVersion':'weighted-100-v3','maxScore':100,'passingScore':80,'excellentScore':90,'origin':'assistant-reviewed-api-completions','condition':'per-task-recorded','sourceSuiteId':prior['sourceSuiteId'],'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),'newRequests':new_requests,'newSuccesses':successes,'tasks':tasks,'models':models}
    (ROOT/'dist/data/completed-suite.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return {'models':len(models),'tasks':len(tasks),'weights':sum(weights),'newRequests':new_requests,'reviewedExtensions':sum(x['score'] is not None for m in models for x in m['items'][6:])}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--receipt',default='results/completion-receipt-20261026');p.add_argument('--zebra',default='results/completion-zebra-20261026');a=p.parse_args();print(json.dumps(build(ROOT/a.receipt,ROOT/a.zebra)))
