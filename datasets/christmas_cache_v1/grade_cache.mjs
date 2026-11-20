import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setImmediate as tick} from 'node:timers/promises';

const {createCache} = await import(pathToFileURL(path.resolve(process.argv[2], 'cache.mjs')));
const groups = [];

function fixture(config={}) {
  let time = 0;
  const pending = [];
  const cache = createCache({capacity:3,ttl:10,stale:5,now:() => time,
    load: key => new Promise((resolve,reject) => pending.push({key,resolve,reject})), ...config});
  return {cache,pending,at:value => {time = value;}};
}

async function test(title,points,check) {
  let timer;
  try {
    await Promise.race([check(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('test pending')), 700); })]);
    groups.push({title,points,score:points});
  } catch (error) {
    groups.push({title,points,score:0,detail:error.message.slice(0,240)});
  } finally { clearTimeout(timer); }
}

await test('基础 LRU、原引用与空值',20,async () => {
  const {cache,pending} = fixture({capacity:2});
  const shared = {x:1};
  cache.put('__proto__',shared);
  cache.put('undefined',undefined);
  assert.equal(await cache.get('__proto__'),shared);
  cache.put('',false);
  assert.deepEqual(cache.stats(),{keys:['__proto__',''],inflight:0});
  cache.put('__proto__',undefined);
  assert.equal(await cache.get('__proto__'),undefined);
  assert.deepEqual(cache.stats(),{keys:['','__proto__'],inflight:0});
  assert.equal(pending.length,0);
});

await test('TTL 边界和后台刷新',20,async () => {
  const {cache,pending,at} = fixture();
  cache.put('a','old');
  at(9);
  assert.equal(await cache.get('a'),'old');
  assert.equal(pending.length,0);
  at(10);
  assert.equal(await cache.get('a'),'old');
  at(14);
  assert.equal(await cache.get('a'),'old');
  assert.equal(pending.length,1);
  at(15);
  const waiting = cache.get('a');
  let settled = false;
  waiting.then(() => { settled=true; }, () => {});
  await tick();
  assert.equal(settled,false);
  assert.deepEqual(cache.stats(),{keys:[],inflight:1});
  pending[0].resolve('new');
  assert.equal(await waiting,'new');
  at(24);
  assert.equal(await cache.get('a'),'new');
  assert.equal(pending.length,1);
});

await test('同键合并与跨键并发',20,async () => {
  const {cache,pending} = fixture({capacity:1});
  const xs = Array.from({length:80}, () => cache.get('x'));
  const y = cache.get('y');
  await tick();
  assert.deepEqual(pending.map(row => row.key),['x','y']);
  assert.deepEqual(cache.stats(),{keys:[],inflight:2});
  pending[1].resolve(7);
  assert.equal(await y,7);
  pending[0].resolve(8);
  assert.deepEqual(await Promise.all(xs),Array(80).fill(8));
  assert.deepEqual(cache.stats(),{keys:['x'],inflight:0});
});

await test('覆盖与失效切代',15,async () => {
  const {cache,pending} = fixture();
  const old = cache.get('a');
  await tick();
  cache.put('a','manual');
  cache.invalidate('a');
  const newLoad = cache.get('a');
  await tick();
  pending[0].resolve('stale-load');
  assert.equal(await old,'stale-load');
  const latest = cache.get('a');
  await tick();
  assert.equal(pending.length,2);
  assert.deepEqual(cache.stats(),{keys:[],inflight:1});
  pending[1].resolve('latest');
  assert.deepEqual(await Promise.all([newLoad,latest]),['latest','latest']);
  assert.equal(await cache.get('a'),'latest');
});

await test('过期优先驱逐、驱逐中刷新隔离',10,async () => {
  const {cache,pending,at} = fixture({capacity:2});
  cache.put('expiredSoon',1);
  at(8);
  cache.put('survivor',2);
  at(10);
  await cache.get('expiredSoon');
  await tick();
  at(15);
  cache.put('newer',3);
  assert.deepEqual(cache.stats(),{keys:['survivor','newer'],inflight:0});
  const reload = cache.get('expiredSoon');
  await tick();
  pending[0].resolve(100);
  await tick();
  assert.deepEqual(cache.stats(),{keys:['survivor','newer'],inflight:1});
  pending[1].resolve(200);
  assert.equal(await reload,200);
  assert.deepEqual(cache.stats().keys,['newer','expiredSoon']);
});

await test('失败恢复、原异常和状态接口',15,async () => {
  const error = Error('upstream down');
  const {cache,pending,at} = fixture();
  cache.put('a','old');
  at(11);
  await cache.get('a');
  await tick();
  pending[0].reject(error);
  await tick();
  assert.equal(await cache.get('a'),'old');
  at(15);
  const blocked = cache.get('a');
  const observed = assert.rejects(blocked, value => value === error);
  await tick();
  pending[1].reject(error);
  await observed;
  assert.deepEqual(cache.stats(),{keys:[],inflight:0});
  const retry = cache.get('a');
  await tick();
  pending[2].resolve('recovered');
  assert.equal(await retry,'recovered');
  const externallyMutable = cache.stats();
  try { externallyMutable.keys.pop(); } catch {}
  assert.deepEqual(cache.stats().keys,['a']);
  const syncError = fixture({load:() => { throw error; }}).cache;
  await assert.rejects(() => syncError.get('b'), value => value === error);
  assert.equal(syncError.stats().inflight,0);
});

console.log(JSON.stringify({score:groups.reduce((sum,row) => sum+row.score,0), groups}));
