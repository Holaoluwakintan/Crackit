# Admission data: how to update it each year

All checker data lives in ONE file: `public/data/admission/admissions.json` (the app, the SEO pages and the tests read it).
`public/data/admission/sources.json` keeps the audit trail: the exact quote from each source page for every number.

- `schools[].min` = school minimum UTME score `{v, yr, s}`. `s` is an index into `sources[]`.
- `schools[].c[courseId]` = departmental cut-off `{v, sc, what, yr, s, cat?}`.
  `sc`: `jamb` (min JAMB score for the course), `jmin` (JAMB minimum just to sit screening), `agg100` (final aggregate /100), `school` (school's own scale; shown, not compared). `cat` = catchment cut-offs by state.
- `schools[].f` = published screening formula (weights, O'level point scale, year, sources). Leave it out if the school hasn't published one.
- `schools[].put` = Post-UTME format (mode, questions, minutes, subjects, year, source).
- `courses[].slots` = JAMB brochure subject rule: 3 slots (besides English), each a list of accepted subjects.

Rules: never type a number without a source URL and a year. If it isn't published, leave it out: the app shows "not published".
After editing: `npm run build` (regenerates /cut-off/* pages + sitemap), `node --test test/admission.test.mjs`, deploy.

Premium Post-UTME questions live server-side in `../api/_packs.js` (never in public/). Free ones: `public/data/postutme/<school>.json`.
Payments: see /api/config.js (env vars PAYMENTS_ENABLED, PAYSTACK_PUBLIC_KEY, PAYSTACK_SECRET_KEY, PACK_PRICE_NGN; live keys need PAYSTACK_ALLOW_LIVE=1).
