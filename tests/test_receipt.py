import base64,unittest
from runner.receipt import prepare
class ReceiptPreparation(unittest.TestCase):
    def test_actual_png_is_sent_without_reference_or_ocr_substitute(self):
        for adapter in ['openai-compatible','anthropic-messages']:
            plan,payload=prepare('not-a-real-call',adapter);self.assertEqual(plan['modelApiCalls'],0)
            parts=payload['messages'][0]['content'];self.assertEqual(parts[0]['text'],'请告诉我这个账单，辣椒炒肉有几份？')
            image=parts[1]['image_url']['url'].split(',',1)[1] if adapter=='openai-compatible' else parts[1]['source']['data']
            self.assertTrue(base64.b64decode(image).startswith(b'\x89PNG\r\n\x1a\n'));self.assertNotIn('reference',payload)
    def test_unknown_adapter_rejected(self):
        with self.assertRaises(ValueError):prepare('x','unknown')
