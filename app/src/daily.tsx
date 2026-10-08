// Daily-5: five mixed questions a day for the chosen exam, a streak, a results card, a challenge link,
// and an opt-in reminder. Loaded on demand (like the WAEC/NECO and admission screens).
import { useEffect, useState } from 'preact/hooks';
import { APP } from './config';
import type { D5Rec, Q, SubjectData, SubjectMeta } from './types';
import { loadMeta, loadSubject } from './data';
import { markActive, progress, recordAnswer, save, today } from './store';
import { recordSsce, blankSsce } from './ssce/core.js';
import { d5Best, d5Streak, decodeChallenge, encodeChallenge, normSubjects, pickDaily } from './daily-core.js';
import { Explain, QText, Skeleton, SITE, mode, replace, setMode, shareText, shareUrl } from './app';
import { user } from './auth';
import { track } from './track';

type X = 'jamb' | 'waec' | 'neco';
const L = ['A', 'B', 'C', 'D'];
const CUR = APP.storageKey + ':d5:cur';
const SUBJ = APP.storageKey + ':d5subj:';
const NAMEON = APP.storageKey + ':cardname';
export const REMIND = APP.storageKey + ':remind';
interface Cur { date: string; x: X; s: string[]; q: [string, string][]; a: number[]; vs?: { n: string; c: number } }

// ---------- banks ----------
let ssceMetaP: Promise<SubjectMeta[]> | null = null;
const ssceBanks: Record<string, Promise<SubjectData>> = {};
function metaFor(x: X): Promise<SubjectMeta[]> {
  if (x === 'jamb') return loadMeta();
  return ssceMetaP || (ssceMetaP = fetch('/data/ssce/index.json').then(r => r.json()).catch(e => { ssceMetaP = null; throw e; }));
}
function bankFor(x: X, sid: string): Promise<SubjectData> {
  if (x === 'jamb') return loadSubject(sid);
  return ssceBanks[sid] || (ssceBanks[sid] = fetch('/data/ssce/' + sid + '.json').then(r => { if (!r.ok) throw new Error('load'); return r.json(); }).catch(e => { delete ssceBanks[sid]; throw e; }));
}
async function banksFor(x: X, sids: string[]) {
  const out: Record<string, SubjectData> = {};
  await Promise.all(sids.map(s => bankFor(x, s).then(b => { out[s] = b; })));
  return out;
}
export function short(n: string) { return n === 'Use of English' || n === 'English Language' ? 'English' : n === 'Mathematics' || n === 'General Mathematics' ? 'Maths' : n === 'Literature-in-English' || n === 'Literature in English' ? 'Literature' : n === 'Government' ? 'Govt' : n === 'Christian Religious Studies' ? 'CRS' : n === 'Principles of Accounts' || n === 'Financial Accounting' ? 'Accounts' : n === 'Agricultural Science' ? 'Agric' : n === 'Civic Education' ? 'Civic' : n; }
export const EXAM_NAME: Record<X, string> = { jamb: 'JAMB', waec: 'WAEC', neco: 'NECO' };

function defaultSubjects(x: X, avail: string[]): string[] {
  try { const s = JSON.parse(localStorage.getItem(SUBJ + x) || 'null'); if (Array.isArray(s) && s.length) return normSubjects(s, avail); } catch { /* ignore */ }
  const p = progress() as any;
  if (x === 'jamb') { const h = p.history && p.history[0]; if (h && h.exam) return normSubjects(h.exam.subjects.map((s: any) => s.sid), avail); }
  else if (p.ssce && p.ssce.subjects && p.ssce.subjects.length) return normSubjects(p.ssce.subjects, avail);
  return normSubjects(['maths', 'biology', x === 'jamb' ? 'chemistry' : 'economics'], avail);
}

// ---------- streak + reminder state (also mirrored for the service worker) ----------
export function d5Today(): D5Rec | undefined { return (progress().d5 || {})[today()]; }
export function d5StreakNow() { return d5Streak(progress().d5 || {}, today()); }
export function writeSwState() {
  try {
    if (!('caches' in window)) return;
    const s = { done: Object.keys(progress().d5 || {}).sort().pop() || '', streak: d5StreakNow(), remind: localStorage.getItem(REMIND) === '1' ? 1 : 0 };
    caches.open('crackit-state').then(c => c.match('/__d5state').then(r => (r ? r.json() : {})).then((old: any) => c.put('/__d5state', new Response(JSON.stringify({ ...s, last: old && old.last }), { headers: { 'Content-Type': 'application/json' } })))).catch(() => {});
  } catch { /* ignore */ }
}
export async function enableReminder(): Promise<'on' | 'install' | 'denied' | 'unsupported'> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  localStorage.setItem(REMIND, '1'); writeSwState(); track('remind_on');
  const reg: any = await navigator.serviceWorker.ready;
  let periodic = false;
  if (reg.periodicSync) { try { await reg.periodicSync.register('crackit-d5', { minInterval: 12 * 3600 * 1000 }); periodic = true; } catch { /* only installed apps get this */ } }
  try { await reg.showNotification('Daily 5 reminders are on ✅', { body: periodic ? "On days you haven't done your Daily 5, I'll send one gentle nudge in the afternoon." : 'Install CrackIt on your home screen so reminders can reach you, or add a calendar reminder.', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'd5-on' }); } catch { /* ignore */ }
  return periodic ? 'on' : 'install';
}
export async function disableReminder() {
  localStorage.removeItem(REMIND); writeSwState();
  try { const reg: any = await navigator.serviceWorker.ready; if (reg.periodicSync) await reg.periodicSync.unregister('crackit-d5'); } catch { /* ignore */ }
}
function calendarFile() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CrackIt//Daily5//EN', 'BEGIN:VEVENT', 'UID:crackit-daily5-' + ds + '@crackit-ng.vercel.app',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', 'DTSTART:' + ds + 'T190000', 'DURATION:PT5M', 'RRULE:FREQ=DAILY',
    'SUMMARY:CrackIt Daily 5 (2 minutes)', 'DESCRIPTION:Keep your streak: ' + SITE + '/#/daily', 'URL:' + SITE + '/#/daily',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:CrackIt Daily 5', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'crackit-daily-5.ics';
  document.body.appendChild(a); a.click(); a.remove();
}
export function ReminderCard({ compact = false }: { compact?: boolean }) {
  const [on, setOn] = useState(localStorage.getItem(REMIND) === '1');
  const [msg, setMsg] = useState('');
  const turnOn = async () => {
    const r = await enableReminder();
    if (r === 'on') { setOn(true); setMsg(''); }
    else if (r === 'install') { setOn(true); setMsg('Reminders reach you best when CrackIt is installed (menu ⋮ → Add to Home screen). You can also add a daily calendar reminder:'); }
    else if (r === 'denied') setMsg('Notifications are blocked for CrackIt. You can allow them in your browser settings, or add a calendar reminder instead:');
    else setMsg("This browser can't show reminders. Add a daily calendar reminder instead:");
  };
  return (
    <section class={'card remind' + (compact ? ' compact' : '')}>
      {on ? (
        <div class="row-h"><span>🔔 Daily reminder is on</span><button class="linkbtn" onClick={() => { disableReminder(); setOn(false); setMsg(''); }}>Turn off</button></div>
      ) : (
        <div class="row-h"><span>🔔 Want a gentle nudge tomorrow?</span><button class="btn sm" onClick={turnOn}>Remind me</button></div>
      )}
      {msg && <p class="muted small">{msg} <button class="linkbtn" onClick={calendarFile}>Add to calendar</button></p>}
      {!on && !msg && !compact && <p class="muted small">Only if you say yes. One notification on days you haven't done your Daily 5. No spam, turn it off any time.</p>}
    </section>
  );
}

// ---------- page ----------
function readCur(): Cur | null { try { const c = JSON.parse(localStorage.getItem(CUR) || 'null'); return c && c.date === today() ? c : null; } catch { return null; } }
function writeCur(c: Cur | null) { try { c ? localStorage.setItem(CUR, JSON.stringify(c)) : localStorage.removeItem(CUR); } catch { /* ignore */ } }

export default function Daily({ parts }: { parts: string[] }) {
  const ex = ['jamb', 'waec', 'neco'].includes(parts[1]) ? (parts[1] as X) : null;
  useEffect(() => { if (ex) { setMode(ex); replace('/daily'); } }, [ex]);
  if (ex) return <Skeleton rows={3} />;
  const challenge = parts[1] === 'c' ? (decodeChallenge(parts.slice(2).join('/')) as Ch | null) : null;
  if (parts[1] === 'c' && !challenge) return <div class="card">This challenge link looks broken. <a href="#/daily">Do today's Daily 5 instead</a></div>;
  if (challenge) return <ChallengeIntro ch={challenge} />;
  return <DailyHome />;
}

interface Ch { x: X; d: string; n: string; c: number; q: [string, string][] }
function ChallengeIntro({ ch }: { ch: Ch }) {
  const [meta, setMeta] = useState<SubjectMeta[] | null>(null);
  useEffect(() => { track('challenge_open', { m: ch.x }); metaFor(ch.x as X).then(setMeta).catch(() => setMeta([])); }, []);
  const done = d5Today();
  const start = () => {
    const cur: Cur = { date: today(), x: ch.x as X, s: [...new Set(ch.q.map(p => p[0]))], q: ch.q as [string, string][], a: [], vs: { n: ch.n || 'Your friend', c: ch.c } };
    writeCur(cur); track('d5_start', { m: 'challenge' }); replace('/daily');
  };
  const names = [...new Set(ch.q.map(p => p[0]))].map(s => short(meta?.find(m => m.id === s)?.name || s));
  return (
    <div class="stack">
      <section class="hero d5hero">
        <span class="kicker">⚔️ {EXAM_NAME[ch.x as X]} Daily 5 challenge</span>
        <h1>{ch.n || 'A friend'} scored {ch.c}/{ch.q.length}. Can you beat that?</h1>
        <p>Same {ch.q.length} questions: {names.join(' · ')}. About 2 minutes, free, no sign-up.</p>
      </section>
      {done && <p class="muted center">You've already done today's Daily 5 ({done.c}/{done.n}). This one is just for bragging rights.</p>}
      <button class="btn primary big center" onClick={start}>Accept the challenge</button>
      <a class="btn center" href="#/daily">Do my own Daily 5 instead</a>
    </div>
  );
}

function DailyHome() {
  const x = mode() as X;
  const [meta, setMeta] = useState<SubjectMeta[] | null>(null);
  const [err, setErr] = useState(false);
  const [cur, setCur] = useState<Cur | null>(readCur());
  const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { metaFor(x).then(m => { setMeta(m); setSel(defaultSubjects(x, m.filter(s => s.count).map(s => s.id))); }).catch(() => setErr(true)); }, [x]);
  if (err) return <div class="card">Couldn't load the questions. Check your connection and try again.</div>;
  const rec = d5Today();
  if (cur && !(rec && !cur.vs)) return <Play cur={cur} onDone={() => { setCur(null); tick(t => t + 1); }} />;
  if (rec) return <ResultView rec={rec} meta={meta} />;
  if (!meta) return <Skeleton rows={4} />;
  const avail = meta.filter(m => m.count);
  const toggle = (id: string) => setSel(s => id === 'english' ? s : s.includes(id) ? s.filter(v => v !== id) : s.length >= 4 ? s : [...s, id]);
  const start = async () => {
    if (sel.length < 2) return;
    setBusy(true);
    try {
      localStorage.setItem(SUBJ + x, JSON.stringify(sel));
      const banks = await banksFor(x, sel);
      const q = pickDaily(banks, sel, today(), x) as [string, string][];
      const c: Cur = { date: today(), x, s: sel, q, a: [] };
      writeCur(c); track('d5_start', { m: x }); setCur(c);
    } catch { setErr(true); } finally { setBusy(false); }
  };
  const st = d5StreakNow();
  return (
    <div class="stack">
      <section class="hero d5hero">
        <span class="kicker">{EXAM_NAME[x]} · {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        <h1>Today's Daily 5 🔥</h1>
        <p>5 mixed questions, about 2 minutes. Do it every day to keep your streak{st ? `: you're on ${st} ${st === 1 ? 'day' : 'days'}` : ''}.</p>
      </section>
      <section class="card">
        <div class="row-h"><h3>Your subjects</h3>{!edit && <button class="linkbtn" onClick={() => setEdit(true)}>Change</button>}</div>
        {edit ? (
          <div class="chips">
            {avail.map(m => <button class={'chip' + (sel.includes(m.id) ? ' on' : '') + (m.id === 'english' ? ' locked' : '')} onClick={() => toggle(m.id)}>{short(m.name)}</button>)}
            <p class="muted small">English is always in. Pick up to 3 more.</p>
            <button class="btn sm" onClick={() => setEdit(false)}>Done</button>
          </div>
        ) : <p>{sel.map(s => short(avail.find(m => m.id === s)?.name || s)).join(' · ')}</p>}
      </section>
      <button class="btn primary big center" disabled={busy || sel.length < 2} onClick={start}>{busy ? 'Loading…' : 'Start my Daily 5'}</button>
      <p class="muted small center">Everyone with the same subjects gets the same 5 today, so you can challenge friends.</p>
    </div>
  );
}

function Play({ cur, onDone }: { cur: Cur; onDone: () => void }) {
  const [banks, setBanks] = useState<Record<string, SubjectData> | null>(null);
  const [err, setErr] = useState(false);
  const [i, setI] = useState(cur.a.length);
  const [ans, setAns] = useState<number | undefined>();
  useEffect(() => { banksFor(cur.x, [...new Set(cur.q.map(p => p[0]))]).then(setBanks).catch(() => setErr(true)); }, []);
  if (err) return <div class="card">Couldn't load the questions. Check your connection and try again.</div>;
  if (!banks) return <Skeleton rows={4} />;
  const qs: { sid: string; q: Q }[] = cur.q.map(([sid, id]) => ({ sid, q: banks[sid]?.questions.find(q => q.id === id)! })).filter(x => x.q);
  if (!qs.length) { writeCur(null); return <div class="card">These questions are no longer in the app. <a href="#/daily" onClick={() => onDone()}>Start a fresh Daily 5</a></div>; }
  const it = qs[Math.min(i, qs.length - 1)];
  const choose = (o: number) => {
    if (ans !== undefined) return;
    setAns(o);
    const ok = o === it.q.a; const p = progress() as any;
    if (cur.x === 'jamb') recordAnswer(p, it.sid, it.q, ok);
    else { if (!p.ssce) p.ssce = blankSsce(); recordSsce(p.ssce, it.sid, it.q, ok); const t = today(); p.daily[t] = (p.daily[t] || 0) + 1; }
    markActive(p); save(p);
    cur.a = [...cur.a.slice(0, i), o]; writeCur(cur);
  };
  const next = () => {
    if (i + 1 < qs.length) { setI(i + 1); setAns(undefined); window.scrollTo(0, 0); return; }
    const c = qs.reduce((n, x, k) => n + (cur.a[k] === x.q.a ? 1 : 0), 0);
    const p = progress();
    const d5 = p.d5 || (p.d5 = {});
    const prev = d5[cur.date];
    const r: D5Rec = { x: cur.x, c, n: qs.length, s: cur.s, q: qs.map(x => [x.sid, x.q.id]), a: cur.a.slice(0, qs.length), ...(cur.vs ? { vs: cur.vs } : {}) };
    if (!prev || (cur.vs && !prev.vs)) d5[cur.date] = prev && cur.vs ? { ...prev, vs: { n: cur.vs.n, c: cur.vs.c } } : r;
    save(p); writeCur(null); writeSwState();
    track('d5_done', { m: cur.vs ? 'challenge' : cur.x, v: c });
    if (cur.vs) { sessionStorage.setItem(APP.storageKey + ':vs', JSON.stringify({ c, n: qs.length, vs: cur.vs, x: cur.x, q: r.q, a: r.a, s: r.s })); }
    onDone();
  };
  const q = it.q;
  const answered = ans !== undefined ? ans : cur.a[i];
  return (
    <div class="stack">
      {cur.vs && <p class="pill center">⚔️ Score to beat: {cur.vs.n} {cur.vs.c}/{qs.length}</p>}
      <div class="d5dots" aria-label={`Question ${i + 1} of ${qs.length}`}>{qs.map((x, k) => <i class={k < i || (k === i && answered !== undefined) ? (cur.a[k] === x.q.a ? 'ok' : 'no') : k === i ? 'now' : ''} />)}</div>
      <div class="qcard">
        <div class="qhead"><div class="qmeta">{i + 1} of {qs.length} · {short(banks[it.sid].name)} · {banks[it.sid].topics[q.t]}</div></div>
        <QText text={q.q} />
        <div class="opts">
          {q.o.map((o, k) => {
            const cls = answered === undefined ? '' : k === q.a ? ' right' : k === answered ? ' wrong' : ' dim';
            return <button class={'opt' + cls} onClick={() => choose(k)} disabled={answered !== undefined}><b>{L[k]}</b><span>{o}</span></button>;
          })}
        </div>
        {answered !== undefined && (
          <>
            <div class={'verdict ' + (answered === q.a ? 'good' : 'bad')}>{answered === q.a ? 'Correct! ✓' : `Not quite. The answer is ${L[q.a]}.`}</div>
            <Explain q={q} />
            <button class="btn primary big center" onClick={next}>{i + 1 < qs.length ? 'Next question ›' : 'See my result'}</button>
          </>
        )}
      </div>
    </div>
  );
}

export function verdictFor(c: number, n: number) { const r = c / Math.max(1, n); return r === 1 ? 'Perfect score! 🏆' : r >= 0.8 ? 'Sharp! 🔥' : r >= 0.6 ? 'Good work 💪' : r >= 0.4 ? 'Getting there 📈' : 'Tomorrow is a new chance 🌱'; }
function firstName(): string { const p = progress(); if (p.name) return p.name; const u = user(); return u && u.name ? u.name.split(' ')[0].slice(0, 24) : ''; }

function ResultView({ rec, meta }: { rec: D5Rec; meta: SubjectMeta[] | null }) {
  const vsRaw = sessionStorage.getItem(APP.storageKey + ':vs');
  const vs = vsRaw ? JSON.parse(vsRaw) : null;
  const shown = vs || rec; // a challenge just played shows its own score
  const [banks, setBanks] = useState<Record<string, SubjectData> | null>(null);
  const [open, setOpen] = useState(-1);
  useEffect(() => { banksFor(shown.x, [...new Set((shown.q as [string, string][]).map(p => p[0]))]).then(setBanks).catch(() => {}); }, []);
  const st = d5StreakNow(); const best = d5Best(progress().d5 || {});
  const c: number = shown.c, n: number = shown.n;
  const subjNames = (shown.s as string[]).map(s => short(meta?.find(m => m.id === s)?.name || banks?.[s]?.name || s)).join(' · ');
  const challengePath = '/daily/c/' + encodeChallenge({ x: shown.x, d: today(), n: firstName(), c, q: shown.q });
  const sendChallenge = () => {
    const nm = firstName();
    const msg = `⚔️ I got ${c}/${n} on today's ${EXAM_NAME[shown.x as X]} Daily 5 on ${APP.name}${vs ? ` (${vs.vs.n} got ${vs.vs.c})` : ''}. Same 5 questions, 2 minutes. Can you beat me?`;
    shareText(msg, shareUrl('/daily/c/' + encodeChallenge({ x: shown.x, d: today(), n: nm, c, q: shown.q }))); track('share', { m: 'd5_challenge' });
  };
  return (
    <div class="stack">
      {vs && (
        <section class="card vs">
          <div class="vs-row"><div><b>{vs.c}<small>/{vs.n}</small></b><span>You</span></div><em>vs</em><div><b>{vs.vs.c}<small>/{vs.n}</small></b><span>{vs.vs.n}</span></div></div>
          <h3>{vs.c > vs.vs.c ? 'You win! 🏆' : vs.c === vs.vs.c ? "It's a draw 🤝" : `${vs.vs.n} wins this round 😅`}</h3>
        </section>
      )}
      <section class="score d5score">
        <div class="ring" style={{ '--p': c / Math.max(1, n) } as any}><div><b>{c}</b><span>/ {n}</span></div></div>
        <h2>{verdictFor(c, n)}</h2>
        <p class="muted">{EXAM_NAME[shown.x as X]} Daily 5 · {subjNames}</p>
        <div class="stats d5stats">
          <div><b>{st}</b><span>day streak {st ? '🔥' : ''}</span></div>
          <div><b>{best}</b><span>best streak</span></div>
        </div>
      </section>
      <CardShare c={c} n={n} streak={st} x={shown.x} subjects={subjNames} dots={(shown.q as any[]).map((_, k) => banks ? shown.a[k] === banks[shown.q[k][0]]?.questions.find(q => q.id === shown.q[k][1])?.a : false)} ready={!!banks} challengePath={challengePath} />
      <button class="btn challenge big center" onClick={sendChallenge}>⚔️ Challenge a friend (same 5 questions)</button>
      <ReminderCard />
      {banks && (
        <section class="card">
          <h3>Your answers</h3>
          {(shown.q as [string, string][]).map(([sid, id], k) => {
            const q = banks[sid]?.questions.find(x => x.id === id); if (!q) return null;
            const ok = shown.a[k] === q.a;
            return (
              <div class="d5row">
                <button class="row link" onClick={() => setOpen(open === k ? -1 : k)}><span>{ok ? '✅' : '❌'} {q.q.length > 70 ? q.q.slice(0, 68) + '…' : q.q}<small>{short(banks[sid].name)}</small></span><em>{open === k ? '▲' : '▼'}</em></button>
                {open === k && <div class="d5open"><QText text={q.q} /><p><b>Answer: {L[q.a]}. {q.o[q.a]}</b>{!ok && shown.a[k] !== undefined ? <span class="muted"> (you chose {L[shown.a[k]]})</span> : null}</p><Explain q={q} /></div>}
              </div>
            );
          })}
        </section>
      )}
      <p class="muted center">Next Daily 5 unlocks tomorrow. Want more today?</p>
      <div class="navbtns">
        <a class="btn" href={shown.x === 'jamb' ? '#/mock/quick' : '#/ssce'}>Quick test</a>
        <a class="btn" href={shown.x === 'jamb' ? '#/practice' : '#/ssce'}>Practise a topic</a>
      </div>
    </div>
  );
}

export function CardShare({ c, n, streak, x, subjects, dots, ready = true, challengePath, kicker = "TODAY'S DAILY 5", unit }: { c: number; n: number; streak?: number; x: string; subjects: string; dots?: boolean[]; ready?: boolean; challengePath: string; kicker?: string; unit?: string }) {
  const [nameOn, setNameOn] = useState(localStorage.getItem(NAMEON) === '1');
  const [img, setImg] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [note, setNote] = useState('');
  const name = nameOn ? firstName() : '';
  useEffect(() => {
    if (!ready) return;
    let url = '';
    import('./scorecard').then(m => m.cardBlob({ kicker, score: c, total: n, unit, verdict: verdictFor(c, n), streak, subjects, exam: EXAM_NAME[x as X] || x.toUpperCase(), name, dots, site: SITE.replace(/^https?:\/\//, '') })).then(b => { setBlob(b); url = URL.createObjectURL(b); setImg(url); }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [ready, nameOn, c, n, streak]);
  const toggleName = () => {
    if (!nameOn && !firstName()) {
      const v = (prompt('Your first name (shown on the card):') || '').trim().split(/\s+/)[0];
      if (!v) return; const p = progress(); p.name = v.slice(0, 24); save(p);
    }
    localStorage.setItem(NAMEON, nameOn ? '0' : '1'); setNameOn(!nameOn);
  };
  const doShare = async () => {
    if (!blob) return;
    const m = await import('./scorecard');
    const r = await m.shareCard(blob, `I scored ${c}/${n} on ${APP.name}${streak ? ` 🔥 ${streak}-day streak` : ''}. Can you beat me?`, shareUrl(challengePath));
    track('card_share', { m: r });
    setNote(r === 'fallback' ? 'Saved the card to your phone. Post it on your Status, then paste the link that opened in WhatsApp.' : r === 'shared' ? 'Shared ✅' : '');
  };
  return (
    <section class="card cardshare">
      <div class="cs-row">
        {img ? <img src={img} alt={`Score card: ${c} out of ${n}`} width={108} height={192} /> : <div class="cs-ph" />}
        <div>
          <b>Post it on your WhatsApp Status</b>
          <span class="muted small">A ready-made card with your score{streak ? ' and streak' : ''}, plus a link so friends can try the same questions.</span>
          <label class="check small"><input type="checkbox" checked={nameOn} onChange={toggleName} /> Show my first name</label>
        </div>
      </div>
      <button class="btn primary" disabled={!blob} onClick={doShare}>📲 Share score card</button>
      {note && <p class="muted small">{note}</p>}
    </section>
  );
}
