import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDaily, d5Streak, d5Best, mergeD5, encodeChallenge, decodeChallenge, normSubjects, refCode, validRef, addDays } from '../src/daily-core.js';
import { mergeProgress } from '../src/sync-core.js';

const bank = (id, n, topics = 6) => ({ id, questions: Array.from({ length: n }, (_, i) => ({ id: id.slice(0, 3) + String(i).padStart(4, '0'), t: i % topics })) });
const banks = { english: bank('english', 200), maths: bank('maths', 150), physics: bank('physics', 120), biology: bank('biology', 90) };

test('daily: same exam + subjects + date -> same 5; next day differs', () => {
  const s = ['english', 'maths', 'physics', 'biology'];
  const a = pickDaily(banks, s, '2026-10-08', 'jamb'), b = pickDaily(banks, s, '2026-10-08', 'jamb'), c = pickDaily(banks, s, '2026-10-09', 'jamb');
  assert.equal(a.length, 5); assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  assert.equal(a[0][0], 'english');
  assert.equal(new Set(a.map(x => x.join(':'))).size, 5, 'no repeats');
  assert.deepEqual(new Set(a.map(x => x[0])), new Set(s), 'all 4 subjects appear');
  assert.notDeepEqual(pickDaily(banks, s, '2026-10-08', 'waec'), a, 'exam is part of the seed');
});
test('daily: works with one subject and skips missing banks', () => {
  const a = pickDaily(banks, ['english', 'nonexistent'], '2026-10-08', 'jamb');
  assert.equal(a.length, 5); assert.ok(a.every(x => x[0] === 'english'));
  assert.deepEqual(pickDaily({}, ['english'], '2026-10-08', 'jamb'), []);
});
test('daily: normSubjects puts English first, max 4, only available', () => {
  assert.deepEqual(normSubjects(['maths', 'english', 'zzz', 'physics', 'biology', 'chemistry'], ['english', 'maths', 'physics', 'biology', 'chemistry']), ['english', 'maths', 'physics', 'biology']);
});
test('daily: streak counts back from today or yesterday, breaks on a gap', () => {
  const r = { c: 3, n: 5 };
  assert.equal(d5Streak({}, '2026-10-08'), 0);
  assert.equal(d5Streak({ '2026-10-08': r, '2026-10-07': r, '2026-10-06': r }, '2026-10-08'), 3);
  assert.equal(d5Streak({ '2026-10-07': r, '2026-10-06': r }, '2026-10-08'), 2, 'still alive until midnight');
  assert.equal(d5Streak({ '2026-10-06': r }, '2026-10-08'), 0);
  assert.equal(d5Streak({ '2026-10-01': r, '2026-09-30': r }, '2026-10-01'), 2, 'month boundary');
  assert.equal(d5Best({ '2026-10-01': r, '2026-10-02': r, '2026-10-03': r, '2026-10-06': r }), 3);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('daily: mergeD5 keeps every day and the better score', () => {
  const m = mergeD5({ '2026-10-07': { c: 2 }, '2026-10-08': { c: 4 } }, { '2026-10-08': { c: 5 }, '2026-10-06': { c: 1 } });
  assert.deepEqual(Object.keys(m).sort(), ['2026-10-06', '2026-10-07', '2026-10-08']);
  assert.equal(m['2026-10-08'].c, 5);
  const p = mergeProgress({ d5: { '2026-10-08': { c: 3 } } }, { d5: { '2026-10-07': { c: 2 } } });
  assert.deepEqual(Object.keys(p.d5).sort(), ['2026-10-07', '2026-10-08']);
  assert.equal(mergeProgress({}, {}).d5, undefined);
});
test('daily: challenge code round-trips and rejects junk', () => {
  const o = { x: 'waec', d: '2026-10-08', n: 'Ada', c: 1, q: [['english', 'eng0001'], ['maths', 'mat0002']] };
  const code = encodeChallenge(o);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeChallenge(code), o);
  assert.equal(decodeChallenge('garbage'), null);
  assert.equal(decodeChallenge(encodeChallenge({ ...o, x: 'sat' })), null);
  assert.equal(decodeChallenge(encodeChallenge({ ...o, q: [['../x', 'a']] })), null);
  assert.equal(decodeChallenge(encodeChallenge({ ...o, c: 99 })).c, 2, 'score capped at question count');
});
test('daily: referral code is 12 hex chars from the user id', () => {
  assert.equal(refCode('4f1c2a9e-77b0-4c1e-9d2a-1b2c3d4e5f60'), '4f1c2a9e77b0');
  assert.equal(refCode(''), ''); assert.ok(validRef('4f1c2a9e77b0')); assert.ok(!validRef('<script>')); assert.ok(!validRef('4f1c2a9e77b'));
});
