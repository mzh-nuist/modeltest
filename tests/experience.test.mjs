import {studioArchive} from '../dist/studio-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {modelPicker,chooseComparison,bindModelPickers} from '../dist/model-picker.js';
import {projectHighSuite} from '../dist/high-suite.js';
import {publishedHome,createPublishedDailyController} from '../dist/published-daily.js';
import {weightedSummary} from '../dist/weighted-score.js';
const read=n=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+n,import.meta.url),'utf8'));
const models=read('daily-measured.json').models;

test('model choices retain the selected side and keep comparisons distinct',()=>{
  const ids=models.map(m=>m.id);
  assert.deepEqual(chooseComparison(models,[ids[0],ids[1]],0,ids[1]),[ids[1],ids[0]]);
  assert.deepEqual(chooseComparison(models,[ids[0],ids[1]],1,ids[0]),[ids[1],ids[0]]);
  assert.deepEqual(chooseComparison(models,[ids[0],ids[1]],1,ids[4]),[ids[0],ids[4]]);
  assert.throws(()=>chooseComparison(models,ids,3,ids[0]));
  assert.throws(()=>chooseComparison(models,ids,0,'unpublished-model'));
  const malicious=structuredClone(models);malicious[0].name='<img src=x onerror=alert(1)>';
  const html=modelPicker(malicious,malicious[0].id,0);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img[^>]+(?:src=x|onerror=)/);
  assert.match(html,/aria-pressed="true"/);assert.match(html,/stroke-width="1.8"/);
  assert.equal((html.match(/data-pub-model-choice=/g)||[]).length,models.length);
});

function pickerHarness(){
  const events={},docEvents={},viewEvents={},focused=[],picked=[],focusOptions=[];
  const make=side=>{
    const summary={focus:()=>focused.push('summary'+side),getBoundingClientRect:()=>({left:800,top:700,bottom:764,width:420})};
    const buttons=models.map((m,i)=>({dataset:{pubModelChoice:String(side),modelId:m.id},getAttribute:()=>i===side?'true':'false',focus:options=>{focused.push(i);focusOptions.push(options)}}));
    const menu={style:{}};
    const p={open:false,dataset:{selected:models[side].id},matches:()=>true,querySelector:s=>s==='summary'?summary:menu,querySelectorAll:()=>buttons};
    p.contains=target=>target===summary||buttons.includes(target);
    summary.closest=()=>p;buttons.forEach(b=>b.closest=s=>s==='[data-model-picker]'?p:b);
    return {p,summary,buttons,menu};
  };
  const pickers=[make(0),make(1)];
  const main={querySelectorAll:()=>pickers.map(x=>x.p),addEventListener:(n,f)=>events[n]=f,ownerDocument:{addEventListener:(n,f)=>docEvents[n]=f,defaultView:{addEventListener:(n,f)=>viewEvents[n]=f}}};
  bindModelPickers(main,{getModels:()=>models,onPick:(...args)=>picked.push(args)});
  return {events,docEvents,viewEvents,pickers,focused,picked,focusOptions};
}

test('actual picker handlers position above a low trigger and support keyboard and outside dismissal',()=>{
  const oldHeight=Object.getOwnPropertyDescriptor(globalThis,'innerHeight'),oldWidth=Object.getOwnPropertyDescriptor(globalThis,'innerWidth');
  Object.defineProperty(globalThis,'innerHeight',{value:800,configurable:true});
  Object.defineProperty(globalThis,'innerWidth',{value:1024,configurable:true});
  try{
    const h=pickerHarness(),one=h.pickers[0],two=h.pickers[1];
    one.p.open=true;two.p.open=true;h.events.toggle({target:one.p});
    assert.equal(two.p.open,false);assert.equal(one.menu.style.top,'auto');assert.equal(one.menu.style.bottom,'108px');assert.equal(one.menu.style.left,'592px');
    let prevented=0;
    h.events.keydown({target:one.summary,key:'ArrowDown',preventDefault:()=>prevented++});assert.equal(h.focused.at(-1),0);
    h.events.keydown({target:one.buttons[0],key:'ArrowUp',preventDefault:()=>prevented++});assert.equal(h.focused.at(-1),4);assert.ok(h.focusOptions.every(x=>x?.preventScroll===true));
    h.events.keydown({target:one.buttons[4],key:'Escape',preventDefault:()=>prevented++});assert.equal(one.p.open,false);assert.equal(h.focused.at(-1),'summary0');assert.equal(prevented,3);
    one.p.open=true;h.docEvents.click({target:{closest:()=>null}});assert.equal(one.p.open,false);
    one.p.open=true;h.events.focusout({target:one.buttons[0],relatedTarget:two.summary});assert.equal(one.p.open,false);
    h.events.click({target:one.buttons[1]});assert.deepEqual(h.picked[0],[[models[1].id,models[0].id],0]);
  }finally{
    if(oldHeight)Object.defineProperty(globalThis,'innerHeight',oldHeight);else delete globalThis.innerHeight;
    if(oldWidth)Object.defineProperty(globalThis,'innerWidth',oldWidth);else delete globalThis.innerWidth;
  }
});

test('first-season archive retains eight whole-card links and original measured points',()=>{
  const p=projectHighSuite(read('high-suite.json'),read('daily-measured.json'),read('completed-suite.json'),read('checkup.json'));
  const before=JSON.stringify(p.book),html=studioArchive(p.data,p.book);
  const grid=html.match(/<div id="question-list">([\s\S]*?)<\/section>/)[1];
  assert.equal((grid.match(/class="question-row"/g)||[]).length,8);
  assert.equal((grid.match(/class="q-arrow"/g)||[]).length,8);
  assert.equal((grid.match(/<a\b/g)||[]).length,8);
  assert.match(html,/studio-score-table/);assert.match(html,/column-model-grid/);assert.doesNotMatch(html,/data-home-warmup/);assert.doesNotMatch(html,/class="hero-sheet"/);
  assert.equal(JSON.stringify(p.book),before);
  assert.deepEqual(p.book.models.map(m=>weightedSummary(p.book,m).finalScore),[77,80,63,90,72.5]);
});

test('controller renders working model disclosures without the former native compare select',async()=>{
  const prevFetch=globalThis.fetch,prevLocation=globalThis.location,prevStorage=globalThis.localStorage;
  try{
    globalThis.location={hash:'#checkup/compare'};
    globalThis.localStorage={getItem:()=>null};
    globalThis.fetch=async url=>({ok:true,text:async()=>JSON.stringify(read(url.replace('data/','')))});
    let ready;const loaded=new Promise(resolve=>ready=resolve);
    const main={addEventListener(){},querySelectorAll:()=>[]};
    const controller=createPublishedDailyController({main,rerender:()=>ready()});
    controller.render(['compare']);await loaded;
    const html=controller.render(['compare']);
    assert.equal((html.match(/class="model-picker"/g)||[]).length,2);
    assert.equal((html.match(/data-pub-model-choice=/g)||[]).length,20);
    assert.doesNotMatch(html,/<select data-pub-compare/);
  }finally{globalThis.fetch=prevFetch;globalThis.location=prevLocation;globalThis.localStorage=prevStorage;}
});

const luminance=hex=>{
  const c=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('release versions reach all module imports so cached old modules cannot mix with the new entry point',()=>{
  const base=new URL('../dist/',import.meta.url),html=fs.readFileSync(new URL('index.html',base),'utf8');
  const version=html.match(/src="app\.js\?v=([^"]+)"/)[1];
  for(const match of html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))(?:\?v=([^"]+))?"/g))assert.equal(match[2],version,match[1]);
  let imports=0;
  for(const name of fs.readdirSync(base).filter(n=>n.endsWith('.js'))){
    const source=fs.readFileSync(new URL(name,base),'utf8');
    for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\/[^'"?]+\.js)(?:\?v=([^'"]+))?['"]/g)){
      imports++;assert.equal(match[2],version,`${name} -> ${match[1]}`);assert.ok(fs.existsSync(new URL(match[1],base)));
    }
  }
  assert.ok(imports>30);
  for(const pair of [['ffffff','182820'],['c5d4c8','182820'],['182820','d7fa88'],['213324','eaf0df']])assert.ok(contrast(...pair)>=4.5);
});
test('light and dark reading tokens meet text contrast targets and public styles follow legacy styles',()=>{
  const css=fs.readFileSync(new URL('../dist/experience.css',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  for(const rule of ['body.published-mode {','body.published-mode.dark {']){
    const block=css.slice(css.indexOf(rule)+rule.length).split('}')[0];
    const tokens=Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(m=>[m[1],m[2].slice(1)]));
    for(const color of ['ink','muted','accent'])for(const surface of ['bg','panel','paper','soft'])assert.ok(contrast(tokens[color],tokens[surface])>=4.5,`${rule} ${color}/${surface}`);
    assert.ok(contrast(tokens['control-line'],tokens.panel)>=3,`${rule} control boundary`);
  }
  assert.ok(contrast('ffffff','2457cf')>=4.5);
  const allLinks=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
  const links=allLinks.filter(x=>!x.startsWith('dynamic-challenge.css'));
  assert.match(allLinks.at(-1),/^dynamic-challenge\.css/);
  assert.match(links.at(-4),/^experience\.css/);
  assert.match(links.at(-3),/^site-shell\.css/);
  assert.match(links.at(-2),/^playful-season\.css/);assert.match(links.at(-1),/^columns\.css/);
  assert.match(css,/prefers-reduced-motion/);assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[0-3])px\b/);
});
