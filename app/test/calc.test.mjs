import { test } from 'node:test';
import assert from 'node:assert/strict';
// same expression rules as calcEval in src/app.tsx (kept in sync by copy; app.tsx needs a browser to import)
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function calcEval'), src.indexOf('export function Calculator'));
const js = body.replace('export function calcEval(expr: string): string', 'function calcEval(expr)');
const calcEval = Function(js + '; return calcEval;')();
test('calculator: arithmetic, precedence, %, sqrt, errors', () => {
  assert.equal(calcEval('2+3×4'), '14'); assert.equal(calcEval('(2+3)×4'), '20'); assert.equal(calcEval('10÷4'), '2.5');
  assert.equal(calcEval('7−10'), '-3'); assert.equal(calcEval('50%'), '0.5'); assert.equal(calcEval('√(81)+1'), '10');
  assert.equal(calcEval('0.1+0.2'), '0.3'); assert.equal(calcEval('1÷0'), 'Error'); assert.equal(calcEval('alert(1)'), 'Error'); assert.equal(calcEval('2++'), 'Error');
});
