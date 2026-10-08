const { chromium } = require('/home/user/node_modules/playwright-core');
const fs = require('fs');
const OUT = process.argv[2], BASE = 'https://crackit-ng.vercel.app';
const sess = JSON.parse(fs.readFileSync('/tmp/cx_sess.json', 'utf8'));
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Redmi A5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  const page = await ctx.newPage(); const errs = [], log = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('dialog', d => d.accept());
  const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/v3-live-${n}.png` }); log.push(n); };
  const go = async (h) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(800); };
  const t0 = Date.now(); await page.goto(BASE + '/', { waitUntil: 'networkidle' }); log.push('load ms ' + (Date.now() - t0));
  await shot('01-home');
  await go('#/account'); await page.waitForTimeout(1500); await shot('02-account-guest');
  log.push('google notice: ' + ((await page.$('.notice')) ? 'shown (waiting for redirect URI fix)' : 'button'));
  await go('#/mock'); await page.click('button:has-text("Start exam")'); await page.waitForSelector('.exam .qcard');
  await page.click('.calcbtn'); for (const k of ['(', '1', '2', '+', '8', ')', '×', '3', '=']) await page.click(`.calc-keys button:text-is("${k}")`);
  log.push('calc: ' + (await page.textContent('.calc output'))); await shot('03-mock-calculator');
  await page.click('.calc .iconbtn'); await page.click('button.submit'); await page.click('.sheet button.primary'); await page.waitForSelector('.score');
  await go('#/admission'); await page.waitForTimeout(1500); await shot('04-admission-still-works');
  await go('#/postutme'); await page.waitForTimeout(1200); await shot('05-postutme-still-works');
  // sign-in on the LIVE origin with a test account session -> sync
  await page.evaluate(s => localStorage.setItem('crackit:auth:v1', JSON.stringify(s)), sess);
  await page.goto(BASE + '/?r=live#/account', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
  log.push('live sync: ' + (await page.textContent('.sync'))); await shot('06-account-signed-in');
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
  log.push('service worker registered: ' + sw);
  const html = await page.content(); log.push('footer ok: ' + html.includes('Not affiliated with JAMB, WAEC or NECO'));
  console.log(JSON.stringify({ log, errs }, null, 1)); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
