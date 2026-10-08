
const { chromium } = require('/home/user/node_modules/playwright-core'); const fs = require('fs');
const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }); });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(base + '/#/', { waitUntil: 'networkidle' });
  await pg.evaluate(async () => {
    const ids = ['english', 'maths', 'physics', 'chemistry'];
    const banks = {}; for (const s of ids) banks[s] = await (await fetch('/data/' + s + '.json')).json();
    const order = ['english', 'maths', 'physics', 'chemistry', 'english'];
    const q = order.map((s, i) => [s, banks[s].questions[40 + i * 7].id]);
    const a = order.map((s, i) => { const qq = banks[s].questions[40 + i * 7]; return i === 2 ? (qq.a + 1) % 4 : qq.a; });
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const d5 = {}; const days = [];
    for (let k = 5; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); d5[ymd(d)] = { x: 'jamb', c: k ? 3 : 4, n: 5, s: ids, q, a }; days.push(ymd(d)); }
    const p = { history: [], topics: {}, days, seen: {}, pidgin: false, practiced: 0, practiceCorrect: 0, bm: {}, wrong: {}, daily: {}, goal: 20, name: 'Tolu', d5 };
    localStorage.setItem('crackit:progress:v1', JSON.stringify(p)); localStorage.setItem('crackit:cardname', '1'); localStorage.setItem('crackit:mode', 'jamb');
  });
  await pg.goto(base + '/#/', { waitUntil: 'networkidle' }); await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('.d5card'); await pg.screenshot({ path: out + '/home.png' });
  await pg.click('.d5card'); await pg.waitForSelector('.cardshare img'); await pg.waitForTimeout(600);
  await pg.screenshot({ path: out + '/result.png' });
  const src = await pg.$eval('.cardshare img', i => i.src);
  const b64 = await pg.evaluate(async s => { const bl = await (await fetch(s)).blob(); return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(bl); }); }, src);
  fs.writeFileSync(out + '/card.png', Buffer.from(b64.split(',')[1], 'base64'));
  const lp = await ctx.newPage(); await lp.goto(base + '/jamb/english/', { waitUntil: 'networkidle' }); await lp.screenshot({ path: out + '/landing.png' });
  await lp.evaluate(() => { const d = document.querySelector('.q details'); d.open = true; d.scrollIntoView({ block: 'center' }); }); await lp.screenshot({ path: out + '/landing-q.png' });
  console.log('errors', JSON.stringify(errs)); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
