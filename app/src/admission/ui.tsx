import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { APP } from '../config';
import { go, replace } from '../app';
import { BAND_LABEL, GRADES, aggregate, checkCourse, comboCheck, olevelOk, qualifyList } from './core.js';
import { shareResultCard } from './card';
import { payConfig, startCheckout, unlockedPack, type PayConfig } from './pay';

// ---------- data ----------
export interface Src { s: number }
export interface Rec { v: number; sc: 'jamb' | 'jmin' | 'agg100' | 'school' | 'other'; what?: string; yr?: string; s: number; cat?: Record<string, number> }
export interface Formula { text: string; year: string; src: number[]; note?: string; scale?: number; kind?: string; utme?: { w: number }; olevel?: any; putme?: { w: number } | null }
export interface School { id: string; short: string; name: string; state: string; type: string; min: { v: number; yr?: string; s: number } | null; f?: Formula; put?: { mode: string; q?: number; min?: number; subj?: string[]; note?: string; yr?: string; s: number }; c: Record<string, Rec>; pack: boolean }
export interface Course { id: string; name: string; slots: string[][]; rule: string; s: number }
export interface Adm { updated: string; sessionNote: string; subjects: string[]; states: string[]; courses: Course[]; schools: School[]; sources: string[] }
let admP: Promise<Adm> | null = null;
export const loadAdm = () => admP || (admP = fetch('/data/admission/admissions.json').then(r => r.json()));
function useAdm() {
  const [d, setD] = useState<Adm | null>(null);
  useEffect(() => { loadAdm().then(setD).catch(() => setD(null)); }, []);
  return d;
}

// ---------- the candidate's input (kept on the phone only) ----------
export interface Input { jamb: number | ''; subjects: string[]; course: string; school: string; state: string; ol: { sub: string; g: string }[]; sittings: number; putme: number | '' }
const IKEY = APP.storageKey + ':adm:v1';
const blankInput = (): Input => ({ jamb: '', subjects: ['', '', ''], course: '', school: '', state: '', ol: [{ sub: 'English', g: '' }, { sub: 'Mathematics', g: '' }, { sub: '', g: '' }, { sub: '', g: '' }, { sub: '', g: '' }], sittings: 1, putme: '' });
export function loadInput(): Input { try { return { ...blankInput(), ...JSON.parse(localStorage.getItem(IKEY) || '{}') }; } catch { return blankInput(); } }
function saveInput(i: Input) { try { localStorage.setItem(IKEY, JSON.stringify(i)); } catch { /* ignore */ } }
function toCore(i: Input) {
  const olevel: Record<string, string> = {};
  for (const r of i.ol) if (r.sub && r.g) olevel[r.sub] = r.g;
  return { jamb: +i.jamb || 0, subjects: i.subjects, utmeSubjects: ['English', ...i.subjects], grades: i.ol.filter(r => r.sub && r.g).map(r => r.g), olevel, sittings: i.sittings, state: i.state, putme: i.putme === '' ? null : +i.putme };
}

// ---------- small bits ----------
const yr = (y?: string) => (y ? y : 'year not stated');
function SrcLink({ d, i, label = 'source' }: { d: Adm; i: number; label?: string }) {
  const u = d.sources[i]; if (!u) return null;
  let host = u; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch { /* keep */ }
  return <a class="src" href={u} target="_blank" rel="noopener nofollow">{label}: {host} ↗</a>;
}
function Band({ b, big = false }: { b: string; big?: boolean }) { return <span class={'chip ' + b + (big ? ' big' : '')}>{BAND_LABEL[b as keyof typeof BAND_LABEL] || b}</span>; }
function scaleText(r: Rec) {
  return r.sc === 'jamb' ? 'JAMB score' : r.sc === 'jmin' ? 'JAMB minimum to sit screening' : r.sc === 'agg100' ? 'aggregate /100' : "school's own scale";
}
const NP = <span class="np">not published</span>;
function Verify({ d }: { d: Adm }) { return <p class="muted small verify">Last updated {d.updated.slice(0, 4)}. Verify with the school before you decide.</p>; }

// ---------- routes ----------
export function admissionTitle(parts: string[]) {
  if (parts[0] === 'postutme') return parts[2] === 't' ? '' : 'Post-UTME practice';
  return parts[1] === 'r' ? 'Your chances' : parts[1] === 'd' ? 'Course check' : parts[1] === 's' ? 'School cut-offs' : 'Admission checker';
}
export default function AdmissionRoutes({ parts }: { parts: string[] }) {
  const d = useAdm();
  if (!d) return <div class="loading"><div class="spin" />Loading…</div>;
  if (parts[0] === 'postutme') {
    if (parts[1] && parts[2] === 't') return <PutmeTest d={d} sid={parts[1]} mode={parts[3] === 'full' ? 'full' : 'free'} />;
    if (parts[1]) return <PutmePack d={d} sid={parts[1]} />;
    return <PutmeHome d={d} />;
  }
  if (parts[1] === 'r') return <Results d={d} />;
  if (parts[1] === 'd') return <Detail d={d} sid={parts[2]} cid={parts[3]} />;
  if (parts[1] === 's') return <SchoolPage d={d} sid={parts[2]} />;
  return <Form d={d} preset={parts[1]} />;
}

// ---------- form ----------
function Form({ d, preset }: { d: Adm; preset?: string }) {
  const [i, setI] = useState<Input>(() => { const x = loadInput(); if (preset && d.schools.some(s => s.id === preset)) x.school = preset; return x; });
  const [err, setErr] = useState('');
  const set = (p: Partial<Input>) => setI(v => ({ ...v, ...p }));
  const subs = d.subjects;
  const setSub = (k: number, v: string) => {
    const s = [...i.subjects]; s[k] = v;
    const ol = i.ol.map(r => ({ ...r }));
    // pre-fill O'level rows 3-5 with the UTME subjects (not English/Maths, which have their own rows)
    const extra = s.filter(x => x && x !== 'Mathematics');
    let j = 2; for (const x of extra) { if (j > 4) break; if (!ol.some(r => r.sub === x)) { while (j <= 4 && ol[j].sub && ol[j].g) j++; if (j <= 4) ol[j].sub = x; j++; } }
    set({ subjects: s, ol });
  };
  const submit = (e: Event) => {
    e.preventDefault();
    const j = +i.jamb;
    if (!j || j < 0 || j > 400) { setErr('Enter your JAMB score (0 to 400).'); return; }
    if (i.subjects.filter(Boolean).length < 3 || new Set(i.subjects).size < 3) { setErr('Pick your 3 other UTME subjects (all different).'); return; }
    if (i.putme !== '' && (+i.putme < 0 || +i.putme > 100)) { setErr('Post-UTME score is a percentage, 0 to 100.'); return; }
    setErr(''); saveInput(i);
    if (i.school && i.course) go(`/admission/d/${i.school}/${i.course}`); else go('/admission/r');
  };
  const olc = olevelOk(toCore(i).olevel);
  return (
    <form class="stack" onSubmit={submit} novalidate>
      <section class="hero adm">
        <h1>🎯 Admission Chance Checker</h1>
        <p>Your JAMB score + subjects → cut-off marks and your chances for {d.courses.length} courses at {d.schools.length} universities. Free.</p>
      </section>
      <label class="field"><span>Your JAMB (UTME) score</span>
        <input type="number" inputMode="numeric" min={0} max={400} placeholder="e.g. 245" value={i.jamb} onInput={e => set({ jamb: (e.target as HTMLInputElement).value === '' ? '' : +(e.target as HTMLInputElement).value })} />
      </label>
      <div class="field"><span>Your 4 UTME subjects</span>
        <div class="subs">
          <span class="fixed">English</span>
          {[0, 1, 2].map(k => (
            <select aria-label={'Subject ' + (k + 2)} value={i.subjects[k]} onChange={e => setSub(k, (e.target as HTMLSelectElement).value)}>
              <option value="">Subject {k + 2}…</option>
              {subs.map(s => <option value={s} disabled={i.subjects.includes(s) && i.subjects[k] !== s}>{s}</option>)}
            </select>
          ))}
        </div>
      </div>
      <label class="field"><span>Course <small>(optional)</small></span>
        <select value={i.course} onChange={e => set({ course: (e.target as HTMLSelectElement).value })}>
          <option value="">All courses I can get</option>
          {d.courses.map(c => <option value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label class="field"><span>University <small>(optional)</small></span>
        <select value={i.school} onChange={e => set({ school: (e.target as HTMLSelectElement).value })}>
          <option value="">All {d.schools.length} universities</option>
          {d.schools.map(s => <option value={s.id}>{s.short}: {s.name}</option>)}
        </select>
      </label>
      <details class="card more" open={i.ol.some(r => r.g) || !!i.state}>
        <summary><b>Add O'level grades &amp; state</b> <small>for a better estimate</small></summary>
        <div class="olrows">
          {i.ol.map((r, k) => (
            <div class="olrow">
              {k < 2 ? <span class="fixed">{r.sub}</span> : (
                <select aria-label={"O'level subject " + (k + 1)} value={r.sub} onChange={e => { const ol = i.ol.map(x => ({ ...x })); ol[k].sub = (e.target as HTMLSelectElement).value; set({ ol }); }}>
                  <option value="">Subject…</option>
                  {subs.filter(s => s !== 'Mathematics').map(s => <option value={s}>{s}</option>)}
                </select>
              )}
              <select aria-label={'Grade for ' + (r.sub || 'subject ' + (k + 1))} class="grade" value={r.g} onChange={e => { const ol = i.ol.map(x => ({ ...x })); ol[k].g = (e.target as HTMLSelectElement).value; set({ ol }); }}>
                <option value="">Grade</option>
                {GRADES.map(g => <option value={g}>{g}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div class="seg sit" role="group" aria-label="Sittings">
          <button type="button" class={i.sittings === 1 ? 'on' : ''} onClick={() => set({ sittings: 1 })}>One sitting</button>
          <button type="button" class={i.sittings === 2 ? 'on' : ''} onClick={() => set({ sittings: 2 })}>Two sittings</button>
        </div>
        {olc.given >= 5 && !olc.ok && <p class="warn">⚠️ Most courses need 5 credits (A1–C6) including English and Maths. You have {olc.credits}{!olc.eng ? ', no credit in English' : ''}{!olc.mat ? ', no credit in Maths' : ''}.</p>}
        <label class="field"><span>State of origin <small>(for catchment cut-offs)</small></span>
          <select value={i.state} onChange={e => set({ state: (e.target as HTMLSelectElement).value })}>
            <option value="">Choose state…</option>
            {d.states.map(s => <option value={s}>{s}</option>)}
          </select>
        </label>
        <label class="field"><span>Post-UTME score in % <small>(if you have one, or a target)</small></span>
          <input type="number" inputMode="decimal" min={0} max={100} placeholder="leave blank if not written yet" value={i.putme} onInput={e => set({ putme: (e.target as HTMLInputElement).value === '' ? '' : +(e.target as HTMLInputElement).value })} />
        </label>
      </details>
      {err && <p class="warn" role="alert">{err}</p>}
      <button class="btn primary big" type="submit"><span>Check my chances</span><small>Takes a second, works offline</small></button>
      <p class="muted small center-t">Cut-offs come from each school's published lists ({d.sessionNote.toLowerCase().includes('2026') ? '2025–2026 cycles' : ''}), with the source on every number. Where a school hasn't published one we say so.</p>
      <a class="btn" href="#/postutme">📝 Post-UTME practice by school</a>
    </form>
  );
}

// ---------- results ----------
function Row({ r }: { r: any }) {
  return (
    <a class="row link res" href={`#/admission/d/${r.school.id}/${r.course.id}`}>
      <span>{r.course.name}<small>{r.school.short} · {r.reason}</small></span>
      <Band b={r.band} />
    </a>
  );
}
function Group({ title, rows, open = true, limit = 40 }: { title: string; rows: any[]; open?: boolean; limit?: number }) {
  const [n, setN] = useState(limit);
  if (!rows.length) return null;
  return (
    <details class="card grp" open={open}>
      <summary><h3>{title} <small>({rows.length})</small></h3></summary>
      {rows.slice(0, n).map(r => <Row r={r} />)}
      {rows.length > n && <button class="btn ghost sm" onClick={() => setN(n + 60)}>Show more</button>}
    </details>
  );
}
function Results({ d }: { d: Adm }) {
  const i = loadInput();
  const ci = toCore(i);
  const rows = useMemo(() => qualifyList(d as any, ci, { school: i.school, course: i.course }), [d]);
  if (!i.jamb) { replace('/admission'); return null; }
  const good = rows.filter(r => r.band === 'strong' || r.band === 'fair');
  const best = good[0] || rows.find(r => r.band === 'long') || rows[0];
  const scope = i.course ? d.courses.find(c => c.id === i.course)?.name : i.school ? d.schools.find(s => s.id === i.school)?.short : 'all schools';
  return (
    <div class="stack">
      <section class="card sum">
        <div class="bigscore"><b>{i.jamb}</b><span>JAMB</span></div>
        <div><b>English, {i.subjects.join(', ')}</b><small>{scope}{i.state ? ' · ' + i.state : ''}{ci.grades.length >= 5 ? " · O'level added" : ''}</small></div>
        <a class="btn sm" href="#/admission">Edit</a>
      </section>
      {good.length > 0
        ? <p class="lead">✅ <b>{good.length}</b> course{good.length > 1 ? 's' : ''} where you have a good chance (Strong or Fair).</p>
        : <p class="lead">No Strong or Fair matches yet. Long shots and options are below. A higher Post-UTME score can change this.</p>}
      {best && <button class="btn primary" onClick={() => shareResultCard({ jamb: +i.jamb, course: best.course.name, school: best.school.short, band: BAND_LABEL[best.band as keyof typeof BAND_LABEL], good: good.length })}>📤 Share my result</button>}
      <Group title="Courses you qualify for" rows={good} />
      <Group title="Long shots" rows={rows.filter(r => r.band === 'long')} open={good.length < 5} />
      <Group title="Meets the school minimum (departmental cut-off not published)" rows={rows.filter(r => r.band === 'unknown')} open={false} />
      <Group title="Below cut-off or wrong subjects" rows={rows.filter(r => r.band === 'below')} open={false} />
      <section class="card">
        <h3>How the bands work</h3>
        <p class="small"><span class="chip strong">Strong</span> comfortably above last year's cut-off · <span class="chip fair">Fair</span> just above · <span class="chip long">Long shot</span> just at it, or you'd need a very high Post-UTME · <span class="chip below">Below cut-off</span> under the cut-off or wrong subjects · <span class="chip unknown">Meets minimum</span> passes the school minimum but the department's cut-off isn't published.</p>
        <Verify d={d} />
      </section>
    </div>
  );
}

// ---------- one course at one school ----------
function Detail({ d, sid, cid }: { d: Adm; sid: string; cid: string }) {
  const s = d.schools.find(x => x.id === sid); const c = d.courses.find(x => x.id === cid);
  if (!s || !c) return <div class="card">Not found. <a href="#/admission">Back to the checker</a></div>;
  const i = loadInput(); const ci = toCore(i);
  if (!i.jamb) return <Form d={d} preset={sid} />;
  const r = checkCourse(s as any, c as any, ci);
  const rec = s.c[c.id];
  const agg = s.f ? aggregate(s.f as any, ci) : null;
  const combo = comboCheck(c.slots, i.subjects);
  return (
    <div class="stack">
      <section class="card verdictcard">
        <small class="muted">{s.name}</small>
        <h2>{c.name}</h2>
        <Band b={r.band} big />
        <p>{r.reason}</p>
      </section>
      <section class="card kv">
        <div><span>School minimum (JAMB)</span>{s.min ? <b>{s.min.v} <small>{yr(s.min.yr)}</small></b> : NP}</div>
        {s.min && <SrcLink d={d} i={s.min.s} />}
        <div><span>Departmental cut-off</span>{rec ? <b>{rec.v} <small>{scaleText(rec)} · {yr(rec.yr)}</small></b> : NP}</div>
        {rec && <><small class="muted">{rec.what}</small><SrcLink d={d} i={rec.s} /></>}
        {rec && rec.cat && i.state && rec.cat[i.state] !== undefined && <div><span>Catchment ({i.state})</span><b>{rec.cat[i.state]}</b></div>}
        {r.via && r.via !== 'merit' && <small class="muted">We used the {r.via} cut-off because it's lower than merit for your state.</small>}
      </section>
      <section class="card">
        <h3>Your estimated aggregate</h3>
        {s.f ? (
          <>
            <p class="small"><b>Formula used ({s.f.year}):</b> {s.f.text}</p>
            {s.f.note && <p class="muted small">{s.f.note}</p>}
            {s.f.src.map(k => <SrcLink d={d} i={k} label="formula source" />)}
            {agg && (
              <div class="parts">
                <div><span>UTME part</span><b>{agg.utme}</b></div>
                {s.f.olevel !== undefined && s.f.olevel !== null && <div><span>O'level part</span><b>{agg.olevel === null ? '–' : agg.olevel}</b></div>}
                {s.f.putme && <div><span>Post-UTME part</span><b>{agg.putme === null ? '?' : agg.putme}</b></div>}
                <div class="tot"><span>Total{agg.total === null ? ' so far' : ''}</span><b>{agg.total === null ? agg.known : agg.total}<small> / {agg.scale}</small></b></div>
              </div>
            )}
            {agg && agg.missing.length > 0 && <p class="muted small">Missing: {agg.missing.join(', ')}.{agg.missing.some((m: string) => m.includes('grades')) ? " Add them on the form." : ''}</p>}
            {r.need !== null && <p class="lead">{r.need > 100 ? '❌ Even 100% in the Post-UTME would not reach last year\'s cut-off.' : `🎯 You need about ${r.need}% in the Post-UTME to reach last year's cut-off of ${r.cutoff}.`}</p>}
          </>
        ) : <p class="small">{s.short} hasn't published its screening formula, so we can't estimate an aggregate. We compare your JAMB score with the cut-offs only.</p>}
      </section>
      <section class="card">
        <h3>Subject combination {combo.ok ? '✅' : '❌'}</h3>
        <p class="small">{c.rule}</p>
        {!combo.ok && <p class="warn small">Your subjects (English, {i.subjects.join(', ')}) don't fit. Missing: {combo.missing.join('; ')}.</p>}
        <p class="muted small">JAMB brochure general rule. Some schools add their own rules, so check {s.short}'s entry in the JAMB brochure.</p>
        <SrcLink d={d} i={c.s} />
      </section>
      <PutmeCard d={d} s={s} />
      <button class="btn primary" onClick={() => shareResultCard({ jamb: +i.jamb, course: c.name, school: s.short, band: BAND_LABEL[r.band as keyof typeof BAND_LABEL] })}>📤 Share my result</button>
      <div class="navbtns">
        <a class="btn" href={`#/admission/s/${s.id}`}>All {s.short} courses</a>
        <a class="btn" href="#/admission/r" data-replace="1">All my options</a>
      </div>
      <Verify d={d} />
    </div>
  );
}
function PutmeCard({ d, s }: { d: Adm; s: School }) {
  const p = s.put;
  return (
    <section class="card">
      <h3>{s.short} Post-UTME</h3>
      {p ? (
        <>
          <p class="small"><b>{p.mode}</b>{p.q ? ` · ${p.q} questions` : ''}{p.min ? ` · ${p.min} minutes` : ''} <small class="muted">({yr(p.yr)})</small></p>
          {p.subj && <p class="small">Subjects: {p.subj.join(', ')}</p>}
          {!p.q && !/no |screening/i.test(p.mode) && <p class="muted small">Number of questions: not published.</p>}
          {p.note && <p class="muted small">{p.note}</p>}
          <SrcLink d={d} i={p.s} />
        </>
      ) : <p class="small">Format {NP}.</p>}
      {s.pack && <a class="btn" href={`#/postutme/${s.id}`}>📝 Practise {s.short}-style questions</a>}
    </section>
  );
}

// ---------- one school, every course ----------
function SchoolPage({ d, sid }: { d: Adm; sid: string }) {
  const s = d.schools.find(x => x.id === sid);
  if (!s) return <div class="card">Not found.</div>;
  const i = loadInput(); const ci = toCore(i);
  return (
    <div class="stack">
      <section class="card">
        <h2>{s.name} ({s.short})</h2>
        <p class="small">{s.type} · {s.state}</p>
        <p>School minimum JAMB score: {s.min ? <b>{s.min.v}</b> : NP} {s.min && <small class="muted">({yr(s.min.yr)})</small>}</p>
        {s.min && <SrcLink d={d} i={s.min.s} />}
        {s.f && <p class="small"><b>Screening formula ({s.f.year}):</b> {s.f.text}</p>}
      </section>
      <section class="card">
        <h3>Departmental cut-offs</h3>
        {d.courses.map(c => {
          const rec = s.c[c.id]; const r = i.jamb ? checkCourse(s as any, c as any, ci) : null;
          return (
            <a class="row link res" href={i.jamb ? `#/admission/d/${s.id}/${c.id}` : `#/admission/${s.id}`}>
              <span>{c.name}<small>{rec ? `${rec.v} · ${scaleText(rec)} · ${yr(rec.yr)}` : 'not published'}</small></span>
              {r ? <Band b={r.band} /> : null}
            </a>
          );
        })}
        <Verify d={d} />
      </section>
      <PutmeCard d={d} s={s} />
      <a class="btn" href={`/cut-off/${s.id}/`}>Printable page with sources</a>
    </div>
  );
}

// ---------- Post-UTME practice ----------
interface PQ { id: string; s: 'eng' | 'math' | 'gen'; q: string; o: string[]; a: number; e: string }
const SUBJ = { eng: 'English', math: 'Maths', gen: 'General paper' } as const;
function PutmeHome({ d }: { d: Adm }) {
  const packs = d.schools.filter(s => s.pack);
  const noTest = d.schools.filter(s => !s.pack && s.put && /no |screening only|screening by points|registration and screening/i.test(s.put.mode));
  return (
    <div class="stack">
      <section class="hero adm">
        <h1>📝 Post-UTME practice</h1>
        <p>Original questions written in each school's style: English, Maths and General paper. Timed like the real test, with explanations. 5 free per school.</p>
      </section>
      <section class="card">
        {packs.map(s => (
          <a class="row link" href={`#/postutme/${s.id}`}>
            <span>{s.short}<small>{s.put ? `${s.put.mode}${s.put.min ? ' · ' + s.put.min + ' min' : ''}${s.put.q ? ' · ' + s.put.q + ' Qs' : ''}` : 'format not published'}</small></span><em>20 Qs ›</em>
          </a>
        ))}
      </section>
      {noTest.length > 0 && (
        <section class="card">
          <h3>No written Post-UTME reported</h3>
          <p class="small muted">These schools screened on JAMB + O'level in their latest cycle (as published):</p>
          {noTest.map(s => <div class="row"><span>{s.short}<small>{s.put!.mode} · {yr(s.put!.yr)}</small></span><SrcLink d={d} i={s.put!.s} /></div>)}
        </section>
      )}
      <p class="muted small">Questions are new and original, written for practice. They are not past questions. Each answer was checked by two independent solvers.</p>
    </div>
  );
}
function secsPerQ(s: School) { const p = s.put; return p && p.q && p.min ? Math.round((p.min * 60) / p.q) : 60; }
const BKEY = (sid: string) => APP.storageKey + ':putme:best:' + sid;
function PutmePack({ d, sid }: { d: Adm; sid: string }) {
  const s = d.schools.find(x => x.id === sid);
  const [cfg, setCfg] = useState<PayConfig | null>(null);
  const [unlocked, setUnlocked] = useState(() => !!unlockedPack(sid));
  const [busy, setBusy] = useState(''); const [email, setEmail] = useState('');
  useEffect(() => { payConfig().then(setCfg); }, []);
  if (!s || !s.pack) return <div class="card">No practice pack for this school yet. <a href="#/postutme">See all</a></div>;
  const best = (() => { try { return JSON.parse(localStorage.getItem(BKEY(sid)) || 'null'); } catch { return null; } })();
  const spq = secsPerQ(s);
  const buy = async (e: Event) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setBusy('Enter a valid email for your receipt.'); return; }
    setBusy('Opening Paystack…');
    const r = await startCheckout(cfg!, sid, email);
    if (r === 'ok') { setUnlocked(true); setBusy(''); } else setBusy(r);
  };
  return (
    <div class="stack">
      <section class="card">
        <h2>{s.short} Post-UTME practice</h2>
        <PutmeFacts d={d} s={s} />
        <p class="small">Practice timing: {spq} seconds per question{s.put && s.put.q && s.put.min ? ` (same pace as ${s.put.q} questions in ${s.put.min} minutes)` : ' (the school does not publish a question count, so we use 1 minute each)'}.</p>
        {best && <p class="pill">Your best: {best.c}/{best.n}</p>}
      </section>
      <a class="btn primary big" href={`#/postutme/${sid}/t/free`}><span>Free timed practice</span><small>5 questions · {Math.ceil((5 * spq) / 60)} min · with explanations</small></a>
      {unlocked ? (
        <a class="btn big" href={`#/postutme/${sid}/t/full`}><span>Full pack: 20 questions ✓</span><small>Unlocked · {Math.ceil((20 * spq) / 60)} min timed test</small></a>
      ) : (
        <section class="card premium big">
          <h3>🔓 Full {s.short} pack: 20 questions</h3>
          <p class="small">All 20 questions in one timed test like the real thing, with explanations. One-time {cfg ? '₦' + cfg.price.toLocaleString() : '₦700'}, no subscription.</p>
          <p class="muted small">Original practice questions written by CrackIt, not the school's official past paper. Not affiliated with {s.short}, JAMB, WAEC or NECO.</p>
          {!cfg ? <p class="muted small">Checking…</p> : cfg.enabled ? (
            <form onSubmit={buy} class="payform">
              <input type="email" placeholder="Your email (for the receipt)" value={email} onInput={e => setEmail((e.target as HTMLInputElement).value)} />
              <button class="btn primary" type="submit">Pay ₦{cfg.price.toLocaleString()} with Paystack</button>
              {cfg.mode === 'test' && <small class="muted">Test mode: no real money moves.</small>}
              <small class="muted">By paying you agree to the <a href="/terms/">Terms and refund policy</a>. Under 18? Ask a parent or guardian first. Problem with a payment? Email {APP.contact}.</small>
            </form>
          ) : <p class="soon">💳 Payments coming soon. Enjoy the free questions for now.</p>}
          {busy && <p class="small warn">{busy}</p>}
        </section>
      )}
      <a class="btn" href={`#/admission/${sid}`}>🎯 Check my {s.short} admission chances</a>
    </div>
  );
}
function PutmeFacts({ d, s }: { d: Adm; s: School }) {
  const p = s.put;
  if (!p) return <p class="small">Official format: {NP}. Our practice uses English, Maths and General paper.</p>;
  return (
    <>
      <p class="small"><b>Latest published format ({yr(p.yr)}):</b> {p.mode}{p.q ? `, ${p.q} questions` : ''}{p.min ? `, ${p.min} minutes` : ''}.{!p.q ? ' Number of questions not published.' : ''}</p>
      {p.subj && <p class="small">Subjects: {p.subj.join(', ')}</p>}
      <SrcLink d={d} i={p.s} />
    </>
  );
}
function PutmeTest({ d, sid, mode }: { d: Adm; sid: string; mode: 'free' | 'full' }) {
  const s = d.schools.find(x => x.id === sid)!;
  const [qs, setQs] = useState<PQ[] | null>(null);
  const [ans, setAns] = useState<Record<number, number>>({});
  const [cur, setCur] = useState(0);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(Date.now());
  const start = useRef(Date.now());
  const spq = s ? secsPerQ(s) : 60;
  useEffect(() => {
    fetch(`/data/postutme/${sid}.json`).then(r => r.json()).then(j => {
      const free: PQ[] = j.free; const paid = unlockedPack(sid);
      setQs(mode === 'full' && paid ? [...free, ...paid] : free); start.current = Date.now();
    }).catch(() => setQs([]));
  }, [sid, mode]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!s) return null;
  if (!qs) return <div class="loading"><div class="spin" />Loading…</div>;
  if (!qs.length) return <div class="card">Could not load questions. Check your connection. <a href={`#/postutme/${sid}`}>Back</a></div>;
  const total = qs.length * spq * 1000;
  const left = start.current + total - now;
  const finish = () => {
    if (done) return; setDone(true);
    const c = qs.filter((q, k) => ans[k] === q.a).length;
    try { const b = JSON.parse(localStorage.getItem(BKEY(sid)) || 'null'); if (!b || c / qs.length > b.c / b.n) localStorage.setItem(BKEY(sid), JSON.stringify({ c, n: qs.length })); } catch { /* ignore */ }
    window.scrollTo(0, 0);
  };
  if (!done && left <= 0) finish();
  if (done) {
    const c = qs.filter((q, k) => ans[k] === q.a).length;
    return (
      <div class="stack">
        <section class="score">
          <div class="ring" style={{ '--p': c / qs.length } as any}><div><b>{c}</b><span>/ {qs.length}</span></div></div>
          <h2>{c / qs.length >= 0.8 ? 'Excellent! 🎉' : c / qs.length >= 0.6 ? 'Good work!' : 'Keep practising, you are learning.'}</h2>
          <p class="muted">{s.short} Post-UTME practice · {Math.round((Date.now() - start.current) / 1000)} s used</p>
        </section>
        {qs.map((q, k) => (
          <div class="qcard">
            <div class="qmeta">{SUBJ[q.s]} · Question {k + 1}</div>
            <p class="qtext">{q.q}</p>
            <div class="opts static">{q.o.map((o, j) => <div class={'opt' + (j === q.a ? ' right' : j === ans[k] ? ' wrong' : ' dim')}><b>{'ABCD'[j]}</b><span>{o}</span>{j === q.a ? <em>answer</em> : j === ans[k] ? <em>yours</em> : null}</div>)}</div>
            <div class="explain"><div class="explain-h"><b>Why</b></div><p>{q.e}</p></div>
          </div>
        ))}
        <a class="btn primary" href={`#/postutme/${sid}`} data-replace="1">Back to {s.short} practice</a>
      </div>
    );
  }
  const q = qs[cur];
  const mm = Math.max(0, Math.floor(left / 60000)), ss = Math.max(0, Math.floor((left % 60000) / 1000));
  return (
    <div class="stack">
      <div class="row-h">
        <span class="qcount">{s.short} · Question {cur + 1} of {qs.length}</span>
        <span class={'timer' + (left < 60000 ? ' low' : '')}>{mm}:{String(ss).padStart(2, '0')}</span>
      </div>
      <div class="progline in" aria-hidden="true"><i style={{ width: (Object.keys(ans).length / qs.length) * 100 + '%' }} /></div>
      <div class="qcard">
        <div class="qmeta">{SUBJ[q.s]}</div>
        <p class="qtext">{q.q}</p>
        <div class="opts" role="radiogroup">
          {q.o.map((o, j) => <button role="radio" aria-checked={ans[cur] === j} class={'opt' + (ans[cur] === j ? ' picked' : '')} onClick={() => setAns({ ...ans, [cur]: j })}><b>{'ABCD'[j]}</b><span>{o}</span></button>)}
        </div>
        <div class="navbtns">
          <button class="btn" disabled={cur === 0} onClick={() => setCur(cur - 1)}>‹ Previous</button>
          {cur < qs.length - 1 ? <button class="btn primary" onClick={() => setCur(cur + 1)}>Next ›</button> : <button class="btn primary" onClick={() => { if (confirm(`Submit? ${Object.keys(ans).length} of ${qs.length} answered.`)) finish(); }}>Submit</button>}
        </div>
      </div>
      <div class="grid small-grid">{qs.map((_, k) => <button class={(ans[k] !== undefined ? 'ans' : '') + (k === cur ? ' cur' : '')} onClick={() => setCur(k)}>{k + 1}</button>)}</div>
    </div>
  );
}
