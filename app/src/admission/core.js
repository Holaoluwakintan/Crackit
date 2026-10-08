// Admission Chance Checker: pure logic (no DOM). Unit-tested in test/admission.test.mjs.
// Every school formula used here is stored in public/data/admission/admissions.json with its source.

export const GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];
export const CREDITS = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6'];
export const isCredit = (g) => CREDITS.includes(g);
const r2 = (x) => Math.round(x * 100) / 100;

/** UTME share of the aggregate. JAMB/8 is the same thing as weight 50. */
export function utmePart(f, jamb) {
  if (!f || !f.utme) return 0;
  return r2((f.utme.w * Math.max(0, Math.min(400, jamb))) / 400);
}

/**
 * O'level share. grades: array of grade strings for the candidate's relevant subjects (best first is not needed).
 * Returns null when the school does not publish its point scale, or when too few grades were given.
 */
export function olevelPart(f, grades, sittings = 1) {
  if (!f || !f.olevel) return 0;
  const o = f.olevel;
  if (!o.pts) return null;
  const g = (grades || []).filter(Boolean);
  if (g.length < o.n) return null;
  const pts = g.map((x) => o.pts[x] || 0).sort((a, b) => b - a).slice(0, o.n);
  let sum = pts.reduce((a, b) => a + b, 0);
  if (o.mult) { if (sittings > 1) sum = Math.max(0, sum - 1); sum = sum * o.mult; }
  return r2(Math.min(o.w, sum));
}

/** UNIZIK 2025/2026: UTME x 0.7 + (O'level score of the 4 UTME subjects + bonus) x 0.3, out of 400. */
export function unizikScore(f, jamb, utmeSubjects, olevel, sittings = 1) {
  const need = utmeSubjects.filter((s) => !(s in olevel));
  if (need.length) return { total: null, missing: need };
  let ol = 0;
  for (const s of utmeSubjects) ol += f.pts[olevel[s]] || 0;
  const allCredit = utmeSubjects.every((s) => isCredit(olevel[s]));
  const bonus = allCredit && sittings === 1 ? 10 : 0;
  return { total: r2(jamb * 0.7 + (ol + bonus) * 0.3), olevel: ol, bonus, missing: [] };
}

/**
 * Estimated aggregate for a school formula.
 * input: { jamb, grades: [..5 grades], olevel: {Subject: grade}, utmeSubjects: [4 incl English], sittings, putme (0-100 or null) }
 * Returns { scale, utme, olevel, putme, known (sum of parts we can compute), total (null unless every part is known), missing: [] }
 */
export function aggregate(f, input) {
  if (!f) return null;
  if (f.kind === 'unizik') {
    const u = unizikScore(f, input.jamb, input.utmeSubjects || [], input.olevel || {}, input.sittings || 1);
    return { scale: 400, utme: r2(input.jamb * 0.7), olevel: u.total === null ? null : r2((u.olevel + u.bonus) * 0.3), putme: 0, known: u.total === null ? r2(input.jamb * 0.7) : u.total, total: u.total, missing: u.missing.map((s) => "O'level grade in " + s) };
  }
  const missing = [];
  const utme = utmePart(f, input.jamb);
  const ol = olevelPart(f, input.grades, input.sittings || 1);
  if (ol === null) missing.push(f.olevel && !f.olevel.pts ? "school's O'level points (not published)" : 'your 5 O\'level grades');
  let pu = 0;
  if (f.putme) {
    if (input.putme === null || input.putme === undefined || input.putme === '' || isNaN(+input.putme)) { pu = null; missing.push('Post-UTME score'); }
    else pu = r2((f.putme.w * Math.max(0, Math.min(100, +input.putme))) / 100);
  }
  const known = r2(utme + (ol || 0) + (pu || 0));
  return { scale: f.scale || 100, utme, olevel: ol, putme: pu, known, total: missing.length ? null : known, missing };
}

/** Post-UTME percentage needed to reach a cut-off, when UTME and O'level parts are known. null if it can't be worked out. */
export function putmeNeeded(f, cutoff, input) {
  if (!f || !f.putme || f.kind === 'unizik') return null;
  const utme = utmePart(f, input.jamb);
  const ol = olevelPart(f, input.grades, input.sittings || 1);
  if (ol === null) return null;
  const need = ((cutoff - utme - ol) / f.putme.w) * 100;
  return Math.max(0, Math.round(need * 10) / 10);
}

/** Does a set of 3 UTME subjects (besides English) fill the course's slots? slots: array of 3 arrays of accepted subjects. */
export function comboCheck(slots, subjects) {
  const subs = (subjects || []).filter((s) => s && s !== 'English');
  if (!slots) return { ok: null, missing: [] };
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  if (subs.length < 3) return { ok: false, missing: ['pick 3 subjects besides English'] };
  for (const p of perms(subs.slice(0, 3))) if (slots.every((sl, i) => sl.includes(p[i]))) return { ok: true, missing: [] };
  // which required single subjects are missing?
  const missing = slots.filter((sl) => sl.length <= 2 && !sl.some((s) => subs.includes(s))).map((sl) => sl.join(' or '));
  return { ok: false, missing: missing.length ? missing : ['a subject from the accepted list'] };
}

export const BAND_LABEL = { strong: 'Strong', fair: 'Fair', long: 'Long shot', below: 'Below cut-off', unknown: 'Meets minimum' };

/** Band from JAMB score vs a departmental JAMB cut-off. */
export function bandFromJamb(jamb, cutoff) {
  const d = jamb - cutoff;
  if (d < 0) return 'below';
  if (d >= 40) return 'strong';
  if (d >= 15) return 'fair';
  return 'long';
}
/** Band from an estimated aggregate vs aggregate cut-off. margin scale: points on the school's scale (100 or 400). */
export function bandFromAggregate(agg, cutoff, scale = 100) {
  const m = ((agg - cutoff) / scale) * 100;
  if (m >= 3) return 'strong';
  if (m >= 0) return 'fair';
  if (m >= -3) return 'long';
  return 'below';
}
/** Band from the Post-UTME % a candidate would need. */
export function bandFromNeeded(need) {
  if (need > 100) return 'below';
  if (need <= 50) return 'strong';
  if (need <= 70) return 'fair';
  return 'long';
}

/** Effective cut-off: merit, or the catchment figure for the candidate's state when it is lower. */
export function effectiveCutoff(rec, state) {
  if (rec && rec.cat && state && typeof rec.cat[state] === 'number' && rec.cat[state] < rec.v) return { v: rec.cat[state], via: 'catchment (' + state + ')' };
  return { v: rec.v, via: 'merit' };
}

/**
 * Full check for one school + course.
 * Returns { band, reason, cutoff, via, agg, need, combo, minOk }
 */
export function checkCourse(school, course, input) {
  const out = { band: 'unknown', reason: '', cutoff: null, via: null, agg: null, need: null, combo: comboCheck(course && course.slots, input.subjects), minOk: null };
  const min = school.min && school.min.v;
  if (min) out.minOk = input.jamb >= min;
  if (min && input.jamb < min) { out.band = 'below'; out.reason = `Below ${school.short}'s minimum of ${min}`; return out; }
  if (out.combo.ok === false) { out.band = 'below'; out.reason = 'Your UTME subjects don\'t match this course'; return out; }
  const rec = school.c && course && school.c[course.id];
  const f = school.f;
  if (!rec) { out.band = 'unknown'; out.reason = min ? `Meets ${school.short}'s minimum; departmental cut-off not published` : 'Cut-off not published'; return out; }
  const eff = effectiveCutoff(rec, input.state);
  out.cutoff = eff.v; out.via = eff.via;
  if (rec.sc === 'jmin') {
    // a per-course minimum to sit the screening, not a final admission cut-off
    out.band = input.jamb < eff.v ? 'below' : 'unknown';
    out.reason = input.jamb < eff.v ? `Below the ${eff.v} needed to sit screening for this course` : `Meets the ${eff.v} needed to sit screening; final cut-off not published`;
    return out;
  }
  if (rec.sc === 'jamb') { out.band = bandFromJamb(input.jamb, eff.v); out.reason = out.band === 'below' ? `Below the departmental JAMB cut-off of ${eff.v}` : `${input.jamb - eff.v} above the departmental JAMB cut-off`; return out; }
  const scale = f && (f.scale || 100);
  const sameScale = (rec.sc === 'agg100' && scale === 100);
  if (f && sameScale) {
    const a = aggregate(f, input);
    out.agg = a;
    if (a.total !== null) { out.band = bandFromAggregate(a.total, eff.v, 100); out.reason = `Your estimate ${a.total} vs cut-off ${eff.v}`; return out; }
    const need = putmeNeeded(f, eff.v, input);
    if (need !== null && a.missing.length === 1 && a.missing[0] === 'Post-UTME score') {
      out.need = need; out.band = bandFromNeeded(need);
      out.reason = need > 100 ? 'Out of reach even with full Post-UTME marks' : `You need about ${need}% in the Post-UTME`;
      return out;
    }
  }
  out.band = 'unknown';
  out.reason = f && !sameScale ? 'Cut-off is on the school\'s own scale' : (f ? 'Add your O\'level grades to estimate' : 'School formula not published, so we can\'t estimate your aggregate');
  return out;
}

/** Courses a candidate qualifies for across schools: Strong/Fair first, then Long shot. */
export function qualifyList(data, input, opts = {}) {
  const rows = [];
  for (const s of data.schools) {
    if (opts.school && s.id !== opts.school) continue;
    for (const c of data.courses) {
      if (opts.course && c.id !== opts.course) continue;
      const r = checkCourse(s, c, input);
      rows.push({ school: s, course: c, ...r });
    }
  }
  const order = { strong: 0, fair: 1, long: 2, unknown: 3, below: 4 };
  rows.sort((a, b) => order[a.band] - order[b.band] || (b.school.min ? 1 : 0) - (a.school.min ? 1 : 0));
  return rows;
}

/** O'level sanity: 5 credits including English and Maths. */
export function olevelOk(olevel) {
  const g = Object.entries(olevel || {}).filter(([, v]) => v);
  const credits = g.filter(([, v]) => isCredit(v)).length;
  const eng = isCredit(olevel && olevel['English']);
  const mat = isCredit(olevel && olevel['Mathematics']);
  return { ok: credits >= 5 && eng && mat, credits, eng, mat, given: g.length };
}
