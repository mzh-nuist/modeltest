"""Bundle only the approved public assets into a dependency-free Worker."""
import base64,json,mimetypes
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def build():
    assets={}
    for p in sorted((ROOT/'dist').rglob('*')):
        if not p.is_file() or p.relative_to(ROOT/'dist').parts[0] in ('server','.openai'):continue
        if p.is_symlink():raise ValueError('Asset symlink rejected')
        mime=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
        if p.suffix=='.js':mime='text/javascript'
        assets['/'+p.relative_to(ROOT/'dist').as_posix()]={'type':mime,'data':base64.b64encode(p.read_bytes()).decode()}
    source=(ROOT/'worker/index.js').read_text(encoding='utf8')
    output=source.replace('/*__ASSET_MAP__*/{}',json.dumps(assets,separators=(',',':')))
    dest=ROOT/'dist/server';dest.mkdir(exist_ok=True)
    (dest/'index.js').write_text(output,encoding='utf8')
    return {'assets':len(assets),'workerBytes':len(output.encode())}
if __name__=='__main__':print(json.dumps(build()))
