import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pelicanPose,pelicanPlayer} from '../dist/pelican-player.js';
import {seasonPage} from '../dist/playful-season.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
test('authored demo keeps contacts and fixed limb lengths throughout a complete cycle',()=>{
 for(let i=0;i<201;i++){
  const p=pelicanPose(i/100);
  assert.ok(Math.abs(distance(p.pedals[0],p.crank)-42)<.002);
  assert.ok(Math.abs(distance(p.pedals[0],p.pedals[1])-84)<.003);
  for(let j=0;j<2;j++){
   assert.deepEqual(p.feet[j],p.pedals[j]);
   assert.ok(Math.abs(distance(p.hips[j],p.knees[j])-100)<.003);
   assert.ok(Math.abs(distance(p.knees[j],p.feet[j])-100)<.003);
  }
  assert.deepEqual(p.body,{x:355,y:275});
 }
 assert.deepEqual(pelicanPose(2),pelicanPose(0));
 assert.deepEqual(pelicanPose(Infinity),pelicanPose(0));
});
test('error example deliberately separates a stationary foot from its moving pedal',()=>{
 const bad=pelicanPose(.5,true),good=pelicanPose(.5);
 assert.ok(distance(bad.feet[0],bad.pedals[0])>50);
 assert.ok(distance(good.feet[0],good.pedals[0])<.001);
 assert.deepEqual(bad.feet,pelicanPose(0,true).feet);
});
test('focused page keeps demos separate from model evidence and puts one copy action before the player',()=>{
 const bank=JSON.parse(fs.readFileSync(new URL('../dist/data/playful-season.json',import.meta.url),'utf8'));
 const html=seasonPage(bank,'dynamic-pelican');
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.equal((html.match(/data-season-copy=/g)||[]).length,1);
 assert.ok(html.indexOf('data-season-copy=')<html.indexOf('data-pelican-player'));
 assert.doesNotMatch(html,/6 类新挑战|<details[^>]+\bopen\b/);
 assert.match(html,/出题方示意 · 非模型答卷/);assert.match(html,/模型结果：待实测/);
 assert.match(html,/0.50 秒/);assert.match(html,/data-dynamic-prompt/);
 assert.doesNotMatch(pelicanPlayer(),/<script|<foreignObject|https?:\/\/(?!www.w3.org)/);
});
