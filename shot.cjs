
const { chromium } = require('/home/user/node_modules/playwright-core');
const base = process.argv[2]; const out = process.argv[3]; const full = process.argv[4] === 'full';
(async () => {
  const exe = require('fs').readdirSync(process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243').map(d => process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/' + d + '/chrome-headless-shell').filter(p => require('fs').existsSync(p))[0];
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Redmi A5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  console.log('home loaded ms', Date.now() - t0, 'title', await page.title());
  await page.screenshot({ path: out + '/1-home.png' });
  await page.screenshot({ path: out + '/1-home-full.png', fullPage: true });
  // practice
  await page.goto(base + '/#/practice/english/0'); await page.waitForSelector('.opt');
  await page.click('.opt >> nth=1'); await page.waitForSelector('.explain');
  await page.screenshot({ path: out + '/4-practice.png', fullPage: true });
  if (full) {
    await page.goto(base + '/#/mock'); await page.waitForSelector('.check');
    await page.screenshot({ path: out + '/5-setup.png', fullPage: true });
    await page.click('button.btn.primary.big');
    await page.waitForSelector('.qtext');
    for (let i = 0; i < 7; i++) { await page.keyboard.press(['a','b','c','d'][i % 4]); await page.keyboard.press('n'); }
    await page.keyboard.press('b');
    await page.screenshot({ path: out + '/2-mock.png' });
    await page.screenshot({ path: out + '/2-mock-full.png', fullPage: true });
    // switch subject tab and answer some
    await page.click('.tabs button >> nth=1'); await page.keyboard.press('c');
    await page.keyboard.press('s'); await page.waitForSelector('.sheet');
    await page.screenshot({ path: out + '/2b-confirm.png' });
    await page.keyboard.press('y');
    await page.waitForSelector('.ring');
    await page.screenshot({ path: out + '/3-results.png' });
    await page.screenshot({ path: out + '/3-results-full.png', fullPage: true });
    await page.click('a.btn.primary.big'); await page.waitForSelector('.rq');
    await page.screenshot({ path: out + '/3b-review.png' });
    await page.goto(base + '/#/progress'); await page.waitForSelector('.stats');
    await page.screenshot({ path: out + '/6-progress.png', fullPage: true });
    await page.goto(base + '/#/about'); await page.screenshot({ path: out + '/7-about.png', fullPage: true });
    // offline check: SW controlling?
    const sw = await page.evaluate(async () => { if (!navigator.serviceWorker) return 'none'; const r = await navigator.serviceWorker.ready; return r.active ? r.active.state : 'noactive'; });
    console.log('sw', sw);
    if (sw === 'activated') {
      await page.reload({ waitUntil: 'networkidle' });
      await ctx.setOffline(true);
      await page.goto(base + '/#/practice/maths/all'); await page.waitForSelector('.opt', { timeout: 8000 }).then(() => console.log('OFFLINE practice ok')).catch(e => console.log('OFFLINE FAIL', e.message));
      await page.goto(base + '/'); await page.waitForSelector('.hero', { timeout: 8000 }).then(() => console.log('OFFLINE home ok')).catch(e => console.log('OFFLINE home FAIL'));
      await ctx.setOffline(false);
    }
  }
  if (full) {
    // back navigation
    await page.goto(base + '/#/'); await page.click('a[href="#/practice"]'); await page.click('a[href="#/practice/biology"]');
    await page.click('a[href="#/practice/biology/0"]'); await page.waitForSelector('.opt');
    await page.screenshot({ path: out + '/8-practice-top.png' });
    await page.goBack(); await page.waitForTimeout(300); console.log('after hw back:', await page.evaluate(() => location.hash));
    await page.click('button[aria-label=Back]'); await page.waitForTimeout(300); console.log('after arrow back:', await page.evaluate(() => location.hash));
    // quick test + challenge
    page.on('dialog', d => d.type() === 'prompt' ? d.accept('Michael') : d.accept());
    await page.goto(base + '/#/mock/quick'); await page.waitForSelector('.check');
    await page.click('button.btn.primary.big'); await page.waitForSelector('.qtext');
    for (let i = 0; i < 20; i++) { await page.keyboard.press(['a','b','c','d'][i % 4]); await page.keyboard.press('n'); }
    await page.keyboard.press('s'); await page.waitForTimeout(300); await page.screenshot({ path: out + '/dbg1.png' }); await page.keyboard.press('y'); await page.waitForTimeout(500); await page.screenshot({ path: out + '/dbg2.png' }); console.log('hash', await page.evaluate(() => location.hash)); await page.waitForSelector('.ring');
    await page.evaluate(() => { window.open = (u) => { window.__opened = u; return null; }; });
    await page.click('button.btn.challenge'); await page.waitForTimeout(300);
    const wa = await page.evaluate(() => window.__opened);
    await page.screenshot({ path: out + '/3c-quick-result.png', fullPage: true });
    const link = decodeURIComponent(wa.split('text=')[1] || '').match(/https?:\/\/\S+/)[0];
    console.log('challenge link length', link.length);
    const p2 = await ctx.newPage();
    await p2.goto(link.replace(/^https?:\/\/[^/]+/, base)); await p2.waitForSelector('.hero');
    await p2.screenshot({ path: out + '/9-challenge-landing.png' });
    await p2.click('button.btn.primary.big'); await p2.waitForSelector('.qtext');
    for (let i = 0; i < 20; i++) { await p2.keyboard.press(['b','c','d','a'][i % 4]); await p2.keyboard.press('n'); }
    await p2.keyboard.press('s'); await p2.keyboard.press('y'); await p2.waitForTimeout(500); await p2.screenshot({ path: out + '/dbg3.png' }); await p2.waitForSelector('.vs');
    await p2.screenshot({ path: out + '/9b-challenge-result.png', fullPage: true });
  }
  console.log('errors', JSON.stringify(errs));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
