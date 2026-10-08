import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeProgress, mergeLww, forCloud, hasProgress, HISTORY_MAX } from '../src/sync-core.js';

const base = () => ({ history: [], topics: {}, days: [], seen: {}, pidgin: false, practiced: 0, practiceCorrect: 0, bm: {}, wrong: {}, daily: {}, goal: 20 });
const h = (id, date, total = 200) => ({ id, date, mode: 'quick', total, per: [], exam: {} });

test('merge max is idempotent (repeat syncs never inflate counts)', () => {
  const a = { ...base(), topics: { 'maths:1': { c: 3, n: 5 } }, practiced: 5, practiceCorrect: 3, seen: { 'maths:x': 2 }, daily: { '2026-10-07': 5 } };
  const once = mergeProgress(a, a, 'max'); const twice = mergeProgress(once, a, 'max');
  assert.deepEqual(once.topics, a.topics); assert.equal(twice.practiced, 5); assert.deepEqual(twice.seen, a.seen); assert.deepEqual(twice.daily, a.daily);
});
test('first sign-in (sum) adds a guest phone into an existing account', () => {
  const guest = { ...base(), topics: { 'bio:2': { c: 4, n: 6 } }, practiced: 6, practiceCorrect: 4, history: [h('g1', 2000)], days: ['2026-10-06'] };
  const cloud = { ...base(), topics: { 'bio:2': { c: 1, n: 2 }, 'eng:0': { c: 2, n: 2 } }, practiced: 4, practiceCorrect: 3, history: [h('c1', 1000)], days: ['2026-10-05'] };
  const m = mergeProgress(guest, cloud, 'sum');
  assert.deepEqual(m.topics['bio:2'], { c: 5, n: 8 }); assert.deepEqual(m.topics['eng:0'], { c: 2, n: 2 });
  assert.equal(m.practiced, 10); assert.equal(m.practiceCorrect, 7);
  assert.deepEqual(m.history.map(x => x.id), ['g1', 'c1'], 'history union, newest first');
  assert.deepEqual(m.days, ['2026-10-05', '2026-10-06']);
});
test('history: union by id, newest first, capped', () => {
  const a = { ...base(), history: Array.from({ length: 30 }, (_, i) => h('a' + i, 1000 + i)) };
  const b = { ...base(), history: [...Array.from({ length: 30 }, (_, i) => h('b' + i, 5000 + i)), h('a3', 1003)] };
  const m = mergeProgress(a, b);
  assert.equal(m.history.length, HISTORY_MAX); assert.equal(m.history[0].id, 'b29'); assert.equal(new Set(m.history.map(x => x.id)).size, HISTORY_MAX);
});
test('bookmarks and wrong answers: last write wins across phones (removals stick)', () => {
  assert.deepEqual(mergeLww({ k: 100 }, { k: -200 }), { k: -200 }, 'removed later on phone B');
  assert.deepEqual(mergeLww({ k: 300 }, { k: -200 }), { k: 300 }, 're-saved later on phone A');
  const m = mergeProgress({ ...base(), wrong: { 'maths:q1': 50, 'maths:q2': -90 } }, { ...base(), wrong: { 'maths:q1': -60, 'maths:q3': 10 } });
  assert.deepEqual(m.wrong, { 'maths:q1': -60, 'maths:q2': -90, 'maths:q3': 10 });
});
test('local preferences win; missing fields are filled', () => {
  const m = mergeProgress({ ...base(), pidgin: true, goal: 40, name: 'Ada' }, { goal: 10, name: 'Old' });
  assert.equal(m.pidgin, true); assert.equal(m.goal, 40); assert.equal(m.name, 'Ada');
  const n = mergeProgress({}, null); assert.deepEqual(n.history, []); assert.equal(n.goal, 20);
});
test('forCloud caps history and marks a version; hasProgress', () => {
  const p = { ...base(), history: Array.from({ length: 60 }, (_, i) => h('x' + i, i)) };
  assert.equal(forCloud(p).history.length, HISTORY_MAX); assert.equal(forCloud(p).v, 1);
  assert.ok(!hasProgress(base())); assert.ok(hasProgress({ ...base(), practiced: 1 })); assert.ok(hasProgress({ ...base(), bm: { a: 1 } }));
});
