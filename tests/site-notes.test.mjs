import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSiteNotes,siteNotesPage} from '../dist/site-notes.js';
import {analyticsConsent,browserIdentity,trafficRoute} from '../dist/traffic.js';
import {createPublishedDailyController} from '../dist/published-daily.js';

function harness(){
  const values=new Map(),listeners={},windowListeners={},sent=[];
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  let status=null;
  const buttons=['allow','deny'].map(value=>({dataset:{analyticsChoice:value},attributes:{},setAttribute(k,v){this.attributes[k]=v;}}));
  const root={addEventListener:(name,fn)=>listeners[name]=fn,querySelector:()=>status,querySelectorAll:()=>status?buttons:[],contains:el=>!!status&&buttons.includes(el)};
  const events={addEventListener:(name,fn)=>windowListeners[name]=fn,dispatchEvent:event=>sent.push(event.type)};
  const ui=bindSiteNotes({root,events,storage:()=>storage,nav:{},hostname:'example.test'});
  return {values,storage,buttons,sent,ui,windowListeners,mount(){status={textContent:''};ui.refresh();return status;},click(index){listeners.click({target:{closest:()=>buttons[index]}});}};
}

test('privacy choices work after route insertion and remain accurate after remount',()=>{
  const h=harness();assert.equal(h.values.size,0);
  let status=h.mount();assert.match(status.textContent,/尚未选择/);
  h.click(0);assert.equal(analyticsConsent(h.storage),true);assert.match(status.textContent,/已允许本站/);assert.equal(h.buttons[0].attributes['aria-pressed'],'true');
  browserIdentity(h.storage);assert.ok(h.values.has('zhufeng-anonymous-browser-v1'));
  status=h.mount();assert.match(status.textContent,/已允许本站/);
  h.click(1);assert.equal(analyticsConsent(h.storage),false);assert.equal(h.values.has('zhufeng-anonymous-browser-v1'),false);assert.match(status.textContent,/已关闭/);assert.equal(h.buttons[1].attributes['aria-pressed'],'true');
  assert.deepEqual(h.sent,['analyticsconsentchange','analyticsconsentchange']);
  h.values.clear();h.windowListeners.storage();assert.match(status.textContent,/尚未选择/);assert.equal(h.buttons[1].attributes['aria-pressed'],'false');
});

test('privacy page remains accessible before score data loads and does not count as a view',()=>{
  const controller=createPublishedDailyController({main:{addEventListener(){},querySelectorAll:()=>[]},rerender(){}});
  assert.equal(controller.render(['privacy']),siteNotesPage());
  assert.match(siteNotesPage(),/data-analytics-choice="allow"/);assert.match(siteNotesPage(),/不以继续浏览视为同意/);
  assert.equal(trafficRoute('#checkup/privacy'),null);
});
