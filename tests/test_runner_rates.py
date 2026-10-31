import unittest
from runner.rates import estimate_rates


class RatePolicyTests(unittest.TestCase):
    def test_buffered_burst_does_not_claim_hundreds_of_thousands_tps(self):
        r = estimate_rates('success', [(1.2, '0.'), (1.200085, '4')], 11)
        self.assertIsNone(r['outputTps'])
        self.assertIsNone(r['charsPerSec'])

    def test_sustained_visible_sample_reports_client_rate(self):
        r = estimate_rates('success', [(1, '甲'*30), (1.4, '乙'*35), (1.8, '丙'*35)], 100)
        self.assertEqual(r['outputTps'], 125)
        self.assertEqual(r['charsPerSec'], 87.5)

    def test_long_text_without_separable_tokens_only_has_character_rate(self):
        r = estimate_rates('success', [(1, '甲'*30), (1.4, '乙'*35), (1.8, '丙'*35)], None)
        self.assertIsNone(r['outputTps'])
        self.assertEqual(r['charsPerSec'], 87.5)

    def test_failed_or_tiny_samples_have_no_rate(self):
        for status, chunks, tokens in [('error', [(0,'a'*50),(.5,'b'*50),(1,'c'*50)],100),('success',[(0,'a'),(.5,'b'),(1,'c')],3),('success',[(0,'a'*50),(1,'b'*50)],100)]:
            r=estimate_rates(status,chunks,tokens)
            self.assertIsNone(r['outputTps'])
            self.assertIsNone(r['charsPerSec'])
