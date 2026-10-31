"""Extend the high-only set without resetting the original lifetime credit cap."""
import argparse,base64,hashlib,json
from decimal import Decimal,ROUND_DOWN
from pathlib import Path
from . import core
from .commandcode_daily_selected import read_balance,BASE

ROOT=Path(__file__).resolve().parents[1]
ANCHOR=ROOT/'results/effort-high-kimi-budget-20261026/closing-credit-audit.json'
OLD_LEDGER=ROOT/'results/effort-high-kimi-budget-20261026/credit-ledger.json'
MODEL={'id':'claude-sonnet55','name':'Claude Sonnet 5.5','apiModel':'claude-sonnet-5-5','provider':'CommandCode',
       'adapter':'anthropic-messages','anthropicEffortProtocol':'adaptive-v1','reasoningEffort':'high',
       'endpoint':BASE+'/provider/v1/messages','temperature':None,'usageSemantics':'includes_reasoning',
       'maxTokensParameter':'max_tokens','maxOutputTokens':128000,'inputPrice':4,'outputPrice':10,'creditFactor':7}
TASK_ORDER=['purpose','reasoning','visual','zebra','edit','memory','honesty','receipt']

def cost(model,input_tokens,output_tokens):
    return (Decimal(str(model['inputPrice']))*input_tokens+Decimal(str(model['outputPrice']))*output_tokens)*Decimal(str(model['creditFactor']))/1000000

def input_bound(messages,image=False):
    # UTF-8 bytes bound text BPE tokens; reserve explicit framing/system overhead.
    # The image uses the old, larger image reservation and may remain untested.
    return (65536 if image else 4096)+128*len(messages)+len(json.dumps(messages,ensure_ascii=False).encode('utf-8'))

def ensure_no_unreconciled_expansion(results):
    # A new output directory is not a new allowance. After any real request,
    # this fixed historical anchor must be reconciled before starting again.
    for path in Path(results).glob('*/credit-ledger.json'):
        ledger=core.load_json(path)
        if 'thisRunInitial' in ledger and 'anchoredHeadroomCredits' in ledger and ledger.get('callsSent',0)>0:
            raise core.ConfigError('Previous expansion needs reconciliation; do not reset the allowance')

class ExpansionGuard:
    BUFFER=Decimal('.05')
    MIN_OUTPUT=8192
    def __init__(self,key,destination,balance_reader=read_balance,anchor=None,old=None):
        self.key=key;self.destination=Path(destination);self.reader=balance_reader
        anchor=anchor or core.load_json(ANCHOR);old=old or core.load_json(OLD_LEDGER)
        self.cap=Decimal(anchor['originalCapCredits'])
        self.headroom=Decimal(anchor['conservativeHeadroomCredits'])
        self.floor=Decimal(old['originalMinimumRemainingCredits'])
        self.historicalReserve=Decimal(anchor['pastUnknownReserveCredits'])+Decimal(anchor['extraConservativeReserveCredits'])
        if not anchor['withinOriginalCap'] or not 0<=self.headroom<=self.cap:raise core.ConfigError('Invalid original budget anchor')
        path=self.destination/'credit-ledger.json'
        if path.exists():
            self.state=core.load_json(path)
            if self.state['originalFixedCapCredits']!=str(self.cap) or self.state['anchoredHeadroomCredits']!=str(self.headroom):raise core.ConfigError('Budget anchor changed')
            if self.state['inflight'] or self.state['halted']:raise core.ConfigError('Unresolved call or halted ledger; do not resend')
        else:
            initial=self.reader(key)
            self.state={'originalFixedCapCredits':str(self.cap),'anchoredHeadroomCredits':str(self.headroom),'historicalSpendAndReserveCredits':str(self.cap-self.headroom),
                        'originalMinimumRemainingCredits':str(self.floor),'historicalUnknownAndUnsettledCredits':str(self.historicalReserve),
                        'thisRunInitial':initial,'spentBoundCredits':'0','callsSent':0,'inflight':None,'halted':None,'events':[]}
        self.save()
    def save(self):core.write_json(self.destination/'credit-ledger.json',self.state)
    def available(self):
        try:balance=self.reader(self.key)
        except Exception:
            self.state['halted']='account_balance_unavailable';self.save();raise core.ConfigError('Cannot verify account balance')
        current=Decimal(balance['totalUsd']);observed=max(Decimal(0),Decimal(self.state['thisRunInitial']['totalUsd'])-current)
        used=max(Decimal(self.state['spentBoundCredits']),observed)
        remaining=min(self.headroom-used,current-self.floor-self.historicalReserve)-self.BUFFER
        self.state['events'].append({'phase':'balance',**balance,'availableBeforeBufferCredits':str(remaining+self.BUFFER)})
        self.save();return remaining
    def allocate(self,model,inputs):
        remaining=self.available()
        affordable=(remaining*1000000/Decimal(str(model['creditFactor']))-Decimal(str(model['inputPrice']))*inputs)/Decimal(str(model['outputPrice']))
        cap=min(model['maxOutputTokens'],int(affordable.to_integral_value(rounding=ROUND_DOWN)))//1024*1024
        return cap if cap>=self.MIN_OUTPUT else None
    def before(self,job,model,inputs,cap):
        if self.state['inflight']:raise core.ConfigError('Already has an in-flight request')
        reserve=cost(model,inputs,cap)
        if reserve>self.available():return None
        self.state['spentBoundCredits']=str(Decimal(self.state['spentBoundCredits'])+reserve)
        self.state['inflight']={'job':job,'reservationCredits':str(reserve),'inputBound':inputs,'outputCap':cap,'balanceBefore':self.state['events'][-1]['totalUsd']}
        self.state['callsSent']+=1;self.save();return reserve
    def after(self,model,metrics):
        pending=self.state['inflight'];reserve=Decimal(pending['reservationCredits'])
        inp,out=metrics.get('inputTokens'),metrics.get('outputTokens')
        known=all(isinstance(n,int) and not isinstance(n,bool) and n>=0 for n in (inp,out))
        charge=cost(model,inp,out) if known else reserve
        if known and (inp>pending['inputBound'] or out>pending['outputCap']):
            self.state['halted']='usage_exceeds_request_bound';charge=max(charge,reserve)
        self.state['spentBoundCredits']=str(Decimal(self.state['spentBoundCredits'])-reserve+charge)
        self.state['events'].append({'phase':'settled','job':pending['job'],'usageKnown':known,'chargedBoundCredits':str(charge)})
        self.state['inflight']=None;self.save()
        remaining=self.available()
        debit=Decimal(pending['balanceBefore'])-Decimal(self.state['events'][-1]['totalUsd'])
        if debit>reserve or remaining+self.BUFFER<0:
            self.state['halted']='account_debit_exceeds_reserved_bound';self.save()
    def close(self):
        remaining=self.available()+self.BUFFER
        result={'originalFixedCapCredits':str(self.cap),'historicalAnchoredHeadroomCredits':str(self.headroom),
                'newSpentBoundCredits':self.state['spentBoundCredits'],'remainingConservativeCredits':str(max(Decimal(0),remaining)),
                'callsSent':self.state['callsSent'],'withinOriginalCap':remaining>=0,'newUnknownCalls':sum(e.get('phase')=='settled' and not e.get('usageKnown') for e in self.state['events']),
                'checkedAt':core.now()}
        core.write_json(self.destination/'closing-credit-audit.json',result);return result

def run(destination,key,guard=None,requester=core.request_once):
    destination=Path(destination);tasks=core.load_json(ROOT/'dist/data/high-suite.json')['tasks']
    guard=guard or ExpansionGuard(key,destination)
    core.write_json(destination/'plan.json',{'effort':'high','timeoutSeconds':None,'automaticRetries':0,'tasks':tasks,'taskOrder':TASK_ORDER,
        'model':MODEL,'capPolicy':'budget-derived per call; maximum is publisher limit, not a verified service ceiling',
        'pricingSource':'https://commandcode.ai/docs/resources/pricing-limits','factorSource':'https://commandcode.ai/docs/plans/goat',
        'inputReservation':'UTF-8 bytes plus 4096 framing tokens and 128 per message; receipt adds 65536 instead; charged at highest cache-write input rate',
        'historicalAnchorSha256':hashlib.sha256(ANCHOR.read_bytes()).hexdigest()})
    image=(ROOT/'dist/assets/receipt-chilli-pork.png').read_bytes()
    for task_id in TASK_ORDER:
        task=next(t for t in tasks if t['id']==task_id);path=destination/MODEL['id']/'high'/(task_id+'.json')
        if path.exists():continue  # Never automatically repeat any attempted task.
        rec={'taskId':task_id,'modelId':MODEL['id'],'name':MODEL['name'],'apiModel':MODEL['apiModel'],'provider':'CommandCode','effort':'high',
             'maxOutputTokens':MODEL['maxOutputTokens'],'timeoutSeconds':None,'outputPolicy':'budget-bounded-output','condition':'high; adaptive Messages; budget-derived output cap; no total deadline or retry',
             'checkedAt':core.now(),'status':'not_run','error':None,'outputs':[None]*len(task['prompts']),'attempts':[]}
        if task_id=='receipt':
            rec['imageSha256']=hashlib.sha256(image).hexdigest()
            if rec['imageSha256']!=task['imageSha256']:raise core.ConfigError('Receipt image changed')
        history=[]
        for step,prompt in enumerate(task['prompts']):
            history.append({'role':'user','content':prompt});bound=input_bound(history,task_id=='receipt')
            cap=guard.allocate(MODEL,bound)
            if cap is None:rec['error']='original_twenty_percent_budget_exhausted';break
            reservation=guard.before(f'{task_id}/{step+1}',MODEL,bound,cap)
            if reservation is None:rec['error']='original_twenty_percent_budget_exhausted';break
            core.write_json(path,rec)
            print(f'SONNET HIGH {task_id} {step+1}/{len(task["prompts"])} output cap {cap}',flush=True)
            result=requester(MODEL,{'prompt':prompt},{'simulation':False,'timeoutSeconds':None},cap,key,messages=history,
                input_image={'mediaType':'image/png','base64':base64.b64encode(image).decode('ascii')} if task_id=='receipt' else None)
            rec['attempts'].append({'step':step+1,**result});rec['outputs'][step]=result['output'] or None
            rec['status']=result['status'];rec['error']=result['error'];rec['checkedAt']=core.now()
            core.write_json(path,core.clean(rec,[key]))
            guard.after(MODEL,result['metrics'])
            if result['status']!='success' or guard.state['halted']:break
            history.append({'role':'assistant','content':result['output']})
        if rec['status']=='success' and any(o is None for o in rec['outputs']):rec['status']='incomplete'
        core.write_json(path,core.clean(rec,[key]))
        print(json.dumps({'task':task_id,'status':rec['status'],'error':rec['error'],'calls':len(rec['attempts'])}),flush=True)
        if guard.state['halted']:break
    print(json.dumps(guard.close()),flush=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--execute',action='store_true');args=parser.parse_args()
    if not args.execute:
        print(json.dumps({'model':MODEL['name'],'effort':'high','maxRequests':13,'networkCalls':0,'qwen':'high not advertised','gpt':'GOAT plan restriction'}));return
    destination=Path(args.out).resolve()
    if not destination.is_relative_to(ROOT/'results') or destination.exists():raise core.ConfigError('Use a fresh results directory')
    ensure_no_unreconciled_expansion(ROOT/'results')
    provider=core.load_json(Path.home()/'.opencodex/config.json')['providers']['commandcode']
    if provider['baseUrl'].rstrip('/')!=BASE+'/provider/v1':raise core.ConfigError('Unexpected endpoint')
    destination.mkdir(parents=True);run(destination,provider['apiKey'])

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,TypeError,KeyError):print('Expansion stopped; inspect private evidence. No credentials logged.');raise SystemExit(2)
