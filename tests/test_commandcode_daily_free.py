import copy
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from runner import core
from runner.checkup import ROOT, load_bank
from runner.checkup_collect import collect, make_plan, validate_commandcode_free
from runner.commandcode_daily_free import configuration, verify_live, ENV_NAME


class FreeDailyTests(unittest.TestCase):
    def setUp(self):
        self.config=configuration();self.bank=load_bank()
        self.scratch=ROOT/'results/free-daily-tests';self.scratch.mkdir(parents=True,exist_ok=True)

    def test_free_plan_has_eleven_requests_and_zero_budget(self):
        for selection in ['beam','laguna','glyph']:
            config=configuration(selection);plan=make_plan(config,self.bank)
            validate_commandcode_free(config,plan)
            self.assertEqual(plan['plannedRequests'],11)
            self.assertEqual(plan['reservedUpperBoundUsd'],0)
            self.assertTrue(plan['fitsBudget'])

    def test_free_guard_refuses_paid_routes_or_nonzero_prices_before_transport(self):
        mutations=[('apiModel','reflection/beam'),('endpoint','https://example.invalid/chat/completions'),
                   ('inputPrice',1),('outputPrice',1),('cachedInputPrice',None),('adapter','anthropic-messages')]
        with tempfile.TemporaryDirectory(dir=self.scratch) as scratch,patch('runner.core.request_once') as request:
            for key,value in mutations:
                config=copy.deepcopy(self.config);config['models'][0][key]=value
                with self.subTest(key=key),self.assertRaises(core.ConfigError):
                    collect(config,self.bank,Path(scratch)/key,commandcode_free=True)
            config=copy.deepcopy(self.config);config['budgetUsd']=1
            with self.assertRaises(core.ConfigError):collect(config,self.bank,Path(scratch)/'budget',commandcode_free=True)
            request.assert_not_called()

    def test_first_free_capacity_error_stops_all_following_calls(self):
        result={'status':'error','error':'http_429','output':'','metrics':{k:None for k in core.METRICS}}
        with tempfile.TemporaryDirectory(dir=self.scratch) as scratch,patch.dict(os.environ,{ENV_NAME:'fake-credential-for-test'}),patch('runner.core.request_once',return_value=result) as request:
            report,summary=collect(self.config,self.bank,Path(scratch)/'run',commandcode_free=True)
        self.assertEqual(request.call_count,1);self.assertEqual(summary['halted'],'free_request_failed')
        self.assertEqual(report['runs'][0]['status'],'incomplete')
        self.assertTrue(all(r['status']=='not_run' for r in report['runs'][1:]))
        self.assertIsNone(summary['totalEstimatedCostUsd'])

    def test_free_terms_check_fails_closed_if_current_terms_change(self):
        catalog={'data':[{'id':'reflection/beam:free','supported_endpoints':['/chat/completions']}]}
        section="**Beam 1.0 is free while capacity lasts.** Requests cost no credits. Input, output, and cache reads are all `$0.00`. Free requests cost $0, so they don't draw down your per-model allowances"
        for terms,valid in [(section,True),(section.replace('$0.00','$1.00'),False)]:
            opener=unittest.mock.Mock()
            opener.open.side_effect=[io.BytesIO(json.dumps(catalog).encode()),io.BytesIO(terms.encode())]
            with patch('urllib.request.build_opener',return_value=opener):
                if valid:self.assertEqual(verify_live('fake-key')['budgetUsd'],0)
                else:
                    with self.assertRaises(core.ConfigError):verify_live('fake-key')


if __name__=='__main__':unittest.main()
