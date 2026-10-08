import { APP } from './config';
import type { Exam, MockRecord, Progress, Q, SubjectData, SubjectResult } from './types';

const PKEY = APP.storageKey + ':progress:v1';
const EKEY = APP.storageKey + ':exam:v1';

export function blank(): Progress {
  return { history: [], topics: {}, days: [], seen: {}, pidgin: false, practiced: 0, practiceCorrect: 0, bm: {}, wrong: {}, daily: {}, goal: 20 };
}
type SaveHook = (p: Progress) => void;
const saveHooks = new Set<SaveHook>();
export function onSave(f: SaveHook) { saveHooks.add(f); return () => { saveHooks.delete(f); }; }
let cache: Progress | null = null;
export function progress(): Progress {
  if (cache) return cache;
  try { cache = { ...blank(), ...JSON.parse(localStorage.getItem(PKEY) || '{}') }; } catch { cache = blank(); }
  return cache!;
}
export function replaceProgress(p: Progress) { cache = { ...blank(), ...p }; save(cache, true); }
export function save(p: Progress = progress(), quiet = false) {
  cache = p;
  if (!quiet) saveHooks.forEach(f => { try { f(p); } catch { /* ignore */ } });
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch {
    // storage full: drop the oldest detailed records and retry once
    p.history = p.history.slice(0, 10);
    try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { /* ignore */ }
  }
}
export function resetProgress(quiet = false) { cache = blank(); save(cache, quiet); }

export function today(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function markActive(p: Progress) {
  const t = today();
  if (!p.days.includes(t)) { p.days.push(t); if (p.days.length > 400) p.days = p.days.slice(-400); }
}
export function streak(p: Progress = progress()): number {
  const set = new Set(p.days);
  const d = new Date();
  if (!set.has(today(d))) { d.setDate(d.getDate() - 1); if (!set.has(today(d))) return 0; }
  let n = 0;
  while (set.has(today(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function bestScore(p: Progress = progress(), mode: 'full' | 'quick' = 'full') {
  return p.history.filter(h => h.mode === mode).reduce((m, h) => Math.max(m, h.total), -1);
}
export function recordAnswer(p: Progress, sid: string, q: Q, correct: boolean) {
  const k = sid + ':' + q.t;
  const s = p.topics[k] || (p.topics[k] = { c: 0, n: 0 });
  s.n++; if (correct) s.c++;
  const sk = sid + ':' + q.id;
  p.seen[sk] = (p.seen[sk] || 0) + 1;
  const now = Date.now();
  if (!correct) p.wrong[sk] = now;
  else if ((p.wrong[sk] || 0) > 0) p.wrong[sk] = -now;
  const t = today(); p.daily[t] = (p.daily[t] || 0) + 1;
  const keys = Object.keys(p.daily); if (keys.length > 120) { keys.sort(); for (const k of keys.slice(0, keys.length - 120)) delete p.daily[k]; }
}
export function isOn(m: Record<string, number>, k: string) { return (m[k] || 0) > 0; }
export function toggleBookmark(p: Progress, sid: string, qid: string) {
  const k = sid + ':' + qid; p.bm[k] = isOn(p.bm, k) ? -Date.now() : Date.now(); save(p); return isOn(p.bm, k);
}
export function activeKeys(m: Record<string, number>, sid?: string) {
  return Object.keys(m).filter(k => m[k] > 0 && (!sid || k.startsWith(sid + ':'))).sort((a, b) => m[b] - m[a]);
}
export function todayCount(p: Progress = progress()) { return p.daily[today()] || 0; }
export function weakTopics(p: Progress, metaName: (sid: string, t: number) => string | undefined) {
  return Object.entries(p.topics)
    .filter(([, s]) => s.n >= 3 && s.c / s.n < 0.6)
    .map(([k, s]) => { const [sid, t] = k.split(':'); return { sid, t: +t, acc: s.c / s.n, n: s.n, name: metaName(sid, +t) || '' }; })
    .filter(x => x.name)
    .sort((a, b) => a.acc - b.acc);
}

// ---- exams ----
export function loadExam(): Exam | null {
  try { const e = JSON.parse(localStorage.getItem(EKEY) || 'null'); return e && !e.submittedAt ? e : null; } catch { return null; }
}
export function saveExam(e: Exam | null) {
  try { if (e) localStorage.setItem(EKEY, JSON.stringify(e)); else localStorage.removeItem(EKEY); } catch { /* ignore */ }
}

export function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
/** pick n questions, preferring ones seen least, spread across topics */
export function pick(data: SubjectData, n: number, p: Progress, topic?: number, diff?: string, only?: Set<string>): Q[] {
  let pool = data.questions.filter(q => (topic === undefined || q.t === topic) && (!diff || diff === 'all' || q.d === diff) && (!only || only.has(q.id)));
  pool = shuffle(pool).sort((a, b) => (p.seen[data.id + ':' + a.id] || 0) - (p.seen[data.id + ':' + b.id] || 0));
  if (topic !== undefined) return pool.slice(0, n);
  // round-robin over topics among the least-seen so a mock covers the syllabus
  const byTopic = new Map<number, Q[]>();
  for (const q of pool) { if (!byTopic.has(q.t)) byTopic.set(q.t, []); byTopic.get(q.t)!.push(q); }
  const lists = shuffle([...byTopic.values()]);
  const out: Q[] = [];
  while (out.length < n && lists.some(l => l.length)) for (const l of lists) { const q = l.shift(); if (q && out.length < n) out.push(q); }
  return shuffle(out);
}

export function grade(e: Exam, subjects: Record<string, SubjectData>): SubjectResult[] {
  return e.subjects.map(s => {
    const data = subjects[s.sid];
    const byId = new Map(data.questions.map(q => [q.id, q]));
    let correct = 0;
    for (const id of s.qids) { const q = byId.get(id); if (q && e.answers[s.sid + ':' + id] === q.a) correct++; }
    const total = s.qids.length;
    return { sid: s.sid, correct, total, score: total ? Math.round((correct / total) * 100) : 0 };
  });
}
export function finishExam(e: Exam, subjects: Record<string, SubjectData>): MockRecord {
  e.submittedAt = Date.now();
  const per = grade(e, subjects);
  const p = progress();
  for (const s of e.subjects) {
    const byId = new Map(subjects[s.sid].questions.map(q => [q.id, q]));
    for (const id of s.qids) {
      const q = byId.get(id)!; const ans = e.answers[s.sid + ':' + id];
      if (ans !== undefined) recordAnswer(p, s.sid, q, ans === q.a);
      else { const sk = s.sid + ':' + id; p.seen[sk] = (p.seen[sk] || 0) + 1; }
    }
  }
  markActive(p);
  const rec: MockRecord = { id: e.id, date: e.submittedAt, mode: e.mode, timeUsed: Math.min(e.submittedAt - e.startedAt, e.duration), total: per.reduce((t, s) => t + s.score, 0), per, exam: e };
  p.history.unshift(rec);
  if (p.history.length > 40) p.history = p.history.slice(0, 40);
  save(p); saveExam(null);
  return rec;
}
