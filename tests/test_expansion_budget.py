import tempfile,unittest
from pathlib import Path
from decimal import Decimal
from runner import core
from runner.commandcode_expansion import ExpansionGuard,MODEL,cost,input_bound,ensure_no_unreconciled_expansion

class ExpansionBudgetTests(unittest.TestCase):
    def setUp(self):
        root=Path(__file__).resolve().parents[1]/'results/expansion-budget-tests';root.mkdir(exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=root);self.addCleanup(self.tmp.cleanup);self.out=Path(self.tmp.name)
        self.balance='60'
        self.anchor={'originalCapCredits':'12.71','conservativeHeadroomCredits':'.9489402910','pastUnknownReserveCredits':'5.8','extraConservativeReserveCredits':'.3','withinOriginalCap':True}
        self.old={'originalMinimumRemainingCredits':'50'}
    def guard(self):return ExpansionGuard('fixture',self.out,lambda _: {'totalUsd':self.balance,'checkedAt':core.now()},self.anchor,self.old)
    def test_same_original_ceiling_even_if_account_is_recharged(self):
        g=self.guard();cap=g.allocate(MODEL,4400)
        self.assertGreaterEqual(cap,8192);self.assertLessEqual(cost(MODEL,4400,cap)+g.BUFFER,g.headroom)
        self.balance='600';self.assertEqual(g.allocate(MODEL,4400),cap)
        g.before('first',MODEL,4400,cap);g.after(MODEL,{'inputTokens':200,'outputTokens':400})
        self.assertEqual(Decimal(g.state['spentBoundCredits']),cost(MODEL,200,400))
        resumed=self.guard();self.assertEqual(resumed.state['spentBoundCredits'],g.state['spentBoundCredits'])
        self.assertLessEqual(resumed.allocate(MODEL,4400),cap)
    def test_unknown_usage_holds_full_reservation_and_crash_cannot_resend(self):
        g=self.guard();cap=g.allocate(MODEL,4400);reserve=g.before('first',MODEL,4400,cap)
        with self.assertRaises(core.ConfigError):self.guard()
        g.after(MODEL,{'inputTokens':None,'outputTokens':None})
        self.assertEqual(Decimal(g.state['spentBoundCredits']),reserve)
        self.assertIsNone(g.allocate(MODEL,4400))
    def test_balance_drop_after_allocation_prevents_send(self):
        g=self.guard();cap=g.allocate(MODEL,4400);self.balance='56.2'
        self.assertIsNone(g.before('first',MODEL,4400,cap));self.assertEqual(g.state['callsSent'],0)
    def test_live_debit_above_reservation_halts(self):
        g=self.guard();cap=g.allocate(MODEL,4400);g.before('first',MODEL,4400,cap)
        self.balance='58';g.after(MODEL,{'inputTokens':100,'outputTokens':100})
        self.assertEqual(g.state['halted'],'account_debit_exceeds_reserved_bound')
    def test_image_not_silently_budgeted_as_plain_text(self):
        messages=[{'role':'user','content':'这张账单有几份？'}]
        self.assertGreater(input_bound(messages,True),65536)
        self.assertIsNone(self.guard().allocate(MODEL,input_bound(messages,True)))
    def test_new_directory_does_not_discard_a_previous_expansion_reservation(self):
        directory=self.out/'previous';directory.mkdir()
        core.write_json(directory/'credit-ledger.json',{'thisRunInitial':{},'anchoredHeadroomCredits':'.94','callsSent':1})
        with self.assertRaises(core.ConfigError):ensure_no_unreconciled_expansion(self.out)

if __name__=='__main__':unittest.main()
