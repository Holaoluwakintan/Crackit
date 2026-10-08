"""CrackIt v4 WAEC/NECO (SSCE) question generator (Oct 7 2026).
Pass 1: claude-sonnet-5 writes ORIGINAL WASSCE/NECO SSCE objective items per WAEC syllabus topic
        (key, difficulty, English + Pidgin explanation, python expression for numeric items).
Pass 2: gpt-6-sol solves every item BLIND.   Pass 3: claude-opus-5-5 solves every item BLIND.
Numeric subjects: when the keyed option is a plain number the python expression MUST exist and equal it.
Kept = key == solver1 == solver2, no ambiguity flag, python check passes where required.
Output: out4/<subj>_<ti>.json
"""
import os, sys, json, re, time, random, glob
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("GEMINI_API_KEY", "unused")
import gen as G0
import gen3 as G3
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out4"); os.makedirs(OUT, exist_ok=True)
TOPICS = json.load(open(os.path.join(HERE, "waec_topics.json")))
NUMERIC = {"maths", "physics", "chemistry", "accounting", "geography", "commerce", "economics", "agric"}
PFX = {"english": "eng", "maths": "mth", "physics": "phy", "chemistry": "che", "biology": "bio", "economics": "eco",
       "government": "gov", "literature": "lit", "crs": "crs", "commerce": "com", "accounting": "acc",
       "geography": "geo", "civic": "civ", "agric": "agr"}
log = G3.log
EXTRA = dict(G3.EXTRA)
EXTRA["civic"] = "- Follow the WAEC Civic Education syllabus for Nigeria. Use settled facts (constitutional provisions, definitions, well-known agencies like FRSC, NDLEA, NAPTIP, EFCC, ICPC). No partisan politics and no current office holders.\n"
EXTRA["agric"] = "- Use standard West African textbook facts (crops, livestock breeds, pests and diseases common in Nigeria). Calculations use simple farm records in naira.\n"
EXTRA["english"] = EXTRA["english"] + "- For comprehension, write a short ORIGINAL passage (60-120 words) inside the question itself, then ask one question on it.\n- WAEC style instructions, e.g. 'From the words lettered A to D, choose the word that is nearest in meaning to the underlined word' — since we cannot underline, put the tested word in CAPITALS and say 'the word in capitals'.\n"
EXTRA["literature"] = EXTRA["literature"].replace("JAMB", "WAEC")
EXTRA["crs"] = EXTRA["crs"].replace("JAMB", "WAEC")

GEN = """You are an experienced Nigerian SS3 teacher and a WAEC (WASSCE) / NECO (SSCE) chief examiner.
Write {n} ORIGINAL objective (multiple-choice) questions for the SSCE {subject} paper, WAEC syllabus topic: "{topic}".
Rules:
- Original wording and numbers. Do NOT copy or closely paraphrase any real WAEC, NECO or JAMB past question.
- Exactly 4 options (A-D). Exactly ONE option is correct; the other three are plausible but clearly wrong to an expert.
- WASSCE/NECO SS3 level and style (school-certificate standard, slightly more direct than JAMB). Mix difficulty: about 35% easy, 45% medium, 20% hard. Hard items need a real step of reasoning, not obscure trivia.
- Each question must be self-contained. No diagrams/images; describe any figure, table or map fully in words.
- Plain text maths: x^2, sqrt(3), 3/4, pi, log_2(8), ° for degrees. No LaTeX. Take pi = 22/7 only if the question says so.
- Nigerian/West African context welcome (names, ₦, places), neutral and respectful.
- No "All of the above"/"None of the above". Options must not repeat. Vary the correct letter.
- Avoid anything time-sensitive or disputed (current office holders, latest statistics). Use well-established facts.
- explanation: 2 to 4 short sentences in simple English saying WHY the answer is right (show the key working for calculations).
- pidgin: the same explanation in natural Nigerian Pidgin English (2 to 4 short sentences, keep maths/terms exact).
{extra}{numeric_rule}
Return ONLY JSON: {{"questions":[{{"q":"...","options":["...","...","...","..."],"answer":"A|B|C|D","difficulty":"easy|medium|hard","explanation":"...","pidgin":"..."{numeric_field}}}]}}"""

def do_topic(subj, ti):
    path = os.path.join(OUT, f"{subj}_{ti:02d}.json")
    if os.path.exists(path): return json.load(open(path))
    sname, topics, n = TOPICS[subj]; topic = topics[ti]
    num = subj in NUMERIC
    prompt = GEN.format(n=n, subject=sname, topic=topic, extra=EXTRA.get(subj, ""),
                        numeric_rule=G0.NUMERIC_RULE if num else "",
                        numeric_field=',"py":"...","values":[...]' if num else "")
    res = {"subject": subj, "topic": topic, "ti": ti, "generated": 0, "kept": [], "rejected": []}
    try:
        data = G3.anth("claude-sonnet-5", prompt)
    except Exception as e:
        log("GEN FAIL", subj, ti, e); return None
    qs = data.get("questions", [])
    res["generated"] = len(qs)
    good = []
    for j, q in enumerate(qs):
        if not isinstance(q, dict) or not G0.valid_shape(q):
            res["rejected"].append({"q": q, "why": "bad-shape"}); continue
        q["id"] = f"w{PFX[subj]}{ti:02d}{j:02d}"
        good.append(q)
    if good:
        try:
            m1, m2 = G3.solve_all(subj, "WAEC/NECO SSCE " + sname, good)
        except Exception as e:
            log("SOLVE FAIL", subj, ti, e); return None
        for q in good:
            a1, a2 = m1.get(q["id"]), m2.get(q["id"])
            q["check"] = {"s1": a1 and a1.get("answer"), "s2": a2 and a2.get("answer"), "s1m": "gpt-6-sol", "s2m": "claude-opus-5-5"}
            why = None
            if not a1 or not a2: why = "no-solve"
            elif a1.get("answer") != q["answer"]: why = f"solver1-disagrees:{a1.get('answer')}"
            elif a2.get("answer") != q["answer"]: why = f"solver2-disagrees:{a2.get('answer')}"
            elif a1.get("ambiguous") or a2.get("ambiguous"): why = "ambiguous:" + (a1.get("note") or "") + "|" + (a2.get("note") or "")
            if not why and num:
                keyed = q["options"]["ABCD".index(q["answer"])]
                keyed_num = G0.parse_num(keyed) is not None
                if q.get("py") is not None or keyed_num:
                    ok, r = G0.py_check(q)
                    q["check"]["py"] = r
                    if ok is not True and (keyed_num or ok is False): why = "python:" + r
            if why: res["rejected"].append({"q": q, "why": why})
            else: res["kept"].append(q)
    json.dump(res, open(path, "w"), ensure_ascii=False, indent=0)
    log(subj, ti, "gen", res["generated"], "kept", len(res["kept"]))
    return res

if __name__ == "__main__":
    subs = sys.argv[1:] or list(TOPICS)
    jobs = [(s, ti) for s in subs for ti in range(len(TOPICS[s][1]))]
    random.Random(4).shuffle(jobs)
    with ThreadPoolExecutor(int(os.environ.get("PAR", "8"))) as ex:
        list(ex.map(lambda j: do_topic(*j), jobs))
    tot = {}
    for f in glob.glob(os.path.join(OUT, "*.json")):
        r = json.load(open(f)); s = r["subject"]
        t = tot.setdefault(s, [0, 0]); t[0] += r["generated"]; t[1] += len(r["kept"])
    print(json.dumps(tot))
