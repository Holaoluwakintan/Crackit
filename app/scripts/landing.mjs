// 12 exam x subject landing pages (/jamb/<subject>/, /waec/<subject>/, /post-utme/<school>/) plus 3 hub pages, generated at build
// from our own question bank (5 original sample questions each), the syllabus topic lists and admissions.json (Post-UTME facts with sources).
// Appends the pages to sitemap.xml written by seo.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const ORIGIN = 'https://crackit-ng.vercel.app';
const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const C = JSON.parse(readFileSync(join(root, 'scripts/landing-content.json'), 'utf8'));
const J = (p) => JSON.parse(readFileSync(join(root, 'public/data', p), 'utf8'));
const adm = J('admission/admissions.json');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const L = ['A', 'B', 'C', 'D'];
const YEAR = '2027';
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const srcLink = (i) => (adm.sources[i] ? `<a href="${esc(adm.sources[i])}" rel="nofollow noopener" target="_blank">${esc(host(adm.sources[i]))}</a>` : '');
const CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#14201a;background:#f6f8f7}
header{background:#0b5d3b;color:#fff;padding:12px 16px}header a{color:#fff;text-decoration:none;font-weight:800;font-size:19px}
main{max-width:760px;margin:0 auto;padding:16px}h1{font-size:24px;line-height:1.25;margin:8px 0 12px}h2{font-size:19px;margin:24px 0 8px}
.card{background:#fff;border:1px solid #e3e9e5;border-radius:14px;padding:14px 16px;margin:12px 0}
.cta{display:block;text-align:center;background:#0b5d3b;color:#fff;font-weight:800;text-decoration:none;padding:14px;border-radius:12px;margin:12px 0}
.cta.alt{background:#fff;color:#0b5d3b;border:1.5px solid #0b5d3b}.cta.gold{background:#f5b301;color:#0b3d27}
.muted{color:#5d6b64;font-size:14px}a{color:#0e7a4d}.crumbs{font-size:13px;color:#5d6b64}.crumbs a{color:#5d6b64}
.q{background:#fff;border:1px solid #e3e9e5;border-radius:14px;padding:14px 16px;margin:12px 0}.q b.n{color:#0b5d3b}
.q ol{list-style:none;padding:0;margin:8px 0}.q li{padding:7px 10px;border:1px solid #e3e9e5;border-radius:10px;margin:6px 0}.q li b{display:inline-block;width:22px;color:#0b5d3b}
details{margin-top:8px}summary{cursor:pointer;font-weight:700;color:#0b5d3b}details p{margin:8px 0 0}
.topics{columns:2;padding-left:18px;font-size:14.5px}.topics li{margin:2px 0;break-inside:avoid}
.links{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.links a{display:inline-block;padding:7px 12px;border:1px solid #cfe0d6;border-radius:999px;background:#fff;text-decoration:none;font-size:14px}
.facts td,.facts th{text-align:left;padding:8px;border-bottom:1px solid #e3e9e5;vertical-align:top}.facts{width:100%;border-collapse:collapse;font-size:14.5px}
footer{text-align:center;color:#5d6b64;font-size:13px;padding:20px 16px 30px;border-top:1px solid #e3e9e5;margin-top:24px}
@media (max-width:420px){.topics{columns:1}}`;
const PV = `<script>try{var n=navigator;if(!(n.doNotTrack==='1'||n.globalPrivacyControl===true)){var t=new Date().toISOString().slice(0,10),f=0;try{if(localStorage.getItem('crackit:ev:day')!==t){localStorage.setItem('crackit:ev:day',t);f=1}}catch(e){}n.sendBeacon&&n.sendBeacon('/api/ev',new Blob([JSON.stringify({e:'pv',p:location.pathname.slice(0,60),x:'jamb',f:f,a:0})],{type:'text/plain'}))}}catch(e){}</script>`;
function page({ path, title, desc, body, jsonld = [] }) {
  return `<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${ORIGIN}${path}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${ORIGIN}${path}"><meta property="og:image" content="${ORIGIN}/og.png"><meta property="og:site_name" content="CrackIt"><meta property="og:locale" content="en_NG">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0b5d3b"><link rel="icon" href="/icons/icon-192.png"><link rel="manifest" href="/manifest.webmanifest">
<style>${CSS}</style>${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('')}</head>
<body><header><a href="/">✔ CrackIt</a></header><main>${body}</main>
<footer><p>CrackIt is an independent practice app. Not affiliated with JAMB, WAEC or NECO. Practice questions are original, written to the official syllabus; they are not past questions.</p><p><a href="/">CrackIt: free JAMB, WAEC &amp; NECO CBT practice</a> · <a href="/jamb/">JAMB subjects</a> · <a href="/waec/">WAEC subjects</a> · <a href="/post-utme/">Post-UTME</a> · <a href="/cut-off/">Cut-off marks</a> · <a href="/privacy/">Privacy</a></p></footer>${PV}</body></html>`;
}
function write(rel, html) { const p = join(dist, rel); mkdirSync(p, { recursive: true }); writeFileSync(join(p, 'index.html'), html); }
const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: ORIGIN + path })) });
const crumbHtml = (items) => `<p class="crumbs">${items.map(([n, p], i) => (i < items.length - 1 ? `<a href="${p}">${esc(n)}</a>` : esc(n))).join(' › ')}</p>`;
const faq = (qa) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const faqHtml = (qa) => `<h2>Frequently asked questions</h2>${qa.map(([q, a]) => `<details class="card"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}`;
const qText = (s) => esc(s).replace(/\n/g, '<br>');

/** 5 samples: different topics, prefer medium, with an explanation, not too long; deterministic */
function samples(bank, n = 5) {
  const ok = bank.questions.filter((q) => q.e && q.q.length < 260 && q.o.every((o) => o.length < 90) && !q.n);
  const pref = [...ok.filter((q) => q.d === 'm'), ...ok.filter((q) => q.d === 'e'), ...ok.filter((q) => q.d === 'h')];
  const out = []; const seenT = new Set();
  const step = Math.max(1, Math.floor(pref.length / 37));
  for (let i = 0; i < pref.length && out.length < n; i += step) { const q = pref[i]; if (!seenT.has(q.t)) { seenT.add(q.t); out.push(q); } }
  for (const q of pref) { if (out.length >= n) break; if (!out.includes(q)) out.push(q); }
  return out;
}
function sampleHtml(qs, topicName) {
  return qs.map((q, i) => `<div class="q"><p><b class="n">Q${i + 1}.</b> ${topicName ? `<span class="muted">${esc(topicName(q))}</span><br>` : ''}${qText(q.q)}</p><ol>${q.o.map((o, k) => `<li><b>${L[k]}</b>${esc(o)}</li>`).join('')}</ol>
<details><summary>Show answer</summary><p><b>Answer: ${L[q.a]}. ${esc(q.o[q.a])}</b></p><p>${esc(q.e)}</p>${q.p ? `<p class="muted"><b>Pidgin:</b> ${esc(q.p)}</p>` : ''}</details></div>`).join('');
}
const jMeta = J('index.json'), sMeta = J('ssce/index.json');
const PAGES = Object.keys(C);
const label = (k) => { const [ex, s] = k.split('/'); return ex === 'post-utme' ? `${s.toUpperCase()} Post-UTME` : `${ex.toUpperCase()} ${C[k].name.replace('Use of English', 'English').replace('General Mathematics', 'Maths').replace('Mathematics', 'Maths').replace('English Language', 'English')}`; };
const others = (k) => `<h2>More free practice</h2><ul class="links">${PAGES.filter((x) => x !== k).map((x) => `<li><a href="/${x}/">${esc(label(x))}</a></li>`).join('')}</ul>`;
const urls = [];

for (const k of PAGES) {
  const c = C[k]; const [ex, slug] = k.split('/'); const path = `/${k}/`; urls.push(path);
  if (ex === 'post-utme') {
    const s = adm.schools.find((x) => x.id === c.school);
    const pk = J(`postutme/${c.school}.json`);
    const qs = pk.free.slice(0, 5).map((q) => ({ ...q, t: 0 }));
    const sec = { eng: 'English', math: 'Mathematics', gen: 'General knowledge' };
    const rows = [
      s.min ? `<tr><th>Minimum UTME score to apply</th><td><b>${esc(s.min.v)}</b> (${esc(s.min.yr)}), source: ${srcLink(s.min.s)}</td></tr>` : '',
      s.put ? `<tr><th>Screening format</th><td>${esc(s.put.mode)}${s.put.q ? `, ${s.put.q} questions` : ''}${s.put.min ? `, ${s.put.min} minutes` : ''} (${esc(s.put.yr)}), source: ${srcLink(s.put.s)}</td></tr>` : '',
      s.f ? `<tr><th>Aggregate formula (${esc(s.f.year)})</th><td>${esc(s.f.text)}<br><span class="muted">Source: ${s.f.src.map(srcLink).join(', ')}</span></td></tr>` : '',
    ].join('');
    const qa = [
      [`What is the ${s.short} Post-UTME cut-off mark?`, s.min ? `${s.name} asked for at least ${s.min.v} in UTME (${s.min.yr}) to apply for screening. Departmental cut-offs are higher for competitive courses; see the ${s.short} cut-off page on CrackIt.` : `${s.short} has not published a general cut-off we could verify.`],
      [`How is the ${s.short} aggregate calculated?`, s.f ? `${s.f.text} (${s.f.year}). Always confirm on the official ${s.short} portal.` : `${s.short} has not published its aggregate formula where we could verify it.`],
      ['Are these real past questions?', `No. They are original practice questions written in the style of the ${s.short} screening. CrackIt is not affiliated with ${s.short}, JAMB, WAEC or NECO.`],
      ['Is it free?', `Yes. The 5 questions on this page and the first 5 in the app are free. A full ${s.short} practice pack is an optional one-time purchase, with the price shown before you pay.`],
    ];
    const body = `${crumbHtml([['CrackIt', '/'], ['Post-UTME', '/post-utme/'], [s.short, path]])}
<h1>${esc(c.h1)}</h1><p>${esc(c.intro)}</p>
<a class="cta" href="/#/postutme/${s.id}">📝 Practise ${esc(s.short)} Post-UTME questions (5 free)</a>
<h2>${esc(s.short)} screening facts</h2><div class="card"><table class="facts">${rows}</table><p class="muted">From the latest published sources we could verify. Always confirm dates and formats on the official ${esc(s.short)} portal.</p></div>
<a class="cta alt" href="/cut-off/${s.id}/">See ${esc(s.short)} departmental cut-off marks</a>
<h2>5 free ${esc(s.short)} Post-UTME practice questions</h2><p class="muted">Original questions in the style of the screening. Tap “Show answer” to check yourself.</p>
${sampleHtml(qs, (q) => sec[q.s] || '')}
<a class="cta gold" href="/#/admission/${s.id}">🎯 Check my ${esc(s.short)} admission chances (free)</a>
<h2>How to prepare</h2><ul>${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
${faqHtml(qa)}${others(k)}`;
    write(k, page({ path, title: c.title, desc: `${s.short} Post-UTME ${s.put ? s.put.yr : ''}: screening format, aggregate formula and minimum UTME score with sources, plus 5 free original practice questions with answers. Check your admission chances free.`.replace(/\s+/g, ' '), body, jsonld: [faq(qa), crumbs([['CrackIt', '/'], ['Post-UTME', '/post-utme/'], [s.short, path]])] }));
    continue;
  }
  const isJ = ex === 'jamb';
  const meta = (isJ ? jMeta : sMeta).find((m) => m.id === c.sid);
  const bank = J(isJ ? `${c.sid}.json` : `ssce/${c.sid}.json`);
  const qs = samples(bank);
  const diff = { e: 0, m: 0, h: 0 }; for (const q of bank.questions) diff[q.d]++;
  const pid = bank.questions.filter((q) => q.p).length;
  const exName = isJ ? 'JAMB UTME' : 'WAEC (WASSCE)';
  const fmt = isJ
    ? (c.sid === 'english' ? 'In the UTME CBT, Use of English has 60 questions and each of your other three subjects has 40: 180 questions in 2 hours, scored out of 400 (100 per subject).' : `In the UTME CBT, ${meta.name} is one of your three subjects besides Use of English: 40 questions, inside a 2-hour paper of 180 questions scored out of 400.`)
    : (c.sid === 'english' ? 'The WASSCE English objective paper usually has 80 questions in about 1 hour. Confirm the time on your own timetable.' : c.sid === 'maths' ? 'The WASSCE General Mathematics objective paper usually has 50 questions in about 90 minutes. Confirm the time on your own timetable.' : 'The WASSCE Biology objective paper usually has 50 questions in about 50 minutes. Confirm the time on your own timetable.');
  const appLink = isJ ? `/#/practice/${c.sid}` : `/#/ssce/practice/${c.sid}`;
  const testLink = isJ ? '/#/mock/quick' : `/#/ssce/paper/${c.sid}/quick`;
  const qa = [
    [`How many questions are in ${exName} ${meta.name}?`, fmt],
    ['Are these real past questions?', `No. CrackIt's ${meta.count} ${meta.name} questions are original, written to the official ${isJ ? 'JAMB' : 'WAEC'} syllabus, and each has a worked explanation. CrackIt is not affiliated with JAMB, WAEC or NECO.`],
    ['Is CrackIt free and does it work offline?', 'Yes. Practice by topic, timed tests and the Daily 5 are free, and once the app has loaded it works without data.'],
    ['Can I read the explanations in Pidgin?', `Yes. ${pid === bank.questions.length ? 'Every' : pid + ' of ' + bank.questions.length} ${meta.name} explanation${pid === 1 ? ' has' : 's have'} a Pidgin version: tap “Pidgin” under the answer.`],
  ];
  const tn = (q) => bank.topics[q.t];
  const crumb = [['CrackIt', '/'], [isJ ? 'JAMB' : 'WAEC', `/${ex}/`], [meta.name, path]];
  const body = `${crumbHtml(crumb)}
<h1>${esc(c.h1)}</h1><p>${esc(c.intro)}</p>
<div class="card"><p><b>${esc(fmt)}</b></p><p>CrackIt has <b>${meta.count}</b> original ${esc(meta.name)} questions across <b>${meta.topics.length}</b> syllabus topics (${diff.e} easy, ${diff.m} medium, ${diff.h} hard), each with an explanation in English${pid ? ' and Pidgin' : ''}.</p></div>
<a class="cta" href="${appLink}">Practise ${esc(meta.name)} free →</a>
<h2>5 free ${esc(isJ ? 'JAMB' : 'WAEC')} ${esc(meta.name)} practice questions</h2><p class="muted">Original questions from our bank, written to the syllabus. Tap “Show answer” to check yourself.</p>
${sampleHtml(qs, tn)}
<a class="cta gold" href="/#/daily/${ex}">🔥 Take today's ${isJ ? 'JAMB' : 'WAEC'} Daily 5 (2 minutes)</a>
<h2>Topics covered</h2><ul class="topics">${meta.topics.map((t) => `<li>${esc(t.name)} <span class="muted">(${t.count})</span></li>`).join('')}</ul>
<h2>How to score higher in ${esc(meta.name)}</h2><ul>${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
<a class="cta alt" href="${testLink}">Take a timed CBT test</a>
${isJ ? '<p>Done with practice? See the <a href="/cut-off/">cut-off marks for 25 universities</a> or check your chances with the <a href="/admission-checker/">admission chance checker</a>.</p>' : '<p>Need five credits? CrackIt tracks your grade (A1 to F9) in every subject and plans each day until the exam.</p>'}
${faqHtml(qa)}${others(k)}`;
  write(k, page({ path, title: c.title, desc: `Free ${isJ ? 'JAMB' : 'WAEC'} ${meta.name} practice: ${meta.count} original CBT questions across ${meta.topics.length} topics with explanations in English and Pidgin. Try 5 sample questions with answers now. Works offline.`, body, jsonld: [faq(qa), crumbs(crumb)] }));
}
// hubs
const hub = (ex, title, h1, intro, keys) => {
  const path = `/${ex}/`; urls.push(path);
  write(ex, page({ path, title, desc: intro, body: `${crumbHtml([['CrackIt', '/'], [h1, path]])}<h1>${esc(h1)}</h1><p>${esc(intro)}</p><ul class="links">${keys.map((k) => `<li><a href="/${k}/">${esc(label(k))}</a></li>`).join('')}</ul><a class="cta" href="/">Open CrackIt (free)</a><a class="cta alt" href="/#/daily/${ex === 'waec' ? 'waec' : 'jamb'}">🔥 Today's Daily 5</a>`, jsonld: [crumbs([['CrackIt', '/'], [h1, path]])] }));
};
hub('jamb', `JAMB CBT practice by subject ${YEAR} (free) | CrackIt`, 'JAMB practice by subject', 'Free JAMB UTME practice questions by subject, with answers and explanations in English and Pidgin. Original questions written to the JAMB syllabus.', PAGES.filter((k) => k.startsWith('jamb/')));
hub('waec', `WAEC objective practice by subject ${YEAR} (free) | CrackIt`, 'WAEC practice by subject', 'Free WASSCE objective practice by subject, graded A1 to F9, with explanations. Original questions written to the WAEC syllabus.', PAGES.filter((k) => k.startsWith('waec/')));
hub('post-utme', 'Post-UTME practice questions by school (free) | CrackIt', 'Post-UTME practice by school', 'Free Post-UTME practice questions and verified screening facts (format, aggregate formula, minimum UTME score) for Nigerian universities.', PAGES.filter((k) => k.startsWith('post-utme/')));

const sm = join(dist, 'sitemap.xml');
const today = new Date().toISOString().slice(0, 10);
writeFileSync(sm, readFileSync(sm, 'utf8').replace('</urlset>', urls.map((u) => `<url><loc>${ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`).join('') + '</urlset>'));
console.log('landing: wrote', PAGES.length, 'exam x subject pages + 3 hubs');
