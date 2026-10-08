// CrackIt SSCE (WAEC / NECO) core logic: pure functions, no DOM. Unit-tested in test/ssce.test.mjs.

/** Exam rules. Objective (Paper 1) only: that is the part sat on the computer.
 *  Sources (checked Oct 7, 2026): WAEC syllabus: English Paper 1 = 80 objective questions in 1 hour;
 *  most WASSCE objective papers run about 1 hour (waectimetable.com); NECO cut English objectives from 100 to 80 from 2026 (legit.ng);
 *  NECO objective papers are usually 60 questions. Times for each subject follow recent timetables; candidates should confirm on their own timetable. */
export const EXAMS = {
  waec: {
    id: 'waec', name: 'WAEC', full: 'WASSCE (WAEC)', color: '#0b5d3b',
    date: '2027-05-11', dateNote: 'Proposed start of WASSCE 2027 (not yet official). Set your own date.',
    def: { n: 50, min: 60 },
    papers: { english: { n: 80, min: 60 }, maths: { n: 50, min: 90 }, physics: { n: 50, min: 75 }, biology: { n: 50, min: 50 }, agric: { n: 50, min: 50 }, civic: { n: 50, min: 50 }, geography: { n: 50, min: 50 }, commerce: { n: 50, min: 50 } },
    rules: ['One subject per sitting, answered on the computer', 'Four options (A–D), one correct answer', 'No negative marking: never leave a question blank', 'The paper submits itself when the time is up'],
  },
  neco: {
    id: 'neco', name: 'NECO', full: 'SSCE (NECO)', color: '#1d4ed8',
    date: '2027-06-14', dateNote: 'Estimated: NECO SSCE usually starts in June. Set your own date.',
    def: { n: 60, min: 60 },
    papers: { english: { n: 80, min: 60 }, maths: { n: 60, min: 90 } },
    rules: ['One subject per sitting, answered on the computer', 'Four options (A–D), one correct answer', 'No negative marking: answer every question', 'The paper submits itself when the time is up'],
  },
};
export function paperRule(exam, sid) { const e = EXAMS[exam] || EXAMS.waec; return { ...e.def, ...(e.papers[sid] || {}) }; }

/** WAEC and NECO both grade on the nine-point scale. */
export const GRADES = [
  [75, 'A1', 'Excellent'], [70, 'B2', 'Very good'], [65, 'B3', 'Good'], [60, 'C4', 'Credit'], [55, 'C5', 'Credit'],
  [50, 'C6', 'Credit'], [45, 'D7', 'Pass'], [40, 'E8', 'Pass'], [0, 'F9', 'Fail'],
];
export function gradeFor(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const row = GRADES.find(g => p >= g[0]);
  return { g: row[1], label: row[2], credit: p >= 50, min: row[0] };
}

// ---------- timer ----------
export function timeLeft(e, now = Date.now()) { return Math.max(0, e.startedAt + e.duration - now); }
export function isTimeUp(e, now = Date.now()) { return !e.submittedAt && now >= e.startedAt + e.duration; }
export function fmtClock(ms) {
  ms = Math.max(0, ms); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0');
}

// ---------- papers ----------
function shuffle(a, rnd = Math.random) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
/** pick n questions: first one from each syllabus topic (least-seen), then fill with the least-seen questions, spread across topics */
export function pickPaper(bank, n, seen = {}, opts = {}) {
  const rnd = opts.rnd || Math.random;
  const sc = q => seen[bank.id + ':' + q.id] || 0;
  let pool = bank.questions.filter(q => (opts.topic === undefined || q.t === opts.topic) && (!opts.diff || opts.diff === 'all' || q.d === opts.diff));
  pool = shuffle(pool, rnd).sort((a, b) => sc(a) - sc(b));
  const by = new Map();
  for (const q of pool) { if (!by.has(q.t)) by.set(q.t, []); by.get(q.t).push(q); }
  const out = [];
  for (const l of shuffle([...by.values()], rnd)) if (out.length < n && l.length) out.push(l.shift());
  const rest = [];
  for (const l of by.values()) l.forEach((q, i) => rest.push({ q, k: sc(q) * 1000 + i + rnd() * 0.5 }));
  rest.sort((a, b) => a.k - b.k);
  for (const r of rest) { if (out.length >= n) break; out.push(r.q); }
  return shuffle(out, rnd);
}
export function newExam(exam, bank, kind, seen, now = Date.now(), rnd) {
  const r = paperRule(exam, bank.id);
  const n = kind === 'quick' ? 20 : Math.min(r.n, bank.questions.length);
  const min = kind === 'quick' ? 15 : r.min;
  return { id: 's' + now.toString(36), exam, sid: bank.id, kind, startedAt: now, duration: min * 60000,
    qids: pickPaper(bank, n, seen, { rnd }).map(q => q.id), answers: {}, flags: {}, cur: 0 };
}
/** score a paper: overall %, grade, topic breakdown */
export function scorePaper(e, bank) {
  const byId = new Map(bank.questions.map(q => [q.id, q]));
  let correct = 0, answered = 0; const topics = {};
  for (const id of e.qids) {
    const q = byId.get(id); if (!q) continue;
    const a = e.answers[id]; const ok = a === q.a;
    if (a !== undefined) answered++;
    if (ok) correct++;
    const t = topics[q.t] || (topics[q.t] = { c: 0, n: 0 }); t.n++; if (ok) t.c++;
  }
  const total = e.qids.length; const pct = total ? Math.round((correct / total) * 100) : 0;
  return { correct, answered, total, pct, grade: gradeFor(pct), topics };
}

// ---------- SSCE progress (lives inside the synced progress object as p.ssce) ----------
export function blankSsce() { return { exam: 'waec', subjects: [], date: '', dates: {}, cfgTs: 0, topics: {}, seen: {}, wrong: {}, history: [] }; }
export const SSCE_HISTORY_MAX = 30;
/** record one answered question */
export function recordSsce(s, sid, q, correct, now = Date.now()) {
  const k = sid + ':' + q.t; const t = s.topics[k] || (s.topics[k] = { c: 0, n: 0 }); t.n++; if (correct) t.c++;
  const sk = sid + ':' + q.id; s.seen[sk] = (s.seen[sk] || 0) + 1;
  if (!correct) s.wrong[sk] = now; else if ((s.wrong[sk] || 0) > 0) s.wrong[sk] = -now;
}
function mergeNum(a = {}, b = {}, mode) { const o = { ...a }; for (const k in b) o[k] = mode === 'sum' ? (o[k] || 0) + b[k] : Math.max(o[k] || 0, b[k]); return o; }
function mergeLww(a = {}, b = {}) { const o = { ...a }; for (const k in b) { const x = o[k], y = b[k]; if (x === undefined || Math.abs(y) > Math.abs(x)) o[k] = y; } return o; }
function mergeTopics(a = {}, b = {}, mode) {
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || { c: 0, n: 0 }, y = b[k] || { c: 0, n: 0 };
    o[k] = mode === 'sum' ? { c: x.c + y.c, n: x.n + y.n } : { c: Math.max(x.c, y.c), n: Math.max(x.n, y.n) };
  }
  return o;
}
export function mergeSsce(local, remote, mode = 'max') {
  if (!local && !remote) return undefined;
  const a = { ...blankSsce(), ...(local || {}) }, b = { ...blankSsce(), ...(remote || {}) };
  const cfg = (a.cfgTs || 0) >= (b.cfgTs || 0) ? a : b;
  const hist = new Map(); for (const h of [...b.history, ...a.history]) if (h && h.id) hist.set(h.id, h);
  return {
    exam: cfg.exam, subjects: cfg.subjects, date: cfg.date, dates: { ...(cfg === a ? b.dates : a.dates), ...(cfg.dates || {}) }, cfgTs: cfg.cfgTs || 0,
    topics: mergeTopics(a.topics, b.topics, mode), seen: mergeNum(a.seen, b.seen, mode), wrong: mergeLww(a.wrong, b.wrong),
    history: [...hist.values()].sort((x, y) => y.date - x.date).slice(0, SSCE_HISTORY_MAX),
  };
}

// ---------- readiness: the 5-credits tracker ----------
/** readiness 0-100 for one subject, from practice accuracy (shrunk toward 40% when there is little data), topic coverage and recent papers */
export function readiness(s, sid, topicCount) {
  let c = 0, n = 0, covered = 0;
  for (let t = 0; t < topicCount; t++) { const x = s.topics[sid + ':' + t]; if (x) { c += x.c; n += x.n; if (x.n >= 3) covered++; } }
  const papers = (s.history || []).filter(h => h.sid === sid && h.kind === 'paper').slice(0, 3);
  const prior = 40, k = 15;
  const acc = n ? ((c + prior / 100 * k) / (n + k)) * 100 : null;
  const paper = papers.length ? papers.reduce((m, h) => m + h.pct, 0) / papers.length : null;
  const coverage = topicCount ? covered / topicCount : 0;
  if ((acc === null || n < 10) && paper === null) return { pct: 0, grade: null, credit: false, coverage: Math.round((topicCount ? covered / topicCount : 0) * 100), answered: n, papers: 0, started: false };
  let base = acc !== null && paper !== null ? 0.45 * acc + 0.55 * paper : (acc !== null ? acc : paper);
  base = base * (0.85 + 0.15 * coverage);
  const pct = Math.round(Math.max(0, Math.min(100, base)));
  const g = gradeFor(pct);
  return { pct, grade: g.g, credit: g.credit, coverage: Math.round(coverage * 100), answered: n, papers: papers.length, started: true };
}
export function creditsSummary(s, metaList) {
  const rows = (s.subjects || []).map(sid => { const m = metaList.find(x => x.id === sid); return { sid, name: m ? m.name : sid, ...readiness(s, sid, m ? m.topics.length : 0) }; });
  const credits = rows.filter(r => r.credit).length;
  const engMaths = ['english', 'maths'].every(sid => { const r = rows.find(x => x.sid === sid); return r && r.credit; });
  return { rows, credits, engMaths, onTrack: credits >= 5 && engMaths };
}

// ---------- countdown + study plan ----------
/** the exam day this student set for WAEC or NECO, else the default */
export function examDate(s, exam) { return (s.dates && s.dates[exam]) || (s.exam === exam && s.date) || (EXAMS[exam] || EXAMS.waec).date; }
export function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function daysUntil(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number); const t = new Date(y, m - 1, d);
  const n0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - n0) / 86400000);
}
/** today's plan: weakest subjects first, English and Maths always in rotation, a timed paper every 7th day */
export function studyPlan(s, metaList, now = new Date()) {
  const sum = creditsSummary(s, metaList);
  const days = daysUntil(examDate(s, s.exam), now);
  const rows = sum.rows.slice().sort((a, b) => a.pct - b.pct);
  if (!rows.length) return { days, tasks: [], phase: 'setup', perDay: 0 };
  const phase = days === null ? 'build' : days <= 14 ? 'final' : days <= 60 ? 'mock' : 'build';
  const dayNo = Math.floor(now.getTime() / 86400000);
  const perDay = phase === 'final' ? 60 : phase === 'mock' ? 45 : 30;
  const tasks = [];
  const must = ['english', 'maths'].filter(sid => rows.find(r => r.sid === sid));
  const weak = rows.filter(r => !must.includes(r.sid));
  const pickTopic = (sid) => {
    const m = metaList.find(x => x.id === sid); if (!m) return null;
    let best = null;
    m.topics.forEach((tp, t) => { const x = s.topics[sid + ':' + t]; const acc = x && x.n ? x.c / x.n : -1; const score = x && x.n >= 3 ? acc : -1 + (x ? x.n : 0) * 0.01; if (best === null || score < best.score) best = { t, name: tp.name, score }; });
    return best;
  };
  const today = [];
  if (must.length) today.push(must[dayNo % must.length]);
  if (weak.length) today.push(weak[dayNo % Math.min(2, weak.length)].sid);
  if (rows.length > 2) today.push(rows[(dayNo + 2) % rows.length].sid);
  const uniq = [...new Set(today)];
  if ((dayNo % 7 === 6 || phase === 'final') && uniq.length) {
    const sid = uniq[0]; const m = metaList.find(x => x.id === sid);
    tasks.push({ kind: 'paper', sid, name: m ? m.name : sid, text: 'Sit a full timed paper' });
  }
  const per = Math.max(10, Math.round(perDay / Math.max(1, uniq.length) / 5) * 5);
  for (const sid of uniq) {
    const tp = pickTopic(sid); const m = metaList.find(x => x.id === sid);
    tasks.push({ kind: 'topic', sid, t: tp ? tp.t : 0, name: m ? m.name : sid, topic: tp ? tp.name : '', n: per, text: `${per} questions` });
  }
  return { days, tasks, phase, perDay };
}
