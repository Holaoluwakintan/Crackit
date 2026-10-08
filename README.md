# CrackIt (v0.1) — JAMB CBT practice PWA

Working name lives in ONE place: `app/src/config.ts` (`APP.name`, `APP.title`). The page title, PWA manifest,
og tags, header, footer and About page all read from it. Change it there and rebuild.

## Layout
- `app/` — Vite + Preact + TypeScript static app (hash routing, no server, no runtime AI calls).
  - `public/data/*.json` — offline question packs (one per subject) + `index.json`.
  - `scripts/postbuild.mjs` — writes `dist/sw.js` that precaches every built file (full offline use).
  - `npm install && npm run build` → `dist/` (deploy as static files; `public/vercel.json` sets cache headers).
- `gen/` — question pipeline.
  - `topics.json` — JAMB syllabus topics per subject.
  - `gen.py` — pass 1: Gemini writes ORIGINAL MCQs per topic (with English + Pidgin explanation);
    pass 2: a different Gemini model answers each question blind and flags ambiguity; numeric items in
    Maths/Physics/Chemistry are re-computed in Python (`py` expression vs keyed option). Kept only when all agree.
    Run: `GEMINI_API_KEY=... PAR=3 python gen.py english maths ...` (resumable: finished topics are skipped).
  - `export.py` — dedupes, prettifies maths/chem text, balances answer letters, writes `app/public/data`.
  - `out/` — raw per-topic results incl. every rejected item and the reason. `stats.json` — counts.

## Storage
localStorage keys `crackit:progress:v1` (history, topic stats, streak days, seen counts, Pidgin pref) and
`crackit:exam:v1` (in-progress mock, so a killed tab resumes).


## v0.4 (Oct 7, 2026): WAEC / NECO mode + premium design system
- Exam switcher on Home: JAMB / WAEC / NECO (localStorage `crackit:mode`). WAEC/NECO screens are a lazy chunk: `app/src/ssce/ui.tsx` (+ pure logic `ssce/core.js`, unit-tested in `app/test/ssce.test.mjs`).
- Bank: `app/public/data/ssce/<subject>.json` + `index.json` (14 subjects, 1,655 questions, IDs `w<sub><topic><n>`, loaded per subject). Pipeline: `gen/waec_topics.json` (WAEC syllabus topics), `gen/gen4.py` (claude-sonnet-5 writes; gpt-6-sol + claude-opus-5-5 solve blind; Python check), `gen/export4.py`, audit `python3 gen/test_ssce_bank.py`.
- CBT room: one subject per paper, rules in `EXAMS` (core.js), navigator grid, flag for review, calculator, warnings at 10/5/1 min, auto-submit at time-up, result with A1–F9 estimate and topic breakdown.
- 5 credits tracker + study plan (exam day per exam, `p.ssce.dates`). SSCE progress lives in `progress.ssce` and syncs (sync-core mergeSsce).
- Design: tokens + dark mode (`fx.ts` theme, `data-theme` on <html>, inline pre-paint script in index.html), page transitions, skeletons, confetti, rings; all off under prefers-reduced-motion.
- Deploy: `python3 deploy-v4.py` (env VERCEL_TOKEN / VERCEL_TEAM / VERCEL_PROJECT to repoint).
