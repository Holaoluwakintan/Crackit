// Generates one static, indexable page per school (/cut-off/<id>/), a checker landing page with its own
// link preview (/admission-checker/), a school index, sitemap.xml and robots.txt — all from admissions.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const ORIGIN = 'https://crackit-ng.vercel.app';
const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const d = JSON.parse(readFileSync(join(root, 'public/data/admission/admissions.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const src = (i) => (d.sources[i] ? `<a href="${esc(d.sources[i])}" rel="nofollow noopener" target="_blank">${esc(host(d.sources[i]))}</a>` : '');
const yr = (y) => esc(y || 'year not stated');
const scale = (r) => (r.sc === 'jamb' ? 'JAMB score' : r.sc === 'jmin' ? 'JAMB minimum to sit screening' : r.sc === 'agg100' ? 'Aggregate /100' : "School's own scale");
const YEAR = d.updated.slice(0, 4);
const CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#14201a;background:#f6f8f7}
header{background:#0b5d3b;color:#fff;padding:12px 16px}header a{color:#fff;text-decoration:none;font-weight:800;font-size:19px}
main{max-width:760px;margin:0 auto;padding:16px}h1{font-size:24px;line-height:1.25;margin:8px 0 12px}h2{font-size:19px;margin:22px 0 8px}
.card{background:#fff;border:1px solid #e3e9e5;border-radius:14px;padding:14px 16px;margin:12px 0}
.cta{display:block;text-align:center;background:#0b5d3b;color:#fff;font-weight:800;text-decoration:none;padding:14px;border-radius:12px;margin:12px 0}
.cta.alt{background:#fff;color:#0b5d3b;border:1.5px solid #0b5d3b}
table{width:100%;border-collapse:collapse;font-size:14.5px;background:#fff}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #e3e9e5;vertical-align:top}
th{background:#eaf5ef;font-size:13px}td small{color:#5d6b64}.np{color:#5d6b64;font-style:italic}
.tw{overflow-x:auto;border:1px solid #e3e9e5;border-radius:12px}a{color:#0e7a4d}.muted{color:#5d6b64;font-size:14px}
footer{text-align:center;color:#5d6b64;font-size:13px;padding:20px 16px 30px;border-top:1px solid #e3e9e5;margin-top:24px}
ul.schools{columns:2;padding-left:18px}`;
function page({ path, title, desc, body, og = '/og-admission.png', jsonld = '' }) {
  return `<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${ORIGIN}${path}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${ORIGIN}${path}"><meta property="og:image" content="${ORIGIN}${og}"><meta property="og:site_name" content="CrackIt">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0b5d3b"><link rel="icon" href="/icons/icon-192.png">
<style>${CSS}</style>${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}</head>
<body><header><a href="/">✔ CrackIt</a></header><main>${body}</main>
<footer><p>Not affiliated with JAMB, WAEC or NECO. Figures are from each school's published lists; verify with the school before you decide.</p><p><a href="/">CrackIt: free JAMB CBT practice</a> · <a href="/cut-off/">All school cut-offs</a> · <a href="/admission-checker/">Admission chance checker</a></p><p>Practice by subject: <a href="/jamb/">JAMB</a> · <a href="/waec/">WAEC</a> · <a href="/post-utme/">Post-UTME</a></p></footer></body></html>`;
}
function write(rel, html) { const p = join(dist, rel); mkdirSync(p, { recursive: true }); writeFileSync(join(p, 'index.html'), html); }

const urls = ['/', '/admission-checker/', '/cut-off/'];
for (const s of d.schools) {
  const path = `/cut-off/${s.id}/`; urls.push(path);
  const rows = d.courses.map((c) => {
    const r = s.c[c.id];
    return `<tr><td>${esc(c.name)}</td>${r ? `<td><b>${esc(r.v)}</b><br><small>${scale(r)}</small></td><td>${yr(r.yr)}</td><td>${src(r.s)}</td>` : '<td class="np" colspan="3">not published</td>'}</tr>`;
  }).join('');
  const n = Object.keys(s.c).length;
  const minTxt = s.min ? `<b>${esc(s.min.v)}</b> (${yr(s.min.yr)}, source: ${src(s.min.s)})` : '<span class="np">not published</span>';
  const f = s.f ? `<h2>How ${esc(s.short)} calculates your aggregate</h2><div class="card"><p><b>Formula (${esc(s.f.year)}):</b> ${esc(s.f.text)}</p>${s.f.note ? `<p class="muted">${esc(s.f.note)}</p>` : ''}<p class="muted">Source: ${s.f.src.map(src).join(', ')}</p></div>` : `<h2>Screening formula</h2><p class="np">${esc(s.short)} has not published its aggregate formula where we could verify it. The checker compares your JAMB score with the cut-offs.</p>`;
  const p = s.put ? `<h2>${esc(s.short)} Post-UTME format</h2><div class="card"><p><b>${esc(s.put.mode)}</b>${s.put.q ? `, ${s.put.q} questions` : ''}${s.put.min ? `, ${s.put.min} minutes` : ''} (${yr(s.put.yr)}).${!s.put.q && !/no |screening/i.test(s.put.mode) ? ' Number of questions not published.' : ''}</p>${s.put.subj ? `<p>Subjects: ${esc(s.put.subj.join(', '))}</p>` : ''}<p class="muted">Source: ${src(s.put.s)}</p></div>` : `<h2>Post-UTME format</h2><p class="np">Not published.</p>`;
  const title = `${s.short} cut-off mark ${YEAR} & admission chances | CrackIt`;
  const desc = `${s.name} (${s.short}) cut-off marks: school minimum ${s.min ? s.min.v : 'not published'}, departmental cut-offs for ${n} popular courses with sources, the screening formula and Post-UTME format. Check your chances free.`;
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
    { '@type': 'Question', name: `What is the ${s.short} cut-off mark?`, acceptedAnswer: { '@type': 'Answer', text: s.min ? `${s.name} requires at least ${s.min.v} in UTME (${s.min.yr || 'latest cycle'}) to apply for screening. Departmental cut-offs are higher for competitive courses.` : `${s.short} has not published a general cut-off we could verify.` } },
    { '@type': 'Question', name: `How do I know my chances at ${s.short}?`, acceptedAnswer: { '@type': 'Answer', text: `Enter your JAMB score and subjects in the CrackIt Admission Chance Checker to compare with ${s.short}'s published cut-offs.` } },
  ] };
  const body = `<p class="muted">${esc(s.name)} · ${esc(s.type)} · ${esc(s.state)} State</p>
<h1>${esc(s.short)} cut-off mark ${YEAR} and your admission chances</h1>
<div class="card"><p><b>School minimum JAMB score:</b> ${minTxt}</p><p>Departmental cut-offs found: <b>${n}</b> of ${d.courses.length} popular courses. Each figure links to where it was published. Where a figure isn't published we say so instead of guessing.</p></div>
<a class="cta" href="/#/admission/${s.id}">🎯 Check my ${esc(s.short)} admission chances (free)</a>
${s.pack ? `<a class="cta alt" href="/#/postutme/${s.id}">📝 Practise ${esc(s.short)}-style Post-UTME questions</a>` : ''}${['unilag', 'oau'].includes(s.id) ? `<p><a href="/post-utme/${s.id}/">${esc(s.short)} Post-UTME: 5 free sample questions and screening facts</a></p>` : ''}
<h2>${esc(s.short)} departmental cut-off marks</h2>
<div class="tw"><table><thead><tr><th>Course</th><th>Cut-off</th><th>Session</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted">"JAMB score" means the minimum UTME score for the course. "Aggregate /100" is the final screening score after Post-UTME (merit list). Last updated ${YEAR}: always verify with ${esc(s.short)}'s official portal.</p>
${f}${p}
<h2>Other universities</h2><ul class="schools">${d.schools.filter((x) => x.id !== s.id).map((x) => `<li><a href="/cut-off/${x.id}/">${esc(x.short)} cut-off mark</a></li>`).join('')}</ul>`;
  write(`cut-off/${s.id}`, page({ path, title, desc, body, jsonld: JSON.stringify(faq) }));
}
write('cut-off', page({ path: '/cut-off/', title: `University cut-off marks ${YEAR}: 25 Nigerian universities | CrackIt`, desc: `Cut-off marks for UNILAG, UI, OAU, UNN, ABU, UNIBEN and 19 more universities, with departmental cut-offs and sources. Check your admission chances free.`,
  body: `<h1>University cut-off marks ${YEAR}</h1><p>School minimums and departmental cut-offs for ${d.schools.length} Nigerian universities, each with its source.</p><a class="cta" href="/#/admission">🎯 Check my admission chances</a><div class="tw"><table><thead><tr><th>University</th><th>Minimum JAMB</th><th>Courses with data</th></tr></thead><tbody>${d.schools.map((s) => `<tr><td><a href="/cut-off/${s.id}/">${esc(s.short)}</a><br><small>${esc(s.name)}</small></td><td>${s.min ? `<b>${s.min.v}</b><br><small>${yr(s.min.yr)}</small>` : '<span class="np">not published</span>'}</td><td>${Object.keys(s.c).length}</td></tr>`).join('')}</tbody></table></div>` }));
write('admission-checker', page({ path: '/admission-checker/', title: 'Admission Chance Checker: see your chances with your JAMB score | CrackIt', desc: 'Enter your JAMB score and subjects. See cut-off marks and your admission chances at 25 Nigerian universities: Strong, Fair, Long shot or Below cut-off. Free.',
  body: `<h1>🎯 What are your admission chances?</h1><p>Enter your JAMB score and your 4 UTME subjects. CrackIt compares them with each university's published cut-offs and tells you, course by course: <b>Strong</b>, <b>Fair</b>, <b>Long shot</b> or <b>Below cut-off</b>. Add your O'level grades and state for a sharper estimate.</p><a class="cta" href="/#/admission">Check my chances now (free)</a><div class="card"><p>✅ ${d.schools.length} universities · ${d.courses.length} popular courses<br>✅ Departmental cut-offs with sources<br>✅ Subject combination check<br>✅ Post-UTME practice for top schools</p></div><a class="cta alt" href="/cut-off/">See all school cut-off marks</a>` }));
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${ORIGIN}${u}</loc><lastmod>${d.updated}</lastmod></url>`).join('')}</urlset>\n`);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
console.log('seo: wrote', d.schools.length, 'school pages + index + checker landing + sitemap');
