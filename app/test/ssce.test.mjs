// WAEC / NECO (SSCE) mode: bank schema, answer keys, exam rules, timer + auto-submit, grades, tracker, sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAMS, paperRule, gradeFor, timeLeft, isTimeUp, fmtClock, pickPaper, newExam, scorePaper, blankSsce, recordSsce, mergeSsce, readiness, creditsSummary, studyPlan, daysUntil } from '../src/ssce/core.js';
import { mergeProgress, hasProgress } from '../src/sync-core.js';

const D = new URL('../public/data/ssce/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('index.json', D)));
const banks = Object.fromEntries(meta.map(m => [m.id, JSON.parse(readFileSync(new URL(m.id + '.json', D)))]));
const jamb = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url)));

test('SSCE bank: at least 1,200 questions across at least 10 subjects, English + Maths + Civic compulsory', () => {
  const total = meta.reduce((n, m) => n + m.count, 0);
  assert.ok(total >= 1200, 'total ' + total);
  assert.ok(meta.length >= 10);
  for (const id of ['english', 'maths', 'physics', 'chemistry', 'biology', 'economics', 'government', 'literature', 'civic', 'agric']) assert.ok(banks[id], id);
  for (const id of ['english', 'maths', 'civic']) assert.ok(meta.find(m => m.id === id).compulsory, id);
  for (const m of meta) {
    assert.equal(m.count, banks[m.id].questions.length, m.id);
    assert.equal(m.topics.reduce((n, t) => n + t.count, 0), m.count, m.id + ' topic counts add up');
    assert.ok(m.count >= 80, m.id + ' has enough for a paper');
  }
});
test('SSCE schema: 4 distinct options, valid key, difficulty, syllabus topic, English + Pidgin explanation', () => {
  for (const [sid, b] of Object.entries(banks)) for (const q of b.questions) {
    const w = sid + ':' + q.id;
    assert.match(q.id, /^w[a-z]{3}\d{4}$/, w);
    assert.equal(q.o.length, 4, w); assert.equal(new Set(q.o.map(o => o.trim())).size, 4, w);
    assert.ok(Number.isInteger(q.a) && q.a >= 0 && q.a < 4, w);
    assert.ok(['e', 'm', 'h'].includes(q.d), w);
    assert.ok(Number.isInteger(q.t) && q.t >= 0 && q.t < b.topics.length, w);
    assert.ok(q.e && q.e.length > 20, w + ' English explanation');
    assert.ok(q.p && q.p.length > 20, w + ' Pidgin explanation');
    assert.ok(!/(all|none) of the above/i.test(q.o.join(' ')), w);
  }
});
test('SSCE IDs are unique across the whole bank and never clash with JAMB IDs', () => {
  const seen = new Set();
  for (const b of Object.values(banks)) for (const q of b.questions) { assert.ok(!seen.has(q.id), q.id); seen.add(q.id); }
  for (const m of jamb) { const jb = JSON.parse(readFileSync(new URL('../public/data/' + m.id + '.json', import.meta.url))); for (const q of jb.questions) assert.ok(!seen.has(q.id), 'clash ' + q.id); }
});
test('answer keys: letters are balanced (no "always C" pattern) and every subject mixes difficulty', () => {
  for (const [sid, b] of Object.entries(banks)) {
    const c = [0, 0, 0, 0]; const d = { e: 0, m: 0, h: 0 };
    for (const q of b.questions) { c[q.a]++; d[q.d]++; }
    for (const x of c) assert.ok(x / b.questions.length > 0.15 && x / b.questions.length < 0.35, sid + ' letters ' + c);
    assert.ok(d.e > 0 && d.m > 0 && d.h > 0, sid + ' difficulty mix');
  }
});
test('answer keys: the pipeline record shows two independent blind solves agreed for every shipped question', () => {
  const stats = JSON.parse(readFileSync(new URL('../../gen/stats4.json', import.meta.url)));
  for (const m of meta) assert.equal(stats[m.id].shipped, m.count, m.id);
});

test('exam rules: WAEC English 80 Qs/60 min, Maths 50/90; NECO 60 per paper; every paper fits its bank', () => {
  assert.deepEqual(paperRule('waec', 'english'), { n: 80, min: 60 });
  assert.deepEqual(paperRule('waec', 'maths'), { n: 50, min: 90 });
  assert.equal(paperRule('neco', 'biology').n, 60);
  assert.equal(paperRule('neco', 'english').n, 80);
  for (const ex of ['waec', 'neco']) for (const m of meta) {
    const e = newExam(ex, banks[m.id], 'paper', {}, 1000);
    assert.equal(e.qids.length, Math.min(paperRule(ex, m.id).n, m.count));
    assert.equal(new Set(e.qids).size, e.qids.length, 'no repeats');
    assert.equal(e.duration, paperRule(ex, m.id).min * 60000);
  }
  const q = newExam('waec', banks.biology, 'quick', {}, 0);
  assert.equal(q.qids.length, 20); assert.equal(q.duration, 15 * 60000);
});
test('papers cover the syllabus: a 50-question paper spans many topics and prefers unseen questions', () => {
  const b = banks.physics; const seen = {};
  for (const q of b.questions.slice(0, 60)) seen['physics:' + q.id] = 5;
  const ps = pickPaper(b, 50, seen);
  assert.ok(new Set(ps.map(q => q.t)).size >= Math.min(15, b.topics.length));
  const fresh = ps.filter(q => !seen['physics:' + q.id]).length;
  assert.ok(fresh >= 35, 'mostly unseen questions: ' + fresh + '/50 (one per topic first, then unseen)');
});
test('timer: counts down, never negative, and flags time-up exactly at the end (auto-submit trigger)', () => {
  const e = { startedAt: 1_000_000, duration: 60 * 60000 };
  assert.equal(timeLeft(e, 1_000_000), 3600000);
  assert.equal(timeLeft(e, 1_000_000 + 3599000), 1000);
  assert.equal(isTimeUp(e, 1_000_000 + 3599999), false);
  assert.equal(isTimeUp(e, 1_000_000 + 3600000), true);
  assert.equal(timeLeft(e, 9e12), 0);
  assert.equal(isTimeUp({ ...e, submittedAt: 5 }, 9e12), false, 'a submitted paper never re-submits');
  assert.equal(fmtClock(3600000), '1:00:00'); assert.equal(fmtClock(65000), '01:05'); assert.equal(fmtClock(-5), '00:00');
});
test('auto-submit scores blanks as wrong and keeps answered ones', () => {
  const b = banks.maths; const e = newExam('waec', b, 'quick', {}, 0);
  const byId = new Map(b.questions.map(q => [q.id, q]));
  e.qids.slice(0, 10).forEach(id => { e.answers[id] = byId.get(id).a; });
  e.answers[e.qids[10]] = (byId.get(e.qids[10]).a + 1) % 4;
  assert.ok(isTimeUp(e, e.startedAt + e.duration));
  const r = scorePaper(e, b);
  assert.equal(r.correct, 10); assert.equal(r.answered, 11); assert.equal(r.total, 20); assert.equal(r.pct, 50);
  assert.equal(r.grade.g, 'C6'); assert.equal(r.grade.credit, true);
  assert.equal(Object.values(r.topics).reduce((n, t) => n + t.n, 0), 20);
});
test('grades follow the WAEC/NECO nine-point scale', () => {
  const cases = [[100, 'A1'], [75, 'A1'], [74, 'B2'], [70, 'B2'], [69, 'B3'], [65, 'B3'], [64, 'C4'], [60, 'C4'], [59, 'C5'], [55, 'C5'], [54, 'C6'], [50, 'C6'], [49, 'D7'], [45, 'D7'], [44, 'E8'], [40, 'E8'], [39, 'F9'], [0, 'F9']];
  for (const [p, g] of cases) assert.equal(gradeFor(p).g, g, String(p));
  assert.equal(gradeFor(50).credit, true); assert.equal(gradeFor(49).credit, false);
});
test('5 credits tracker: readiness starts cautious, rises with good work, and needs English + Maths', () => {
  const s = blankSsce(); s.subjects = ['english', 'maths', 'biology', 'civic', 'economics'];
  const metaById = id => meta.find(m => m.id === id);
  assert.equal(readiness(s, 'english', metaById('english').topics.length).started, false);
  const b = banks.biology;
  for (const q of b.questions.slice(0, 4)) recordSsce(s, 'biology', q, true);
  assert.equal(readiness(s, 'biology', b.topics.length).started, false, 'no grade from 4 answers');
  for (const q of b.questions.slice(4, 12)) recordSsce(s, 'biology', q, true);
  const early = readiness(s, 'biology', b.topics.length);
  assert.ok(early.started && early.pct < 75, 'twelve right answers are not an A1 yet: ' + early.pct);
  for (const q of b.questions) recordSsce(s, 'biology', q, true);
  const late = readiness(s, 'biology', b.topics.length);
  assert.ok(late.pct >= 75 && late.grade === 'A1', 'strong full coverage: ' + late.pct);
  for (const sid of ['civic', 'economics']) for (const q of banks[sid].questions) recordSsce(s, sid, q, true);
  let sum = creditsSummary(s, meta);
  assert.equal(sum.credits, 3); assert.equal(sum.engMaths, false); assert.equal(sum.onTrack, false);
  for (const sid of ['english', 'maths']) for (const q of banks[sid].questions) recordSsce(s, sid, q, Math.random() < 0.9);
  sum = creditsSummary(s, meta);
  assert.equal(sum.credits, 5); assert.ok(sum.engMaths); assert.ok(sum.onTrack);
});
test('study plan: counts down to exam day and always rotates English or Maths in', () => {
  const s = blankSsce(); s.subjects = ['english', 'maths', 'physics', 'chemistry', 'biology']; s.date = '2027-05-11';
  const now = new Date(2026, 9, 7);
  assert.equal(daysUntil('2027-05-11', now), 216);
  for (let d = 0; d < 14; d++) {
    const plan = studyPlan(s, meta, new Date(2026, 9, 7 + d));
    assert.ok(plan.tasks.some(t => t.sid === 'english' || t.sid === 'maths'), 'day ' + d);
    assert.ok(plan.tasks.every(t => t.kind === 'paper' || (t.n >= 10 && Number.isInteger(t.t))));
  }
  assert.equal(studyPlan(s, meta, new Date(2027, 4, 1)).phase, 'final');
  assert.ok(studyPlan(s, meta, new Date(2027, 4, 1)).tasks.some(t => t.kind === 'paper'));
});
test('sync: SSCE progress survives the cloud merge (sum on first sign-in, max after) and counts as progress', () => {
  const a = blankSsce(); a.subjects = ['english', 'maths', 'civic', 'biology', 'agric']; a.cfgTs = 10;
  a.topics['biology:0'] = { c: 3, n: 4 }; a.history = [{ id: 's1', date: 5, sid: 'biology', pct: 60 }];
  const b = blankSsce(); b.subjects = ['english', 'maths']; b.cfgTs = 5; b.topics['biology:0'] = { c: 1, n: 2 }; b.history = [{ id: 's2', date: 9, sid: 'maths', pct: 40 }];
  const sum = mergeSsce(a, b, 'sum');
  assert.deepEqual(sum.topics['biology:0'], { c: 4, n: 6 }); assert.equal(sum.subjects.length, 5); assert.deepEqual(sum.history.map(h => h.id), ['s2', 's1']);
  const max = mergeSsce(a, b, 'max'); assert.deepEqual(max.topics['biology:0'], { c: 3, n: 4 });
  assert.deepEqual(mergeSsce(max, max, 'max'), max, 'idempotent');
  const p = mergeProgress({ history: [], ssce: a }, { history: [], ssce: b }, 'max');
  assert.equal(p.ssce.subjects.length, 5);
  assert.ok(!('ssce' in mergeProgress({ history: [] }, { history: [] })), 'JAMB-only users unchanged');
  assert.ok(hasProgress({ ssce: a }));
});
test('exam day is kept per exam: setting a WAEC date does not move the NECO countdown', async () => {
  const { examDate } = await import('../src/ssce/core.js');
  const s = blankSsce(); s.exam = 'waec'; s.dates = { waec: '2027-05-20' }; s.date = '2027-05-20';
  assert.equal(examDate(s, 'waec'), '2027-05-20'); assert.equal(examDate(s, 'neco'), EXAMS.neco.date);
  const m = mergeSsce({ ...s, cfgTs: 1 }, { ...blankSsce(), dates: { neco: '2027-06-20' }, cfgTs: 0 }, 'max');
  assert.deepEqual(m.dates, { neco: '2027-06-20', waec: '2027-05-20' });
});
test('exam definitions are complete', () => {
  for (const x of Object.values(EXAMS)) { assert.match(x.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(x.rules.length >= 3); assert.ok(x.def.n >= 50); }
});
