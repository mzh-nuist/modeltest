import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [caseId, target] = process.argv.slice(2);
const bank = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'));
const task = bank.cases.find(item => item.id === caseId);
assert.ok(task && target, 'Usage: node grade.mjs CASE_ID TARGET');
const root = path.resolve(target);
const results = [];

async function check(run) {
  const [name, points] = task.groups[results.length];
  try {
    await run();
    results.push({name, points, score:points, passed:true});
  } catch (error) {
    results.push({name, points, score:0, passed:false, type:error.constructor.name});
  }
}

async function schedule() {
  const {findConflicts:find} = await import(pathToFileURL(path.join(root, 'schedule.mjs')));
  const slot = (id, start, end) => ({id, start, end});
  const shift = slot('shift', '2026-12-01T23:40+08:00', '2026-12-02T00:10+08:00');
  const start = slot('west', '2026-12-01T15:50Z', '2026-12-01T16:05Z');
  await check(() => {
    assert.deepEqual(find([shift], start), ['shift']);
    assert.deepEqual(find([start], shift), ['west']);
    assert.deepEqual(find([shift], slot('x', '2026-12-02T23:50+08:00', '2026-12-03T00:00+08:00')), []);
    const leapDay = slot('leap', '2028-02-29T23:55-03:30', '2028-03-01T00:05-03:30');
    assert.deepEqual(find([leapDay], slot('utc', '2028-03-01T03:31Z', '2028-03-01T03:45Z')), ['leap']);
  });
  await check(() => {
    assert.deepEqual(find([shift], slot('same', '2026-12-01T16:10Z', '2026-12-01T16:11Z')), []);
    assert.deepEqual(find([shift], slot('same', '2026-12-01T15:00Z', '2026-12-01T15:40Z')), []);
    assert.deepEqual(find([shift], slot('same', '2026-12-01T16:09Z', '2026-12-01T16:10Z')), ['shift']);
  });
  await check(() => {
    for (const time of ['2026-12-01T23:40', '2026-02-30T23:40Z', '2026-12-01T24:00Z',
      '2026-12-01T23:40+24:30', '2026-12-01T23:40-03:60', '2026-12-01T23:40:00Z', 'bad']) {
      assert.throws(() => find([], {...shift, start:time}), RangeError);
      assert.throws(() => find([{...shift, end:time}], start), RangeError);
    }
    assert.throws(() => find([], {...shift, end:shift.start}), RangeError);
    assert.throws(() => find([], {start:shift.end, end:shift.start}), RangeError);
    assert.throws(() => find([{...shift, end:shift.start}], start), RangeError);
  });
  await check(() => {
    const records = Object.freeze([Object.freeze(shift), Object.freeze(start)]);
    const request = Object.freeze({...start});
    assert.deepEqual(find(records, request), ['shift','west']);
    assert.deepEqual(find(Object.freeze([...records].reverse()), request), ['west','shift']);
  });
}

async function booking() {
  const {createDesk} = await import(pathToFileURL(path.join(root, 'booking.mjs')));
  const order = (id, seats, channel='web') => ({id,seats,channel});
  const fail = code => ({ok:false,code});
  await check(() => {
    const desk = createDesk();
    for (const invalid of [order('',1), order('x',0), order('x',3.1), order('x','2'),
      order(null,2), order('x',4), order('x',1,'desk')]) assert.deepEqual(desk.book(invalid),fail('invalid'));
    for (const [id,seats] of [['a',3],['b',3],['c',2]]) {
      assert.deepEqual(desk.book(order(id,seats)),{ok:true,booking:order(id,seats)});
    }
    assert.deepEqual(desk.book(order('d',1)),fail('capacity'));
    assert.deepEqual(desk.list(), [order('a',3), order('b',3), order('c',2)]);
    assert.deepEqual(createDesk().list(), []);
  });
  await check(() => {
    const desk = createDesk();
    const first = desk.book(order('a',3));
    desk.book(order('b',3));
    desk.book(order('c',2));
    assert.deepEqual(desk.book(order('a',3)),first);
    assert.deepEqual(desk.book(order('a',2)),fail('conflict'));
    assert.deepEqual(desk.book(order('a',5)),fail('invalid'));
    assert.deepEqual(desk.book(order('a',3,'phone')),fail('conflict'));
    const listed = desk.list();
    try { listed[0].seats=1; listed.pop(); } catch {}
    assert.deepEqual(desk.list(), [order('a',3), order('b',3), order('c',2)]);
  });
  await check(() => {
    const desk = createDesk();
    assert.deepEqual(desk.book(order('a',1,'phone')),fail('closed'));
    assert.deepEqual(desk.book(order('a',0,'phone')),fail('invalid'));
    assert.equal(desk.book(order('a',3)).ok,true);
    assert.deepEqual(desk.book(order('a',3,'phone')),fail('conflict'));
    assert.equal(desk.book(order('b',3)).ok,true);
    assert.equal(desk.book(order('c',2)).ok,true);
    assert.deepEqual(desk.book(order('d',1,'phone')),fail('closed'));
  });
  await check(() => {
    const desk = createDesk();
    assert.deepEqual(desk.cancel('never'),fail('not_found'));
    desk.book(order('a',3));
    desk.book(order('b',3));
    desk.book(order('c',2));
    assert.deepEqual(desk.cancel('b'),{ok:true});
    assert.deepEqual(desk.cancel('b'),{ok:true});
    assert.deepEqual(desk.book(order('b',3)),fail('conflict'));
    assert.deepEqual(desk.book(order('b',1,'phone')),fail('conflict'));
    assert.equal(desk.book(order('d',3)).ok,true);
    assert.deepEqual(desk.book(order('e',1)),fail('capacity'));
    assert.deepEqual(desk.list(), [order('a',3), order('c',2), order('d',3)]);
  });
}

async function reservation(browser) {
  const local = pathToFileURL(path.join(root, 'index.html')).href;
  const docs = new Set(task.editable.map(name => pathToFileURL(path.join(root, name)).href));
  const dates = ['周六 09:00','周六 10:30','周日 08:00','周日 16:00'];
  const available = [dates[0],dates[2]];
  async function onPage(test, width=960) {
    const ctx = await browser.newContext({viewport:{width,height:720}});
    const remoteRequests = [];
    try {
      await ctx.route('**/*', route => {
        const url = route.request().url();
        if (docs.has(url)) return route.continue();
        if (/^https?:/.test(url)) remoteRequests.push(url);
        return route.abort();
      });
      const page = await ctx.newPage();
      page.setDefaultTimeout(2500);
      await page.goto(local);
      await test(page, remoteRequests);
    } finally {
      await ctx.close();
    }
  }
  const filter = page => page.getByRole('checkbox',{name:'仅看有空位',exact:true});
  const visibleDates = page => page.locator('#slots li:visible').evaluateAll(rows => rows.map(li => li.dataset.date));
  await check(() => onPage(async page => {
    assert.equal(await filter(page).isChecked(),false);
    assert.deepEqual(await visibleDates(page),dates);
    await filter(page).check();
    assert.deepEqual(await visibleDates(page),available);
    await filter(page).uncheck();
    assert.deepEqual(await visibleDates(page),dates);
  }));
  await check(() => onPage(async page => {
    const count = page.locator('#reservation').locator('[aria-live], [role="status"]').filter({hasText:/[24]/}).first();
    assert.match(await count.textContent({timeout:2000}), /4/);
    await filter(page).focus();
    await page.keyboard.press('Space');
    assert.equal(await filter(page).isChecked(),true);
    assert.deepEqual(await visibleDates(page),available);
    assert.match(await count.textContent({timeout:2000}), /2/);
  }));
  await check(() => onPage(async (page, remoteRequests) => {
    assert.equal(await page.title(),'周末球场预约');
    assert.equal(await page.locator('h1').textContent(),'周末球场预约');
    assert.equal(await page.locator('#intro').textContent(),'每人每周最多预约一场。');
    assert.equal(await page.locator('#reservation h2').textContent(),'可预约场次');
    assert.equal(await page.locator('#rules h2').textContent(),'到场须知');
    assert.equal(await page.locator('#rules p').textContent(),'请提前十分钟到场。');
    assert.equal(await page.getByRole('link',{name:'查看场馆规则'}).getAttribute('href'),'/rules.html');
    assert.equal(await page.getByRole('button',{name:'预约'}).count(),2);
    await page.getByRole('button',{name:'预约'}).last().click();
    assert.equal(await page.locator('#confirmation').textContent(),'已选 周日 08:00');
    assert.equal(remoteRequests.length,0);
  }));
  await check(() => onPage(async page => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await filter(page).check();
    assert.equal(await filter(page).isVisible(),true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(await visibleDates(page),available);
  }, 320));
}

const grader = {'02':schedule,'03':reservation,'04':booking}[caseId];
let browser;
if (caseId === '03') {
  const moduleName = process.env.QA_PLAYWRIGHT_MODULE;
  const {chromium} = await import(moduleName ? pathToFileURL(moduleName) : 'playwright');
  browser = await chromium.launch({channel:'msedge',headless:true});
}
try {
  await grader(browser);
} catch (error) {
  while (results.length < task.groups.length) {
    const [name, points] = task.groups[results.length];
    results.push({name, points, score:0, passed:false, type:error.constructor.name});
  }
} finally {
  await browser?.close();
}
console.log(JSON.stringify({id:caseId, score:results.reduce((sum,row) => sum+row.score,0), groups:results}));
