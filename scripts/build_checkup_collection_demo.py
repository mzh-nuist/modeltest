"""Publish only the clearly labelled output of a local HTTP fixture into static assets."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runner.checkup import ROOT,load_bank,validate_report
from runner.checkup_http_fixture import run_offline,public_collection_demo


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);a=p.parse_args()
    report,summary=run_offline(a.out)
    report=validate_report(public_collection_demo(report,load_bank()),load_bank())
    (ROOT/'dist/data/checkup-collected-demo.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'state':'passed','tasks':6,'loopbackRequests':summary['loopbackRequests'],'modelApiCalls':0},ensure_ascii=False))
