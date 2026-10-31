"""Bind an assistant's explicit review to the exact private per-task file."""
import hashlib
from pathlib import Path
from runner import core

def missing_finish_only(raw):
    attempts=raw.get('attempts',[])
    if raw.get('status')!='error' or raw.get('error')!='invalid_or_incomplete_stream' or len(attempts)!=1:return False
    a=attempts[0];wire=a.get('_raw',{});usage=a.get('metrics',{})
    inp,out=usage.get('inputTokens'),usage.get('outputTokens');cap=wire.get('request',{}).get('max_completion_tokens')
    return (a.get('status')=='error' and a.get('error')=='invalid_or_incomplete_stream' and wire.get('httpStatus')==200 and wire.get('streamDone') is True and wire.get('finishSeen') is False
            and isinstance(inp,int) and inp>=0 and isinstance(out,int) and isinstance(cap,int) and 0<=out<cap
            and bool(a.get('output','').strip()) and raw.get('outputs')==[a['output']])

def record_marks(source,model_id,effort,marks,reviewer='assistant-first-pass',accept_missing_finish=False):
    if reviewer not in ('assistant-first-pass','site-owner') or accept_missing_finish and reviewer!='site-owner':raise ValueError('Only explicit owner review can accept missing finish metadata')
    source=Path(source);path=source/'assistant-review.json';review=core.load_json(path) if path.exists() else {'reviewer':'assistant-first-pass','profiles':[]}
    profile=next((p for p in review['profiles'] if p['modelId']==model_id and p['effort']==effort),None)
    if profile is None:profile={'modelId':model_id,'effort':effort,'items':[]};review['profiles'].append(profile)
    for task_id,mark in marks.items():
        evidence=source/model_id/effort/(task_id+'.json');raw=core.load_json(evidence)
        score,reason,*criteria=mark
        pending=task_id=='receipt' and score is None
        exception=accept_missing_finish and task_id=='purpose' and missing_finish_only(raw)
        if (raw['status']!='success' and not exception) or (not pending and (not isinstance(score,(int,float)) or isinstance(score,bool) or not 0<=score<=2)) or not reason:raise ValueError('Review must match a completed actual answer')
        row={'taskId':task_id,'score':score,'reason':reason,'sourceDigest':hashlib.sha256(evidence.read_bytes()).hexdigest(),'reviewer':reviewer}
        if exception:row['adjudication']='owner-accepted-content-missing-finish'
        if criteria:
            if task_id!='zebra' or len(criteria[0])!=4 or abs(sum(x['awarded'] for x in criteria[0])-score*7.5)>1e-7:raise ValueError('Zebra criterion sum differs')
            row['criteriaScores']=criteria[0]
        profile['items']=[x for x in profile['items'] if x['taskId']!=task_id]+[row]
    core.write_json(path,review)
