"""Export only approved public answers; never publish account ledgers or raw streams."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner.checkup import ROOT,load_bank,validate_report
from runner.core import write_json
from runner.commandcode_daily_selected import SELECTION


def build(source):
    source=Path(source);bank=load_bank()
    review=json.loads((source/'assistant-review.json').read_text(encoding='utf-8'))
    notes={m['modelId']:m for m in review['models']};models=[]
    for ident,name,api,*_ in SELECTION:
        report_file=source/ident/'public.json';report=json.loads(report_file.read_text(encoding='utf-8'))
        validate_report(report,bank)
        if any(r['review'] is not None for r in report['runs']):raise ValueError('Publisher export must not invent user confirmation')
        raw=json.loads((source/ident/'raw/conversations.json').read_text(encoding='utf-8'))['attempts']
        if any(a['raw']['request']['model']!=api for a in raw):raise ValueError('Requested model mismatch')
        extra_file=source/'visual-low'/(ident+'.json');extra=json.loads(extra_file.read_text(encoding='utf-8'))
        if extra['apiModel']!=api:raise ValueError('Supplement model mismatch')
        models.append({'id':ident,'name':name,'apiModel':api,'provider':'CommandCode',
            'checkedAt':report['checkedAt'],'report':report,
            'defaultRequests':len(raw),'defaultSuccessfulRequests':sum(a['status']=='success' for a in raw),
            'sourceDigest':hashlib.sha256(report_file.read_bytes()).hexdigest(),
            'checks':[{'taskId':c['taskId'],'label':c['verdict'],'note':c['note'],
                       'origin':'rule' if c['taskId']=='edit' else 'assistant'} for c in notes[ident]['primaryChecks']],
            'textNote':notes[ident]['textSummary'],
            'supplement':{'status':extra['status'],'error':extra['error'],'output':extra['output'],
                          'reasoningEffort':'low','maxOutputTokens':32768,'timeoutSeconds':180,
                          'note':notes[ident]['visualSupplementSummary']}})
    data={'schemaVersion':'published-daily-v1','suiteId':bank['suiteId'],
          'publishedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds'),
          'origin':'publisher-local-api-collection','reviewer':'assistant-first-pass',
          'totalRequests':sum(m['defaultRequests']+1 for m in models),
          'successfulRequests':sum(m['defaultSuccessfulRequests']+(m['supplement']['status']=='success') for m in models),
          'models':models}
    target=ROOT/'dist/data/daily-measured.json';write_json(target,data)
    return {'models':len(models),'totalRequests':data['totalRequests'],'successfulRequests':data['successfulRequests'],'file':str(target)}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);a=p.parse_args()
    print(json.dumps(build(a.source),ensure_ascii=False))
