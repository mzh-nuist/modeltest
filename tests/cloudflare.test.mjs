import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import worker from '../worker/index.js';
import {sqliteD1} from '../scripts/d1_sqlite.mjs';

test('independent Pages worker serves local assets without contacting a Sites origin', async()=>{
  const seen=[];
  const ASSETS={async fetch(request){seen.push(request.url);return new Response('local page',{
    headers:{'content-type':'text/html','cache-control':'max-age=3600'}
  });}};
  const response=await worker.fetch(new Request('https://modeltest.cc/'),{ASSETS});
  assert.equal(response.status,200);assert.equal(await response.text(),'local page');
  assert.deepEqual(seen,['https://modeltest.cc/']);
  assert.equal(response.headers.get('cache-control'),'no-cache');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  const head=await worker.fetch(new Request('https://modeltest.cc/boot.js',{method:'HEAD'}),{ASSETS});
  assert.equal(await head.text(),'');
});

test('Pages analytics keeps the same SQL, consent boundary and QA exclusion',async()=>{
  const DB=sqliteD1();let staticCalls=0;
  const env={DB,ASSETS:{fetch(){staticCalls++;throw Error('API was routed to static assets');}}};
  try{
    const body={eventId:crypto.randomUUID(),visitorId:crypto.randomUUID(),kind:'qa',route:'checkup',source:'direct',device:'desktop'};
    const request=new Request('https://modeltest.cc/api/traffic',{method:'POST',headers:{origin:'https://modeltest.cc','content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await worker.fetch(request,env)).status,204);
    const summary=await (await worker.fetch(new Request('https://modeltest.cc/api/traffic'),env)).json();
    assert.equal(summary.state,'live');assert.deepEqual(summary.total,{pv:0,uv:0});assert.equal(staticCalls,0);
    const unknown=await worker.fetch(new Request('https://modeltest.cc/api/unknown'),{ASSETS:{fetch:()=>new Response('Not found',{status:404})}});
    assert.equal(unknown.status,404);
  }finally{DB.db.close();}
});

test('standalone upload preserves every public source asset and excludes hosting metadata and private files',async()=>{
  const root=path.resolve(import.meta.dirname,'..');
  fs.mkdirSync(path.join(root,'results'),{recursive:true});
  const out=path.join(root,'results',`cloudflare-test-${crypto.randomUUID()}`);
  try{
    const report=JSON.parse(execFileSync('python',['scripts/build_cloudflare.py','--out',out],{cwd:root,encoding:'utf8'}));
    assert.equal(report.deployed,false);assert.equal(report.databaseConfigured,false);
    const upload=path.join(out,'public');
    for(const forbidden of ['.openai','server','private','.env','wrangler.json','manifest.json'])assert.equal(fs.existsSync(path.join(upload,forbidden)),false);
    const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
    const tracked=execFileSync('git',['ls-files','-z','--','dist'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
    for(const filename of tracked){
      const rel=filename.replace(/^dist\//,'');
      assert.deepEqual(fs.readFileSync(path.join(upload,rel)),fs.readFileSync(path.join(root,filename)),rel);
      assert.ok(manifest.fileHashes[rel]);
    }
    const routes=JSON.parse(fs.readFileSync(path.join(upload,'_routes.json'),'utf8'));
    assert.deepEqual(routes,{version:1,include:['/api/*'],exclude:[]});
    const headers=fs.readFileSync(path.join(upload,'_headers'),'utf8');
    assert.match(headers,/Cache-Control: public, no-cache, no-transform/,'The proxy may inject analytics before the visitor chooses to allow it');
    const source=fs.readFileSync(path.join(upload,'_worker.js'),'utf8');
    assert.doesNotMatch(source,/chatgpt\.site|fetch\(['"]https?:\/\//);
    const built=await import(pathToFileURL(path.join(upload,'_worker.js')).href);
    const response=await built.default.fetch(new Request('https://modeltest.cc/'),{ASSETS:{fetch:()=>new Response('independent')}});
    assert.equal(await response.text(),'independent');
    assert.throws(()=>execFileSync('python',['scripts/build_cloudflare.py','--out',out],{cwd:root,stdio:'pipe'}),/Command failed/);
  }finally{fs.rmSync(out,{recursive:true,force:true});}
});
