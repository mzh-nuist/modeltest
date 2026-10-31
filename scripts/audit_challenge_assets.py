"""Check public V2 assets against local data and reject sealed payload leakage."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runner.challenge_bank import load_bank, read_json, public_catalog, validate_public_catalog
from runner.challenge_offline import validate_report


def ensure_public_tree(root, bank=None):
    root=Path(root).resolve()
    bank=bank if bank is not None else load_bank()
    catalog_path=root/'dist/data/challenge.json'
    if not catalog_path.is_file():
        return {'state':'not_present','filesScanned':0}
    catalog=read_json(catalog_path)
    validate_public_catalog(catalog)
    manifest=read_json(root/'datasets/challenge_manifest_v2.json') if (root/'datasets/challenge_manifest_v2.json').is_file() else None
    expected=public_catalog(bank,manifest)
    if catalog['tasks']!=expected['tasks'] or catalog['counts']!=expected['counts']:
        raise ValueError('Public challenge catalog does not match its permitted projection')
    report_path=root/'dist/data/challenge-offline.json'
    if report_path.is_file():validate_report(read_json(report_path), bank)
    public_files=[]
    for folder in ('dist','datasets','runner','scripts','docs','tests'):
        for path in (root/folder).rglob('*'):
            if path.is_symlink() or getattr(path,'is_junction',lambda:False)():
                raise ValueError('Public source contains an unsupported link')
            if path.is_file() and '__pycache__' not in path.parts and '.runner-tmp' not in path.parts:
                if path.suffix.lower() in ('.zip','.gz','.tar','.7z'):
                    raise ValueError('Archives cannot be embedded in the audited public tree')
                public_files.append(path)
    signatures=[]
    for task in bank['tasks']:
        if task['pool']!='sealed':continue
        for value in [task['prompt'],task['reference']]+[a['content'] for a in task.get('assets',[])]:
            if len(value)<150:continue
            signatures.extend((value,json.dumps(value,ensure_ascii=False)[1:-1],json.dumps(value,ensure_ascii=True)[1:-1]))
    for path in public_files:
        body=path.read_bytes().decode('utf-8',errors='ignore')
        if any(s in body for s in signatures):
            raise ValueError('Sealed prompt/reference/source leaked into public path: '+path.relative_to(root).as_posix())
        if path.suffix=='.json':
            data=read_json(path)
            if isinstance(data,dict) and data.get('schemaVersion')=='challenge-bank-v2' and any(t.get('pool')=='sealed' for t in data.get('tasks',[])):
                raise ValueError('Full sealed bank is present in public JSON')
    legacy=root/'dist/data/measured.json'
    return {'state':'passed','catalogTasks':len(catalog['tasks']),'developmentTasks':catalog['counts']['development'],
      'sealedMetadataOnly':catalog['counts']['sealed'],'filesScanned':len(public_files),
      'sealedContentCompared':sum(t['pool']=='sealed' for t in bank['tasks']),
      'historicalMeasuredSha256':hashlib.sha256(legacy.read_bytes()).hexdigest() if legacy.is_file() else None,
      'limit':'Checks public projections and exact private payload signatures; does not prove absence of all semantic leakage or model contamination.'}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',default=str(Path(__file__).resolve().parents[1]));p.add_argument('--bank');p.add_argument('--out');a=p.parse_args()
    result=ensure_public_tree(a.root,load_bank(a.bank))
    if a.out:
        path=Path(a.out);path.parent.mkdir(parents=True,exist_ok=True)
        with path.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
