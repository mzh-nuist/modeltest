import copy
import json
from pathlib import Path
import unittest

from scripts.publish_measured import merge

ROOT=Path(__file__).resolve().parents[1]


class PublicationTests(unittest.TestCase):
    def fixture(self):
        data=json.loads((ROOT/'dist/data/measured.json').read_text(encoding='utf-8'))
        batch=next(b for b in data['batches'] if 'goat-claude' in ' '.join(b['modelIds']))
        data['models']=[m for m in data['models'] if m['id'] in batch['modelIds']]
        data['tasks']=[t for t in data['tasks'] if t['id'] in batch['taskIds']]
        data['runs']=[r for r in data['runs'] if r['batchId']==batch['id']]
        data['batches']=[batch]
        return data

    def second(self,first):
        second=copy.deepcopy(first)
        second['batches'][0]['id']='second-batch'
        for run in second['runs']:
            run['id']='second-'+run['id']
            run['batchId']='second-batch'
        return second

    def test_same_configuration_across_batches_deduplicates_without_losing_attempts(self):
        first=self.fixture();second=self.second(first)
        result=merge([first,second])
        self.assertEqual(len(result['models']),len(first['models']))
        self.assertEqual(len(result['runs']),len(first['runs'])*2)
        self.assertEqual(len(result['batches']),2)
        self.assertEqual(first,self.fixture(),'Merge must not mutate the source evidence')

    def test_conflicting_price_under_same_identity_blocks_publication(self):
        first=self.fixture();second=self.second(first)
        second['models'][0]['inputPrice']+=1
        with self.assertRaisesRegex(ValueError,'model identity'):merge([first,second])

    def test_changed_prompt_under_same_task_id_blocks_publication(self):
        first=self.fixture();second=self.second(first)
        second['tasks'][0]['prompt']+=' changed'
        with self.assertRaisesRegex(ValueError,'task identity'):merge([first,second])

    def test_demo_cannot_enter_real_measured_publication(self):
        data=json.loads((ROOT/'dist/data/demo.json').read_text(encoding='utf-8'))
        with self.assertRaises(ValueError):merge([data])


if __name__=='__main__':unittest.main()
