"""Build the six-check local UI assets and synthetic offline evidence; no network."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runner.checkup import ROOT, load_bank, demos, offline_check


def build():
    bank = load_bank(); report = offline_check(bank)
    target = ROOT / 'dist/data'
    for name, value in [('checkup.json', bank), ('checkup-demo.json', demos(bank)), ('checkup-offline.json', report)]:
        (target / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'tasks': 6, 'offlineCases': report['passed'], 'modelApiCalls': 0}


if __name__ == '__main__': print(json.dumps(build(), ensure_ascii=False))
