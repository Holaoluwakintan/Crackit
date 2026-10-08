// CrackIt WAEC / NECO (SSCE) mode. Loaded on demand, so the JAMB side stays as light as before.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { replace, Calculator, Explain, QText, Skeleton, Ring, setExamGuard, shareText } from '../app';
import { markActive, progress, save, today } from '../store';
import { user } from '../auth';
import type { Q, SubjectData, SubjectMeta } from '../types';
import { EXAMS, GRADES, blankSsce, examDate, creditsSummary, daysUntil, fmtClock, gradeFor, isTimeUp, newExam, paperRule, readiness, recordSsce, scorePaper, studyPlan, SSCE_HISTORY_MAX, timeLeft } from './core.js';
import { buzz, confetti, countUp } from '../fx';
import { track } from '../track';

const L = ['A', 'B', 'C', 'D'];
type ExamId = 'waec' | 'neco';
interface SExam { id: string; exam: ExamId; sid: string; kind: 'paper' | 'quick'; startedAt: number; duration: number; qids: string[]; answers: Record<string, number>; flags: Record<string, 1>; cur: number; submittedAt?: number; timeUp?: boolean }
interface SRec { id: string; exam: ExamId; sid: string; kind: 'paper' | 'quick'; date: number; pct: number; correct: number; total: number; timeUsed: number; e: SExam }

// ---------- data ----------
let metaP: Promise<SubjectMeta[]> | null = null;
export function loadSsceMeta() { return metaP || (metaP = fetch('/data/ssce/index.json').then(r => r.json())); }
const banks: Record<string, Promise<SubjectData>> = {};
export function loadBank(id: string) { return banks[id] || (banks[id] = fetch('/data/ssce/' + id + '.json').then(r => { if (!r.ok) throw new Error('load'); return r.json(); }).catch(e => { delete banks[id]; throw e; })); }
function useSsceMeta() { const [m, setM] = useState<SubjectMeta[] | null>(null); useEffect(() => { loadSsceMeta().then(setM).catch(() => setM([])); }, []); return m; }
function useBank(id: string) {
  const [b, setB] = useState<SubjectData | null>(null); const [err, setErr] = useState(false);
  useEffect(() => { setB(null); setErr(false); loadBank(id).then(setB).catch(() => setErr(true)); }, [id]);
  return { b, err };
}

// ---------- state ----------
interface SState { exam: string; subjects: string[]; date: string; dates: Record<string, string>; cfgTs: number; topics: Record<string, { c: number; n: number }>; seen: Record<string, number>; wrong: Record<string, number>; history: any[] }
export function ss(): SState { const p = progress() as any; if (!p.ssce) p.ssce = blankSsce(); return p.ssce as SState; }
function commit() { save(progress()); }
const EKEY = 'crackit:ssce-exam:v1';
export function loadSExam(): SExam | null { try { const e = JSON.parse(localStorage.getItem(EKEY) || 'null'); return e && !e.submittedAt ? e : null; } catch { return null; } }
function saveSExam(e: SExam | null) { try { e ? localStorage.setItem(EKEY, JSON.stringify(e)) : localStorage.removeItem(EKEY); } catch { /* ignore */ } }
setExamGuard(() => !!loadSExam());
export function examName(x: string) { return (EXAMS as any)[x]?.name || 'WAEC'; }
function short(n: string) { return ({ 'English Language': 'English', 'General Mathematics': 'Maths', 'Literature-in-English': 'Literature', 'Christian Religious Studies': 'CRS', 'Financial Accounting': 'Accounting', 'Agricultural Science': 'Agric', 'Civic Education': 'Civic' } as any)[n] || n; }
const ICON: Record<string, string> = { english: '📖', maths: '➗', civic: '🏛️', biology: '🧬', physics: '⚡', chemistry: '⚗️', agric: '🌱', economics: '📈', government: '⚖️', literature: '🎭', crs: '✝️', commerce: '🏪', accounting: '🧾', geography: '🌍' };

function finish(e: SExam, bank: SubjectData, timeUp = false): SRec {
  e.submittedAt = Date.now(); e.timeUp = timeUp;
  const r = scorePaper(e, bank);
  const p = progress(); const s = ss();
  const byId = new Map(bank.questions.map(q => [q.id, q]));
  for (const id of e.qids) {
    const q = byId.get(id); const a = e.answers[id]; if (!q) continue;
    if (a !== undefined) { recordSsce(s, bank.id, q, a === q.a); p.daily[today()] = (p.daily[today()] || 0) + 1; }
    else s.seen[bank.id + ':' + id] = (s.seen[bank.id + ':' + id] || 0) + 1;
  }
  markActive(p);
  const rec: SRec = { id: e.id, exam: e.exam, sid: e.sid, kind: e.kind, date: e.submittedAt, pct: r.pct, correct: r.correct, total: r.total, timeUsed: Math.min(e.submittedAt - e.startedAt, e.duration), e };
  s.history = [rec, ...s.history.filter((h: any) => h.id !== rec.id)].slice(0, SSCE_HISTORY_MAX) as any;
  commit(); saveSExam(null); track('finish_test', { m: e.exam + '_' + e.kind, v: Math.round(r.pct / 10) * 10 });
  return rec;
}

// ---------- router ----------
export function ssceTitle(parts: string[]) {
  const k = parts[1];
  return k === 'subjects' ? 'Your subjects' : k === 'paper' ? 'Timed paper' : k === 'result' ? 'Your result' : k === 'review' ? 'Review' : k === 'practice' ? 'Practice' : k === 'credits' ? '5 credits tracker' : k === 'premium' ? 'CrackIt Premium' : k === 'papers' ? 'Timed papers' : '';
}
export default function Ssce({ parts, exam }: { parts: string[]; exam: ExamId }) {
  const meta = useSsceMeta();
  if (!meta) return <Skeleton rows={5} />;
  if (!meta.length) return <div class="card">Couldn't load WAEC/NECO subjects. Check your connection and try again.</div>;
  const k = parts[1];
  if (k === 'subjects') return <Subjects meta={meta} exam={exam} />;
  if (k === 'papers') return <Papers meta={meta} exam={exam} />;
  if (k === 'paper') return <PaperSetup meta={meta} sid={parts[2]} exam={exam} />;
  if (k === 'exam') return <ExamRoom meta={meta} />;
  if (k === 'result') return <Result meta={meta} id={parts[2]} />;
  if (k === 'review') return <Review meta={meta} id={parts[2]} filter={parts[3] || 'all'} />;
  if (k === 'practice' && parts[3] !== undefined) return <Practice meta={meta} sid={parts[2]} topic={parts[3]} diff={parts[4] || 'all'} />;
  if (k === 'practice' && parts[2]) return <Topics meta={meta} sid={parts[2]} />;
  if (k === 'credits') return <Credits meta={meta} exam={exam} />;
  if (k === 'premium') return <Premium exam={exam} />;
  return <Home meta={meta} exam={exam} />;
}

// ---------- home ----------
function Home({ meta, exam }: { meta: SubjectMeta[]; exam: ExamId }) {
  const s = ss(); const E = (EXAMS as any)[exam];
  const total = meta.reduce((n, m) => n + m.count, 0);
  const date = examDate(s, exam); const days = daysUntil(date);
  const sum = creditsSummary(s, meta); const plan = studyPlan({ ...s, exam }, meta);
  const pending = loadSExam(); const u = user();
  const last = s.history[0] as any as SRec | undefined;
  const yearSpan = 240; const timePct = days === null ? 0 : Math.max(0.03, Math.min(1, 1 - days / yearSpan));
  return (
    <div class="stack">
      <section class={'hero ssce ' + exam}>
        <div class="hero-glow" aria-hidden="true" />
        {u ? <p class="hi">Welcome back, {u.name.split(' ')[0]} 👋</p> : null}
        <span class="kicker">{E.full} · CBT</span>
        <h1>Sit the {E.name} CBT before the real one.</h1>
        <p>{total.toLocaleString()} new original questions · {meta.length} subjects · grades A1 to F9 · works offline.</p>
        <div class="hero-rings">
          <a class="hring" href="#/ssce/credits">
            <Ring pct={days === null ? 0 : timePct * 100} size={74} stroke={7} cls="gold"><b>{days === null ? '–' : Math.max(0, days)}</b><small>days</small></Ring>
            <span>to {E.name}<small>{fmtDate(date)}</small></span>
          </a>
          <a class="hring" href="#/ssce/credits">
            <Ring pct={(Math.min(5, sum.credits) / 5) * 100} size={74} stroke={7}><b>{sum.credits}<i>/5</i></b><small>credits</small></Ring>
            <span>on track<small>{sum.rows.length ? (sum.engMaths ? 'Eng + Maths ✓' : 'Eng + Maths needed') : 'pick subjects'}</small></span>
          </a>
        </div>
      </section>
      {pending && (
        <a class="card resume pop" href="#/ssce/exam">
          <b>Continue your {short(meta.find(m => m.id === pending.sid)?.name || '')} paper</b>
          <span>{Object.keys(pending.answers).length} answered · {fmtClock(timeLeft(pending))} left</span>
        </a>
      )}
      {!s.subjects.length ? (
        <a class="card cta" href="#/ssce/subjects">
          <b>🎯 Pick your {E.name} subjects</b>
          <span>Choose your 5 to 9 subjects. I'll track your readiness for 5 credits (English and Maths included) and plan every day until exam day.</span>
          <em class="btn sm primary">Pick subjects</em>
        </a>
      ) : <TrackerCard meta={meta} exam={exam} compact />}
      {plan.tasks.length > 0 && <PlanCard plan={plan} exam={exam} />}
      <a class="btn big primary shine" href="#/ssce/papers">
        <span>Sit a timed {E.name} paper</span><small>Real CBT screen: navigator, flag for review, calculator, auto-submit</small>
      </a>
      <div class="duo">
        <a class="card tile" href={'#/ssce/paper/' + (s.subjects[0] || 'english') + '/quick'}><b>⚡ 20 Qs</b><span>Quick test, 15 minutes</span></a>
        <a class="card tile" href="#/ssce/credits"><b>📊 Grades</b><span>Readiness per subject</span></a>
      </div>
      {last && (
        <a class="card lastres" href={'#/ssce/result/' + last.id}>
          <span class={'gchip g' + gradeFor(last.pct).g}>{gradeFor(last.pct).g}</span>
          <span><b>Last paper: {short(meta.find(m => m.id === last.sid)?.name || '')}</b><small>{last.correct}/{last.total} correct · {ago(last.date)}</small></span>
          <em>{last.pct}%</em>
        </a>
      )}
      <PremiumTeaser exam={exam} />
      <section class="card">
        <h3>Practise by subject</h3>
        <div class="subgrid">
          {meta.map(m => {
            const r = readiness(s, m.id, m.topics.length);
            return (
              <a class="subtile" href={'#/ssce/practice/' + m.id}>
                <span class="ic" aria-hidden="true">{ICON[m.id] || '📘'}</span>
                <b>{short(m.name)}</b>
                <small>{m.count} Qs{r.started ? ' · ' + r.grade : ''}</small>
                {r.started && <i class="mini" style={{ width: r.pct + '%' }} />}
              </a>
            );
          })}
        </div>
      </section>
      <p class="muted small center">Objective papers only (the part you sit on the computer). Formats follow recent {E.name} timetables; always confirm yours.</p>
    </div>
  );
}
function fmtDate(d: string) { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function ago(ts: number) { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }

function TrackerCard({ meta, exam, compact = false }: { meta: SubjectMeta[]; exam: ExamId; compact?: boolean }) {
  const s = ss(); const sum = creditsSummary(s, meta);
  const rows = compact ? sum.rows.slice().sort((a: any, b: any) => (b.sid === 'english' || b.sid === 'maths' ? 1 : 0) - (a.sid === 'english' || a.sid === 'maths' ? 1 : 0)) : sum.rows;
  return (
    <section class="card tracker">
      <div class="row-h"><h3>5 credits tracker</h3><a class="linkbtn" href="#/ssce/subjects">Edit</a></div>
      <div class={'trk-sum' + (sum.onTrack ? ' ok' : '')}>
        <div class="dots" aria-label={`${sum.credits} of 5 credits on track`}>{[0, 1, 2, 3, 4].map(i => <i class={i < sum.credits ? 'on' : ''} style={{ animationDelay: i * 70 + 'ms' }} />)}</div>
        <span>{sum.onTrack ? '5 credits on track, English and Maths included 🎉' : `${sum.credits} of 5 credits on track${sum.engMaths ? '' : ' · English and Maths must be credits'}`}</span>
      </div>
      {rows.map((r: any) => (
        <a class="trk-row" href={r.started ? '#/ssce/practice/' + r.sid : '#/ssce/paper/' + r.sid + '/quick'}>
          <span class="ic" aria-hidden="true">{ICON[r.sid] || '📘'}</span>
          <span class="trk-name"><b>{short(r.name)}{(r.sid === 'english' || r.sid === 'maths') && <i class="must">must</i>}</b>
            <span class="pbar"><i class={!r.started ? 'none' : r.credit ? 'ok' : r.pct >= 40 ? 'mid' : 'low'} style={{ width: (r.started ? Math.max(3, r.pct) : 0) + '%' }} /></span>
            <small>{r.started ? `${r.pct}% ready · ${r.answered} answered · ${r.coverage}% of topics` : r.answered ? `${10 - r.answered} more answers for a grade estimate` : 'Not started: take a quick test'}</small></span>
          <span class={'gchip ' + (r.started ? 'g' + r.grade : 'none')}>{r.started ? r.grade : '–'}</span>
        </a>
      ))}
      {!compact && <p class="muted small">Readiness mixes your practice accuracy (counted cautiously until you've answered enough), your last 3 timed papers and how many syllabus topics you've covered. A credit is C6 (50%) or better.</p>}
    </section>
  );
}

function PlanCard({ plan, exam }: { plan: ReturnType<typeof studyPlan>; exam: ExamId }) {
  const E = (EXAMS as any)[exam];
  const phase = plan.phase === 'final' ? 'Final stretch: timed papers every day' : plan.phase === 'mock' ? 'Mock season: mix papers and weak topics' : 'Building phase: cover every topic';
  return (
    <section class="card plan">
      <div class="row-h"><h3>Today's plan</h3><span class="pill">{plan.days === null ? '' : plan.days > 0 ? `${plan.days} days to ${E.name}` : plan.days === 0 ? 'Exam day!' : 'Exam passed'}</span></div>
      <p class="muted small">{phase} · about {plan.perDay} questions a day</p>
      {plan.tasks.map((t: any, i: number) => (
        <a class="task" style={{ animationDelay: i * 60 + 'ms' }} href={t.kind === 'paper' ? '#/ssce/paper/' + t.sid : `#/ssce/practice/${t.sid}/${t.t}`}>
          <span class="ic" aria-hidden="true">{t.kind === 'paper' ? '⏱️' : ICON[t.sid] || '📘'}</span>
          <span><b>{t.kind === 'paper' ? `${t.text}: ${short(t.name)}` : `${short(t.name)}: ${t.topic}`}</b><small>{t.kind === 'paper' ? 'Full time, real exam rules' : t.text + ' · weakest topic first'}</small></span>
          <em>›</em>
        </a>
      ))}
    </section>
  );
}

// ---------- subjects + exam date ----------
function Subjects({ meta, exam }: { meta: SubjectMeta[]; exam: ExamId }) {
  const s = ss(); const E = (EXAMS as any)[exam];
  const [sel, setSel] = useState<string[]>(s.subjects.length ? s.subjects : ['english', 'maths', 'civic']);
  const [date, setDate] = useState(examDate(s, exam));
  const toggle = (id: string) => { buzz(8); setSel(x => x.includes(id) ? (id === 'english' || id === 'maths' ? x : x.filter(y => y !== id)) : x.length >= 9 ? x : [...x, id]); };
  const ok = sel.length >= 5 && sel.length <= 9;
  const saveIt = () => { const st = ss(); st.subjects = sel; st.dates = { ...(st.dates || {}), [exam]: date }; st.date = date; st.exam = exam; st.cfgTs = Date.now(); commit(); confetti(60); replace('/'); };
  return (
    <div class="stack">
      <h2>Your {E.name} subjects</h2>
      <p class="muted">Pick 5 to 9. English and Maths are locked in: almost every course needs credits in both.</p>
      <div class="schips">
        {meta.map(m => {
          const on = sel.includes(m.id); const lock = m.id === 'english' || m.id === 'maths';
          return <button class={'schip' + (on ? ' on' : '') + (lock ? ' lock' : '')} aria-pressed={on} onClick={() => toggle(m.id)}><span aria-hidden="true">{ICON[m.id]}</span>{short(m.name)}{lock && ' 🔒'}</button>;
        })}
      </div>
      <p class={'small ' + (ok ? 'muted' : 'bad')}>{sel.length} selected{sel.length < 5 ? ` · pick ${5 - sel.length} more` : sel.length === 9 ? ' · that is the maximum' : ''}</p>
      <div class="card">
        <h3>Exam day</h3>
        <input class="input" type="date" value={date} min={today()} onInput={e => setDate((e.target as HTMLInputElement).value)} />
        <p class="muted small">{E.dateNote}</p>
      </div>
      <button class="btn primary big center" disabled={!ok} onClick={saveIt}>{ok ? 'Save and build my plan' : 'Pick at least 5 subjects'}</button>
    </div>
  );
}

// ---------- paper picker + setup ----------
function Papers({ meta, exam }: { meta: SubjectMeta[]; exam: ExamId }) {
  const s = ss(); const mine = s.subjects.length ? meta.filter(m => s.subjects.includes(m.id)) : meta;
  const rest = meta.filter(m => !mine.includes(m));
  const row = (m: SubjectMeta) => { const r = paperRule(exam, m.id); return (
    <a class="row link" href={'#/ssce/paper/' + m.id}><span>{ICON[m.id]} {m.name}<small>{r.n} questions · {r.min} min</small></span><em>›</em></a>); };
  return (
    <div class="stack">
      <h2>Timed {examName(exam)} papers</h2>
      <section class="card">{s.subjects.length > 0 && <h3>Your subjects</h3>}{mine.map(row)}</section>
      {rest.length > 0 && <section class="card"><h3>Other subjects</h3>{rest.map(row)}</section>}
    </div>
  );
}
function PaperSetup({ meta, sid, exam }: { meta: SubjectMeta[]; sid: string; exam: ExamId }) {
  const m = meta.find(x => x.id === sid);
  const quickInit = location.hash.endsWith('/quick');
  const [quick, setQuick] = useState(quickInit);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  if (!m) return <div class="card">Subject not found.</div>;
  const E = (EXAMS as any)[exam]; const r = paperRule(exam, sid);
  const n = quick ? 20 : Math.min(r.n, m.count), min = quick ? 15 : r.min;
  const start = async () => {
    setBusy(true); setErr('');
    try { const bank = await loadBank(sid); const e = newExam(exam, bank, quick ? 'quick' : 'paper', ss().seen) as SExam; saveSExam(e); track('start_test', { m: exam + (quick ? '_quick' : '_paper') }); replace('/ssce/exam'); }
    catch { setErr("Couldn't load the questions. Check your connection and try again."); setBusy(false); }
  };
  return (
    <div class="stack">
      <section class={'card paperhead ' + exam}>
        <span class="ic big" aria-hidden="true">{ICON[sid]}</span>
        <div><span class="kicker">{E.full}</span><h2>{m.name}</h2><p class="muted small">Paper 1 · Objective · on computer</p></div>
      </section>
      <div class="seg">
        <button class={!quick ? 'on' : ''} onClick={() => setQuick(false)}>Full paper</button>
        <button class={quick ? 'on' : ''} onClick={() => setQuick(true)}>Quick 20</button>
      </div>
      <div class="facts">
        <div><b>{n}</b><span>questions</span></div><div><b>{min}</b><span>minutes</span></div><div><b>A–D</b><span>options</span></div>
      </div>
      <section class="card">
        <h3>Exam rules</h3>
        <ul class="rules">{E.rules.map((x: string) => <li>{x}</li>)}<li>Flag any question to come back to it. The grid shows answered, flagged and blank questions.</li><li>A calculator is on screen for calculation papers.</li></ul>
        <p class="muted small">Keys: A–D answer · N next · P previous · F flag · S submit</p>
      </section>
      {err && <p class="notice small">{err}</p>}
      <button class="btn primary big center shine" disabled={busy} onClick={start}>{busy ? 'Preparing your paper…' : 'Start exam'}</button>
    </div>
  );
}

// ---------- the CBT exam room ----------
function ExamRoom({ meta }: { meta: SubjectMeta[] }) {
  const [e, setE] = useState<SExam | null>(() => loadSExam());
  const eref = useRef<SExam | null>(e);
  const upd = (x: SExam) => { eref.current = x; setE(x); saveSExam(x); };
  const [bank, setBank] = useState<SubjectData | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirmS] = useState(false); const cref = useRef(false);
  const setConfirm = (v: boolean) => { cref.current = v; setConfirmS(v); };
  const [calc, setCalc] = useState(false); const calcRef = useRef(false); calcRef.current = calc;
  const [grid, setGrid] = useState(false);
  const [toast, setToast] = useState('');
  const warned = useRef<Record<string, boolean>>({});
  const done = useRef(false);
  useEffect(() => { if (!e) { replace('/'); return; } loadBank(e.sid).then(setBank).catch(() => setToast('Questions failed to load. Check your connection.')); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const submit = (timeUp = false) => {
    const x = eref.current; if (!x || !bank || done.current) return;
    done.current = true; const rec = finish({ ...x }, bank, timeUp);
    replace('/ssce/result/' + rec.id + (timeUp ? '/timeup' : ''));
  };
  const left = e ? timeLeft(e, now) : 0;
  useEffect(() => { if (e && bank && isTimeUp(e, now)) submit(true); }, [now, bank]);
  useEffect(() => {
    if (!e) return;
    for (const [ms, msg] of [[600000, '10 minutes left'], [300000, '5 minutes left. Answer every blank: there is no negative marking.'], [60000, '1 minute left!']] as [number, string][]) {
      if (left <= ms && left > 0 && !warned.current[ms] && e.duration > ms * 1.5) { warned.current[ms] = true; setToast(msg); buzz([30, 60, 30]); setTimeout(() => setToast(''), 4000); }
    }
  }, [left]);
  const q: Q | undefined = useMemo(() => (e && bank ? bank.questions.find(x => x.id === e.qids[e.cur]) : undefined), [e, bank]);
  const choose = (o: number) => { const x = eref.current; if (!x) return; buzz(8); upd({ ...x, answers: { ...x.answers, [x.qids[x.cur]]: o } }); };
  const move = (d: number) => { const x = eref.current; if (!x) return; upd({ ...x, cur: Math.max(0, Math.min(x.qids.length - 1, x.cur + d)) }); };
  const jump = (i: number) => { const x = eref.current; if (!x) return; upd({ ...x, cur: i }); setGrid(false); };
  const flag = () => { const x = eref.current; if (!x) return; const id = x.qids[x.cur]; const f = { ...x.flags }; if (f[id]) delete f[id]; else f[id] = 1; buzz(10); upd({ ...x, flags: f }); };
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || calcRef.current) return;
      const k = ev.key.toLowerCase();
      if (cref.current) { if (k === 'y' || k === 'enter') submit(); else if (k === 'n' || k === 'escape') setConfirm(false); return; }
      const ix = L.map(c => c.toLowerCase()).indexOf(k);
      if (ix >= 0) choose(ix); else if (k === 'n' || k === 'arrowright') move(1); else if (k === 'p' || k === 'arrowleft') move(-1);
      else if (k === 'f') flag(); else if (k === 's') setConfirm(true); else return;
      ev.preventDefault();
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  });
  if (!e || !bank || !q) return <div class="exam"><Skeleton rows={4} /></div>;
  const m = meta.find(x => x.id === e.sid); const E = (EXAMS as any)[e.exam];
  const answered = Object.keys(e.answers).length, flagged = Object.keys(e.flags).length, total = e.qids.length;
  const id = q.id; const isFlag = !!e.flags[id]; const last = e.cur === total - 1;
  const u = user(); const cand = u ? u.name : 'Candidate';
  const tcls = left < 300000 ? ' low' : left < 600000 ? ' warn' : '';
  return (
    <div class={'exam cbt ' + e.exam}>
      <div class="cbt-top">
        <div class="cbt-id"><span class="cbt-badge">{E.name}</span><span><b>{short(m?.name || '')}</b><small>{cand} · {e.kind === 'quick' ? 'Quick test' : 'Paper 1 (Objective)'}</small></span></div>
        <div class={'timer' + tcls} role="timer" aria-label="time left">{fmtClock(left)}</div>
      </div>
      <div class="cbt-tools">
        <span class="small"><b>{answered}</b>/{total} answered{flagged ? <> · <b class="flagc">{flagged}</b> flagged</> : null}</span>
        <span class="cbt-btns">
          <button class="iconbtn calcbtn" aria-label="Calculator" onClick={() => setCalc(!calc)}>🧮</button>
          <button class="btn sm ghostb" onClick={() => setGrid(true)} aria-label="Question navigator">▦ Grid</button>
          <button class="btn sm submit" onClick={() => setConfirm(true)}>Submit</button>
        </span>
      </div>
      <div class="progline" aria-hidden="true"><i style={{ width: (answered / total) * 100 + '%' }} /></div>
      {calc && <Calculator onClose={() => setCalc(false)} />}
      <div class="qcard swap" key={id}>
        <div class="qmeta"><span>Question {e.cur + 1} of {total}</span>
          <button class={'flagbtn' + (isFlag ? ' on' : '')} aria-pressed={isFlag} onClick={flag}>{isFlag ? '🚩 Flagged' : '⚑ Flag for review'}</button></div>
        <QText text={q.q} />
        <div class="opts" role="radiogroup">
          {q.o.map((o, i) => (
            <button role="radio" aria-checked={e.answers[id] === i} class={'opt' + (e.answers[id] === i ? ' picked' : '')} onClick={() => choose(i)}>
              <b>{L[i]}</b><span>{o}</span>
            </button>
          ))}
        </div>
        <div class="navbtns">
          <button class="btn" onClick={() => move(-1)} disabled={e.cur === 0}>‹ Previous</button>
          {last ? <button class="btn primary" onClick={() => setConfirm(true)}>Finish</button> : <button class="btn primary" onClick={() => move(1)}>Next ›</button>}
        </div>
      </div>
      <div class="gridwrap inline">
        <NavGrid e={e} onJump={jump} />
        <p class="keys">Keys: <kbd>A</kbd>–<kbd>D</kbd> answer · <kbd>N</kbd>/<kbd>P</kbd> next/previous · <kbd>F</kbd> flag · <kbd>S</kbd> submit</p>
      </div>
      {grid && (
        <div class="modal" onClick={() => setGrid(false)}>
          <div class="sheet up" onClick={ev => ev.stopPropagation()}>
            <div class="row-h"><h3>Question navigator</h3><button class="iconbtn" aria-label="Close" onClick={() => setGrid(false)}>✕</button></div>
            <NavGrid e={e} onJump={jump} />
          </div>
        </div>
      )}
      {toast && <div class="toast" role="status">{toast}</div>}
      {confirm && (
        <div class="modal" onClick={() => setConfirm(false)}>
          <div class="sheet up" onClick={ev => ev.stopPropagation()}>
            <h3>Submit your paper?</h3>
            <p>You've answered <b>{answered}</b> of {total}.{answered < total ? ` ${total - answered} still blank: there's no negative marking, so guess if you must.` : ''}</p>
            {flagged > 0 && <p class="small">🚩 {flagged} flagged for review.</p>}
            <p class="muted small">{fmtClock(left)} left on the clock.</p>
            <div class="navbtns">
              <button class="btn" onClick={() => setConfirm(false)}>Go back <kbd>N</kbd></button>
              <button class="btn primary" onClick={() => submit()}>Submit <kbd>Y</kbd></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function NavGrid({ e, onJump }: { e: SExam; onJump: (i: number) => void }) {
  return (
    <>
      <div class="legend"><span><i class="lg ans" />Answered</span><span><i class="lg flg" />Flagged</span><span><i class="lg" />Not answered</span></div>
      <div class="grid">
        {e.qids.map((id, i) => <button aria-label={`Question ${i + 1}`} class={(e.answers[id] !== undefined ? 'ans' : '') + (e.flags[id] ? ' flg' : '') + (i === e.cur ? ' cur' : '')} onClick={() => onJump(i)}>{i + 1}</button>)}
      </div>
    </>
  );
}

// ---------- result ----------
function findRec(id: string): SRec | undefined { return (ss().history as any as SRec[]).find(h => h.id === id); }
function Result({ meta, id }: { meta: SubjectMeta[]; id: string }) {
  const rec = findRec(id);
  const { b: bank } = useBank(rec ? rec.sid : 'english');
  const [shown, setShown] = useState(0);
  const timeUp = location.hash.endsWith('/timeup');
  useEffect(() => {
    if (!rec) return;
    const stop = countUp(setShown, rec.pct, 1100);
    const g = gradeFor(rec.pct);
    const t = setTimeout(() => { if (g.credit) { confetti(g.g === 'A1' ? 140 : 80); buzz([20, 40, 20]); } }, 1000);
    return () => { stop(); clearTimeout(t); };
  }, [id]);
  if (!rec) return <div class="card">That result isn't on this phone.</div>;
  const m = meta.find(x => x.id === rec.sid); const g = gradeFor(rec.pct); const gs = gradeFor(shown);
  const E = (EXAMS as any)[rec.exam];
  const r = bank ? scorePaper(rec.e, bank) : null;
  const tops = r ? Object.entries(r.topics).map(([t, v]: any) => ({ t: +t, name: m?.topics[+t]?.name || '', ...v, acc: v.c / v.n })).sort((a, b) => a.acc - b.acc) : [];
  const flagged = Object.keys(rec.e.flags || {}).length; const answered = Object.keys(rec.e.answers).length;
  const verdict = g.g === 'A1' ? 'Outstanding. That is an A1 pace.' : g.credit ? `That's a credit. Push for ${nextUp(String(g.g))} next.` : rec.pct >= 40 ? 'A pass, but not yet a credit. You are close.' : 'Not a credit yet. Work on the weak topics below and try again.';
  return (
    <div class="stack">
      {timeUp && <p class="notice small">⏰ Time up! Your paper was submitted automatically, just like the real CBT.</p>}
      <section class={'card resultcard ' + (g.credit ? 'credit' : 'nocredit')}>
        <span class="kicker">{E.full} · {m?.name}</span>
        <div class="res-main">
          <Ring pct={shown} size={132} stroke={11} cls={g.credit ? '' : 'warm'}><b class="big">{shown}%</b><small>{rec.correct}/{rec.total}</small></Ring>
          <div class="res-grade">
            <small>You'd likely score</small>
            <span class={'grade-badge g' + gs.g + (shown === rec.pct ? ' pop' : '')}>{gs.g}</span>
            <b>{g.label}{g.credit && g.label !== 'Credit' ? ' · a credit' : ''}</b>
          </div>
        </div>
        <p class="verdict">{verdict}</p>
        <GradeScale pct={rec.pct} />
        <p class="muted small">Estimate from this objective paper only. In the real exam your theory/essay paper counts too, so treat this as your pace, not a promise.</p>
      </section>
      <div class="facts">
        <div><b>{answered}</b><span>answered</span></div><div><b>{fmtClock(rec.timeUsed)}</b><span>time used</span></div><div><b>{flagged}</b><span>flagged</span></div>
      </div>
      {tops.length > 0 && (
        <section class="card">
          <h3>Topic breakdown</h3>
          {tops.map(t => (
            <a class="topicbar" href={`#/ssce/practice/${rec.sid}/${t.t}`}>
              <span><b>{t.name}</b><small>{t.c}/{t.n}</small></span>
              <span class="pbar"><i class={t.acc >= .5 ? 'ok' : t.acc >= .4 ? 'mid' : 'low'} style={{ width: Math.max(4, t.acc * 100) + '%' }} /></span>
            </a>
          ))}
        </section>
      )}
      <a class="btn primary" href={'#/ssce/review/' + rec.id}>Review answers with explanations</a>
      <div class="duo">
        <a class="btn" href={'#/ssce/paper/' + rec.sid}>Another paper</a>
        <button class="btn" onClick={() => shareText(`I just scored ${rec.pct}% (${g.g}) in a ${E.name} ${short(m?.name || '')} CBT mock on CrackIt 🔥 Can you beat me? Free WAEC/NECO CBT practice:`)}>Share result</button>
      </div>
    </div>
  );
}
function nextUp(g: string) { const i = GRADES.findIndex(x => x[1] === g); return i > 0 ? String(GRADES[i - 1][1]) : 'A1'; }
function GradeScale({ pct }: { pct: number }) {
  const g = gradeFor(pct).g;
  return <div class="gscale" aria-label={'Grade scale, you are at ' + g}>{(GRADES as any[]).slice().reverse().map((x: any) => <span class={'g' + String(x[1]) + (x[1] === g ? ' here' : '')}>{x[1]}<small>{x[0]}+</small></span>)}</div>;
}

// ---------- review ----------
function Review({ meta, id, filter }: { meta: SubjectMeta[]; id: string; filter: string }) {
  const rec = findRec(id); const { b: bank } = useBank(rec ? rec.sid : 'english');
  if (!rec) return <div class="card">That result isn't on this phone.</div>;
  if (!bank) return <Skeleton rows={4} />;
  const byId = new Map(bank.questions.map(q => [q.id, q]));
  const items = rec.e.qids.map((qid, i) => ({ i, q: byId.get(qid)!, a: rec.e.answers[qid], f: !!(rec.e.flags || {})[qid] })).filter(x => x.q);
  const show = items.filter(x => filter === 'wrong' ? x.a !== x.q.a : filter === 'flagged' ? x.f : true);
  const nw = items.filter(x => x.a !== x.q.a).length, nf = items.filter(x => x.f).length;
  return (
    <div class="stack">
      <div class="seg">
        <a href={`#/ssce/review/${id}/all`} data-replace="1" class={filter === 'all' ? 'on' : ''}>All {items.length}</a>
        <a href={`#/ssce/review/${id}/wrong`} data-replace="1" class={filter === 'wrong' ? 'on' : ''}>Wrong {nw}</a>
        <a href={`#/ssce/review/${id}/flagged`} data-replace="1" class={filter === 'flagged' ? 'on' : ''}>Flagged {nf}</a>
      </div>
      {show.length === 0 && <p class="card center muted">Nothing here. 👌</p>}
      {show.map(x => (
        <article class="card rv">
          <div class="qmeta"><span>Q{x.i + 1} · {meta.find(m => m.id === rec.sid)?.topics[x.q.t]?.name}</span>{x.f && <span>🚩</span>}<Diff d={x.q.d} /></div>
          <QText text={x.q.q} />
          <div class="opts">
            {x.q.o.map((o, i) => <div class={'opt static' + (i === x.q.a ? ' right' : i === x.a ? ' wrong' : '')}><b>{L[i]}</b><span>{o}</span></div>)}
          </div>
          {x.a === undefined && <p class="small bad">Not answered</p>}
          <Explain q={x.q} />
        </article>
      ))}
    </div>
  );
}
function Diff({ d }: { d: string }) { return <span class={'diff d' + d}>{d === 'e' ? 'Easy' : d === 'h' ? 'Hard' : 'Medium'}</span>; }

// ---------- practice ----------
function Topics({ meta, sid }: { meta: SubjectMeta[]; sid: string }) {
  const m = meta.find(x => x.id === sid); const s = ss();
  const [diff, setDiff] = useState('all');
  if (!m) return <div class="card">Subject not found.</div>;
  const r = readiness(s, sid, m.topics.length);
  const nWrong = Object.keys(s.wrong).filter(k => k.startsWith(sid + ':') && (s.wrong as any)[k] > 0).length;
  return (
    <div class="stack">
      <section class="card subjhead">
        <Ring pct={r.pct} size={64} stroke={6}><b>{r.started ? r.grade : '–'}</b></Ring>
        <div><h2>{m.name}</h2><p class="muted small">{m.count} questions · {m.topics.length} WAEC syllabus topics{r.started ? ` · ${r.pct}% ready` : ''}</p></div>
      </section>
      <div class="seg">{[['all', 'All'], ['e', 'Easy'], ['m', 'Medium'], ['h', 'Hard']].map(([k, l]) => <button class={diff === k ? 'on' : ''} onClick={() => setDiff(k)}>{l}</button>)}</div>
      <div class="duo">
        <a class="btn primary" href={`#/ssce/practice/${sid}/all/${diff}`}>Mixed practice</a>
        <a class="btn" href={'#/ssce/paper/' + sid}>Timed paper</a>
      </div>
      {nWrong > 0 && <a class="card tile row-h" href={`#/ssce/practice/${sid}/wrong`}><b>❌ Retry my {nWrong} wrong answer{nWrong > 1 ? 's' : ''}</b><em>›</em></a>}
      <section class="card">
        <h3>Topics</h3>
        {m.topics.map((t, i) => {
          const x = (s.topics as any)[sid + ':' + i]; const acc = x && x.n ? Math.round((x.c / x.n) * 100) : null;
          return (
            <a class={'row link' + (t.count ? '' : ' off')} href={t.count ? `#/ssce/practice/${sid}/${i}/${diff}` : undefined}>
              <span>{t.name}<small>{t.count} questions{x ? ` · ${x.n} done` : ''}</small></span>
              <em class={acc === null ? '' : acc >= 50 ? 'good' : 'bad'}>{acc === null ? '›' : acc + '%'}</em>
            </a>
          );
        })}
      </section>
    </div>
  );
}
const SESSION = 10;
function Practice({ meta, sid, topic, diff }: { meta: SubjectMeta[]; sid: string; topic: string; diff: string }) {
  const { b: bank, err } = useBank(sid);
  const [qs, setQs] = useState<Q[] | null>(null);
  const [i, setI] = useState(0); const [pick, setPick] = useState<number | null>(null); const [right, setRight] = useState(0);
  const [round, setRound] = useState(0);
  const m = meta.find(x => x.id === sid);
  useEffect(() => {
    if (!bank) return;
    const s = ss(); let pool = bank.questions;
    if (topic === 'wrong') { const w = new Set(Object.keys(s.wrong).filter(k => k.startsWith(sid + ':') && (s.wrong as any)[k] > 0).map(k => k.split(':')[1])); pool = pool.filter(q => w.has(q.id)); }
    else if (topic !== 'all') pool = pool.filter(q => q.t === +topic);
    if (diff !== 'all') { const f = pool.filter(q => q.d === diff); if (f.length) pool = f; }
    pool = pool.slice().sort(() => Math.random() - .5).sort((a, b) => ((s.seen as any)[sid + ':' + a.id] || 0) - ((s.seen as any)[sid + ':' + b.id] || 0));
    setQs(pool.slice(0, SESSION)); setI(0); setPick(null); setRight(0);
  }, [bank, topic, diff, round]);
  if (err) return <div class="card">Couldn't load questions. Check your connection.</div>;
  if (!bank || !qs || !m) return <Skeleton rows={4} />;
  if (!qs.length) return <div class="card center">Nothing to practise here yet. 🎉 <a href={'#/ssce/practice/' + sid}>Back to topics</a></div>;
  if (i >= qs.length) return <SessionEnd right={right} total={qs.length} sid={sid} again={() => setRound(x => x + 1)} />;
  const q = qs[i]; const answered = pick !== null;
  const answer = (o: number) => {
    if (answered) return;
    setPick(o); const ok = o === q.a; if (ok) setRight(x => x + 1);
    buzz(ok ? 15 : [40, 50, 40]);
    const p = progress(); recordSsce(ss(), sid, q, ok); p.daily[today()] = (p.daily[today()] || 0) + 1; markActive(p); p.practiced++; if (ok) p.practiceCorrect++; commit();
  };
  const tname = topic === 'all' ? 'Mixed' : topic === 'wrong' ? 'Wrong answers' : m.topics[+topic]?.name;
  return (
    <div class="stack">
      <div class="practop"><span class="small muted">{short(m.name)} · {tname}</span><span class="small"><b>{i + 1}</b>/{qs.length}</span></div>
      <div class="progline r" aria-hidden="true"><i style={{ width: ((i + (answered ? 1 : 0)) / qs.length) * 100 + '%' }} /></div>
      <div class="qcard swap" key={q.id}>
        <div class="qmeta"><span>{m.topics[q.t]?.name}</span><Diff d={q.d} /></div>
        <QText text={q.q} />
        <div class="opts">
          {q.o.map((o, k) => (
            <button class={'opt' + (answered ? (k === q.a ? ' right reveal' : k === pick ? ' wrong shake' : ' dim') : '')} disabled={answered} onClick={() => answer(k)}>
              <b>{answered && k === q.a ? '✓' : answered && k === pick ? '✕' : L[k]}</b><span>{o}</span>
            </button>
          ))}
        </div>
        {answered && <div class={'fb ' + (pick === q.a ? 'ok' : 'no')}>{pick === q.a ? praise(i) : `Not quite. The answer is ${L[q.a]}.`}</div>}
        {answered && <Explain q={q} />}
        {answered && <button class="btn primary wide" onClick={() => { setI(i + 1); setPick(null); }}>{i + 1 >= qs.length ? 'See my score' : 'Next question ›'}</button>}
      </div>
    </div>
  );
}
function praise(i: number) { return ['Correct! 🎯', 'Nailed it ✅', 'Sharp! 🔥', 'Correct. Keep going 💪', 'Exactly right ⭐'][i % 5]; }
function SessionEnd({ right, total, sid, again }: { right: number; total: number; sid: string; again: () => void }) {
  const pct = Math.round((right / total) * 100); const [shown, setShown] = useState(0);
  useEffect(() => { const stop = countUp(setShown, pct, 900); if (pct >= 80) setTimeout(() => confetti(), 700); return stop; }, []);
  const g = gradeFor(pct);
  return (
    <div class="stack center">
      <section class="card resultcard credit">
        <div class="res-main center"><Ring pct={shown} size={120} stroke={10} cls={g.credit ? '' : 'warm'}><b class="big">{right}/{total}</b><small>{shown}%</small></Ring></div>
        <p class="verdict">{pct >= 80 ? 'Excellent session! 🎉' : pct >= 50 ? 'Credit pace. Keep it up.' : 'Keep going: every miss is a lesson.'}</p>
      </section>
      <button class="btn primary" onClick={again}>Another 10</button>
      <a class="btn" href={'#/ssce/practice/' + sid}>Back to topics</a>
    </div>
  );
}

// ---------- tracker page ----------
function Credits({ meta, exam }: { meta: SubjectMeta[]; exam: ExamId }) {
  const s = ss(); const plan = studyPlan({ ...s, exam }, meta); const E = (EXAMS as any)[exam];
  if (!s.subjects.length) return <div class="stack"><p class="card">Pick your subjects first so I can track your credits.</p><a class="btn primary" href="#/ssce/subjects">Pick subjects</a></div>;
  return (
    <div class="stack">
      <section class="card countdown">
        <Ring pct={plan.days === null ? 0 : Math.max(3, 100 - (plan.days / 240) * 100)} size={88} stroke={8} cls="gold"><b class="big">{Math.max(0, plan.days || 0)}</b><small>days</small></Ring>
        <div><h2>{E.name} countdown</h2><p class="muted small">Exam day {fmtDate(examDate(s, exam))}. <a href="#/ssce/subjects">Change</a></p></div>
      </section>
      <TrackerCard meta={meta} exam={exam} />
      {plan.tasks.length > 0 && <PlanCard plan={plan} exam={exam} />}
      <section class="card">
        <h3>How {E.name} grades work</h3>
        <GradeScale pct={-1} />
        <p class="muted small">A1 to C6 are credits. D7 and E8 are passes. F9 is a fail. Most universities need 5 credits, including English and Maths, in not more than two sittings.</p>
      </section>
    </div>
  );
}

// ---------- premium (built, OFF) ----------
function PremiumTeaser({ exam }: { exam: ExamId }) {
  return (
    <a class="card premium" href="#/ssce/premium">
      <span class="crown" aria-hidden="true">👑</span>
      <span><b>CrackIt Premium · {examName(exam)} season pass</b><small>Unlimited timed papers, full grade reports, and a no-wahala unlock tied to your Google account. Coming soon.</small></span>
    </a>
  );
}
function Premium({ exam }: { exam: ExamId }) {
  const [cfg, setCfg] = useState<{ enabled: boolean; price: number } | null>(null);
  const [noted, setNoted] = useState(() => localStorage.getItem('crackit:premium-interest') === '1');
  useEffect(() => { import('../admission/pay').then(x => x.payConfig()).then(c => setCfg(c)).catch(() => setCfg({ enabled: false, price: 0 })); }, []);
  const feats = ['Unlimited full timed papers in every subject', 'Detailed grade report per topic, with a study plan that adapts', 'All explanations in English and Pidgin', 'Works on any phone: the unlock lives in your Google account, no activation codes, no receipts', 'JAMB + WAEC + NECO in one app'];
  return (
    <div class="stack">
      <section class="card premium big">
        <span class="crown" aria-hidden="true">👑</span>
        <h2>CrackIt Premium</h2>
        <p class="muted">{examName(exam)} season pass · one payment for the whole exam season</p>
        <ul class="rules ticks">{feats.map(f => <li>{f}</li>)}</ul>
        <button class="btn primary big center" disabled>Coming soon</button>
        <p class="muted small center">{cfg && cfg.enabled ? 'Payments are being tested.' : 'Payments are not switched on yet. Everything here is free while we finish it.'}</p>
      </section>
      <button class="btn" disabled={noted} onClick={() => { localStorage.setItem('crackit:premium-interest', '1'); setNoted(true); confetti(40); }}>{noted ? "✓ You're on the early list" : 'Tell me when it launches'}</button>
    </div>
  );
}
export type { ComponentChildren };
