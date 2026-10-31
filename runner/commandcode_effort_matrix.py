"""Three explicit effort settings, whole-suite selection, original fixed credit cap."""
import argparse,base64,datetime as dt,hashlib,json
from decimal import Decimal
from pathlib import Path
from . import core
from .checkup import ROOT
from .commandcode_daily_selected import BASE,SELECTION,configuration,read_balance
from .commandcode_complete_receipt import OriginalCreditGuard

EFFORTS=('low','medium','high')
OUTPUT_CAP=16384
TIMEOUT=300
INPUT_CAP=16384
IMAGE_INPUT_CAP=65536

def matrix_plan():
    suite=core.load_json(ROOT/'dist/data/completed-suite.json')
    return {'schemaVersion':'effort-matrix-plan-v1','efforts':list(EFFORTS),'models':[{'id':r[0],'name':r[1],'apiModel':r[2]} for r in SELECTION],
        'tasks':suite['tasks'],'maxRequests':sum(len(t['prompts']) for t in suite['tasks'])*len(EFFORTS)*len(SELECTION),
        'conditions':{'maxOutputTokens':OUTPUT_CAP,'timeoutSeconds':TIMEOUT,'retries':0,'temperature':None},
        'selection':'highest whole-suite total after all supported profiles have been assessed; ties prefer low then medium then high; never combine task maxima',
        'timePolicy':'Historical 300s, 16384-output protocol. Superseded by high-only.',
        'identityNote':'Requested effort is recorded; provider acceptance is not independent proof of upstream effort.',
        'budget':'original fixed 20% cap; live balance checked before every call; unknown usage retains full reservation; stop rather than reset cap'}

class MatrixGuard(OriginalCreditGuard):
    def __init__(self,key,destination):
        own=destination/'credit-ledger.json';prior=core.load_json(own) if own.exists() else None
        super().__init__(key,destination)
        for other in (ROOT/'results').glob('effort-*/credit-ledger.json'):
            if other.resolve()!=own.resolve():
                ledger=core.load_json(other)
                self.unknownReserve+=Decimal(ledger.get('newUnknownUsageReserveCredits','0'))+Decimal(ledger.get('newUnsettledUsageReserveCredits','0'))
        if prior:
            self.initial=prior['thisRunInitial'];self.newUnknown=Decimal(prior['newUnknownUsageReserveCredits']);self.calls=prior['callsSent'];self.events=prior['events']
        self.save()

def reserve_for(model,task_id):
    limit=IMAGE_INPUT_CAP if task_id=='receipt' else INPUT_CAP
    return (Decimal(str(model['inputPrice']))*limit+Decimal(str(model['outputPrice']))*OUTPUT_CAP)/Decimal(1000000)*4

def run(destination,requester=core.request_once,guard=None,key='',selection=SELECTION):
    destination=Path(destination);plan=matrix_plan();core.write_json(destination/'plan.json',plan)
    guard=guard or MatrixGuard(key,destination)
    image=(ROOT/'dist/assets/receipt-chilli-pork.png').read_bytes()
    if hashlib.sha256(image).hexdigest()!=plan['tasks'][6]['imageSha256']:raise core.ConfigError('Original image changed')
    encoded=base64.b64encode(image).decode('ascii');summary=[]
    # Complete one effort across all models before the next; no model fallback.
    for effort in EFFORTS:
      for selection_row in selection:
        model=configuration(selection_row)['models'][0];model.update(reasoningEffort=effort,maxOutputTokens=OUTPUT_CAP,maxInputTokens=INPUT_CAP)
        unsupported=False
        for task in plan['tasks']:
            path=destination/model['id']/effort/(task['id']+'.json')
            saved=None;start_step=0
            if path.exists():
                saved=core.load_json(path)
                if saved.get('profileUnsupported'):unsupported=True
                # A balance-read interruption can occur between successful turns.
                # Continue only the not-yet-sent turns, with the exact saved history.
                if (saved['attempts'] and len(saved['attempts'])<len(task['prompts'])
                        and all(a['status']=='success' for a in saved['attempts'])
                        and all(saved['outputs'][j] for j in range(len(saved['attempts'])))):
                    start_step=len(saved['attempts'])
                elif not saved['attempts'] and saved['status']=='not_run' and not saved.get('profileUnsupported'):
                    start_step=0
                else:continue
            if guard.halted:break
            record={'taskId':task['id'],'modelId':model['id'],'name':model['name'],'apiModel':model['apiModel'],'provider':'CommandCode',
                'effort':effort,'timeoutSeconds':TIMEOUT,'condition':f'{effort} reasoning; cap{OUTPUT_CAP}; timeout{TIMEOUT}; no retries',
                'checkedAt':core.now(),'status':'not_run','error':None,'outputs':[None]*len(task['prompts']),'attempts':[],'profileUnsupported':unsupported}
            if saved:
                record=saved;record['error']=None
            if task['id']=='receipt':record['imageSha256']=hashlib.sha256(image).hexdigest()
            if unsupported:
                record['error']='effort_parameter_not_supported';core.write_json(path,record);continue
            history=[];reservation=reserve_for(model,task['id'])
            for j in range(start_step):history.extend([{'role':'user','content':task['prompts'][j]},{'role':'assistant','content':record['outputs'][j]}])
            for step in range(start_step,len(task['prompts'])):
                prompt=task['prompts'][step]
                history.append({'role':'user','content':prompt})
                if len(json.dumps(history,ensure_ascii=False).encode('utf8'))+1024>INPUT_CAP:
                    record['error']='conversation_exceeds_reserved_input';record['status']='incomplete' if step else 'not_run';break
                if guard.check('before',reservation):break
                print(f"CALL {guard.calls}: {model['name']} / {effort} / {task['id']} / {step+1}",flush=True)
                try:result=requester(model,{'prompt':prompt},{'simulation':False,'timeoutSeconds':TIMEOUT},OUTPUT_CAP,key,messages=history,
                    input_image={'mediaType':'image/png','base64':encoded} if task['id']=='receipt' else None)
                except KeyboardInterrupt:
                    guard.check('after',reservation,True);guard.halted='request_interrupted';guard.save();core.write_json(path,core.clean(record,[key]));return summary
                metrics=result['metrics'];unknown=metrics.get('inputTokens') is None or metrics.get('outputTokens') is None
                guard.check('after',reservation,unknown)
                input_limit=IMAGE_INPUT_CAP if task['id']=='receipt' else INPUT_CAP
                if metrics.get('inputTokens') is not None and metrics['inputTokens']>input_limit or metrics.get('outputTokens') is not None and metrics['outputTokens']>OUTPUT_CAP:
                    guard.halted='reported_usage_exceeds_reservation';guard.save()
                record['attempts'].append({'step':step+1,**result});record['status']=result['status'];record['error']=result['error'];record['checkedAt']=core.now()
                if result['output'].strip():record['outputs'][step]=result['output']
                # HTTP 200 proves acceptance only. No assertion about hidden upstream settings.
                core.write_json(path,core.clean(record,[key]))
                if result['status']!='success' or not result['output'].strip() or guard.halted:break
                history.append({'role':'assistant','content':result['output']})
            if record['status']=='success' and any(o is None for o in record['outputs']):record['status']='incomplete'
            if guard.halted and any(o is None for o in record['outputs']):record['error']=guard.halted
            core.write_json(path,core.clean(record,[key]))
            summary.append({'modelId':model['id'],'effort':effort,'taskId':task['id'],'status':record['status'],'requests':len(record['attempts'])})
            core.write_json(destination/'summary.json',{'kind':'measured','runs':summary,'halted':guard.halted,'callsSent':guard.calls})
            print(json.dumps(summary[-1],ensure_ascii=False),flush=True)
        if guard.halted:break
      if guard.halted:break
    guard.check('final');return summary

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);p.add_argument('--execute',action='store_true');p.add_argument('--resume',action='store_true');a=p.parse_args(argv)
    if not a.execute:print(json.dumps({'maxRequests':matrix_plan()['maxRequests'],'efforts':list(EFFORTS),'maxOutputTokens':OUTPUT_CAP,'timeoutSeconds':TIMEOUT,'networkCalls':0}));return 0
    raise core.ConfigError('Three-effort execution was superseded by high-only; use runner.commandcode_high')

if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,KeyError,TypeError):print('Effort matrix stopped; inspect private evidence, no credentials logged.');raise SystemExit(2)
