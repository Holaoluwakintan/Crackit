const { chromium } = require('/home/user/node_modules/playwright-core');
const fs = require('fs');
const sess = JSON.parse(fs.readFileSync('/tmp/cx_sess.json', 'utf8'));
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const out = {};
  // phone 2: fresh install, signs in -> gets the account's progress
  let ctx = await browser.newContext({ viewport: { width: 360, height: 800 } }); let page = await ctx.newPage();
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(s => localStorage.setItem('crackit:auth:v1', JSON.stringify(s)), sess);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  let p = await page.evaluate(() => JSON.parse(localStorage.getItem('crackit:progress:v1')));
  out.phone2 = { practiced: p.practiced, history: p.history.length, saved: Object.values(p.bm).filter(x => x > 0).length };
  // phone 2 un-saves the bookmark -> pushed (debounced 5s, or on hide)
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('crackit:progress:v1')); });
  await ctx.close();
  // phone 3: guest practised 2 questions offline-style, then signs in -> one-time SUM merge
  ctx = await browser.newContext({ viewport: { width: 360, height: 800 } }); page = await ctx.newPage();
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('crackit:progress:v1', JSON.stringify({ history: [], topics: { 'geography:0': { c: 2, n: 2 } }, days: ['2026-10-01'], seen: {}, pidgin: true, practiced: 2, practiceCorrect: 2, bm: {}, wrong: {}, daily: {}, goal: 40 })));
  await page.evaluate(s => localStorage.setItem('crackit:auth:v1', JSON.stringify(s)), sess);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  p = await page.evaluate(() => JSON.parse(localStorage.getItem('crackit:progress:v1')));
  out.phone3 = { practiced: p.practiced, geo: p.topics['geography:0'], hasOct1: p.days.includes('2026-10-01'), pidgin: p.pidgin, goal: p.goal };
  // sign out from phone 3 -> phone becomes a clean guest
  await page.goto('http://localhost:4173/?r=2#/account', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  page.on('dialog', d => d.accept());
  await page.click('button:has-text("Sign out")'); await page.waitForTimeout(1500);
  p = await page.evaluate(() => ({ auth: localStorage.getItem('crackit:auth:v1'), prog: JSON.parse(localStorage.getItem('crackit:progress:v1')) }));
  out.afterSignOut = { signedIn: !!p.auth, practiced: p.prog.practiced };
  console.log(JSON.stringify(out));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
