import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [folder, output] = process.argv.slice(2);
assert.ok(folder && output, 'Usage: node inspect_tree.mjs SUBMISSION OUTPUT');
const override = process.env.QA_PLAYWRIGHT_MODULE;
const {chromium} = await import(override ? pathToFileURL(override) : 'playwright');
const browser = await chromium.launch({channel:'msedge',headless:true});
await mkdir(output,{recursive:true});

const origin = 'http://christmas-test.local';
const assets = {'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/tree.js':['tree.js','text/javascript'],
  '/cue-sheet.json':['cue-sheet.json','application/json'],'/music.wav':['music.wav','audio/wav']};
const groups = [];
const errors = [];

async function test(title,points,run) {
  try {
    await run();
    groups.push({title,points,score:points});
  } catch (error) {
    groups.push({title,points,score:0,detail:error.message.split('\n')[0]});
  }
}

async function frame(page, seconds) {
  await page.locator('#seek').evaluate((input,time) => {
    input.value = String(time);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  },seconds);
  await page.waitForFunction(time => Math.abs(document.querySelector('#music').currentTime - time) < .06,seconds);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function open(width,height) {
  const context = await browser.newContext({viewport:{width,height}});
  await context.route('**/*',async route => {
    const url = new URL(route.request().url());
    const asset = url.origin === origin && assets[url.pathname];
    if (!asset) return route.abort();
    const [file, contentType] = asset;
    const body = await readFile(path.resolve(folder,file)).catch(() => null);
    if (!body) return route.fulfill({status:404});
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    if (file === 'music.wav' && range) {
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]),body.length-1) : body.length-1;
      if (start > end) return route.fulfill({status:416,headers:{'content-range':`bytes */${body.length}`}});
      const portion = body.subarray(start,end+1);
      return route.fulfill({status:206,contentType,body:portion,headers:{'accept-ranges':'bytes',
        'content-range':`bytes ${start}-${end}/${body.length}`,'content-length':String(portion.length)}});
    }
    return route.fulfill({contentType,body,headers:{'content-length':String(body.length)}});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(3600);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  return page;
}

try {
  const desktop = await open(1440,900);
  const music = desktop.locator('#music');
  const play = desktop.locator('#play');
  const stage = desktop.locator('#stage');
  await test('键盘播放、暂停与真实音频',5,async () => {
    await music.evaluate(audio => { audio.muted = true; });
    await play.press('Enter');
    await desktop.waitForFunction(() => document.querySelector('#music').currentTime > .28);
    assert.equal(await music.evaluate(audio => new URL(audio.currentSrc).pathname), '/music.wav');
    await play.press('Space');
    await desktop.waitForFunction(() => document.querySelector('#music').paused);
    const stopped = await music.evaluate(audio => audio.currentTime);
    await frame(desktop,stopped);
    assert.equal(await music.evaluate(audio => audio.paused),true);
  });
  await test('拖动与播放结束后重播',5,async () => {
    await frame(desktop,11.24);
    await frame(desktop,18.75);
    await play.press('Enter');
    await desktop.waitForFunction(() => document.querySelector('#music').ended);
    await play.press('Enter');
    await desktop.waitForFunction(() => {
      const audio = document.querySelector('#music');
      return !audio.paused && audio.currentTime < 1;
    });
    await play.press('Enter');
  });
  const mobile = await open(390,844);
  await test('手机构图、控件可见和无横向溢出',5,async () => {
    assert.equal(await mobile.locator('#stage').isVisible(),true);
    assert.equal(await mobile.locator('#play').isVisible(),true);
    assert.equal(await mobile.locator('#seek').isVisible(),true);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
  await mobile.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  await mobile.context().close();

  const times=[0,2.94,3.10,3.89,4.12,5.60,5.76,8.28,8.48,9.20,10.24,10.41,11.12,17.23,17.67,18.8];
  const captures = [];
  if (await stage.isVisible() && await desktop.locator('#seek').count()) {
    await music.evaluate(audio => { audio.pause(); });
    for (const [index,time] of times.entries()) {
      try {
        await frame(desktop,time);
        const file=`frame-${String(index).padStart(2,'0')}.png`;
        await stage.screenshot({path:path.join(output,file),timeout:3200});
        captures.push({time,file});
      } catch { break; }
    }
  }
  await desktop.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  const result={utilityScore:groups.reduce((sum,g) => sum+g.score,0),groups,captures,errors};
  await writeFile(path.join(output,'inspection.json'), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
