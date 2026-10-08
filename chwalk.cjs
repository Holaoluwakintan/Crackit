
const { chromium } = require('/home/user/node_modules/playwright-core'); const fs = require('fs');
const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 15; Redmi A5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' };
  const errs = []; const beacons = [];
  // A: NO privacy signal -> events should be sent (we delete them afterwards)
  const A = await b.newContext(opts); const pa = await A.newPage();
  pa.on('pageerror', e => errs.push('A ' + e.message)); pa.on('console', m => { if (m.type() === 'error') errs.push('A ' + m.text()); });
  pa.on('request', r => { if (r.url().includes('/api/ev')) beacons.push(r.postData()); });
  await pa.goto(base + '/#/daily/waec', { waitUntil: 'networkidle' });
  await pa.waitForSelector('text=Start my Daily 5'); console.log('mode after /daily/waec:', await pa.evaluate(() => localStorage.getItem('crackit:mode')), pa.url());
  await pa.click('text=Start my Daily 5');
  for (let i = 0; i < 5; i++) { await pa.waitForSelector('.opts .opt:not([disabled])'); const o = await pa.$$('.opts .opt'); await o[0].click(); await pa.waitForSelector('.verdict'); await pa.click(i < 4 ? 'text=Next question' : 'text=See my result'); }
  await pa.waitForSelector('.d5score');
  const rec = await pa.evaluate(() => JSON.parse(localStorage.getItem('crackit:progress:v1')).d5);
  const day = Object.keys(rec)[0]; const r = rec[day];
  // build the same challenge link the app shares
  const code = await pa.evaluate(r => { const o = { v: 2, x: r.x, d: '', n: 'Ada', c: r.c, q: r.q }; return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, r);
  console.log('A scored', r.c, '/', r.n, 'beacons so far', beacons.length);
  // B: friend opens the challenge (GPC on, so no counts)
  const B = await b.newContext(opts); await B.addInitScript(() => { Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }); });
  const pb = await B.newPage(); pb.on('pageerror', e => errs.push('B ' + e.message));
  await pb.goto(base + '/?ref=4f1c2a9e77b0#/daily/c/' + code, { waitUntil: 'networkidle' });
  await pb.waitForSelector('text=Accept the challenge'); await pb.screenshot({ path: out + '/challenge-landing.png' });
  await pb.click('text=Accept the challenge');
  for (let i = 0; i < 5; i++) { await pb.waitForSelector('.opts .opt:not([disabled])'); const o = await pb.$$('.opts .opt'); await o[1].click(); await pb.waitForSelector('.verdict'); await pb.click(i < 4 ? 'text=Next question' : 'text=See my result'); }
  await pb.waitForSelector('.vs'); await pb.waitForTimeout(500);
  await pb.screenshot({ path: out + '/challenge-result.png' });
  console.log('B vs:', (await pb.$eval('.vs', e => e.innerText)).replace(/\n/g, ' | '));
  // B: JAMB quick test result card
  await pb.evaluate(() => localStorage.setItem('crackit:mode', 'jamb'));
  await pb.goto(base + '/#/mock/quick', { waitUntil: 'networkidle' });
  await pb.click('button.btn.primary.big');
  await pb.waitForSelector('.opts, .opt', { timeout: 15000 });
  console.log('B exam started; url', pb.url());
  await b.close();
  console.log('beacons', beacons.length, JSON.stringify(beacons.slice(0, 4)));
  console.log('errors', JSON.stringify(errs));
})().catch(e => { console.error('FAIL', e); process.exit(1); });
