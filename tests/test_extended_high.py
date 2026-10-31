import tempfile,unittest
from decimal import Decimal
from pathlib import Path
from runner import core
from runner.commandcode_extended_high import AuthorizedGuard,specs

class AuthorizedBatchTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.out=Path(self.tmp.name);self.balance='57'
 def guard(self):return AuthorizedGuard('fixture',self.out,lambda _: {'totalUsd':self.balance,'checkedAt':core.now()},historical_reserve=Decimal('6'))
 def test_new_authorization_uses_existing_balance_without_old_twenty_percent_cap(self):
  g=self.guard();self.assertEqual(g.cap,Decimal(51));self.assertTrue(g.state['oldTwentyPercentCapSuperseded'])
  cap=g.allocate(specs()[0],5000);self.assertEqual(cap,128000)
 def test_recharge_does_not_expand_fixed_authorization_and_unknown_usage_stays_reserved(self):
  g=self.guard();m=specs()[0];cap=g.allocate(m,5000);reserved=g.before('first',m,5000,cap)
  self.balance='570';g.after(m,{'inputTokens':None,'outputTokens':None})
  self.assertEqual(Decimal(g.state['spentBoundCredits']),reserved);self.assertEqual(g.cap,Decimal(51))
 def test_live_debit_breach_halts_and_inflight_cannot_resume(self):
  g=self.guard();m=specs()[0];cap=g.allocate(m,5000);g.before('first',m,5000,cap)
  with self.assertRaises(core.ConfigError):self.guard()
  self.balance='30';g.after(m,{'inputTokens':100,'outputTokens':100})
  self.assertEqual(g.state['halted'],'account_debit_exceeds_reserved_bound')
 def test_limits_are_separate_from_context_and_adapters_request_explicit_high(self):
  models=specs();self.assertEqual(len(models),5);self.assertEqual(len({m['apiModel'] for m in models}),5)
  for m in models:self.assertEqual(m['reasoningEffort'],'high');self.assertTrue(m['limitSource'].startswith('https://'))
  for m in models[:2]:self.assertEqual(m['anthropicEffortProtocol'],'adaptive-v1')
if __name__=='__main__':unittest.main()
