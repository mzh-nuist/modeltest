"""Package a clean committed checkout, excluding local credentials and raw results."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


def git(root,*args):
    return subprocess.run(['git',*args],cwd=root,capture_output=True,check=True).stdout


def package(root,destination):
    root=Path(root).resolve();destination=Path(destination).resolve()
    if (root/'dist/data/checkup.json').is_file():
        from scripts.audit_checkup_assets import audit
        audit(root)
    if (root/'dist/data/challenge.json').is_file():
        from scripts.audit_challenge_assets import ensure_public_tree
        ensure_public_tree(root)
    if git(root,'status','--porcelain').strip():raise ValueError('Source checkout must be clean and committed')
    commit=git(root,'rev-parse','HEAD').decode().strip()
    names=[n.decode('utf-8') for n in git(root,'ls-files','-z').split(b'\0') if n]
    hashes={}
    forbidden={'.git','results','private','__pycache__','.env','.env.local'}
    for name in names:
        path=root/name
        if path.is_symlink() or any(part in forbidden for part in path.relative_to(root).parts):
            raise ValueError('Unsupported private or symlink source entry')
        if not path.is_file():raise ValueError('Tracked source file is absent')
        hashes[name]=hashlib.sha256(path.read_bytes()).hexdigest()
    manifest={'commitSha':commit,'fileCount':len(hashes),'files':hashes,
              'note':'Source and public curated data only; raw results and all credentials are excluded.'}
    with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name in names:archive.write(root/name,'zhufeng-eval/'+name)
        archive.writestr('zhufeng-eval/SOURCE-MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    with zipfile.ZipFile(destination) as archive:
        expected={'zhufeng-eval/'+n for n in hashes}|{'zhufeng-eval/SOURCE-MANIFEST.json'}
        if set(archive.namelist())!=expected:raise ValueError('Archive membership mismatch')
        for name,digest in hashes.items():
            if hashlib.sha256(archive.read('zhufeng-eval/'+name)).hexdigest()!=digest:raise ValueError('Archive content mismatch')
    return {'archive':str(destination),'commitSha':commit,'fileCount':len(hashes),
            'archiveSha256':hashlib.sha256(destination.read_bytes()).hexdigest()}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',required=True)
    args=parser.parse_args();print(json.dumps(package(Path(__file__).resolve().parents[1],args.out),ensure_ascii=True))
