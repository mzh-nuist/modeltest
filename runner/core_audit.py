"""Offline core-protocol replay audit. Reads local SSE; emits hashes, never raw text."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from .core import load_json,validate_document,grade,write_json,token_number,nonnegative
from .measurement import measure
from .anthropic import MessagesStream
from .rubric_review import apply_review


def audit(document,raw_dir):
    errors=validate_document(document)
    if errors:raise ValueError('Invalid result document')
    tasks={t['id']:t for t in document['tasks']};models={m['id']:m for m in document['models']}
    raw_root=Path(raw_dir).resolve()
    records=[]
    for run in document['runs']:
        if run['status']=='skipped':continue
        if run['provenance'].get('metricProtocol')!='core-client-v1':raise ValueError('Requires core-client-v1 evidence')
        path=(raw_root/(run['id']+'.json')).resolve()
        if path.parent!=raw_root:raise ValueError('Raw evidence path leaves the selected directory')
        raw=load_json(path);task=tasks[run['taskId']];model=models[run['modelId']]
        if not isinstance(raw,dict) or not isinstance(raw.get('request'),dict) or not isinstance(raw.get('events'),list):raise ValueError('Malformed raw evidence')
        digest=hashlib.sha256(task['prompt'].encode()).hexdigest();request=raw.get('request',{})
        if raw.get('runId')!=run['id'] or raw.get('taskSha256')!=digest:raise ValueError('Raw identity mismatch')
        requested_model=run['provenance'].get('requestedModel')
        if not isinstance(requested_model,str) or not requested_model or request.get('messages')!=[{'role':'user','content':task['prompt']}] or request.get('model')!=requested_model:
            raise ValueError('Request prompt/alias mismatch')
        if request.get('stream') is not True or request.get('temperature')!=run['config'].get('temperature'):
            raise ValueError('Request streaming/temperature mismatch')
        if request.get('max_completion_tokens',request.get('max_tokens'))!=min(model['maxOutputTokens'],task['maxOutputTokens']):raise ValueError('Request cap mismatch')
        expected=grade(run['output'],task['grader'],run['status'])
        if run['grading'].get('rubricReview'):expected=apply_review(run['output'],task['grader'],run['grading']['rubricReview'])
        if expected!=run['grading']:raise ValueError('Scoring replay mismatch')
        normalizer=MessagesStream() if run['provenance'].get('adapter')=='anthropic-messages' else None
        chunks=[];counters=[];usage=None;first_content=None;finish_reason=None
        for entry in raw.get('events',[]):
            if not isinstance(entry,dict) or not nonnegative(entry.get('elapsedMs')) or not isinstance(entry.get('data'),dict):raise ValueError('Malformed event evidence')
            event=entry['data']
            if normalizer:
                try:event,_=normalizer.normalize(event)
                except ValueError:
                    if run['status']=='success':raise
                    break
            if event.get('error') is not None:
                if run['status']=='success':raise ValueError('Successful run contains an error event')
                break
            if event.get('usage') is not None:
                if not isinstance(event['usage'],dict):
                    if run['status']=='success':raise ValueError('Invalid usage event')
                    break
                usage=event['usage']
            if not isinstance(event.get('choices',[]),list):raise ValueError('Malformed choice evidence')
            for choice in event.get('choices',[]):
                if not isinstance(choice,dict) or choice.get('index',0)!=0 or not isinstance(choice.get('delta',{}),dict):raise ValueError('Unsupported choice evidence')
                delta=choice.get('delta',{});content=delta.get('content');reasoning=delta.get('reasoning_content',delta.get('reasoning'))
                if first_content is None and ((isinstance(reasoning,str) and reasoning) or (isinstance(content,str) and content)):first_content=entry['elapsedMs']
                if isinstance(content,str) and content:
                    chunks.append((entry['elapsedMs']/1000,content))
                    if run['provenance'].get('streamUsageMode')=='cumulative_visible_fixture':counters.append(event.get('usage',{}).get('completion_tokens'))
                if choice.get('finish_reason') is not None:finish_reason=choice['finish_reason']
        if ''.join(text for _,text in chunks)!=run['output']:raise ValueError('Body replay mismatch')
        if bool(raw.get('finishSeen'))!=(finish_reason is not None):raise ValueError('Finish flag contradicts stream events')
        if run['status']=='success' and (not raw.get('streamDone') or finish_reason!='stop' or not chunks or not isinstance(raw.get('httpStatus'),int) or not 200<=raw['httpStatus']<300):raise ValueError('Completion evidence missing')
        if (run.get('error') or '').startswith('http_') and run['error']!='http_'+str(raw.get('httpStatus')):raise ValueError('HTTP error evidence mismatch')
        metrics=run['metrics'];duration=raw.get('durationMs')
        if not nonnegative(duration) or duration!=metrics['durationMs']:raise ValueError('Request duration replay mismatch')
        output=usage.get('completion_tokens') if usage else None
        details=usage.get('completion_tokens_details',{}) if usage else {};reasoning=details.get('reasoning_tokens') if isinstance(details,dict) else None
        input_tokens=usage.get('prompt_tokens') if usage else None
        output=output if token_number(output) else None;reasoning=reasoning if token_number(reasoning) else None;input_tokens=input_tokens if token_number(input_tokens) else None
        if output is not None and reasoning is not None and run['provenance'].get('usageSemantics')=='includes_reasoning' and reasoning>output:
            if run['status']!='error' or run.get('error')!='inconsistent_usage':raise ValueError('Inconsistent usage must be an error')
            reasoning=None
        visible=output if run['provenance'].get('usageSemantics')=='visible_only' else output-reasoning if output is not None and reasoning is not None else None
        if metrics['outputTokens']!=output or metrics['reasoningTokens']!=reasoning or metrics['inputTokens']!=input_tokens:raise ValueError('Usage replay mismatch')
        first=counters[0] if counters and len(counters)==len(chunks) and all(isinstance(x,int) and not isinstance(x,bool) for x in counters) and all(a<=b for a,b in zip(counters,counters[1:])) and counters[-1]==visible else None
        calculated=measure(run['status'],chunks,visible,duration/1000,first)
        actual=run.get('measurement')
        for key,value in calculated.items():
            observed=actual.get(key)
            if key in ('visibleTokens','firstChunkTokens','chunkCount'):
                if value!=observed:raise ValueError('Measurement count replay mismatch')
            elif isinstance(value,(int,float)) and not isinstance(value,bool):
                if observed is None or not math.isclose(observed,value,rel_tol=2e-3,abs_tol=.02):raise ValueError('Measurement replay mismatch')
            elif value!=observed:raise ValueError('Measurement availability mismatch')
        if run['status']=='success':
            if metrics['ttfaMs'] is None or abs(metrics['ttfaMs']-chunks[0][0]*1000)>.01 or metrics['ttftMs'] is None or abs(metrics['ttftMs']-first_content)>.01:raise ValueError('First-content timing mismatch')
        billable=metrics['outputTokens']
        if run['provenance'].get('usageSemantics')=='visible_only':billable=billable+reasoning if billable is not None and reasoning is not None else None
        fee=None
        if billable is not None and metrics['inputTokens'] is not None and model['inputPrice'] is not None and model['outputPrice'] is not None:
            fee=(metrics['inputTokens']*model['inputPrice']+billable*model['outputPrice'])/1_000_000
        if (fee is None)!=(metrics['cost'] is None) or (fee is not None and not math.isclose(fee,metrics['cost'],rel_tol=1e-9,abs_tol=1e-12)):raise ValueError('Fee replay mismatch')
        records.append({'runId':run['id'],'rawSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'taskSha256':digest,'outputSha256':hashlib.sha256(run['output'].encode()).hexdigest()})
    return {'protocolId':'core-client-v1','dataKind':document['meta']['kind'],'checkedRuns':len(records),'externalApiCalls':0,
            'note':'Local consistency replay, not independent model identity or invoice verification. Toy counters remain demo evidence.','records':records}


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source');p.add_argument('--raw-dir',required=True);p.add_argument('--out',required=True);a=p.parse_args(argv)
    try:
        if Path(a.out).exists():raise ValueError('Output must be new')
        result=audit(load_json(a.source),a.raw_dir);write_json(a.out,result)
        print(json.dumps({k:v for k,v in result.items() if k!='records'},ensure_ascii=False));return 0
    except (ValueError,KeyError,TypeError,OSError):print('Replay audit rejected: inspect local source and matching raw evidence.');return 2


if __name__=='__main__':raise SystemExit(main())
