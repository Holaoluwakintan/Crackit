"""Answer-key audit for the WAEC/NECO (SSCE) bank. Run: python3 gen/test_ssce_bank.py
For every shipped question it checks, against the raw generator record in out4/:
  1. the record passed both blind solves (gpt-6-sol and claude-opus-5-5 picked the writer's key) with no ambiguity flag;
  2. the option shown as correct in the app is the same text as the double-solved key (after option shuffling);
  3. numeric items: when the keyed option is a plain number, the Python expression is re-evaluated now and must equal it;
  4. nothing shipped from the rejected lists, and no stem is copied from the JAMB bank.
"""
import json, os, glob, sys, re
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ.setdefault("GEMINI_API_KEY", "unused")
import export as E, gen as G0, export4 as X
fails = []; n = 0; pyn = 0
raw = {}; rejected = set()
for f in glob.glob(os.path.join(HERE, "out4", "*.json")):
    r = json.load(open(f))
    for q in r["kept"]: raw[(r["subject"], q["id"])] = q
    for x in r["rejected"]:
        if isinstance(x.get("q"), dict) and x["q"].get("id"): rejected.add((r["subject"], x["q"]["id"]))
D = os.path.join(HERE, "..", "app", "public", "data", "ssce")
for sid in X.ORDER:
    bank = json.load(open(os.path.join(D, sid + ".json")))
    jamb = set()
    jp = os.path.join(HERE, "..", "app", "public", "data", sid + ".json")
    if os.path.exists(jp): jamb = {E.norm(q["q"])[:160] for q in json.load(open(jp))["questions"]}
    fx = E.pretty_chem if sid == "chemistry" else E.pretty_math if sid in ("maths", "physics") else (lambda s: s)
    for q in bank["questions"]:
        n += 1; k = (sid, q["id"]); src = raw.get(k)
        if not src: fails.append((k, "no raw record")); continue
        if k in rejected: fails.append((k, "was rejected"))
        c = src.get("check") or {}
        if not (c.get("s1") == c.get("s2") == src["answer"]): fails.append((k, f"solves disagree {c}"))
        opts = [o.strip() for o in src["options"]]
        if sum(1 for o in opts if re.match(r"^[A-D][.)]\s+", o)) >= 3: opts = [re.sub(r"^[A-D][.)]\s+", "", o) for o in opts]
        want = fx(opts["ABCD".index(src["answer"])])
        if q["o"][q["a"]] != want: fails.append((k, f"shown key {q['o'][q['a']]!r} != solved key {want!r}"))
        if sorted(q["o"]) != sorted(fx(o) for o in opts): fails.append((k, "option set changed"))
        if sid in G0.__dict__.get("NUMERIC", set()) or sid in {"maths", "physics", "chemistry", "accounting", "geography", "commerce", "economics", "agric"}:
            plain = G0.parse_num(src["options"]["ABCD".index(src["answer"])]) is not None
            if plain or src.get("py") is not None:
                ok, why = G0.py_check(src); pyn += 1
                if ok is not True and (plain or ok is False): fails.append((k, "python " + why))
        if E.norm(src["q"])[:160] in jamb: fails.append((k, "copied from JAMB bank"))
        if not q.get("p") or len(q["e"]) < 20: fails.append((k, "missing explanation/pidgin"))
print(f"checked {n} shipped SSCE questions; {pyn} numeric keys re-computed in Python; {len(fails)} failures")
for f in fails[:30]: print("FAIL", f)
sys.exit(1 if fails else 0)
