import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
test('public HTML hides the legacy shell even before application JavaScript loads',()=>{
  const initial=html.match(/<body\b[^>]*class="([^"]*)"/)?.[1]||'';
  assert.ok(initial.split(/\s+/).includes('published-mode'),'Fresh public HTML exposes the legacy sidebar before app.js runs');
  const css=fs.readFileSync(new URL('../dist/editorial.css',import.meta.url),'utf8');
  assert.match(css,/\.published-mode \.sidebar,\.published-mode \.topbar\{display:none\}/);
});

test('blocking bootstrap sets route and theme before the old shell is parsed, without app.js',()=>{
  const script=html.match(/<script\b[^>]*src="(boot\.js[^\"]*)"[^>]*><\/script>/);
  assert.ok(script,'Route/theme bootstrap is missing before module loading');
  assert.doesNotMatch(script[0],/\b(?:defer|async)\b|type="module"/);
  assert.ok(script.index<html.indexOf('<header'));
  const source=fs.readFileSync(new URL('../dist/'+script[1].split('?')[0],import.meta.url),'utf8');
  const initial=html.match(/<body\b[^>]*class="([^"]*)"/)[1];
  for(const [hash,isPublic,isHome,isDark] of [['',true,true,true],['#checkup/model/kimi-k3',true,false,true],['#checkup/receipt',true,false,true],['#models',false,false,true],['#selftest',false,false,true]]){
    const classes=new Set(initial.split(/\s+/));
    const classList={toggle(name,on){if(on)classes.add(name);else classes.delete(name);},add(name){classes.add(name);}};
    vm.runInNewContext(source,{document:{body:{classList}},location:{hash},localStorage:{getItem:()=>isDark?'dark':'light'}});
    assert.equal(classes.has('published-mode'),isPublic,hash);
    assert.equal(classes.has('published-home'),isHome,hash);
    assert.equal(classes.has('dark'),isDark,hash);
  }
  const classes=new Set(initial.split(/\s+/));
  assert.doesNotThrow(()=>vm.runInNewContext(source,{document:{body:{classList:{toggle(n,on){if(on)classes.add(n);else classes.delete(n);},add(n){classes.add(n);}}}},location:{hash:'#checkup'},localStorage:{getItem(){throw Error('storage blocked');}}}));
  assert.ok(classes.has('published-mode'));
});

test('tab icon remains valid while the header uses a text wordmark',()=>{
  const icon=html.match(/<link\b[^>]*rel="icon"[^>]*href="([^"]+)"/)?.[1];
  assert.ok(icon);assert.notEqual(icon.split('?')[0],'favicon.svg');
  const header=html.match(/<header class="editorial-header">([\s\S]*?)<\/header>/)[1];
  assert.doesNotMatch(header,/<img/);assert.match(header,/modeltest<span class="domain">\.cc/);
  const svg=fs.readFileSync(new URL('../dist/'+icon.split('?')[0],import.meta.url),'utf8');
  assert.match(svg,/<svg\b/);assert.doesNotMatch(svg,/<script|foreignObject/);
});
