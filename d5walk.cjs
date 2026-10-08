
const { chromium } = require('/home/user/node_modules/playwright-core');
const fs = require('fs');
const base = process.argv[2]; const out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Redmi A5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }); });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  const mode = process.argv[4] || 'jamb';
  await page.goto(base + '/?ref=4f1c2a9e77b0#/', { waitUntil: 'networkidle' });
  await page.evaluate(m => localStorage.setItem('crackit:mode', m), mode);
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  console.log('url after ref strip', page.url(), 'ref stored', await page.evaluate(() => localStorage.getItem('crackit:ref')));
  await page.waitForSelector('.d5card'); await page.screenshot({ path: out + '/home-' + mode + '.png' });
  await page.click('.d5card'); await page.waitForSelector('text=Start my Daily 5');
  await page.screenshot({ path: out + '/daily-intro-' + mode + '.png' });
  await page.click('text=Start my Daily 5');
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.opts .opt:not([disabled])');
    if (i === 1) await page.screenshot({ path: out + '/daily-q-' + mode + '.png' });
    const opts = await page.$$('.opts .opt'); await opts[i % 2 ? 0 : 1].click();
    await page.waitForSelector('.verdict');
    if (i === 1) await page.screenshot({ path: out + '/daily-answered-' + mode + '.png', fullPage: true });
    await page.click(i < 4 ? 'text=Next question' : 'text=See my result');
  }
  await page.waitForSelector('.d5score'); await page.waitForSelector('.cardshare img', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/daily-result-' + mode + '.png' });
  await page.screenshot({ path: out + '/daily-result-full-' + mode + '.png', fullPage: true });
  // the card itself at full size
  const src = await page.$eval('.cardshare img', i => i.src);
  const b64 = await page.evaluate(async s => { const b = await (await fetch(s)).blob(); return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }, src);
  fs.writeFileSync(out + '/scorecard-' + mode + '.png', Buffer.from(b64.split(',')[1], 'base64'));
  // challenge link round trip
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('crackit:progress:v1')).d5);
  console.log('d5 saved', JSON.stringify(st).slice(0, 200));
  await page.goto(base + '/#/', { waitUntil: 'networkidle' }); await page.waitForSelector('.d5card.done');
  console.log('home card after', await page.$eval('.d5card', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('errors', JSON.stringify(errs));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
