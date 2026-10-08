const { chromium } = require('/home/user/work/crackit-tools/node_modules/playwright-core');
const fs = require('fs');
const OUT = process.argv[2], BASE = process.argv[3] || 'http://localhost:4321';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const mk = async (scheme = 'light') => browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Redmi A5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  const ctx = await mk();
  const page = await ctx.newPage();
  const errs = [], log = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('dialog', d => d.accept());
  const shot = async (p, n, full = false) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/v4-${n}.png`, fullPage: full }); log.push('shot ' + n); };
  const ow = async (p, n) => { if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) errs.push('OVERFLOW on ' + n); };
  const go = async (p, h) => { await p.evaluate(h => { location.hash = h; }, h); await p.waitForTimeout(600); };
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  log.push('home load ms ' + (Date.now() - t0));
  await shot(page, '01-home-jamb-switcher'); await ow(page, 'home-jamb');
  await page.click('.xswitch button:has-text("WAEC")'); await page.waitForSelector('.hero.ssce');
  await shot(page, '02-waec-home-new'); await ow(page, 'waec-home');
  await page.click('a.card.cta'); await page.waitForSelector('.schips');
  for (const s of ['Biology', 'Chemistry', 'Physics', 'Economics']) await page.click(`.schip:has-text("${s}")`);
  await shot(page, '03-pick-subjects'); await ow(page, 'subjects');
  await page.click('button:has-text("Save and build my plan")'); await page.waitForSelector('.tracker');
  await shot(page, '04-waec-home-tracker'); await shot(page, '05-waec-home-full', true); await ow(page, 'home-tracker');
  await go(page, '#/ssce/papers'); await shot(page, '06-papers'); await ow(page, 'papers');
  await go(page, '#/ssce/paper/maths'); await page.waitForSelector('.facts'); await shot(page, '07-paper-setup-maths'); await ow(page, 'setup');
  await page.click('button:has-text("Start exam")'); await page.waitForSelector('.cbt .opts .opt');
  log.push('exam qs: ' + await page.evaluate(() => JSON.parse(localStorage.getItem('crackit:ssce-exam:v1')).qids.length));
  // answer 30 (mostly right using the bank), flag 3
  const bank = await page.evaluate(async () => (await fetch('/data/ssce/maths.json')).json());
  const key = Object.fromEntries(bank.questions.map(q => [q.id, q.a]));
  for (let i = 0; i < 30; i++) {
    const id = await page.evaluate(() => { const e = JSON.parse(localStorage.getItem('crackit:ssce-exam:v1')); return e.qids[e.cur]; });
    const right = i % 6 !== 5; const pick = right ? key[id] : (key[id] + 1) % 4;
    await page.click(`.cbt .opts .opt >> nth=${pick}`);
    if (i === 3 || i === 9 || i === 17) await page.click('.flagbtn');
    if (i === 17) await shot(page, '08-cbt-question-flagged');
    await page.click('.navbtns .btn.primary');
  }
  await ow(page, 'exam');
  await page.click('button:has-text("Grid")'); await page.waitForSelector('.sheet .grid'); await shot(page, '09-cbt-navigator'); await page.click('.sheet .iconbtn');
  await page.click('.calcbtn'); await page.click('.calc-keys button:has-text("7")'); await page.click('.calc-keys button:has-text("×")'); await page.click('.calc-keys button:has-text("8")'); await page.click('.calc-keys .eq');
  log.push('calc 7x8 = ' + await page.textContent('.calc-top output')); await shot(page, '10-cbt-calculator'); await page.click('.calc-top .iconbtn');
  await page.click('.cbt-btns .submit'); await page.waitForSelector('.sheet'); await shot(page, '11-cbt-submit-confirm');
  await page.click('.sheet .btn.primary'); await page.waitForSelector('.resultcard'); await page.waitForTimeout(1600);
  await shot(page, '12-result-grade'); await shot(page, '13-result-full', true); await ow(page, 'result');
  log.push('result: ' + (await page.textContent('.res-grade')).replace(/\s+/g, ' '));
  await page.click('a:has-text("Review answers")'); await page.waitForSelector('.rv'); await page.click('.seg a:has-text("Wrong")'); await page.waitForTimeout(400);
  await shot(page, '14-review-wrong'); await ow(page, 'review');
  // practice with feedback
  await go(page, '#/ssce/practice/biology'); await page.waitForSelector('.subjhead'); await shot(page, '15-practice-topics'); await ow(page, 'topics');
  await page.click('a.btn.primary:has-text("Mixed practice")'); await page.waitForSelector('.opts .opt');
  const bb = await page.evaluate(async () => (await fetch('/data/ssce/biology.json')).json());
  const qtext = await page.textContent('.qtext'); const bq = bb.questions.find(q => qtext.includes(q.q.slice(0, 40).split('\n').pop().slice(0, 30)));
  await page.click(`.opts .opt >> nth=${bq ? (bq.a + 1) % 4 : 0}`); await page.waitForSelector('.fb');
  await page.click('.explain .seg button:has-text("Pidgin")').catch(() => {});
  await shot(page, '16-practice-wrong-feedback-pidgin');
  await page.click('button:has-text("Next question")'); await page.waitForSelector('.opts .opt:not([disabled])');
  const qt2 = await page.textContent('.qtext'); const bq2 = bb.questions.find(q => qt2.includes(q.q.split('\n').pop().slice(0, 30)));
  await page.click(`.opts .opt >> nth=${bq2 ? bq2.a : 0}`); await page.waitForSelector('.fb');
  await shot(page, '17-practice-correct'); log.push('feedback: ' + await page.textContent('.fb'));
  await go(page, '#/ssce/credits'); await page.waitForSelector('.countdown'); await shot(page, '18-credits-tracker', true); await ow(page, 'credits');
  await go(page, '#/ssce/premium'); await shot(page, '19-premium'); await ow(page, 'premium');
  // auto-submit at time-up: start a quick paper, then push its start time into the past
  await go(page, '#/ssce/paper/english/quick'); await page.click('button:has-text("Start exam")'); await page.waitForSelector('.cbt .opts .opt');
  await page.click('.cbt .opts .opt >> nth=0');
  await page.evaluate(() => { const e = JSON.parse(localStorage.getItem('crackit:ssce-exam:v1')); e.startedAt = Date.now() - e.duration + 2500; localStorage.setItem('crackit:ssce-exam:v1', JSON.stringify(e)); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.cbt .timer'); await shot(page, '20-cbt-last-seconds');
  await page.waitForSelector('.resultcard', { timeout: 9000 }); await page.waitForTimeout(1300);
  log.push('auto-submit: ' + (await page.isVisible('text=Time up!')) + ' ' + page.url());
  await shot(page, '21-auto-submitted-timeup');
  // NECO
  await go(page, '#/'); await page.click('.xswitch button:has-text("NECO")'); await page.waitForSelector('.hero.ssce.neco'); await shot(page, '22-neco-home');
  await go(page, '#/ssce/paper/biology'); await page.waitForSelector('.facts'); log.push('neco biology: ' + (await page.textContent('.facts')).replace(/\s+/g, ' '));
  // JAMB still works
  await go(page, '#/'); await page.click('.xswitch button:has-text("JAMB")'); await page.waitForSelector('.hero:not(.ssce)');
  await go(page, '#/mock/quick'); await page.click('button:has-text("Start exam")'); await page.waitForSelector('.exam .opts .opt'); await shot(page, '23-jamb-quick-still-works');
  await page.click('.exam .opts .opt >> nth=1'); await page.click('.btn.submit'); await page.click('.sheet .btn.primary'); await page.waitForSelector('.score, .verdict', { timeout: 8000 });
  log.push('jamb result ok: ' + page.url());
  await page.evaluate(() => localStorage.setItem('crackit:mode', 'waec'));
  // dark mode
  const d = await (await mk('dark')).newPage();
  d.on('pageerror', e => errs.push('PAGEERROR(dark) ' + e.message));
  await d.goto(BASE + '/', { waitUntil: 'networkidle' });
  await d.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))));
  await d.reload({ waitUntil: 'networkidle' }); await d.waitForSelector('.hero.ssce');
  log.push('dark theme attr: ' + await d.evaluate(() => document.documentElement.dataset.theme));
  await shot(d, '24-dark-waec-home'); await ow(d, 'dark-home');
  await d.evaluate(() => { location.hash = '#/ssce/paper/chemistry'; }); await d.waitForSelector('.facts'); await d.click('button:has-text("Start exam")'); await d.waitForSelector('.cbt .opts .opt');
  await d.click('.cbt .opts .opt >> nth=2'); await d.click('.flagbtn'); await shot(d, '25-dark-cbt');
  await d.evaluate(() => { location.hash = '#/ssce/credits'; }); await d.waitForTimeout(800); await shot(d, '26-dark-tracker');
  // skeleton: slow the SSCE index on a fresh page
  const s = await (await mk()).newPage();
  await s.route('**/data/ssce/index.json', async r => { await new Promise(x => setTimeout(x, 2500)); r.continue(); });
  await s.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await s.evaluate(() => { localStorage.setItem('crackit:mode', 'waec'); location.hash = '#/ssce/credits'; location.reload(); });
  await s.waitForTimeout(900); await s.screenshot({ path: `${OUT}/v4-27-skeleton-loading.png` }); log.push('skeleton visible: ' + await s.isVisible('.skel'));
  // reduced motion still renders
  const rm = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' }); const rp = await rm.newPage();
  await rp.goto(BASE + '/', { waitUntil: 'networkidle' }); await rp.evaluate(() => { localStorage.setItem('crackit:mode', 'waec'); }); await rp.reload({ waitUntil: 'networkidle' });
  await rp.waitForSelector('.hero.ssce'); log.push('reduced-motion page anim: ' + await rp.evaluate(() => getComputedStyle(document.querySelector('.page')).animationName));
  await browser.close();
  console.log(log.join('\n')); console.log('ERRORS', JSON.stringify(errs));
})().catch(e => { console.error('WALK FAIL', e); process.exit(1); });
