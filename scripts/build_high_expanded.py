"""Export only source-verified answers and source-bound reviews for the authorized batch."""
import argparse,base64,hashlib,json,sys
from pathlib import Path
from datetime import datetime
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from runner import core
from runner.commandcode_extended_high import specs
def stamp(v):return datetime.fromisoformat(v.replace('Z','+00:00')).isoformat(timespec='milliseconds').replace('+00:00','Z')
def build(source,target):
 source=Path(source);base=core.load_json(ROOT/'dist/data/high-suite.json');manifest=core.load_json(source/'sources/manifest.json')
 reviews=core.load_json(source/'review.json') if (source/'review.json').exists() else {}
 models=[];total=successful=0
 for model in specs():
  ident=model['id'];items=[];digests=[];n=ok=0;limit=model['maxOutputTokens'];evidence=manifest[ident]
  if not evidence['verified'] or hashlib.sha256((source/'sources'/(ident+'.txt')).read_bytes()).hexdigest()!=evidence['sha256']:raise ValueError('Source evidence changed')
  for task in base['tasks']:
   path=source/ident/'high'/(task['id']+'.json');measurement=None;review=reviews.get(ident,{}).get(task['id'])
   if path.exists():
    raw=core.load_json(path);digest=hashlib.sha256(path.read_bytes()).hexdigest();digests.append(digest)
    if raw['effort']!='high' or raw['apiModel']!=model['apiModel'] or raw['timeoutSeconds'] is not None:raise ValueError('Protocol changed')
    history=[]
    for k,a in enumerate(raw['attempts']):
     req=a['_raw']['request'];history.append({'role':'user','content':task['prompts'][k]})
     cap=req.get(model['maxTokensParameter'])
     if req.get('model')!=model['apiModel'] or not isinstance(cap,int) or not 8192<=cap<=limit:raise ValueError('Wrong model or output cap')
     if model['adapter']=='anthropic-messages':
      if req.get('thinking')!={'type':'adaptive'} or req.get('output_config')!={'effort':'high'}:raise ValueError('Not adaptive high')
     elif req.get('reasoning_effort')!='high':raise ValueError('Not explicit high')
     if task['id']!='receipt':
      if req['messages']!=history:raise ValueError('Conversation history changed')
     else:
      content=req['messages'][0]['content'];texts=[x for x in content if x.get('type')=='text']
      if len(req['messages'])!=1 or len(content)!=2 or len(texts)!=1 or texts[0]['text']!=task['prompts'][0]:raise ValueError('Receipt prompt changed')
      images=[x for x in content if x.get('type') in ['image','image_url']]
      if len(images)!=1:raise ValueError('Wrong receipt image count')
      data=images[0]['source']['data'] if model['adapter']=='anthropic-messages' else images[0]['image_url']['url'].split(',',1)[1]
      if hashlib.sha256(base64.b64decode(data,validate=True)).hexdigest()!=task['imageSha256']:raise ValueError('Receipt image changed')
     history.append({'role':'assistant','content':a['output']})
    n+=len(raw['attempts']);ok+=sum(a['status']=='success' for a in raw['attempts'])
    measurement={k:raw[k] for k in ['status','error','outputs','checkedAt','apiModel','provider','condition','maxOutputTokens','timeoutSeconds','effort','outputPolicy']}
    measurement['checkedAt']=stamp(measurement['checkedAt'])
    if measurement['status']=='success' and (len(raw['attempts'])<len(task['prompts']) or any(x is None for x in raw['outputs'])):measurement['status']='incomplete'
    measurement.update(output=raw['outputs'][-1] or '',sourceDigest=digest,attempts=[{'step':a['step'],'status':a['status'],'error':a['error'],'maxOutputTokens':a['_raw']['request'][model['maxTokensParameter']],'tokenUsage':{k:a['metrics'].get(k) for k in ['inputTokens','outputTokens','reasoningTokens']}} for a in raw['attempts']])
    if task['id']=='receipt':measurement['imageSha256']=raw['imageSha256']
    if review and (review['sourceDigest']!=digest or raw['status']!='success'):raise ValueError('Review not bound to completed source')
   elif review:raise ValueError('Review without source')
   item={'taskId':task['id'],'score':review['score'] if review else None,'reason':review['reason'] if review else '答卷已保存，等待按原评分标准复核。' if measurement and measurement['attempts'] else '本批尚未采集，不计零分。','reviewer':'assistant' if review else 'unreviewed','measurement':measurement}
   if review and 'criteriaScores' in review:item['criteriaScores']=review['criteriaScores']
   items.append(item)
  models.append({'modelId':ident,'name':model['name'],'apiModel':model['apiModel'],'provider':'CommandCode','effort':'high','eligibility':'eligible','eligibilityReason':'现有套餐已开放；本批实际答卷与评分单独记录。',
     'maxOutputTokens':limit,'limitStatus':'declared','limitSource':model['limitSource'],'limitSourceDigest':evidence['sha256'],'limitAuthority':model['limitAuthority'],
     'limitNote':'文档上限来自'+('原厂' if model['limitAuthority']=='model-publisher' else '服务商公开配置')+'；本批逐次请求额度另记，接口接收不证明服务商内部未裁剪。',
     'outputPolicy':'budget-bounded-output','budgetAuthorization':'user-approved-existing-credits-20261031','checkedAt':stamp(core.now()),'requests':n,'successfulRequests':ok,
     'sourceDigest':hashlib.sha256((''.join(digests)+evidence['sha256']).encode()).hexdigest(),'items':items})
  total+=n;successful+=ok
 doc={'schemaVersion':'daily-high-expanded-v1','collectionAuthorization':'user-approved-existing-credits-20261031','suiteId':base['suiteId'],'scoreVersion':base['scoreVersion'],'effort':'high','timeoutSeconds':None,'automaticRetries':0,'updatedAt':stamp(core.now()),'tasks':base['tasks'],'models':models,'totalRequests':total,'successfulRequests':successful}
 core.write_json(target,doc);print(json.dumps({'models':len(models),'requests':total,'successes':successful,'reviewedItems':sum(x['score'] is not None for m in models for x in m['items'])}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',default='results/extended-high-authorized-20261031');p.add_argument('--out',default='dist/data/high-expanded.json');a=p.parse_args();build(ROOT/a.source,ROOT/a.out)
