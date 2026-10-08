const { chromium } = require('/home/user/node_modules/playwright-core');
const fs = require('fs');
const base = process.argv[2]; const out = process.argv[3]; const pre = process.argv[4] || 'admission';
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Redmi A5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('dialog', d => d.accept());
  ctx.on('page', p => p.close().catch(() => {}));
  const shot = async (n, full = false) => { await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${pre}-${n}.png`, fullPage: full }); console.log('shot', n); };
  const ow = async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  console.log('home ms', Date.now() - t0, await page.title());
  await shot('1-home');
  await page.click('a.newcard');
  await page.waitForSelector('input[type=number]');
  await page.fill('input[type=number] >> nth=0', '268');
  const sels = page.locator('.subs select');
  await sels.nth(0).selectOption('Physics'); await sels.nth(1).selectOption('Chemistry'); await sels.nth(2).selectOption('Biology');
  await page.locator('label.field select').nth(0).selectOption('medicine');
  await page.click('details.more summary');
  const grades = page.locator('select.grade');
  for (const [k, g] of [[0, 'B3'], [1, 'A1'], [2, 'A1'], [3, 'B2'], [4, 'A1']]) await grades.nth(k).selectOption(g);
  await page.locator('details.more label.field select').selectOption('Lagos');
  await shot('2-form', true);
  console.log('overflow form', await ow());
  await page.click('button[type=submit]');
  await page.waitForSelector('.sum');
  await shot('3-results');
  await shot('3-results-full', true);
  console.log('overflow results', await ow());
  // detail UNILAG medicine
  await page.goto(base + '/#/admission/d/unilag/medicine'); await page.waitForSelector('.verdictcard');
  await shot('4-detail-unilag-medicine', true);
  console.log('detail text', (await page.textContent('.verdictcard')).replace(/\s+/g, ' '));
  // share card -> download fallback in headless
  try {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('text=Share my result')]);
    await dl.saveAs(`${out}/${pre}-5-share-card.png`); console.log('share card saved');
  } catch (e) { console.log('share card: ' + e.message.split('\n')[0]); }
  // all-schools course list: no course
  await page.goto(base + '/#/admission/s/ui'); await page.waitForSelector('.res');
  await shot('6-school-ui', true);
  await page.goto(base + '/#/postutme'); await page.waitForSelector('.row');
  await shot('7-postutme', true);
  await page.goto(base + '/#/postutme/unilag'); await page.waitForSelector('.premium, .btn.big');
  await page.waitForTimeout(800);
  await shot('8-pack-unilag', true);
  await page.click('text=Free timed practice'); await page.waitForSelector('.timer');
  await page.click('.opt >> nth=1');
  await shot('9-timed-test');
  for (let i = 0; i < 4; i++) { await page.click('text=Next ›'); await page.click('.opt >> nth=0'); }
  await page.click('text=Submit'); await page.waitForSelector('.score');
  await shot('10-test-result', true);
  // existing features still work
  await page.goto(base + '/#/practice/english/0'); await page.waitForSelector('.opt'); await page.click('.opt >> nth=1'); await page.waitForSelector('.explain');
  console.log('practice ok');
  await page.goto(base + '/#/mock/quick'); await page.waitForSelector('.btn.primary.big');
  console.log('mock setup ok');
  await page.goto(base + '/cut-off/unilag/', { waitUntil: 'load' }); await shot('11-seo-unilag');
  await shot('11-seo-unilag-full', true);
  console.log('overflow seo', await ow(), await page.title());
  await page.goto(base + '/admission-checker/', { waitUntil: 'load' }); await shot('12-landing');
  console.log('ERRORS', JSON.stringify(errs.filter(e => !/api\/config/.test(e))));
  await browser.close();
})().catch(e => { console.error('WALK FAILED', e); process.exit(1); });
