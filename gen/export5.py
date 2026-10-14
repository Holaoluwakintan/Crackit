
"""CrackIt v5 export: shipped bank (frozen copy in base5/, option order kept so challenge links and saved answers stay valid)
minus blocklist (manual + v5 audit removals) plus the new v5 items from out5/ (dedupe, prettify, balanced answer letters).
Writes app/public/data/<subj>.json + index.json and gen/stats5.json. Old IDs are never renumbered."""
import json, os, re, glob, random, collections, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
sys.argv = sys.argv[:1]
import export as X
DATA = os.path.join(HERE, "..", "app", "public", "data")
BASE = os.path.join(HERE, "base5")
T5 = json.load(open(os.path.join(HERE, "topics5.json")))
ORDER = X.ORDER
SHORT = {"english": ["Comprehension (short passages)", "Cloze passages", "Grammatical names and functions"],
         "physics": ["Gravitational field and satellites", "Alternating current", "Semiconductors and basic electronics", "Fluids: surface tension and viscosity", "Energy and society"],
         "chemistry": ["Carbon and its compounds", "Fats, oils, soaps and food chemistry"],
         "economics": ["Business organisations", "Distributive trade"],
         "government": ["Political ideologies"],
         "biology": ["Biotechnology and applied genetics"]}
def integ(s):
    s = re.sub(r"\bint_\(?([^\s^()]+)\)?\^\(?([^\s()]+(?:/[^\s()]+)?)\)?\s*", r"∫ (from \1 to \2) ", s)
    s = re.sub(r"\bint\s*(?=\()", "∫ ", s)
    s = re.sub(r"\bint\s+(?=[\w√(])", "∫ ", s)
    return s
def main():
    if not os.path.isdir(BASE):
        os.makedirs(BASE)
        for s in ORDER: shutil.copy(os.path.join(DATA, s + ".json"), BASE)
        shutil.copy(os.path.join(DATA, "index.json"), BASE)
    block = json.load(open(os.path.join(HERE, "blocklist.json")))
    old_meta = {m["id"]: m for m in json.load(open(os.path.join(BASE, "index.json")))}
    meta = []; stats = {}
    opath = os.path.join(HERE, "order5.json")   # frozen option order per new id, so later removals never reshuffle shipped items
    frozen = json.load(open(opath)) if os.path.exists(opath) else {}
    ssce = set()   # new JAMB items must not repeat a WAEC/NECO bank stem (test_ssce_bank.py checks this)
    for f in glob.glob(os.path.join(DATA, "ssce", "*.json")) + glob.glob(os.path.join(HERE, "out4", "*.json")):
        try: d = json.load(open(f))
        except Exception: continue
        for q in (d.get("questions") or []) + (d.get("kept") or []) if isinstance(d, dict) else []:
            if isinstance(q, dict) and isinstance(q.get("q"), str): ssce.add(X.norm(q["q"])[:160])
    for sid in ORDER:
        b = json.load(open(os.path.join(BASE, sid + ".json")))
        bl = set(block.get(sid, []))
        base = [q for q in b["questions"] if q["id"] not in bl]
        removed = len(b["questions"]) - len(base)
        extra = T5[sid][1][len(b["topics"]):]
        topics = list(b["topics"]) + (SHORT[sid] if sid in SHORT else X.topics_clean(extra))
        assert len(topics) == len(T5[sid][1]), sid
        seen = {X.norm(q["q"])[:160] for q in base} | ssce
        fx0 = X.pretty_chem if sid == "chemistry" else X.pretty_math if sid in ("maths", "physics") else (lambda s: s)
        fx = (lambda s: fx0(integ(s))) if sid in ("maths", "physics") else fx0
        cnt = collections.Counter(q["a"] for q in base)
        rej = collections.Counter(); new = []; gen = 0
        for path in sorted(glob.glob(os.path.join(HERE, "out5", f"{sid}_*.json"))):
            r = json.load(open(path)); ti = r["ti"]; gen += r["generated"]
            for x in r["rejected"]: rej[x["why"].split(":")[0]] += 1
            for q in r["kept"]:
                if q["id"] in bl: rej["manual"] += 1; continue
                key = X.norm(q["q"])[:160]
                if key in seen: rej["duplicate"] += 1; continue
                raw = [o.strip() for o in q["options"]]
                if sum(1 for o in raw if re.match(r"^[A-D][.)]\s+", o)) >= 3: raw = [re.sub(r"^[A-D][.)]\s+", "", o) for o in raw]
                opts = [fx(o) for o in raw]
                if len({re.sub(r"\s+", " ", o).strip() for o in opts}) < 4: rej["dup-option"] += 1; continue
                stem = q["q"].strip()
                if re.search(r"['\"‘“]", stem): stem = re.sub(r"\b(the )?highlighted (word|words|expression|phrase)", lambda m: (m.group(1) or "") + m.group(2) + " in quotes", stem)
                stem = re.sub(r"\b(sentence|word|phrase|words|expression)s? in italics", lambda m: m.group(0).replace("in italics", "in quotes"), stem)
                if re.search(r"\b[A-Z]{3,}\b", stem): stem = re.sub(r"\bunderlined (word|words|expression)\b", r"\1 in capitals", stem)
                if sid == "english":
                    if not re.search(r"\b(choose|select|which|what|identify|pick|read)\b", stem, re.I):
                        pre = X.ENG_INSTR.get(ti) or ("Choose the option that best completes the gap." if "__" in stem else None)
                        if pre: stem = pre + "\n" + stem
                    if ti in (11, 12, 15):
                        caps = re.findall(r"\b\w*[A-Z]{1,4}\w*\b", stem.split(":")[-1])
                        given = {c.lower() for c in caps}
                        if any(o.lower() in given for o in opts): rej["trivial-oral"] += 1; continue
                seen.add(key)
                a = "ABCD".index(q["answer"])
                if q["id"] in frozen:
                    order = frozen[q["id"]]; opts = [opts[i] for i in order]; a = order.index(a)
                elif not X.NOSHUF.search(" ".join(opts)) and not X.LETTER_REF.search(q["explanation"] + " " + q.get("pidgin", "")):
                    rnd = random.Random(q["id"])
                    low = min(cnt[i] for i in range(4)); cands = [i for i in range(4) if cnt[i] == low]
                    tgt = rnd.choice(cands)
                    others = [i for i in range(4) if i != a]; rnd.shuffle(others)
                    order = others[:tgt] + [a] + others[tgt:]
                    opts = [opts[i] for i in order]; a = tgt
                    frozen[q["id"]] = order
                else:
                    frozen[q["id"]] = [0, 1, 2, 3]
                cnt[a] += 1
                d = {"easy": "e", "medium": "m", "hard": "h"}.get(str(q.get("difficulty", "")).lower(), "m")
                item = {"id": q["id"], "t": ti, "d": d, "q": fx(stem), "o": opts, "a": a, "e": fx(q["explanation"].strip())}
                if q.get("pidgin"): item["p"] = fx(q["pidgin"].strip())
                new.append(item)
        qs = base + new
        tcount = [0] * len(topics)
        for q in qs: tcount[q["t"]] += 1
        json.dump({"id": sid, "name": b["name"], "topics": topics, "questions": qs}, open(os.path.join(DATA, sid + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
        meta.append({"id": sid, "name": b["name"], "count": len(qs), "compulsory": old_meta[sid]["compulsory"],
                     "topics": [{"name": t, "count": c} for t, c in zip(topics, tcount)]})
        stats[sid] = {"before": len(b["questions"]), "removed": removed, "generated_v5": gen, "added_v5": len(new), "after": len(qs),
                      "reject_reasons_v5": dict(rej), "answer_letters": dict(collections.Counter("ABCD"[q["a"]] for q in qs)),
                      "difficulty_new": dict(collections.Counter(q["d"] for q in new)), "pidgin_missing": sum(1 for q in qs if not q.get("p"))}
    json.dump(frozen, open(opath, "w"), separators=(",", ":"))
    json.dump(meta, open(os.path.join(DATA, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(stats, open(os.path.join(HERE, "stats5.json"), "w"), indent=1)
    for k, v in stats.items(): print(k, v["before"], "-", v["removed"], "+", v["added_v5"], "=", v["after"], v["answer_letters"], "nopidgin", v["pidgin_missing"])
if __name__ == "__main__":
    main()
