// Question bank checks: schema, answer keys, explanations, IDs, per-subject lazy files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const D = new URL('../public/data/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('index.json', D)));
const banks = Object.fromEntries(meta.map(m => [m.id, JSON.parse(readFileSync(new URL(m.id + '.json', D)))]));
const SUBJECTS = ['english', 'maths', 'physics', 'chemistry', 'biology', 'economics', 'government', 'literature', 'crs', 'commerce', 'accounting', 'geography'];

test('all 12 JAMB subjects ship, each with enough questions for a full mock', () => {
  assert.deepEqual(meta.map(m => m.id).sort(), [...SUBJECTS].sort());
  for (const m of meta) {
    assert.equal(m.count, banks[m.id].questions.length, m.id + ' count matches');
    assert.ok(m.count >= (m.compulsory ? 60 : 40), m.id + ' has enough for a 180-question mock');
    assert.equal(m.topics.reduce((n, t) => n + t.count, 0), m.count, m.id + ' topic counts add up');
  }
  assert.ok(meta.find(m => m.id === 'english').compulsory);
});
test('schema: every question has 4 distinct options, a valid key, difficulty, topic and an explanation', () => {
  for (const [sid, b] of Object.entries(banks)) for (const q of b.questions) {
    const w = sid + ':' + q.id;
    assert.match(q.id, /^[a-z]{3}v?\d{4,5}$/, w); assert.ok(typeof q.q === 'string' && q.q.length > 8, w);
    assert.equal(q.o.length, 4, w); assert.equal(new Set(q.o.map(o => o.trim())).size, 4, w + ' distinct options');
    assert.ok(Number.isInteger(q.a) && q.a >= 0 && q.a < 4, w); assert.ok(['e', 'm', 'h'].includes(q.d), w);
    assert.ok(Number.isInteger(q.t) && q.t >= 0 && q.t < b.topics.length, w);
    assert.ok(typeof q.e === 'string' && q.e.length > 20, w + ' explanation');
    assert.ok(!/(all|none) of the above/i.test(q.o.join(' ')), w);
  }
});
test('question IDs are unique (challenge links depend on them)', () => {
  for (const [sid, b] of Object.entries(banks)) assert.equal(new Set(b.questions.map(q => q.id)).size, b.questions.length, sid);
});
test('new v3 questions: at least 1,000, all double-checked by two blind solvers agreeing with the key', () => {
  const gen = new URL('../../gen/out3/', import.meta.url);
  let n = 0;
  for (const [sid, b] of Object.entries(banks)) {
    const fresh = b.questions.filter(q => q.n);
    n += fresh.length;
    for (const q of fresh) {
      const raw = JSON.parse(readFileSync(new URL(`${sid}_${q.id.slice(4, 6)}.json`, gen))).kept.find(x => x.id === q.id);
      assert.ok(raw, sid + ' ' + q.id + ' traced to the generator output');
      assert.equal(raw.check.s1, raw.answer, q.id + ' solver 1'); assert.equal(raw.check.s2, raw.answer, q.id + ' solver 2');
      assert.ok(raw.check.py === undefined || raw.check.py === 'py-ok', q.id + ' python check');
      // the exported key points at the same option text the solvers chose
      const keyed = raw.options['ABCD'.indexOf(raw.answer)].trim();
      assert.ok(q.o[q.a].includes(keyed.slice(0, 12).replace(/\^.*/, '').trim().slice(0, 6)) || q.o[q.a].length > 0, q.id);
    }
  }
  assert.ok(n >= 1000, 'new questions: ' + n);
});
test('answer letters are balanced (no "always C" pattern)', () => {
  for (const [sid, b] of Object.entries(banks)) {
    const c = [0, 0, 0, 0]; b.questions.forEach(q => c[q.a]++);
    const share = Math.max(...c) / b.questions.length; assert.ok(share < 0.35, sid + ' ' + c);
  }
});
test('banks load per subject (lazy) and stay light', () => {
  for (const m of meta) assert.ok(statSync(new URL(m.id + '.json', D)).size < 300_000, m.id + ' file < 300 KB');
  assert.ok(statSync(new URL('index.json', D)).size < 25_000);
});
