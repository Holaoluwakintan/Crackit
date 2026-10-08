
"""Turn generator output into the app's offline JSON packs (public/data)."""
import json, os, re, glob, random, collections, sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "app", "public", "data")
TOPICS = json.load(open(os.path.join(HERE, "topics.json")))
ORDER = ["english", "maths", "physics", "chemistry", "biology", "economics", "government", "literature", "crs", "commerce", "accounting", "geography"]
MIN_SHIP = int(os.environ.get("MIN_SHIP", "60"))
SUP = str.maketrans("0123456789-+abcdefghijklmnoprstuvwxyz", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ")
SUB = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")

def pretty_math(s):
    s = re.sub(r"\bsqrt\(([0-9a-zA-Z.]+)\)", r"√\1", s)
    s = re.sub(r"\bsqrt\(", "√(", s)
    s = re.sub(r"\bsqrt\b", "√", s)
    s = re.sub(r"\^\((-?\d*[a-pr-z]?(?:[+-]\d+)?)\)|\^(-?\d+|[a-pr-z](?![a-z]))", lambda m: (m.group(1) or m.group(2)).translate(SUP) if (m.group(1) or m.group(2)) else m.group(0), s)
    s = re.sub(r"\b(\d+)_(\d{1,2})\b", lambda m: m.group(1) + m.group(2).translate(SUB), s)
    s = re.sub(r"(\d)\s*\*\s*(?=[√πa-zA-Z(])", r"\1", s)
    s = re.sub(r"\s*\*\s*", " × ", s)
    s = re.sub(r"\bpi\b", "π", s)
    s = re.sub(r"(\d)\s?deg\b", r"\1°", s)
    s = re.sub(r"\blog_(\d+)", lambda m: "log" + m.group(1).translate(SUB), s)
    s = re.sub(r"\blog_\{?([a-z])\}?", r"log_\1", s)
    return s

def pretty_chem(s):
    def f(m):
        tok = m.group(0)
        if not re.search(r"[A-Z][a-z]?\d|\)\d", tok): return tok
        lead = re.match(r"^\d*", tok).group(0)
        rest = tok[len(lead):]
        return lead + re.sub(r"(?<=[A-Za-z)])(\d+)", lambda k: k.group(1).translate(SUB), rest)
    s = re.sub(r"\b\d*(?:(?:[A-Z][a-z]?|\([A-Za-z0-9]+\))\d*){1,8}\b", f, s)
    s = re.sub(r"\^(\d*[+-])(?!\d)", lambda m: m.group(1).translate(SUP), s)
    return pretty_math(s)

NOSHUF = re.compile(r"\b(both|neither|all of|none of|[A-D] and [A-D])\b", re.I)
LETTER_REF = re.compile(r"\b(option|options|choice)\s+[A-D]\b|\([A-D]\)", re.I)

ENG_INSTR = {0: "Choose the option nearest in meaning to the word in capitals.",
             1: "Choose the option opposite in meaning to the word in capitals.",
             6: "Choose the option that best explains the expression in quotes."}

def norm(s): return re.sub(r"[^a-z0-9]", "", s.lower())

def main():
    os.makedirs(OUTDIR, exist_ok=True)
    stats = {}; meta = []; global newc; newc = {}
    for sid in ORDER:
        name, topics = TOPICS[sid]
        gen = kept = 0; rej = collections.Counter(); qs = []; seen = set()
        tcount = [0] * len(topics)
        cyc = []
        apath = os.path.join(HERE, "audit", sid + ".json")
        audit = json.load(open(apath)) if os.path.exists(apath) else {}
        unaudited = 0
        bpath = os.path.join(HERE, "blocklist.json")
        block = set(json.load(open(bpath)).get(sid, [])) if os.path.exists(bpath) else set()
        for path in sorted(glob.glob(os.path.join(HERE, "out", f"{sid}_*.json"))) + sorted(glob.glob(os.path.join(HERE, "out3", f"{sid}_*.json"))):
            v3 = "/out3/" in path
            r = json.load(open(path))
            ti = topics.index(r["topic"])
            gen += r["generated"]
            for x in r["rejected"]:
                w = x["why"].split(":")[0].split(" ")[0]; rej[w] += 1
            for q in r["kept"]:
                if q["id"] in block: rej["manual"] += 1; continue
                au = None if v3 else audit.get(q["id"])
                if au is None and not v3: unaudited += 1
                elif not v3 and (not au["ok"] or au.get("answer") != q["answer"]): rej["audit"] += 1; continue
                key = norm(q["q"])[:160]
                if key in seen: rej["duplicate"] += 1; continue
                seen.add(key)
                if v3: newc[sid] = newc.get(sid, 0) + 1
                fx = pretty_chem if sid == "chemistry" else pretty_math if sid in ("maths", "physics") else (lambda s: s)
                raw = [o.strip() for o in q["options"]]
                if sum(1 for o in raw if re.match(r"^[A-D][.)]\s+", o)) >= 3:
                    raw = [re.sub(r"^[A-D][.)]\s+", "", o) for o in raw]
                opts = [fx(o) for o in raw]
                if len({re.sub(r"\s+", " ", o).strip() for o in opts}) < 4:
                    rej["dup-option"] += 1; continue
                stem = q["q"].strip()
                if re.search(r"['\"‘“]", stem): stem = re.sub(r"\b(the )?highlighted (word|words|expression|phrase)", lambda m: (m.group(1) or "") + m.group(2) + " in quotes", stem)
                stem = re.sub(r"\b(sentence|word|phrase|words|expression)s? in italics", lambda m: m.group(0).replace("in italics", "in quotes"), stem)
                if re.search(r"\b[A-Z]{3,}\b", stem): stem = re.sub(r"\bunderlined (word|words|expression)\b", r"\1 in capitals", stem)
                if sid == "english":
                    if not re.search(r"\b(choose|select|which|what|identify|pick)\b", stem, re.I):
                        pre = ENG_INSTR.get(ti) or ("Choose the option that best completes the gap." if "__" in stem else None)
                        if pre: stem = pre + "\n" + stem
                    if ti in (11, 12, 15):  # oral: an option identical to the given word is a giveaway
                        caps = re.findall(r"\b\w*[A-Z]{1,4}\w*\b", stem.split(":")[-1])
                        given = {c.lower() for c in caps}
                        if any(o.lower() in given for o in opts): rej["trivial-oral"] += 1; continue
                q = dict(q, q=stem)
                a = "ABCD".index(q["answer"])
                rnd = random.Random(q["id"])
                if not NOSHUF.search(" ".join(opts)) and not LETTER_REF.search(q["explanation"] + " " + q.get("pidgin", "")):
                    if not cyc: cyc.extend(rnd.sample(range(4), 4))
                    tgt = cyc.pop()
                    others = [i for i in range(4) if i != a]; rnd.shuffle(others)
                    order = others[:tgt] + [a] + others[tgt:]
                    opts = [opts[i] for i in order]; a = tgt
                d = {"easy": "e", "medium": "m", "hard": "h"}.get(str(q.get("difficulty", "")).lower(), "m")
                item = {"id": q["id"], "t": ti, "d": d, **({"n": 1} if v3 else {}), "q": fx(q["q"].strip()), "o": opts, "a": a, "e": fx(q["explanation"].strip())}
                if q.get("pidgin"): item["p"] = fx(q["pidgin"].strip())
                qs.append(item); tcount[ti] += 1
        kept = len(qs)
        stats[sid] = {"generated": gen, "kept": kept, "rejected": gen - kept, "reasons": dict(rej),
                      "unaudited": unaudited, "answer_letters": dict(collections.Counter("ABCD"[q["a"]] for q in qs))}
        ship = kept >= MIN_SHIP
        if ship:
            json.dump({"id": sid, "name": name, "topics": topics_clean(topics), "questions": qs},
                      open(os.path.join(OUTDIR, sid + ".json"), "w"), ensure_ascii=False, separators=(",", ":"))
        meta.append({"id": sid, "name": name, "count": kept if ship else 0, "compulsory": sid == "english",
                     "topics": [{"name": t, "count": c} for t, c in zip(topics_clean(topics), tcount)]})
    json.dump(meta, open(os.path.join(OUTDIR, "index.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    for k in stats: stats[k]["new_v3"] = newc.get(k, 0)
    json.dump(stats, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
    for k, v in stats.items(): print(k, v["generated"], v["kept"], v["rejected"], v["reasons"], v["answer_letters"])

def topics_clean(topics):
    # shorter display names: drop the instruction part in brackets/after colon for English oral items
    out = []
    for t in topics:
        t = re.sub(r"\s*\([^)]*\)", "", t)
        t = re.sub(r":\s*(word nearest|word opposite|which option|meaning of the|choose the).*$", "", t)
        out.append(t.strip())
    return out

if __name__ == "__main__":
    main()
