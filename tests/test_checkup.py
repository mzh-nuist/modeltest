import copy
import json
from pathlib import Path
import tempfile
import shutil
import unittest
from unittest.mock import patch
from runner.checkup import ROOT, load_bank, template, demos, validate_report, assess_report, assess_run, compare_reports, collect_conversation, offline_check, previewable_svg, read, main


class EverydayCheckupTests(unittest.TestCase):
    def setUp(self):
        self.bank = load_bank()
        self.samples = demos(self.bank)

    def test_offline_never_opens_network_and_preserves_no_measurements(self):
        with patch('socket.socket', side_effect=AssertionError('No network in everyday offline check')):
            report = offline_check(self.bank)
        self.assertEqual(report['modelApiCalls'], 0)
        self.assertEqual(report['passed'], 22)
        self.assertTrue(all(c['passed'] for c in report['cases']))
        self.assertEqual(report['kind'], 'demo')

    def test_default_has_five_required_and_optional_visual_without_scores(self):
        self.assertEqual([t['id'] for t in self.bank['tasks'] if t['optional']], ['visual'])
        report = template(self.bank)
        self.assertEqual([r['verdict'] for r in assess_report(report, self.bank)], ['not_run'] * 6)
        self.assertNotIn('score', json.dumps(report))

    def test_no_semantic_keyword_autopass(self):
        report = template(self.bank)
        for i in [0, 1, 4, 5]:
            report['runs'][i].update(status='complete', outputs=['开车 10点15 未说明 <svg/>'])
        results = assess_report(report, self.bank)
        self.assertTrue(all(results[i]['verdict'] == 'review' for i in [0, 1, 4, 5]))

    def test_exact_edit_does_not_normalize_away_unrequested_changes(self):
        task = self.bank['tasks'][2]; row = copy.deepcopy(self.samples['previous']['runs'][2])
        for output, expected in [(' \n'+task['exactAnswer']+'\n', 'normal'), ('\ufeff'+task['exactAnswer'], 'normal'), ('\u0085'+task['exactAnswer'], 'missed'), ('好的，'+task['exactAnswer'], 'missed'), (task['exactAnswer'].replace('雨伞', '伞'), 'missed'), (task['exactAnswer'].replace('。','！'), 'missed')]:
            row['outputs'][-1] = output
            self.assertEqual(assess_run(task,row)['verdict'], expected)

    def test_missing_memory_turns_cannot_receive_completed_review(self):
        report = copy.deepcopy(self.samples['previous']); row = report['runs'][3]
        row['outputs'][1] = None; row.update(status='incomplete', review=None)
        self.assertEqual(assess_report(report,self.bank)[3]['verdict'], 'review')
        row['review'] = self.samples['previous']['runs'][3]['review']
        with self.assertRaises(ValueError): validate_report(report,self.bank)

    def test_truncated_nonempty_answer_is_not_judged_correct(self):
        report = copy.deepcopy(self.samples['previous']); row = report['runs'][2]
        row.update(status='incomplete', note='回答中途报错')
        self.assertEqual(assess_report(report,self.bank)[2]['verdict'],'review')

    def test_human_wrong_missing_and_uncertain_are_distinct(self):
        report = copy.deepcopy(self.samples['previous']); row = report['runs'][3]
        for field, value, verdict in [('return','no','missed'), ('budget','no','wrong'), ('people','unsure','review')]:
            row['review']['answers'] = {c['id']:'yes' for c in self.bank['tasks'][3]['checks']}
            row['review']['answers'][field] = value
            self.assertEqual(assess_report(report,self.bank)[3]['verdict'], verdict)

    def test_collector_keeps_real_answers_and_isolates_new_sessions(self):
        task = self.bank['tasks'][3]; seen = []
        def reply(history):
            seen.append(copy.deepcopy(history)); history.append({'role':'assistant','content':'must not leak back'})
            return 'answer-' + str(len(seen))
        row = collect_conversation(task,reply)
        self.assertEqual([len(h) for h in seen],[1,3,5,7,9])
        self.assertEqual(seen[-1][1]['content'],'answer-1')
        self.assertEqual(row['outputs'],['answer-'+str(i) for i in range(1,6)])
        seen.clear(); collect_conversation(self.bank['tasks'][0],reply)
        self.assertEqual(len(seen[0]),1)

    def test_collector_stops_on_failure_without_filling_or_retrying(self):
        seen = []
        def reply(history):
            seen.append(history)
            if len(seen)==2: raise RuntimeError('authorization: confidential')
            return '真实第一轮'
        row=collect_conversation(self.bank['tasks'][3],reply)
        self.assertEqual(len(seen),2)
        self.assertEqual(row['outputs'],['真实第一轮',None,None,None,None])
        self.assertNotIn('confidential',row['note'])
        self.assertEqual(row['status'],'incomplete')

    def test_compare_needs_model_conditions_and_chronology(self):
        old,new = self.samples['previous'],self.samples['current']
        result=compare_reports(old,new,self.bank)
        self.assertTrue(result['comparable'])
        self.assertEqual(result['rows'][1]['note'],'上次正常，这次出现问题。')
        for field,value in [('conditions',''),('modelLabel','different'),('checkedAt',None),('checkedAt','2026-10-23T12:00:00Z')]:
            altered=copy.deepcopy(new);altered[field]=value
            r=compare_reports(old,altered,self.bank)
            self.assertFalse(r['comparable'])
            self.assertTrue(all('先补齐' in row['note'] for row in r['rows']))

    def test_import_rejects_forged_verdict_hidden_fields_and_inconsistent_status(self):
        for change in [lambda d:d.update(kind='measured'),lambda d:d.update(score=100),lambda d:d['runs'][0].update(verdict='normal'),lambda d:d['runs'][0].update(status='not_run'),lambda d:d['runs'][0].update(review={'answers':{},'note':''}),lambda d:d.update(checkedAt='2026-02-30T12:00:00Z')]:
            data=copy.deepcopy(self.samples['previous']);change(data)
            with self.assertRaises(ValueError):validate_report(data,self.bank)

    def test_svg_preview_is_format_only_and_blocks_active_external_content(self):
        self.assertTrue(previewable_svg('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'))
        for output in ['<svg onload="alert(1)"/>','<svg><foreignObject/></svg>','<svg><use href="https://bad.test/x"/></svg>','<svg><script/></svg>','<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg>&x;</svg>']:
            self.assertFalse(previewable_svg(output))

    def test_cli_roundtrip_creates_new_files_and_rejects_duplicates(self):
        parent=ROOT/'results/checkup-tests';parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=parent) as folder:
            p=Path(folder);source=p/'source.json';source.write_text(json.dumps(self.samples['previous'],ensure_ascii=False),encoding='utf-8')
            self.assertEqual(main(['check','--input',str(source),'--out',str(p/'result.json')]),0)
            self.assertEqual(read(p/'result.json')['kind'],'imported')
            with self.assertRaises(FileExistsError):main(['check','--input',str(source),'--out',str(p/'result.json')])
            bad=p/'bad.json';bad.write_text('{"kind":"demo","kind":"measured"}',encoding='utf-8')
            with self.assertRaises(ValueError):read(bad)

    def test_package_audit_rejects_demo_provenance_or_evidence_tampering(self):
        from scripts.audit_checkup_assets import audit
        parent=ROOT/'results/checkup-tests';parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=parent) as folder:
            root=Path(folder)
            for relative in ['datasets/checkup_v1.json','dist/data/checkup.json','dist/data/checkup-demo.json','dist/data/checkup-offline.json','dist/data/checkup-collected-demo.json']:
                path=root/relative;path.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/relative,path)
            self.assertEqual(audit(root)['offlineCases'],22)
            path=root/'dist/data/checkup-demo.json';data=read(path);data['current']['kind']='imported';path.write_text(json.dumps(data),encoding='utf-8')
            with self.assertRaises(ValueError):audit(root)
            shutil.copyfile(ROOT/'dist/data/checkup-demo.json',path)
            path=root/'dist/data/checkup-offline.json';data=read(path);data['modelApiCalls']=1;path.write_text(json.dumps(data),encoding='utf-8')
            with self.assertRaises(ValueError):audit(root)


if __name__=='__main__': unittest.main()
