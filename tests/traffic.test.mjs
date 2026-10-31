import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{validateTrafficEvent,localDay} from '../worker/index.js';
import {sqliteD1} from '../scripts/d1_sqlite.mjs';
import {trafficRoute,referrerGroup,analyticsDisabled,analyticsConsent,setAnalyticsConsent,startTraffic,browserIdentity,audienceView,validateTrafficSummary} from '../dist/traffic.js';
const origin='https://example.test';
const event=(visitorId=crypto.randomUUID(),kind='pageview')=>({eventId:crypto.randomUUID(),visitorId,kind,route:'checkup',source:'direct',device:'desktop'});
const post=(body,extra={})=>new Request(origin+'/api/traffic',{method:'POST',headers:{origin,'content-type':'application/json',...extra},body:JSON.stringify(body)});
const summary=async DB=>(await worker.fetch(new Request(origin+'/api/traffic?days=30'),{DB})).json();
test('real SQL aggregate deduplicates events and browsers; QA never inflates advertised counts',async()=>{
  const DB=sqliteD1(),a=event();
  for(const body of [a,a,{...a,eventId:crypto.randomUUID()},event(crypto.randomUUID(),'qa'),event()])assert.equal((await worker.fetch(post(body),{DB})).status,204);
  const x=await summary(DB);validateTrafficSummary(x);assert.deepEqual(x.total,{pv:3,uv:2});assert.deepEqual(x.today,{pv:3,uv:2});assert.equal(x.daily[0].pv,3);
  const raw=DB.db.prepare('SELECT * FROM traffic_events').all();assert.equal(raw.length,4);assert.ok(raw.every(r=>r.visitor_hash.length===64&&!r.visitor_hash.includes(a.visitorId)));
  assert.doesNotMatch(JSON.stringify(x),/visitor_hash|visitorId|event_id|email|ipAddress/);DB.db.close();
});
test('period UV is distinct across days, not a sum of daily visitors',async()=>{
  const DB=sqliteD1(),a=event();await worker.fetch(post(a),{DB});const hash=DB.db.prepare('SELECT visitor_hash FROM traffic_events').get().visitor_hash;
  const yesterday=new Date(Date.now()-86400000);DB.db.prepare('INSERT INTO traffic_events VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),hash,yesterday.toISOString(),localDay(yesterday),'checkup/receipt','x.com','mobile',0);
  const x=await summary(DB);assert.deepEqual(x.total,{pv:2,uv:1});assert.equal(x.daily.reduce((n,r)=>n+r.uv,0),2);DB.db.close();
});
test('server blocks wrong origin, raw referrer, unknown route, oversized body and respects privacy signals',async()=>{
  const DB=sqliteD1();assert.equal((await worker.fetch(post(event(),{origin:'https://wrong.test'}),{DB})).status,403);
  for(const body of [{...event(),email:'private@example.test'},{...event(),source:'https://private.test/secret'},{...event(),route:'selftest'},{...event(),route:'checkup/audience'}])assert.equal((await worker.fetch(post(body),{DB})).status,400);
  assert.equal((await worker.fetch(post({...event(),route:'x'.repeat(3000)}),{DB})).status,413);
  for(const headers of [{'user-agent':'ExampleBot'},{DNT:'1'},{'Sec-GPC':'1'}])assert.equal((await worker.fetch(post(event(),headers),{DB})).status,204);
  assert.deepEqual((await summary(DB)).total,{pv:0,uv:0});DB.db.close();
});
test('unavailable storage is explicit; rate limits and retention use actual data',async()=>{
  assert.equal((await worker.fetch(new Request(origin+'/api/traffic'),{})).status,503);
  const DB=sqliteD1(),a=event();for(let i=0;i<30;i++)await worker.fetch(post({...a,eventId:crypto.randomUUID()}),{DB});assert.equal((await worker.fetch(post(event(a.visitorId)),{DB})).status,429);
  DB.db.prepare('INSERT INTO traffic_events VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'old',new Date(Date.now()-91*86400000).toISOString(),'2000-01-01','checkup','direct','desktop',0);await summary(DB);assert.equal(DB.db.prepare("SELECT COUNT(*) AS n FROM traffic_events WHERE visitor_hash='old'").get().n,0);DB.db.close();
});
test('client collects only allowlisted routes and coarse source categories',()=>{
  assert.equal(trafficRoute('#checkup/play'),'checkup/works');
  assert.equal(trafficRoute(''),'checkup');assert.equal(trafficRoute('#checkup/compare/a/b'),'checkup/compare');for(const h of ['#selftest','#checkup/audience','#checkup/private?key=secret'])assert.equal(trafficRoute(h),null);
  assert.equal(referrerGroup('https://x.com/person/status/123','https://example.test'),'x.com');assert.equal(referrerGroup('https://private.test/secret?token=x',origin),'other');assert.equal(referrerGroup('',origin),'direct');assert.equal(referrerGroup(origin+'/route',origin),'internal');
  const store={getItem:()=>null};assert.equal(analyticsDisabled(store,{doNotTrack:'1'},'example.test'),true);assert.equal(analyticsDisabled(store,{globalPrivacyControl:true},'example.test'),true);assert.equal(analyticsDisabled(store,{},'localhost'),true);
});
test('historical play analytics remain readable without accepting guesses or model choices',async()=>{
  const DB=sqliteD1(),body={...event(),route:'checkup/play'};
  assert.equal((await worker.fetch(post(body),{DB})).status,204);
  assert.equal((await worker.fetch(post({...body,eventId:crypto.randomUUID(),choice:'A'}),{DB})).status,400);
  const x=await summary(DB);assert.deepEqual(x.total,{pv:1,uv:1});assert.equal(x.pages[0].label,'checkup/play');DB.db.close();
});
test('browser identifier is reused, expires after 30 days, and does not claim visits without storage',()=>{
  let item=null;const store={getItem:()=>item,setItem:(k,v)=>item=v};const a=browserIdentity(store,0);assert.equal(browserIdentity(store,86400000),a);assert.notEqual(browserIdentity(store,31*86400000),a);assert.throws(()=>browserIdentity({getItem(){throw Error();},setItem(){throw Error();}}));
});

test('analytics requires a current explicit choice; expiry, rejection and privacy signals stop collection',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  assert.equal(analyticsConsent(storage),null);assert.equal(analyticsDisabled(storage,{},'example.test'),true);
  setAnalyticsConsent(storage,true);assert.equal(analyticsDisabled(storage,{},'example.test'),false);
  for(const nav of [{doNotTrack:'1'},{globalPrivacyControl:true},{webdriver:true}])assert.equal(analyticsDisabled(storage,nav,'example.test'),true);
  assert.equal(analyticsDisabled(storage,{},'localhost'),true);
  storage.setItem('zhufeng-analytics-off','1');assert.equal(analyticsDisabled(storage,{},'example.test'),true);
  storage.removeItem('zhufeng-analytics-off');browserIdentity(storage);assert.ok(values.has('zhufeng-anonymous-browser-v1'));
  setAnalyticsConsent(storage,false);assert.equal(analyticsDisabled(storage,{},'example.test'),true);assert.equal(values.has('zhufeng-anonymous-browser-v1'),false);
  setAnalyticsConsent(storage,true,0);assert.equal(analyticsConsent(storage,29*86400000),true);assert.equal(analyticsConsent(storage,30*86400000),null);
  assert.equal(analyticsConsent(storage,-1),null);assert.throws(()=>setAnalyticsConsent(storage,'yes'));
  values.set('zhufeng-analytics-consent-v1','invalid');assert.equal(analyticsConsent(storage),null);
  assert.equal(analyticsDisabled({getItem(){throw Error('blocked');}}, {},'example.test'),true);
});

test('page entry does not create an identifier or send analytics before consent, and revocation stops later views',async()=>{
  const values=new Map(),listeners=new Map(),sent=[];
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const globals={localStorage:storage,navigator:{},location:{hostname:'example.test',hash:'#checkup',origin},document:{visibilityState:'visible',referrer:'',addEventListener:(k,f)=>listeners.set(k,f)},innerWidth:1200,fetch:async(u,options)=>{sent.push({u,body:JSON.parse(options.body)});return new Response(null,{status:204});},addEventListener:(k,f)=>listeners.set(k,f)};
  const prior=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  try{
    for(const [k,v] of Object.entries(globals))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
    startTraffic();await Promise.resolve();assert.equal(sent.length,0);assert.equal(values.has('zhufeng-anonymous-browser-v1'),false);
    setAnalyticsConsent(storage,true);listeners.get('analyticsconsentchange')();await Promise.resolve();assert.equal(sent.length,1);assert.equal(sent[0].body.route,'checkup');
    setAnalyticsConsent(storage,false);listeners.get('analyticsconsentchange')();location.hash='#checkup/receipt';await listeners.get('hashchange')();assert.equal(sent.length,1);assert.equal(values.has('zhufeng-anonymous-browser-v1'),false);
  }finally{for(const [k,d] of prior){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
test('audience error shows unknown dashes; empty live data has no invented history',async()=>{
  const html=audienceView(null,{error:'未连接'});assert.match(html,/—/);assert.match(html,/不会用0代替/);
  const DB=sqliteD1(),x=await summary(DB);assert.equal(x.startedOn,null);assert.match(audienceView(x),/尚无/);assert.match(audienceView(x),/未采集/);assert.match(audienceView(x),/尚未经第三方审计/);DB.db.close();
});
