"""Export out4 (WAEC/NECO SSCE bank) to app/public/data/ssce/*.json + index.json, and gen/stats4.json."""
import json, os, re, glob, random, collections
import export as E
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "..", "app", "public", "data", "ssce")
JAMB = os.path.join(HERE, "..", "app", "public", "data")
TOPICS = json.load(open(os.path.join(HERE, "waec_topics.json")))
ORDER = ["english", "maths", "civic", "biology", "physics", "chemistry", "agric", "economics", "government",
         "literature", "crs", "commerce", "accounting", "geography"]
COMPULSORY = {"english", "maths", "civic"}
JAMB_MAP = {s: s for s in ["english","maths","physics","chemistry","biology","economics","government","literature","crs","commerce","accounting","geography"]}

def main():
    os.makedirs(OUTDIR, exist_ok=True)
    stats = {}; meta = []
    for sid in ORDER:
        name, topics, _ = TOPICS[sid]
        seen = set()
        jp = os.path.join(JAMB, JAMB_MAP.get(sid, "_none") + ".json")
        if os.path.exists(jp):
            for q in json.load(open(jp))["questions"]: seen.add(E.norm(q["q"])[:160])
        jamb_seen = set(seen)
        gen = 0; rej = collections.Counter(); qs = []; tcount = [0]*len(topics); cyc = []; pyok = 0; diff = collections.Counter()
        for path in sorted(glob.glob(os.path.join(HERE, "out4", f"{sid}_*.json"))):
            r = json.load(open(path)); ti = topics.index(r["topic"]); gen += r["generated"]
            for x in r["rejected"]:
                rej[x["why"].split(":")[0]] += 1
            for q in r["kept"]:
                key = E.norm(q["q"])[:160]
                if key in jamb_seen: rej["same-as-jamb-bank"] += 1; continue
                if key in seen: rej["duplicate"] += 1; continue
                seen.add(key)
                fx = E.pretty_chem if sid == "chemistry" else E.pretty_math if sid in ("maths", "physics") else (lambda s: s)
                raw = [o.strip() for o in q["options"]]
                if sum(1 for o in raw if re.match(r"^[A-D][.)]\s+", o)) >= 3:
                    raw = [re.sub(r"^[A-D][.)]\s+", "", o) for o in raw]
                opts = [fx(o) for o in raw]
                if len({re.sub(r"\s+", " ", o).strip() for o in opts}) < 4: rej["dup-option"] += 1; continue
                stem = q["q"].strip()
                stem = re.sub(r"\b(sentence|word|phrase|words|expression)s? in italics", lambda m: m.group(0).replace("in italics", "in quotes"), stem)
                if re.search(r"\b[A-Z]{3,}\b", stem): stem = re.sub(r"\bunderlined (word|words|expression)\b", r"\1 in capitals", stem)
                a = "ABCD".index(q["answer"]); rnd = random.Random(q["id"])
                if not E.NOSHUF.search(" ".join(opts)) and not E.LETTER_REF.search(q["explanation"] + " " + q.get("pidgin", "")):
                    if not cyc: cyc.extend(rnd.sample(range(4), 4))
                    tgt = cyc.pop(); others = [i for i in range(4) if i != a]; rnd.shuffle(others)
                    order = others[:tgt] + [a] + others[tgt:]; opts = [opts[i] for i in order]; a = tgt
                d = {"easy": "e", "medium": "m", "hard": "h"}.get(str(q.get("difficulty", "")).lower(), "m"); diff[d] += 1
                if (q.get("check") or {}).get("py") == "py-ok": pyok += 1
                item = {"id": q["id"], "t": ti, "d": d, "q": fx(stem), "o": opts, "a": a, "e": fx(q["explanation"].strip())}
                if q.get("pidgin"): item["p"] = fx(q["pidgin"].strip())
                else: rej["no-pidgin"] += 1; continue
                qs.append(item); tcount[ti] += 1
        tl = E.topics_clean(topics)
        json.dump({"id": sid, "name": name, "topics": tl, "questions": qs}, open(os.path.join(OUTDIR, sid + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
        meta.append({"id": sid, "name": name, "count": len(qs), "compulsory": sid in COMPULSORY, "topics": [{"name": t, "count": c} for t, c in zip(tl, tcount)]})
        stats[sid] = {"generated": gen, "shipped": len(qs), "dropped": gen - len(qs), "reasons": dict(rej), "python_verified": pyok,
                      "difficulty": dict(diff), "answer_letters": dict(collections.Counter("ABCD"[q["a"]] for q in qs))}
        print(sid, gen, len(qs), dict(rej), "py", pyok, dict(diff))
    json.dump(meta, open(os.path.join(OUTDIR, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(stats, open(os.path.join(HERE, "stats4.json"), "w"), indent=1)
    print("TOTAL", sum(s["shipped"] for s in stats.values()))

if __name__ == "__main__":
    main()
