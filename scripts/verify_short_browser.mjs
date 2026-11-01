// Disposable Edge profile; only same-origin GET/HEAD. Never sends inference.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT_MODULE));
const out=path.resolve(process.env.QA_OUT||'results/short-challenges-20261101/browser-local');await fs.mkdir(out,{recursive:true});
let server,base=process.env.QA_URL;
if(!base){server=http.createServer(async(req,res)=>{try{
  const file=path.resolve('dist','.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!['GET','HEAD'].includes(req.method)||!file.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(await fs.readFile(file));
}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/?qa=1`;}
const report={base,scope:'Headless Edge at 1440,390,320; mobile viewport emulation, not physical devices',checks:[],errors:[],failedRequests:[],blockedRequests:[]};
const check=(name,pass,details)=>{report.checks.push({name,pass:Boolean(pass),details});if(!pass)throw Error(name+': '+JSON.stringify(details));};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]){
  const prefix=String(viewport.width),ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,reducedMotion:'reduce',extraHTTPHeaders:{DNT:'1'}}),page=await ctx.newPage();
  await ctx.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(['data:','blob:'].includes(u.protocol)||u.origin===new URL(base).origin&&['GET','HEAD'].includes(r.method()))return route.continue();report.blockedRequests.push({url:r.url(),method:r.method()});return route.abort();});
  page.on('pageerror',x=>report.errors.push(String(x)));page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  const ready=async selector=>{await page.locator(selector).first().waitFor({state:'visible',timeout:25000});await page.evaluate(()=>document.fonts.ready);};
  const layout=async name=>{const size=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));check(prefix+'/'+name+'/no-overflow',size.s<=size.w+1,size);};
  await page.goto(base+'#checkup',{waitUntil:'networkidle'});await ready('.studio-home');
  check(prefix+'/new-links-on-home',await page.locator('a[href="#checkup/season/boss-sokoban"]').count()>0&&await page.locator('a[href="#checkup/season/gear-scam"]').count()>0);
  const bank=await page.evaluate(()=>fetch('data/short-challenges.json').then(r=>r.json())),results=await page.evaluate(()=>fetch('data/short-challenge-results.json').then(r=>r.json()));
  if(process.env.QA_EXPECT_CALLS)check(prefix+'/actual-call-count',results.modelCalls===Number(process.env.QA_EXPECT_CALLS),results.modelCalls);
  for(const task of bank.tasks){
   await page.goto(base+'#checkup/season/'+task.id,{waitUntil:'networkidle'});await ready('[data-short-task]');
   check(prefix+'/'+task.id+'/single-title',await page.locator('main h1').count()===1);
   check(prefix+'/'+task.id+'/reference-label',await page.locator('[data-short-source]').innerText()==='出题方示意 · 非模型答卷');
   check(prefix+'/'+task.id+'/rubric-collapsed',await page.locator('.season-rubric[open]').count()===0);
   const bounds=await page.locator('[data-short-copy]').boundingBox();check(prefix+'/'+task.id+'/copy-first-screen',bounds.y+bounds.height<=viewport.height,bounds);
   await layout(task.id);await page.screenshot({path:out+'/'+prefix+'-'+task.id+'.png'});
   await page.locator('[data-short-results]').click();check(prefix+'/'+task.id+'/score-jump-preserves-route',new URL(page.url()).hash==='#checkup/season/'+task.id);await page.locator('[data-short-copy]').scrollIntoViewIfNeeded();
   await page.locator('.season-rubric summary').click();check(prefix+'/'+task.id+'/rubric-opens',await page.locator('.season-rubric[open]').count()===1);
   await page.locator('.season-rubric summary').click();
   await page.evaluate(()=>{window.__copied=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
   await page.locator('[data-short-copy]').click();check(prefix+'/'+task.id+'/exact-copy',await page.evaluate(()=>window.__copied)===task.cases[0].prompt);
   await page.locator('[data-short-case]').selectOption('1');check(prefix+'/'+task.id+'/case-switch',await page.locator('[data-short-prompt]').textContent()===task.cases[1].prompt);
   if(task.id==='boss-sokoban'){
    await page.locator('[data-short-action="next"]').click();check(prefix+'/boss/next-step',/第 1 \//.test(await page.locator('[data-short-progress]').innerText()));
    await page.locator('[data-short-action="play"]').click();await page.waitForFunction(()=>/第 [2-9] \//.test(document.querySelector('[data-short-progress]').textContent));
    await page.locator('[data-short-action="play"]').click();const paused=await page.locator('[data-short-progress]').innerText();await page.waitForTimeout(650);check(prefix+'/boss/pause',paused===await page.locator('[data-short-progress]').innerText());
    await page.locator('[data-short-action="reset"]').click();check(prefix+'/boss/reset',/第 0 \//.test(await page.locator('[data-short-progress]').innerText()));
   }else{
    await page.locator('[data-short-case]').selectOption('0');await page.locator('[data-short-action="play"]').click();check(prefix+'/gears/repair-shown',await page.locator('.gear-edge.removed').count()===1);
    check(prefix+'/gears/repair-verdict',(await page.locator('[data-short-progress]').innerText()).includes('修复方案合格'));
    await page.locator('[data-short-action="reset"]').click();check(prefix+'/gears/reset',await page.locator('.gear-edge.removed').count()===0);
    await page.locator('[data-short-case]').selectOption('1');await page.locator('[data-short-action="play"]').click();check(prefix+'/gears/positive-control',await page.locator('.gear-edge.removed').count()===0&&(await page.locator('[data-short-progress]').innerText()).includes('原机构可行'));
   }
   for(const rec of results.records.filter(r=>r.taskId===task.id)){
    await page.locator('[data-short-model]').selectOption(rec.modelId);await page.locator('[data-short-case]').selectOption(String(task.cases.findIndex(c=>c.id===rec.caseId)));
    check(prefix+'/'+rec.modelId+'/'+rec.caseId+'/raw-preserved',await page.locator('[data-short-output]').textContent()===rec.output);
    check(prefix+'/'+rec.modelId+'/'+rec.caseId+'/grade-shown',(await page.locator('[data-short-grade]').innerText()).includes('本例 '+rec.grade.total+'/100'));
   }
   await page.locator('#theme-published').click();await layout(task.id+'-dark');
   const contrast=await page.locator('.short-primary').evaluate(el=>{const cs=getComputedStyle(el),lum=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;};const a=lum(cs.color),b=lum(cs.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
   check(prefix+'/'+task.id+'/button-contrast',contrast>=4.5,contrast);await page.locator('#theme-published').click();
   await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}});});
   await page.locator('[data-short-copy]').click();check(prefix+'/'+task.id+'/manual-copy-fallback',await page.locator('.short-prompt[open]').count()===1&&(await page.locator('[data-short-copy-status]').innerText()).includes('手动选择'));
   await page.locator('a[href="#checkup/results"]').last().click();await ready('.column-page');check(prefix+'/'+task.id+'/old-score-link',(await page.locator('main').innerText()).includes('八项成绩'));
  }
  await page.goto(base+'#checkup/season',{waitUntil:'networkidle'});await ready('.short-overview');await layout('season-directory');
  check(prefix+'/old-development-tasks-preserved',await page.locator('.season-task').count()===6);
  await page.goto(base+'#checkup/season/dynamic-pelican',{waitUntil:'networkidle'});await ready('[data-pelican-player]');check(prefix+'/dynamic-preserved',(await page.locator('main').innerText()).includes('模型结果：待实测'));
  await ctx.close();
 }
 check('no-page-errors',report.errors.length===0,report.errors);check('no-failed-resources',report.failedRequests.length===0,report.failedRequests);check('no-write-or-external-requests',report.blockedRequests.length===0,report.blockedRequests);
 report.success=true;
}catch(err){report.error=String(err);report.success=false;process.exitCode=1;}finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();server?.close();}
console.log(JSON.stringify({out,success:report.success,passed:report.checks.filter(x=>x.pass).length,total:report.checks.length,error:report.error}));
