"""Build a standalone Pages upload from tracked public files, without Sites metadata."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico'}


def public_files():
    tracked = subprocess.check_output(
        ['git', 'ls-files', '-z', '--', 'dist'], cwd=ROOT
    ).decode('utf8').split('\0')
    files = []
    known = set()
    for name in filter(None, tracked):
        path = ROOT / name
        rel = path.relative_to(ROOT / 'dist')
        if any(part.startswith('.') for part in rel.parts) or rel.parts[0] == 'server':
            raise ValueError('Internal file is tracked under dist: ' + name)
        if path.suffix.lower() not in ALLOWED:
            raise ValueError('Unapproved asset type: ' + name)
        if any(p.is_symlink() or p.is_junction() for p in [path, *path.parents] if p != ROOT.parent):
            raise ValueError('Asset link rejected: ' + name)
        if not path.is_file() or not path.resolve().is_relative_to(ROOT / 'dist'):
            raise ValueError('Missing or escaped asset: ' + name)
        files.append((path, rel))
        known.add(rel.as_posix())
    for path in (ROOT / 'dist').rglob('*'):
        rel = path.relative_to(ROOT / 'dist')
        if rel.parts[0] in {'server', '.openai'}:
            continue
        if path.is_file() and rel.as_posix() not in known:
            raise ValueError('Untracked public file; review before building: ' + str(rel))
    return files


def build(out, database_id=None):
    out = Path(out).resolve()
    if not out.is_relative_to(ROOT / 'results') or out == ROOT / 'results':
        raise ValueError('Output must be a new subdirectory of project results')
    if out.exists():
        raise ValueError('Refusing to overwrite an existing build')
    if database_id is not None:
        database_id = str(uuid.UUID(database_id))
        if database_id == str(uuid.UUID(int=0)):
            raise ValueError('A real D1 database ID is required')
    files = public_files()
    source = (ROOT / 'worker/index.js').read_text(encoding='utf8')
    if source.count('/*__ASSET_MAP__*/{}') != 1 or 'env.ASSETS.fetch(request)' not in source:
        raise ValueError('Independent asset handler missing')
    upload = out / 'public'
    upload.mkdir(parents=True)
    hashes = {}
    for path, rel in files:
        destination = upload / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        body = path.read_bytes()
        destination.write_bytes(body)
        hashes[rel.as_posix()] = hashlib.sha256(body).hexdigest()
    (upload / '_worker.js').write_text(source, encoding='utf8')
    # Only the analytics endpoint needs Functions; all other assets stay on Pages.
    (upload / '_routes.json').write_text(json.dumps({
        'version': 1, 'include': ['/api/*'], 'exclude': []
    }, indent=2) + '\n', encoding='utf8')
    (upload / '_headers').write_text(
        '/*\n  Cache-Control: public, no-cache, no-transform\n  X-Content-Type-Options: nosniff\n'
        '  Referrer-Policy: strict-origin-when-cross-origin\n', encoding='utf8'
    )
    config = {
        'name': 'modeltest-cc',
        'pages_build_output_dir': './public',
        'compatibility_date': '2026-10-26',
        'd1_databases': [{
            'binding': 'DB', 'database_name': 'modeltest-traffic',
            'database_id': database_id or 'REPLACE_WITH_CREATED_D1_DATABASE_ID',
            'migrations_dir': os.path.relpath(ROOT / 'drizzle', out).replace('\\', '/'),
        }],
    }
    (out / ('wrangler.json' if database_id else 'wrangler.example.json')).write_text(
        json.dumps(config, indent=2) + '\n', encoding='utf8'
    )
    for name in ['_worker.js', '_routes.json', '_headers']:
        hashes[name] = hashlib.sha256((upload / name).read_bytes()).hexdigest()
    report = {
        'target': 'Cloudflare Pages + D1, owned account',
        'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
        'sourceHasChanges': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT)),
        'publicFiles': len(hashes), 'fileHashes': hashes,
        'databaseConfigured': database_id is not None,
        'output': str(upload), 'deployed': False,
    }
    (out / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--database-id')
    args = parser.parse_args()
    report = build(args.out, args.database_id)
    print(json.dumps({k: v for k, v in report.items() if k != 'fileHashes'}))
