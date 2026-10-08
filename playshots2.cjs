const { chromium } = require('/home/user/node_modules/playwright-core');
const fs = require('fs');
const OUT = process.argv[2], BASE = 'http://localhost:4173';
const sess = JSON.parse(fs.readFileSync('/tmp/cx_sess.json', 'utf8'));
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  const go = async (h) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(600); };
  const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/play-${n}.png` }); };
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  // seed some realistic progress so the screens aren't empty
  await page.evaluate(() => {
    const d = new Date(); const days = []; for (let i = 6; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); days.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')); }
    const topics = { 'maths:3': { c: 14, n: 30 }, 'physics:5': { c: 9, n: 20 }, 'english:2': { c: 40, n: 52 }, 'chemistry:1': { c: 30, n: 60 }, 'biology:4': { c: 70, n: 90 } };
    const daily = {}; daily[days[6]] = 14;
    localStorage.setItem('crackit:progress:v1', JSON.stringify({ history: [], topics, days, seen: {}, pidgin: false, practiced: 252, practiceCorrect: 163, bm: {}, wrong: {}, daily, goal: 20 }));
  });
  await page.reload({ waitUntil: 'networkidle' }); await page.evaluate(() => sessionStorage.setItem('crackit:hideSignin', '1')); await page.reload({ waitUntil: 'networkidle' });
  await shot('1-home'); /*
  await go('#/practice/physics/all'); await page.waitForSelector('.opts .opt');
  const a = await page.$$('.opts .opt'); await a[0].click(); await page.waitForSelector('.verdict');
  await page.evaluate(() => document.querySelector('.verdict').scrollIntoView({ block: 'center' })); await shot('2-practice-explained');
  await go('#/mock'); await page.click('button:has-text("Start exam")'); await page.waitForSelector('.exam .qcard');
  */ await go('#/mock'); await page.click('button:has-text("Start exam")'); await page.waitForSelector('.exam .qcard');
  await page.evaluate(async () => {
    const e = JSON.parse(localStorage.getItem('crackit:exam:v1'));
    let k = 0;
    for (const s of e.subjects) {
      const d = await (await fetch('/data/' + s.sid + '.json')).json(); const by = new Map(d.questions.map(q => [q.id, q]));
      const rate = { english: 0.82, maths: 0.7, physics: 0.75, chemistry: 0.68 }[s.sid] || 0.7;
      s.qids.forEach((id, i) => { const q = by.get(id); e.answers[s.sid + ':' + id] = (i / s.qids.length) < rate ? q.a : (q.a + 1) % 4; k++; });
    }
    e.startedAt = Date.now() - 83 * 60000;
    localStorage.setItem('crackit:exam:v1', JSON.stringify(e));
  });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.exam .qcard');
  await page.click('button.submit'); await page.click('.sheet button.primary'); await page.waitForSelector('.score .ring'); await shot('4-score');
  /* await go('#/admission'); await page.waitForTimeout(1500); await shot('5-admission');
  await go('#/wrong'); await shot('6-wrong-answers');
  await page.evaluate(s => localStorage.setItem('crackit:auth:v1', JSON.stringify(s)), sess);
  await page.goto(BASE + '/?r=1#/account', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await shot('7-account'); */
  await browser.close(); console.log('ok');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
