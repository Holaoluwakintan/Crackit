import { mergeSsce } from './ssce/core.js';
import { mergeD5 } from './daily-core.js';
// Pure merge logic for CrackIt progress (no DOM). Unit-tested in test/sync.test.mjs.
// mode 'max': idempotent merge for two copies of the SAME account (safe to repeat on every sync).
// mode 'sum': one-time merge of a guest phone's progress INTO an account on first sign-in.

/** last-write-wins map: value > 0 = on at ts, value < 0 = off at |ts| */
export function mergeLww(a = {}, b = {}) {
  const out = { ...a };
  for (const k in b) { const x = out[k], y = b[k]; if (x === undefined || Math.abs(y) > Math.abs(x)) out[k] = y; }
  return out;
}
function mergeNum(a = {}, b = {}, mode) {
  const out = { ...a };
  for (const k in b) out[k] = mode === 'sum' ? (out[k] || 0) + b[k] : Math.max(out[k] || 0, b[k]);
  return out;
}
function mergeTopics(a = {}, b = {}, mode) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || { c: 0, n: 0 }, y = b[k] || { c: 0, n: 0 };
    out[k] = mode === 'sum' ? { c: x.c + y.c, n: x.n + y.n } : { c: Math.max(x.c, y.c), n: Math.max(x.n, y.n) };
  }
  return out;
}
export const HISTORY_MAX = 40;
export function mergeProgress(local, remote, mode = 'max') {
  local = local || {}; remote = remote || {};
  const hist = new Map();
  for (const h of [...(remote.history || []), ...(local.history || [])]) if (h && h.id) hist.set(h.id, h);
  const history = [...hist.values()].sort((x, y) => y.date - x.date).slice(0, HISTORY_MAX);
  const days = [...new Set([...(remote.days || []), ...(local.days || [])])].sort().slice(-400);
  const n = (k) => mode === 'sum' ? (local[k] || 0) + (remote[k] || 0) : Math.max(local[k] || 0, remote[k] || 0);
  return {
    ...remote, ...local,
    history, days,
    topics: mergeTopics(local.topics, remote.topics, mode),
    seen: mergeNum(local.seen, remote.seen, mode),
    daily: mergeNum(local.daily, remote.daily, mode),
    practiced: n('practiced'), practiceCorrect: n('practiceCorrect'),
    bm: mergeLww(local.bm, remote.bm), wrong: mergeLww(local.wrong, remote.wrong),
    pidgin: local.pidgin !== undefined ? !!local.pidgin : !!remote.pidgin,
    goal: local.goal || remote.goal || 20,
    name: local.name || remote.name,
    ...((local.ssce || remote.ssce) ? { ssce: mergeSsce(local.ssce, remote.ssce, mode) } : {}),
    ...((local.d5 || remote.d5) ? { d5: mergeD5(local.d5, remote.d5) } : {}),
  };
}
/** what goes to the cloud: drop nothing important, but cap size (history exams are the heavy part) */
export function forCloud(p) {
  const h = (p.history || []).slice(0, HISTORY_MAX);
  return { ...p, history: h, v: 1 };
}
export function sameData(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
/** has the guest done anything worth merging? */
export function hasProgress(p) {
  return !!p && ((p.history && p.history.length) || p.practiced > 0 || Object.keys(p.d5 || {}).length > 0 || Object.keys(p.bm || {}).length > 0 || !!(p.ssce && ((p.ssce.history && p.ssce.history.length) || Object.keys(p.ssce.topics || {}).length || (p.ssce.subjects && p.ssce.subjects.length))));
}
