"""Budget-derived output caps; completed requests consume measured token bounds."""
from decimal import Decimal, ROUND_DOWN
from . import core
from .commandcode_effort_matrix import MatrixGuard

class BudgetHighGuard(MatrixGuard):
    BUFFER=Decimal('.05')
    MIN_OUTPUT=8192
    def __init__(self,key,destination):
        path=destination/'credit-ledger.json'
        prior=core.load_json(path) if path.exists() else {}
        self.spentBound=Decimal(prior.get('completedUsageBoundCredits','0'))
        super().__init__(key,destination)
    def save(self):
        super().save()
        path=self.destination/'credit-ledger.json';d=core.load_json(path)
        observed=Decimal(0)
        if self.events:observed=max(Decimal(0),Decimal(self.initial['totalUsd'])-Decimal(self.events[-1]['totalUsd']))
        d.update(completedUsageBoundCredits=str(self.spentBound),newUnsettledUsageReserveCredits=str(max(Decimal(0),self.spentBound-self.newUnknown-observed)),
                 outputBudgetPolicy='Per-request hard token cap derived from original remaining credits; completed usage bounded at nominal uncached prices x4; 0.05 credits buffer')
        core.write_json(path,d)
    def allocate_output_cap(self,model,task_id,ceiling):
        if self.check('eligibility'):return None
        live=Decimal(self.events[-1]['totalUsd'])-self.originalFloor-self.unknownReserve-self.newUnknown
        tracked=Decimal(self.initial['totalUsd'])-self.originalFloor-self.unknownReserve-self.spentBound
        available=min(live,tracked)-self.BUFFER
        input_cap=65536 if task_id=='receipt' else 16384
        affordable=(available*1000000/4-Decimal(str(model['inputPrice']))*input_cap)/Decimal(str(model['outputPrice']))
        cap=min(ceiling,int(affordable.to_integral_value(rounding=ROUND_DOWN)))
        cap=max(0,cap//1024*1024)
        if cap<self.MIN_OUTPUT:
            self.halted='original_twenty_percent_budget_exhausted';self.save();return None
        return cap
    def record_usage(self,model,metrics,reservation):
        inp,out=metrics.get('inputTokens'),metrics.get('outputTokens')
        if inp is None or out is None:charge=reservation
        else:charge=(Decimal(str(model['inputPrice']))*inp+Decimal(str(model['outputPrice']))*out)/1000000*4
        self.spentBound+=charge;self.save()
