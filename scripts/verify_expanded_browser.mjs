// Read-only public-site integration checks in a disposable headless browser.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT_MODULE));
const root=process.cwd(),out=path.resolve(process.env.QA_OUT||'results/extended-high-authorized-20261031/browser-local');
await fs.mkdir(out,{recursive:true});let server,base=process.env.QA_URL;
if(!base){
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
 server=http.createServer(async(req,res)=>{try{
  const target=path.resolve(root,'dist','.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!['GET','HEAD'].includes(req.method)||!target.startsWith(path.resolve(root,'dist')+path.sep)){res.writeHead(403).end();return;}
  const b=await fs.readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','cache-control':'no-store'}).end(req.method==='HEAD'?undefined:b);
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/?qa=1`;
}
const report={startedAt:new Date().toISOString(),base,scope:'Headless Edge desktop and mobile viewport emulation, not physical devices',checks:[],errors:[],failedRequests:[],blockedRequests:[]};
const check=(name,pass,details)=>{report.checks.push({name,pass:Boolean(pass),details});if(!pass)throw Error(name+': '+JSON.stringify(details));};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]){
  const label=String(viewport.width),context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:viewport.width<500,hasTouch:viewport.width<500,reducedMotion:'reduce',extraHTTPHeaders:{DNT:'1'}}),page=await context.newPage();
  await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(['data:','blob:'].includes(u.protocol)||(u.origin===new URL(base).origin&&['GET','HEAD'].includes(r.method())))return route.continue();report.blockedRequests.push({url:r.url(),method:r.method()});return route.abort();});
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  async function ready(selector){await page.locator(selector).first().waitFor({state:'visible',timeout:20000});await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(r));});}
  async function layout(name){const m=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));check(label+'/'+name+'/no-horizontal-overflow',m.scroll<=m.width+1,m);}
  await page.goto(base+'#checkup',{waitUntil:'networkidle'});await ready('.studio-home');await layout('home');
  check(label+'/new-names-visible',(await page.locator('main').innerText()).includes('GPT-6 Luna'));
  check(label+'/unavailable-models-absent',!await page.locator('main').getByText(/Qwen 3.8 Max|GPT-6.1 Sol/).count());
  await page.screenshot({path:out+'/'+label+'-home.png',fullPage:true});
  await page.locator('a[href="#checkup/season/dynamic-pelican"]').first().click();await ready('#season-dynamic-pelican');
  check(label+'/dynamic-single-task',await page.locator('.season-task').count()===1);
  check(label+'/dynamic-unmeasured',(await page.locator('main').innerText()).includes('模型结果：待实测'));
  const copyBounds=await page.locator('[data-season-copy="dynamic-pelican"]').boundingBox();
  check(label+'/copy-in-first-screen',copyBounds.y>=0&&copyBounds.y+copyBounds.height<=viewport.height,copyBounds);
  check(label+'/one-title',await page.locator('main h1').count()===1);
  check(label+'/prompt-collapsed',await page.locator('[data-dynamic-prompt][open]').count()===0);
  const player=page.locator('[data-pelican-player]');await page.waitForFunction(()=>document.querySelector('[data-pelican-player]')?.dataset.playing==='false');
  check(label+'/reduced-motion-paused',await player.getAttribute('data-playing')==='false');
  await page.screenshot({path:out+'/'+label+'-dynamic-first-screen.png'});
  await page.locator('#theme-published').click();
  const contrast=await page.locator('.dynamic-copy').evaluate(el=>{
   const style=getComputedStyle(el),luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
   const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  check(label+'/dark-copy-contrast',contrast>=4.5,contrast);await layout('dark-player');
  await page.locator('#theme-published').click();

  await player.locator('[data-pelican-action="step"]').click();
  check(label+'/step-one-frame',Math.abs(Number(await player.getAttribute('data-seconds'))-2/12)<.001);
  await player.locator('[data-pelican-speed]').selectOption('0.25');
  check(label+'/slow-motion-selected',await player.getAttribute('data-speed')==='0.25');
  await player.locator('[data-pelican-action="toggle"]').click();
  await page.waitForFunction(()=>Number(document.querySelector('[data-pelican-player]').dataset.seconds)>.18);
  check(label+'/animation-plays',await player.getAttribute('data-playing')==='true');
  await player.locator('[data-pelican-action="toggle"]').click();
  const stopped=await player.locator('[data-part="front-leg"]').getAttribute('d');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  check(label+'/pause-stops-motion',await player.locator('[data-part="front-leg"]').getAttribute('d')===stopped);
  const slider=player.locator('[data-pelican-time]');await slider.focus();await slider.press('End');
  check(label+'/seek-with-keyboard',Number(await player.getAttribute('data-seconds'))>1.9);
  await page.locator('[data-pelican-evidence]').click();
  check(label+'/error-timestamp',await player.getAttribute('data-mode')==='broken'&&Number(await player.getAttribute('data-seconds'))===.5);
  check(label+'/error-highlight-visible',await player.locator('[data-part="error-rings"]').getAttribute('visibility')==='visible');
  await page.screenshot({path:out+'/'+label+'-dynamic-error.png'});
  await player.locator('[data-pelican-mode="linked"]').click();
  check(label+'/normal-mode-restored',await player.getAttribute('data-mode')==='linked');
  await page.locator('[data-pelican-score-jump]').click();
  check(label+'/summary-jump-keeps-route',page.url().endsWith('#checkup/season/dynamic-pelican'));
  await layout('player-controls');

  const dynamicRubric=page.locator('.season-rubric');await dynamicRubric.locator('summary').click();
  check(label+'/dynamic-rubric-open',await dynamicRubric.getAttribute('open')!==null);
  const dynamicText=await dynamicRubric.innerText();
  for(const text of ['36 个观察帧','3 个完整周期','脚踏联动','腿部连续弯伸','曲柄中心与踏板相位','车轮转动','稳定骑姿'])check(label+'/dynamic-rubric/'+text,dynamicText.includes(text));
  await page.locator('.season-reference summary').click();check(label+'/dynamic-reference-labelled',(await page.locator('.season-reference').innerText()).includes('不是模型答卷'));
  await layout('dynamic-rubric');
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__qaCopied=text;}}}));
  await page.locator('[data-season-copy="dynamic-pelican"]').click();
  const copied=await page.evaluate(()=>window.__qaCopied),expectedPrompt=JSON.parse(await fs.readFile(path.join(root,'dist/data/playful-season.json'),'utf8')).tasks.find(t=>t.id==='dynamic-pelican').prompts[0];
  check(label+'/dynamic-copy-full-prompt',copied===expectedPrompt);
  await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
  await page.screenshot({path:out+'/'+label+'-dynamic.png',fullPage:true});

  await page.locator('a[href="#checkup/results"]').first().click();await ready('.studio-score-table');await layout('results');
  const text=await page.locator('main').innerText();for(const name of ['DeepSeek V4.1 Flash','Kimi K3','GLM-5.3 Flash','GPT-6 Luna'])check(label+'/results/'+name,text.includes(name));
  check(label+'/ten-ranked-models',await page.locator('.studio-score-table tbody tr').count()===10);
  check(label+'/no-pending-models',await page.locator('.pending-model-card').count()===0);
  for(const id of ['claude-sonnet55','claude-haiku55','gpt6-luna','gemini38-flash','mistral-large4']){
   await page.goto(base+'#checkup/model/'+id,{waitUntil:'networkidle'});await ready('.model-profile');await layout('model-'+id);
   check(label+'/'+id+'/eight-task-sections',await page.locator('.answer-section').count()===8);
   const expected={'claude-sonnet55':[80,0],'claude-haiku55':[68,0],'gemini38-flash':[85,20]}[id];
   if(expected){
    check(label+'/'+id+'/final-total',Number(await page.locator('.page-total strong').innerText())===expected[0]);
    const receipt=page.locator('.answer-section').nth(6);
    check(label+'/'+id+'/receipt-score',Number(await receipt.locator('.item-score strong').innerText())===expected[1]);
    check(label+'/'+id+'/receipt-reason',(await receipt.locator('.answer-review').innerText()).includes('主要结论'));
    const rubric=receipt.locator('details').filter({has:page.locator('summary',{hasText:'评分'})}).last();
    await rubric.locator('summary').click();check(label+'/'+id+'/receipt-rubric-opens',await rubric.getAttribute('open')!==null);
    await layout('receipt-rubric-'+id);
   }
   const disclosure=page.locator('.answer-section details').first();await disclosure.locator('summary').click();check(label+'/'+id+'/disclosure-opens',await disclosure.getAttribute('open')!==null);await disclosure.locator('summary').click();
  }
  await page.locator('.page-action.primary').click();await ready('.model-comparison');await layout('compare');
  const picker=page.locator('[data-model-picker="0"]');await picker.locator('summary').click();check(label+'/ten-options',await picker.locator('[data-model-id]').count()===10);
  await picker.locator('[data-model-id="mistral-large4"]').click();await page.locator('[data-model-picker="0"][data-selected="mistral-large4"]').waitFor();await layout('last-option');
  await page.screenshot({path:out+'/'+label+'-comparison.png',fullPage:false});
  await page.goto(base+'#checkup/receipt',{waitUntil:'networkidle'});await ready('.receipt-layout');
  const ref=page.locator('.receipt-reference');await ref.locator('summary').click();
  check(label+'/receipt-unified-rule',(await ref.innerText()).includes('主要结论'));
  check(label+'/receipt-ten-answers',await page.locator('.traffic-panel article.panel').count()===10);
  await layout('receipt-page');
  await page.goto(base+'#checkup/works',{waitUntil:'networkidle'});await ready('.work-collection');await layout('works');
  await page.goto(base+'#checkup/season',{waitUntil:'networkidle'});await ready('[data-season-copy]');await layout('season');
  const rub=page.locator('details').filter({has:page.locator('summary', {hasText:'评分'})}).first();
  if(await rub.count()){await rub.locator('summary').click();check(label+'/new-rubric-opens',await rub.getAttribute('open')!==null);await layout('rubric-open');}
  for(const id of ['qwen38-max','gpt61-sol']){
   await page.goto(base+'#checkup/model/'+id,{waitUntil:'networkidle'});await ready('main h1');
   check(label+'/'+id+'/removed-link-safe',(await page.locator('main').innerText()).includes('没有找到这份答卷'));
  }
  await context.close();
 }
 check('no-page-errors',report.errors.length===0,report.errors);check('no-failed-resources',report.failedRequests.length===0,report.failedRequests);check('no-write-or-external-requests',report.blockedRequests.length===0,report.blockedRequests);
}catch(e){report.fatal=String(e);process.exitCode=1;}finally{await browser.close();if(server)await new Promise(r=>server.close(r));report.completedAt=new Date().toISOString();await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.filter(x=>x.pass).length,fatal:report.fatal,errors:report.errors.length,output:out}));}
