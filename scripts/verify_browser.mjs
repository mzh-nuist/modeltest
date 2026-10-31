// Public UI acceptance in a fresh browser profile. No personal browser or model API access.
// PUPPETEER_MODULE points to an already installed puppeteer-core entry file.
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {default: puppeteer} = await import(pathToFileURL(process.env.PUPPETEER_MODULE));
let server;
let base = process.env.QA_URL || 'https://modeltest.cc/?ui=13&qa=1';
if(process.env.QA_DIST){
  const root=path.resolve(process.env.QA_DIST);
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
  server=createServer(async(req,res)=>{
    try{
      const filename=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')));
      if(!['GET','HEAD'].includes(req.method)||!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      const body=await readFile(filename);
      res.writeHead(200,{'content-type':types[path.extname(filename)]||'application/octet-stream','cache-control':'no-store'}).end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base=`http://127.0.0.1:${server.address().port}/?qa=1`;
}
const out = path.resolve(process.env.QA_OUT || 'results/columns-20261031/browser');
await mkdir(out, {recursive:true});
const report = {startedAt:new Date().toISOString(),base,mobileScope:'Chromium mobile viewport and touch emulation, not physical devices',checks:[],pages:[],errors:[],blockedRequests:[],failedRequests:[]};
const check = (name,pass,detail) => {report.checks.push({name,pass:Boolean(pass),detail}); if(!pass) console.log('FAIL '+name+' '+JSON.stringify(detail));};
const browser = await puppeteer.launch({executablePath:process.env.QA_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,pipe:true,userDataDir:path.join(out,'isolated-profile'),args:['--no-first-run','--no-default-browser-check'],timeout:30000});
report.browser=await browser.version();
try {
  for(const viewport of [{label:'desktop',width:1440,height:1000},{label:'mobile',width:390,height:844,isMobile:true,hasTouch:true},{label:'narrow',width:320,height:740,isMobile:true,hasTouch:true},{label:'wide',width:1920,height:1080}]) {
    const context=await browser.createBrowserContext();
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    await page.setViewport({...viewport,label:undefined,deviceScaleFactor:1});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.setRequestInterception(true);
    page.on('request',r=>{
      const u=new URL(r.url());
      if(['data:','blob:'].includes(u.protocol)||(u.origin===new URL(base).origin&&['GET','HEAD'].includes(r.method()))) r.continue();
      else {report.blockedRequests.push({url:r.url(),method:r.method()});r.abort();}
    });
    page.on('pageerror',e=>report.errors.push({viewport:viewport.label,error:String(e)}));
    page.on('requestfailed',r=>report.failedRequests.push({viewport:viewport.label,url:r.url().split('?')[0],error:r.failure()?.errorText}));
    async function ready(selector) {
      await page.waitForSelector(selector,{visible:true});
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    }
    async function route(hash,selector) {
      await page.evaluate(h=>{location.hash=h;},hash);
      await ready(selector);
      await page.evaluate(()=>window.scrollTo(0,0));
    }
    async function inspect(name,{full=false,images=false}={}) {
      if(images) for(const img of await page.$$('main img')) {
        await img.scrollIntoView();
        await page.waitForFunction(el=>el.complete,{},img);
      }
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const metrics=await page.evaluate(()=>{
        const visible=el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0&&getComputedStyle(el).visibility!=='hidden';
        const clippedByScroller=el=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(['auto','scroll','hidden','clip'].includes(s.overflowX)&&p.scrollWidth>p.clientWidth)return true;}return false;};
        const overflow=[...document.querySelectorAll('main *,.editorial-header *,.site-footer *')].filter(visible).filter(el=>{const b=el.getBoundingClientRect();return(b.right>innerWidth+1||b.left< -1)&&!clippedByScroller(el);}).slice(0,12).map(el=>({tag:el.tagName,class:el.className,text:el.textContent.slice(0,60),left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
        const text=['.editorial-header nav a','.column-heading h1','.column-heading p','.column-model','.column-note','.studio-pages h1','.answer-text','.edit-pair p'].map(s=>{const el=document.querySelector(s);if(!el)return null;const c=getComputedStyle(el);return{selector:s,size:c.fontSize,weight:c.fontWeight,font:c.fontFamily,color:c.color,lineHeight:c.lineHeight};}).filter(Boolean);
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
        const lum=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const c=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
        const labels=[...document.querySelectorAll('.result-label')].filter(visible).map(e=>{const s=getComputedStyle(e),fg=lum(s.color),bg=lum(s.backgroundColor);return{text:e.textContent,color:s.color,background:s.backgroundColor,contrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};});
        return {url:location.href,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow,text,labels,images:[...document.querySelectorAll('main img')].filter(visible).map(i=>({alt:i.alt,loaded:i.complete&&i.naturalWidth>0})),guesses:document.querySelectorAll('[data-guess],[data-suite-star],.model-choices,.reader-rating').length};
      });
      const shot=`${viewport.label}-${name}.png`;
      const png=await page.screenshot({path:path.join(out,shot),fullPage:full});
      const screenshotWidth=Buffer.from(png).readUInt32BE(16);
      report.pages.push({viewport:viewport.label,name,screenshot:shot,screenshotWidth,...metrics});
      check(`${viewport.label}/${name}/page-width`,metrics.scrollWidth<=viewport.width+1&&metrics.width<=viewport.width+1,metrics.overflow);
      check(`${viewport.label}/${name}/screenshot-width`,screenshotWidth===viewport.width,screenshotWidth);
      check(`${viewport.label}/${name}/no-unclipped-overflow`,metrics.overflow.length===0,metrics.overflow);
      check(`${viewport.label}/${name}/no-guess-or-vote-controls`,metrics.guesses===0,metrics.guesses);
      if(metrics.labels.length)check(`${viewport.label}/${name}/badge-contrast`,metrics.labels.every(l=>l.contrast>=4.5),metrics.labels);
      if(images)check(`${viewport.label}/${name}/images`,metrics.images.every(i=>i.loaded),metrics.images);
    }
    await page.goto(base+'#checkup',{waitUntil:'networkidle0',timeout:45000});
    await ready('.home-art-grid .work-image');
    await inspect('home',{full:true,images:true});
    await page.screenshot({path:path.join(out,`${viewport.label}-home-first.png`)});
    const homeLayout=await page.evaluate(()=>({quick:document.querySelector('.home-quick-links').getBoundingClientRect().bottom,feature:document.querySelector('.home-art-grid').getBoundingClientRect().bottom,models:document.querySelector('.home-models').getBoundingClientRect().top,height:document.documentElement.scrollHeight}));
    check(`${viewport.label}/home-shortcuts-in-first-screen`,homeLayout.quick<viewport.height,homeLayout);
    const shortcutLabels=await page.$$eval('.home-quick-links>a>span',els=>els.map(el=>({text:el.textContent.trim(),height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight)})));
    check(`${viewport.label}/home-shortcuts-single-line`,shortcutLabels.every(x=>x.height<=x.line*1.2),shortcutLabels);
    if(viewport.isMobile)check(`${viewport.label}/home-results-within-short-scroll`,homeLayout.models<1100,homeLayout);
    const featured=await page.$$eval('.home-art-grid .work-picture',a=>a.map(x=>x.getAttribute('href')));
    check(`${viewport.label}/same-task-two-vendors`,JSON.stringify(featured)===JSON.stringify(['#checkup/works/visual/deepseek-v41-flash','#checkup/works/visual/kimi-k3']),featured);
    check(`${viewport.label}/pending-models-separate`,(await page.$$('.pending-model-card')).length===3&&(await page.$$('.column-model-card')).length===5);
    check(`${viewport.label}/navigation`,await page.$$eval('.editorial-header nav a',a=>a.map(x=>x.textContent).join('|'))==='模型测评|整活作品|翻车修复');
    if(viewport.label==='wide'){await context.close();continue;}

    await page.click('.editorial-header a[href="#checkup/results"]');
    await ready('.studio-score-table');
    await inspect('results',{full:true});
    const scores=await page.$$eval('.column-model-card .model-card-score strong',a=>a.map(x=>x.textContent));
    check(`${viewport.label}/original-scores`,JSON.stringify(scores)===JSON.stringify(['90','80','77','72.5','63']),scores);
    const scoreLayout=await page.$$eval('.model-card-score',els=>els.map(e=>{const box=e.getBoundingClientRect(),small=e.querySelector('small'),s=small.getBoundingClientRect();return {text:e.textContent,fits:s.right<=box.right+1,oneLine:s.height<Number.parseFloat(getComputedStyle(small).lineHeight)*1.5};}));
    check(`${viewport.label}/score-labels-fit`,scoreLayout.every(x=>x.fits&&x.oneLine),scoreLayout);
    const tableLayout=await page.$$eval('.studio-score-table tbody tr',rows=>rows.map(row=>{const name=row.querySelector('.column-model').getBoundingClientRect(),cell=row.children[1].getBoundingClientRect(),total=row.children[2].getBoundingClientRect();return name.right<=cell.right+1&&name.right<total.left;}));
    check(`${viewport.label}/table-name-score-separation`,tableLayout.every(Boolean),tableLayout);
    if(viewport.isMobile) {
      const tableScroll=await page.$eval('.score-scroll',el=>{el.scrollLeft=200;return el.scrollLeft;});
      check(`${viewport.label}/score-table-scroll`,tableScroll>0,tableScroll);
      await page.$eval('.score-scroll',el=>{el.scrollLeft=0;el.scrollIntoView({block:'start'});});
      await page.screenshot({path:path.join(out,`${viewport.label}-table.png`)});
    }

    await page.click('.editorial-header a[href="#checkup/works"]');
    await ready('.work-collection');
    check(`${viewport.label}/all-ten-works`,(await page.$$('.work-card')).length===10);
    await inspect('works',{full:viewport.label==='desktop',images:true});
    await page.click('.column-tabs a[href="#checkup/works/zebra"]');
    await ready('.column-tabs a[aria-current="page"][href="#checkup/works/zebra"]');
    check(`${viewport.label}/five-zebras`,(await page.$$('.work-card')).length===5);
    await page.click('.work-picture');
    await ready('.work-detail');
    await page.click('.work-evidence summary');
    await ready('.work-evidence[open] .column-original');
    check(`${viewport.label}/original-svg-visible`,await page.$eval('.column-original',e=>e.textContent.includes('<svg')));
    await inspect('original',{images:true});

    await page.click('.editorial-header a[href="#checkup/repairs"]');
    await ready('.repair-status');
    check(`${viewport.label}/real-repairs-only`,(await page.$$('.issue-card')).length===2&&(await page.$$('.edit-result')).length===5&&await page.$eval('.repair-status',e=>e.textContent.includes('还没有代码修 bug')));
    await page.click('[data-repair-jump="repair-edits"]');
    await page.waitForFunction(()=>document.activeElement?.id==='repair-edits');
    check(`${viewport.label}/repair-jump-stays-on-page`,await page.evaluate(()=>location.hash==='#checkup/repairs'&&document.querySelector('#repair-edits').getBoundingClientRect().top<innerHeight));
    await inspect('repairs',{full:true,images:true});

    await page.click('.edit-result .column-model');
    await ready('.model-profile');
    await inspect('model-detail');
    check(`${viewport.label}/eight-answer-sections`,(await page.$$('.answer-section')).length===8);
    await page.click('[data-answer-jump="receipt"]');
    await page.waitForFunction(()=>document.activeElement?.id==='answer-receipt');
    check(`${viewport.label}/answer-jump`,await page.$eval('#answer-receipt',e=>{const b=e.getBoundingClientRect();return b.top>=0&&b.top<innerHeight;}));
    await page.screenshot({path:path.join(out,`${viewport.label}-receipt-answer.png`)});

    await page.click('.page-action.primary');
    await ready('.model-comparison');
    await page.evaluate(()=>window.scrollTo(0,0));
    await inspect('compare');
    const picker='[data-model-picker="0"]';
    await page.click(picker+' > summary');
    await ready(picker+'[open] .model-options');
    check(`${viewport.label}/eight-model-options`,(await page.$$(picker+' [data-model-id]')).length===8);
    const menuBox=await page.$eval(picker+' .model-options',e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:innerWidth,height:innerHeight};});
    check(`${viewport.label}/dropdown-in-viewport`,menuBox.left>=0&&menuBox.right<=menuBox.width+1&&menuBox.top>=0&&menuBox.bottom<=menuBox.height+1,menuBox);
    await page.screenshot({path:path.join(out,`${viewport.label}-compare-menu.png`)});
    await page.click(picker+' [data-model-id="glm53-flash"]');
    await page.waitForSelector('[data-model-picker="0"][data-selected="glm53-flash"]');
    check(`${viewport.label}/picker-changes-model`,await page.$eval('[data-model-picker="0"]',e=>e.dataset.selected==='glm53-flash'));
    await page.focus('[data-model-picker="0"] > summary');
    await page.keyboard.press('ArrowDown');
    await page.waitForSelector('[data-model-picker="0"][open]');
    await page.keyboard.press('Escape');
    check(`${viewport.label}/picker-keyboard-close`,await page.$eval('[data-model-picker="0"]',e=>!e.open));

    for(const id of ['qwen38-max','claude-sonnet55','gpt61-sol']){
      await route('checkup/model/'+id,'.model-pending-reason');
      await inspect('pending-'+id,{images:true});
      check(`${viewport.label}/${id}/unmeasured-not-zero`,await page.$eval('.page-total',e=>e.textContent.includes('待测')&&!e.textContent.includes('/ 100'))&&(await page.$$('.answer-section')).length===8);
    }
    await page.click('.page-action.primary');
    await ready('.model-comparison');
    await page.evaluate(()=>window.scrollTo(0,0));
    await inspect('pending-compare',{images:true});
    check(`${viewport.label}/pending-comparison`,(await page.$$('.pending-total')).length===1);
    await page.click(picker+' > summary');
    await ready(picker+'[open] .model-options');
    const lastChoice=await page.$(picker+' [data-model-id="gpt61-sol"]');
    await lastChoice.scrollIntoView();await lastChoice.click();
    await page.waitForSelector('[data-model-picker="0"][data-selected="gpt61-sol"]');
    check(`${viewport.label}/last-model-selectable`,true);

    await route('checkup/play','.work-collection');
    check(`${viewport.label}/old-play-is-gallery`,(await page.$$('.work-card')).length===10&&!(await page.$('.model-choices')));
    await page.click('.wordmark');
    await ready('.column-home');
    await page.click('#theme-published');
    await page.waitForSelector('body.dark');
    await inspect('home-dark');
    await page.click('#theme-published');
    // Direct mobile entry catches layout viewport expansion that SPA navigation can mask.
    if(viewport.isMobile){
      await page.goto(base+'#checkup/results',{waitUntil:'networkidle0',timeout:45000});
      await ready('.studio-score-table');
      await inspect('results-reload');
    }
    await context.close();
    console.log(`Finished ${viewport.label}`);
  }
  check('no-page-errors',report.errors.length===0,report.errors);
  check('no-write-or-external-requests',report.blockedRequests.length===0,report.blockedRequests);
} catch(e) {report.errors.push({fatal:String(e),stack:e.stack});console.error(e);process.exitCode=1;}
finally {
  await browser.close();
  if(server)await new Promise(r=>server.close(r));
  report.finishedAt=new Date().toISOString();
  report.passed=report.checks.length>0&&report.checks.every(c=>c.pass)&&report.errors.length===0;
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failed:report.checks.filter(c=>!c.pass),pages:report.pages.length,errors:report.errors},null,2));
  if(!report.passed)process.exitCode=1;
}
