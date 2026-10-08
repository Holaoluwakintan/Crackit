
"""CrackIt v3 question generator (Oct 7 2026).
Pass 1: claude-sonnet-5 writes ORIGINAL JAMB-syllabus MCQs per topic (with key, explanation, pidgin, and a
        python expression for numeric items).
Pass 2: gpt-6-sol solves every item BLIND (no key shown).
Pass 3: claude-opus-5-5 solves every item BLIND (no key shown) and flags ambiguity/factual errors.
Numeric subjects: the python expression is evaluated and must equal the keyed option's value.
Kept = key == solver1 == solver2, no ambiguity flag from either, python check passes where present.
Output: out3/<subj>_<ti>.json  {subject, topic, generated, kept:[...], rejected:[{q,why}]}
"""
import os, sys, json, re, time, random, threading, glob
from concurrent.futures import ThreadPoolExecutor
import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("GEMINI_API_KEY", "unused")
import gen as G0   # reuse valid_shape, py_check, NUMERIC_RULE
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out3"); os.makedirs(OUT, exist_ok=True)
MC = json.load(open("/home/user/tab/.model-capability.json"))
TOPICS = json.load(open(os.path.join(HERE, "topics.json")))
NUMERIC = {"maths", "physics", "chemistry", "accounting", "geography", "commerce", "economics"}
PER = {"crs": 8, "commerce": 8, "accounting": 8, "geography": 8, "english": 6, "maths": 4, "physics": 4,
       "chemistry": 4, "biology": 4, "economics": 3, "government": 4, "literature": 7}
lock = threading.Lock()
def log(*a):
    with lock: print(time.strftime("%H:%M:%S"), *a, flush=True)

def _json(txt):
    m = re.search(r"\{.*\}", txt, re.S)
    return json.loads(m.group(0))

def anth(model, prompt, max_tokens=16000):
    for attempt in range(6):
        try:
            r = requests.post(MC["base_url"] + "/anthropic/v1/messages",
                headers={"Authorization": "Bearer " + MC["token"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}, timeout=500)
            if r.status_code == 200:
                txt = "".join(c.get("text", "") for c in r.json()["content"] if c.get("type") == "text")
                return _json(txt)
            log("anth http", model, r.status_code, r.text[:150])
        except Exception as e:
            log("anth err", model, repr(e)[:150])
        time.sleep(6 * (attempt + 1))
    raise RuntimeError("anth failed")

def oai(model, prompt):
    for attempt in range(6):
        try:
            r = requests.post(MC["base_url"] + "/openai/v1/chat/completions",
                headers={"Authorization": "Bearer " + MC["token"], "content-type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}}, timeout=500)
            if r.status_code == 200:
                return _json(r.json()["choices"][0]["message"]["content"])
            log("oai http", model, r.status_code, r.text[:150])
        except Exception as e:
            log("oai err", model, repr(e)[:150])
        time.sleep(6 * (attempt + 1))
    raise RuntimeError("oai failed")

EXTRA = {
 "literature": "- Test literary principles: genres, devices, figures of speech, poetic forms, dramatic terms, narrative techniques, and analysis of SHORT ORIGINAL extracts (prose/poem lines) that you write yourself and quote in full in the question. Do NOT ask about specific prescribed set books or real copyrighted poems.\n",
 "crs": "- Base every question on the Bible text (any standard translation agrees on the fact asked). Put the Bible reference in the explanation (e.g. 'Genesis 41:46'). No denominational doctrine presented as fact. Ask about events, people, teachings and their lessons as JAMB does.\n",
 "english": "- When a word to be tested is in capitals, say 'the word in capitals'. For oral English use standard British RP (as JAMB does) and only well-established sounds; avoid words whose pronunciation varies.\n",
 "accounting": "- Use naira (₦) amounts. Use IFRS-friendly but JAMB-standard terms (e.g. balance sheet / statement of financial position).\n",
 "geography": "- Facts about Nigeria and West Africa must be standard textbook facts that are not disputed. For map questions describe the map fully in words.\n",
}

GEN = """You are an experienced Nigerian secondary-school teacher and JAMB UTME examiner.
Write {n} ORIGINAL multiple-choice questions for JAMB UTME {subject}, syllabus topic: "{topic}".
Rules:
- Original wording and numbers. Do NOT copy or closely paraphrase any real JAMB/WAEC/NECO past question.
- Exactly 4 options. Exactly ONE option is correct; the other three are plausible but clearly wrong to an expert.
- JAMB style and level. Mix difficulty: about 30% easy, 45% medium, 25% hard. Hard items need a real step of reasoning, not obscure trivia.
- Each question must be self-contained (include the full instruction a candidate needs). No diagrams/images/tables to draw; describe any figure in words.
- Plain text maths: x^2, sqrt(3), 3/4, pi, log_2(8), ° for degrees. No LaTeX.
- Nigerian context welcome (names, ₦, places), neutral and respectful.
- No "All of the above"/"None of the above". Options must not repeat. Vary the correct letter.
- Avoid anything time-sensitive or disputed (current office holders, latest statistics). Use well-established facts.
- explanation: 2 to 4 short sentences in simple English saying WHY the answer is right (show key working for calculations).
- pidgin: the same explanation in natural Nigerian Pidgin English (2 to 4 short sentences, keep maths/terms exact).
{extra}{numeric_rule}
Do not repeat these existing questions on this topic:
{avoid}
Return ONLY JSON: {{"questions":[{{"q":"...","options":["...","...","...","..."],"answer":"A|B|C|D","difficulty":"easy|medium|hard","explanation":"...","pidgin":"..."{numeric_field}}}]}}"""

SOLVE = """You are a strict JAMB UTME {subject} examiner checking practice questions written by someone else.
Solve each question yourself, independently and carefully (work it out fully; for calculations compute exactly; do not guess).
For each item return:
- "id"
- "answer": the letter A-D of the single correct option, or "X" if no option is correct
- "ambiguous": true if more than one option could reasonably be defended, the question is unclear, depends on a missing figure, or contains a factual/scientific error; else false
- "note": a few words if there is a problem, else ""
Items (JSON lines):
{items}
Return ONLY JSON: {{"results":[{{"id":"...","answer":"A","ambiguous":false,"note":""}}]}}"""

def existing_stems(subj, ti, k=12):
    p = os.path.join(HERE, "..", "app", "public", "data", subj + ".json")
    if not os.path.exists(p): return []
    d = json.load(open(p))
    s = [q["q"].replace("\n", " ")[:140] for q in d["questions"] if q["t"] == ti]
    random.Random(ti).shuffle(s)
    return s[:k]

def solve_all(subj, sname, qs):
    items = "\n".join(json.dumps({"id": q["id"], "question": q["q"], "options": dict(zip("ABCD", q["options"]))}, ensure_ascii=False) for q in qs)
    p = SOLVE.format(subject=sname, items=items)
    with ThreadPoolExecutor(2) as ex:
        f1 = ex.submit(oai, "gpt-6-sol", p)
        f2 = ex.submit(anth, "claude-opus-5-5", p)
        r1, r2 = f1.result(), f2.result()
    m1 = {str(x.get("id")): x for x in r1.get("results", [])}
    m2 = {str(x.get("id")): x for x in r2.get("results", [])}
    return m1, m2

def do_topic(subj, ti):
    path = os.path.join(OUT, f"{subj}_{ti:02d}.json")
    if os.path.exists(path): return json.load(open(path))
    sname, topics = TOPICS[subj]; topic = topics[ti]
    num = subj in NUMERIC
    n = PER[subj]
    avoid = existing_stems(subj, ti)
    prompt = GEN.format(n=n, subject=sname, topic=topic, extra=EXTRA.get(subj, ""),
                        numeric_rule=G0.NUMERIC_RULE if num else "",
                        numeric_field=',"py":"...","values":[...]' if num else "",
                        avoid="\n".join("- " + s for s in avoid) or "(none)")
    res = {"subject": subj, "topic": topic, "generated": 0, "kept": [], "rejected": []}
    try:
        data = anth("claude-sonnet-5", prompt)
    except Exception as e:
        log("GEN FAIL", subj, ti, e); return None
    qs = data.get("questions", [])
    res["generated"] = len(qs)
    good = []
    for j, q in enumerate(qs):
        if not isinstance(q, dict) or not G0.valid_shape(q):
            res["rejected"].append({"q": q, "why": "bad-shape"}); continue
        q["id"] = f"{subj[:3]}v{ti:02d}{j:02d}"
        good.append(q)
    if good:
        try:
            m1, m2 = solve_all(subj, sname, good)
        except Exception as e:
            log("SOLVE FAIL", subj, ti, e); return None
        for q in good:
            a1, a2 = m1.get(q["id"]), m2.get(q["id"])
            q["check"] = {"s1": a1 and a1.get("answer"), "s2": a2 and a2.get("answer")}
            why = None
            if not a1 or not a2: why = "no-solve"
            elif a1.get("answer") != q["answer"]: why = f"solver1-disagrees:{a1.get('answer')}"
            elif a2.get("answer") != q["answer"]: why = f"solver2-disagrees:{a2.get('answer')}"
            elif a1.get("ambiguous") or a2.get("ambiguous"): why = "ambiguous:" + (a1.get("note") or "") + "|" + (a2.get("note") or "")
            if not why and num and q.get("py") is not None:
                ok, r = G0.py_check(q)
                q["check"]["py"] = r
                if ok is False: why = "python:" + r
            if why: res["rejected"].append({"q": q, "why": why})
            else: res["kept"].append(q)
    json.dump(res, open(path, "w"), ensure_ascii=False, indent=0)
    log(subj, ti, "gen", res["generated"], "kept", len(res["kept"]))
    return res

if __name__ == "__main__":
    subs = sys.argv[1:] or list(PER)
    jobs = [(s, ti) for s in subs for ti in range(len(TOPICS[s][1]))]
    random.Random(1).shuffle(jobs)
    with ThreadPoolExecutor(int(os.environ.get("PAR", "6"))) as ex:
        list(ex.map(lambda j: do_topic(*j), jobs))
    tot = {}
    for f in glob.glob(os.path.join(OUT, "*.json")):
        r = json.load(open(f)); s = r["subject"]
        t = tot.setdefault(s, [0, 0]); t[0] += r["generated"]; t[1] += len(r["kept"])
    print(json.dumps(tot))
