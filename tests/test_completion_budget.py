import io,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout
from decimal import Decimal
from runner.commandcode_complete_receipt import OriginalCreditGuard,main
from runner.receipt import ROOT
SCRATCH=ROOT/'results/completion-budget-tests'
SCRATCH.mkdir(parents=True,exist_ok=True)
class CompletionBudget(unittest.TestCase):
    def test_plan_is_offline(self):
        with patch('socket.socket',side_effect=AssertionError('offline')),redirect_stdout(io.StringIO()):self.assertEqual(main(['--out','unused-plan-path']),0)
    def test_original_cap_and_unknown_usage_are_reserved_before_sending(self):
        def prior(path):return {'minimumRemainingUsd':'50','fixedBudgetUsd':'12'} if path.name=='credit-ledger.json' else {'unknownUsageFullAccountCreditReservation':'2'}
        with tempfile.TemporaryDirectory(dir=SCRATCH) as td,patch('runner.commandcode_complete_receipt.core.load_json',side_effect=prior),patch('runner.commandcode_complete_receipt.read_balance',return_value={'totalUsd':'60'}):
            guard=OriginalCreditGuard('fake-key',Path(td));self.assertEqual(guard.check('preflight',Decimal('9')),'original_twenty_percent_budget_exhausted');self.assertEqual(guard.calls,0)
        with tempfile.TemporaryDirectory(dir=SCRATCH) as td,patch('runner.commandcode_complete_receipt.core.load_json',side_effect=prior),patch('runner.commandcode_complete_receipt.read_balance',return_value={'totalUsd':'60'}):
            guard=OriginalCreditGuard('fake-key',Path(td));self.assertIsNone(guard.check('before',Decimal('2')));self.assertEqual(guard.calls,1);guard.check('after',Decimal('2'),True);self.assertEqual(guard.newUnknown,Decimal('2'));self.assertEqual(guard.check('before',Decimal('7')),'original_twenty_percent_budget_exhausted')
    def test_balance_unavailable_stops_before_a_model_call(self):
        def prior(path):return {'minimumRemainingUsd':'50','fixedBudgetUsd':'12'} if path.name=='credit-ledger.json' else {'unknownUsageFullAccountCreditReservation':'2'}
        with tempfile.TemporaryDirectory(dir=SCRATCH) as td,patch('runner.commandcode_complete_receipt.core.load_json',side_effect=prior),patch('runner.commandcode_complete_receipt.read_balance',return_value={'totalUsd':'60'}) as read:
            guard=OriginalCreditGuard('fake-key',Path(td));read.side_effect=OSError('unavailable');self.assertEqual(guard.check('before',Decimal('1')),'account_balance_unavailable');self.assertEqual(guard.calls,0)
