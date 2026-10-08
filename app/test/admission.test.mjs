import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../src/admission/core.js';

const data = JSON.parse(readFileSync(new URL('../public/data/admission/admissions.json', import.meta.url)));
const S = Object.fromEntries(data.schools.map((s) => [s.id, s]));
const C = Object.fromEntries(data.courses.map((c) => [c.id, c]));

test('UTME part: JAMB/8 for a 50% weight', () => {
  assert.equal(A.utmePart(S.unilag.f, 248), 31); // legit.ng worked example
  assert.equal(A.utmePart(S.unilag.f, 400), 50);
  assert.equal(A.utmePart(S.oou.f, 300), 45); // 60% weight
  assert.equal(A.utmePart(S.kwasu.f, 200), 35); // 70% weight
});

test("O'level points: UNILAG scale (A1=4.0 ... C6=2.0), best 5", () => {
  assert.equal(A.olevelPart(S.unilag.f, ['A1', 'B2', 'B3', 'C4', 'C5']), 16);
  assert.equal(A.olevelPart(S.unilag.f, ['A1', 'A1', 'A1', 'A1', 'A1', 'F9']), 20);
  assert.equal(A.olevelPart(S.unilag.f, ['A1', 'D7', 'B2', 'F9', 'C6']), 9.6);
  assert.equal(A.olevelPart(S.unilag.f, ['A1', 'B2']), null, 'too few grades');
  assert.equal(A.olevelPart(S.unilorin.f, ['A1', 'A1', 'A1', 'A1', 'A1']), null, 'scale not published');
});

test('UNILAG aggregate = UTME/8 + O\'level + Post-UTME x 0.3', () => {
  const a = A.aggregate(S.unilag.f, { jamb: 248, grades: ['A1', 'B2', 'B3', 'C4', 'C5'], putme: 80 });
  assert.deepEqual([a.utme, a.olevel, a.putme, a.total], [31, 16, 24, 71]);
  const b = A.aggregate(S.unilag.f, { jamb: 248, grades: ['A1', 'B2', 'B3', 'C4', 'C5'] });
  assert.equal(b.total, null); assert.deepEqual(b.missing, ['Post-UTME score']); assert.equal(b.known, 47);
});

test('OAU 50:40:10 and FUNAAB (UTME/8 + points x 5/3)', () => {
  const a = A.aggregate(S.oau.f, { jamb: 250, grades: ['A1', 'A1', 'A1', 'A1', 'A1'], putme: 75 });
  assert.equal(a.total, 71.25);
  const f = A.aggregate(S.funaab.f, { jamb: 240, grades: ['A1', 'A1', 'B2', 'B3', 'C4'] });
  assert.equal(f.total, 70);
  const f2 = A.aggregate(S.funaab.f, { jamb: 240, grades: ['A1', 'A1', 'B2', 'B3', 'C4'], sittings: 2 });
  assert.equal(f2.total, 68.33);
});

test('UNIZIK 2025/2026 example from the published formula: 292.5 and 289.5', () => {
  const subj = ['English', 'Biology', 'Physics', 'Chemistry'];
  const ol = { English: 'B3', Biology: 'A1', Physics: 'C4', Chemistry: 'B2' };
  assert.equal(A.unizikScore(S.unizik.f, 285, subj, ol, 1).total, 292.5);
  assert.equal(A.unizikScore(S.unizik.f, 285, subj, ol, 2).total, 289.5);
  assert.deepEqual(A.unizikScore(S.unizik.f, 285, subj, { English: 'B3' }, 1).missing, ['Biology', 'Physics', 'Chemistry']);
});

test('Post-UTME needed to reach a cut-off', () => {
  const need = A.putmeNeeded(S.unilag.f, 83.425, { jamb: 300, grades: ['A1', 'A1', 'A1', 'A1', 'A1'] });
  assert.equal(need, 86.4); // (83.425 - 37.5 - 20) / 30 x 100
  assert.equal(A.putmeNeeded(S.unilag.f, 50, { jamb: 400, grades: ['A1', 'A1', 'A1', 'A1', 'A1'] }), 0);
  assert.equal(A.putmeNeeded(S.unilorin.f, 60, { jamb: 300, grades: ['A1', 'A1', 'A1', 'A1', 'A1'] }), null);
});

test('chance bands', () => {
  assert.equal(A.bandFromJamb(199, 200), 'below');
  assert.equal(A.bandFromJamb(200, 200), 'long');
  assert.equal(A.bandFromJamb(215, 200), 'fair');
  assert.equal(A.bandFromJamb(240, 200), 'strong');
  assert.equal(A.bandFromAggregate(73, 70), 'strong');
  assert.equal(A.bandFromAggregate(70, 70), 'fair');
  assert.equal(A.bandFromAggregate(67.5, 70), 'long');
  assert.equal(A.bandFromAggregate(60, 70), 'below');
  assert.equal(A.bandFromNeeded(45), 'strong');
  assert.equal(A.bandFromNeeded(65), 'fair');
  assert.equal(A.bandFromNeeded(95), 'long');
  assert.equal(A.bandFromNeeded(101), 'below');
});

test('subject combination check', () => {
  assert.equal(A.comboCheck(C.medicine.slots, ['Physics', 'Chemistry', 'Biology']).ok, true);
  const m = A.comboCheck(C.medicine.slots, ['Mathematics', 'Chemistry', 'Biology']);
  assert.equal(m.ok, false); assert.deepEqual(m.missing, ['Physics']);
  assert.equal(A.comboCheck(C.law.slots, ['Literature in English', 'Government', 'CRS']).ok, true);
  assert.equal(A.comboCheck(C.law.slots, ['Mathematics', 'Government', 'CRS']).ok, false);
  assert.equal(A.comboCheck(C['civil-eng'].slots, ['Chemistry', 'Physics', 'Mathematics']).ok, true);
  assert.equal(A.comboCheck(C.accounting.slots, ['Mathematics', 'Economics', 'Commerce']).ok, true);
});

test('catchment cut-off used when lower for the candidate\'s state', () => {
  const rec = { v: 80, sc: 'agg100', cat: { Lagos: 75 } };
  assert.deepEqual(A.effectiveCutoff(rec, 'Lagos'), { v: 75, via: 'catchment (Lagos)' });
  assert.deepEqual(A.effectiveCutoff(rec, 'Kano'), { v: 80, via: 'merit' });
});

test('checkCourse end to end on real data', () => {
  const input = { jamb: 180, subjects: ['Physics', 'Chemistry', 'Biology'], grades: [], olevel: {} };
  assert.equal(A.checkCourse(S.unilag, C.medicine, input).band, 'below'); // under 200 minimum
  const strong = A.checkCourse(S.unilag, C.medicine, { jamb: 380, subjects: ['Physics', 'Chemistry', 'Biology'], grades: ['A1', 'A1', 'A1', 'A1', 'A1'] });
  assert.ok(['strong', 'fair'].includes(strong.band), strong.band);
  assert.ok(strong.need !== null);
  const wrong = A.checkCourse(S.unilag, C.medicine, { jamb: 380, subjects: ['Mathematics', 'Chemistry', 'Biology'] });
  assert.equal(wrong.band, 'below'); assert.equal(wrong.combo.ok, false);
  const jmin = A.checkCourse(S.unizik, C.medicine, { jamb: 300, subjects: ['Physics', 'Chemistry', 'Biology'] });
  assert.equal(jmin.band, 'unknown', 'a screening minimum is not an admission cut-off');
  const noData = A.checkCourse(S.abu, C.medicine, { jamb: 300, subjects: ['Physics', 'Chemistry', 'Biology'] });
  assert.equal(noData.band, 'unknown');
});

test('data honesty: every record carries a source and a year/session', () => {
  for (const s of data.schools) {
    if (s.min) { assert.ok(data.sources[s.min.s], s.id + ' min source'); }
    for (const [cid, r] of Object.entries(s.c)) {
      assert.ok(data.sources[r.s], `${s.id}/${cid} source`);
      assert.ok(typeof r.v === 'number', `${s.id}/${cid} value`);
      assert.ok(['jamb', 'jmin', 'agg100', 'school', 'other'].includes(r.sc));
    }
    if (s.f) assert.ok(s.f.src.every((i) => data.sources[i]) && s.f.year, s.id + ' formula source');
  }
  for (const c of data.courses) assert.ok(data.sources[c.s] && c.slots.length === 3, c.id);
});
