"""Verify public everyday assets and synthetic provenance before local packaging."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runner.checkup import ROOT, read, validate_bank, validate_report, demos, offline_check
from runner.checkup_http_fixture import expected_outputs


def audit(root=ROOT):
    root = Path(root)
    bank = validate_bank(read(root / 'datasets/checkup_v1.json'))
    public = validate_bank(read(root / 'dist/data/checkup.json'))
    if public != bank: raise ValueError('网页六项题目和源题库不同')
    demo = read(root / 'dist/data/checkup-demo.json')
    if set(demo) != {'previous','current'}: raise ValueError('演示字段不符合约定')
    for report in demo.values():
        validate_report(report, bank)
        if report['kind'] != 'demo': raise ValueError('预设回答必须标为演示')
    if demo != demos(bank): raise ValueError('演示回答不是本轮冻结样例')
    report = read(root / 'dist/data/checkup-offline.json')
    if report != offline_check(bank): raise ValueError('网页离线证据无法重放')
    collected_path=root/'dist/data/checkup-collected-demo.json'
    if not collected_path.is_file(): raise ValueError('缺少自动采集演示资产')
    if collected_path.is_file():
        collected=validate_report(read(collected_path),bank)
        expected=expected_outputs(bank)
        if collected['kind']!='demo' or collected['modelLabel']!='本机模拟接口（自动采集演示）' or collected['conditions']!='本机loopback模拟接口；固定预设回答；没有真实模型API':
            raise ValueError('自动采集演示必须保留模拟来源标记')
        for row in collected['runs']:
            if row['status']!='complete' or row['outputs']!=expected[row['taskId']] or row['review'] is not None or row['note']:
                raise ValueError('自动采集演示不能伪造模型回答或人工结论')
    return {'state':'passed','tasks':6,'optionalVisual':True,'offlineCases':report['passed'],'modelApiCalls':0,'demoRecords':2,'httpCollectionDemo':collected_path.is_file()}


if __name__=='__main__': print(json.dumps(audit(),ensure_ascii=False))
