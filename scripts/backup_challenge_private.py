"""Create a separately labelled local private bank backup, never a Site artifact."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def backup(root,destination):
    root=Path(root).resolve();source=(root/'private/challenge-v2').resolve();destination=Path(destination).resolve()
    if not source.is_relative_to(root/'private') or not (source/'bank.json').is_file():
        raise ValueError('A complete local private bank is required')
    if destination.is_relative_to(root/'dist') or destination.is_relative_to(source) or 'private' not in destination.name.lower():
        raise ValueError('Private backup must be explicitly labelled and outside served/source folders')
    files=[p for p in source.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix in ('.json','.py','.md','.txt')]
    if any(p.is_symlink() or not p.resolve().is_relative_to(source) for p in files):raise ValueError('Linked private files are not supported')
    hashes={p.relative_to(source).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    manifest={'kind':'private-local-backup','warning':'包含封存题、答案、参考程序和夹具。不得放入网页、公开Git或公开源码包。','files':hashes}
    destination.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(destination,'x',zipfile.ZIP_DEFLATED) as archive:
        for p in files:archive.write(p,'challenge-v2/'+p.relative_to(source).as_posix())
        archive.writestr('PRIVATE-MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    with zipfile.ZipFile(destination) as archive:
        for name,digest in hashes.items():
            if hashlib.sha256(archive.read('challenge-v2/'+name)).hexdigest()!=digest:raise ValueError('Private backup readback mismatch')
    return {'kind':'private-local-backup','fileCount':len(files),'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'path':str(destination)}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);a=p.parse_args()
    print(json.dumps(backup(Path(__file__).resolve().parents[1],a.out),ensure_ascii=False))
