
"""CrackIt v5 question generator (Oct 13 2026): grow the JAMB bank to ~2x at UTME standard.
Writer: claude-sonnet-5 (Tab model proxy). Blind solver 1: claude-opus-5-5 (also grades JAMB standard).
Blind solver 2: Gemini Flash-Lite (Michael's free tier; falls back to gpt-6-sol). Numeric items re-computed in Python.
Kept = key == solver1 == solver2, no ambiguity/quality flag, python check passes where present, not a near-duplicate.
Output: out5/<subj>_<ti>_<b>.json {subject, topic, ti, b, generated, kept, rejected}. IDs <sub>x<ti:02><b><j> (new prefix x; old IDs untouched).
"""
import os, sys, json, re, time, random, threading, glob, difflib
from concurrent.futures import ThreadPoolExecutor
import requests
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("GEMINI_API_KEY", "unused")
import gen as G0
OUT = os.path.join(HERE, "out5"); os.makedirs(OUT, exist_ok=True)
DATA = os.path.join(HERE, "..", "app", "public", "data")
MC = json.load(open("/home/user/tab/.model-capability.json"))
TOPICS = json.load(open(os.path.join(HERE, "topics5.json")))
PLAN = json.load(open(os.path.join(HERE, "plan5.json")))   # {subj: {ti: n_batches}}
NUMERIC = {"maths", "physics", "chemistry", "accounting", "geography", "commerce", "economics"}
PER = int(os.environ.get("PER", "8"))
lock = threading.Lock()
SPEND = os.path.join(HERE, "spend5.json")
PRICE = {"gpt-6-sol-x": (2, 10), "claude-sonnet-5": (2, 10), "claude-opus-5-5": (4, 20), "gpt-6-sol": (2, 10)}
def _envf(p):
    d = {}
    for l in open(p):
        l = l.strip()
        if "=" in l and not l.startswith("#"):
            k, v = l.split("=", 1); d[k.replace("export ", "").strip()] = v.strip().strip("\"'")
    return d
_g = _envf("/home/user/tab/files/.michael-gemini.env")
GKEYS = [_g[k] for k in ("GEMINI_API_KEY", "GEMINI_API_KEY_2") if _g.get(k)]
GMODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"]
GDEAD = set()

def log(*a):
    with lock: print(time.strftime("%H:%M:%S"), *a, flush=True)

def add_spend(model, inp, out):
    with lock:
        s = json.load(open(SPEND)) if os.path.exists(SPEND) else {}
        m = s.setdefault(model, {"in": 0, "out": 0, "calls": 0})
        m["in"] += inp; m["out"] += out; m["calls"] += 1
        tot = 0
        for k, v in s.items():
            if k in PRICE: tot += v["in"] / 1e6 * PRICE[k][0] + v["out"] / 1e6 * PRICE[k][1]
        s["_usd"] = round(tot, 3)
        json.dump(s, open(SPEND, "w"), indent=1)
        return tot

def usd():
    s = json.load(open(SPEND)) if os.path.exists(SPEND) else {}
    return s.get("_usd", 0)

def _json(txt):
    t = txt.strip()
    if t.startswith("```"): t = re.sub(r"^```\w*|```$", "", t).strip()
    try:
        v = json.loads(t, strict=False)
        if isinstance(v, list):
            if v and isinstance(v[0], dict) and ("results" in v[0] or "questions" in v[0]): return v[0]
            return {"results": v, "questions": v}
        return v
    except Exception:
        pass
    i = txt.find("{")
    try:
        return json.loads(txt[i:], strict=False)
    except Exception:
        return json.JSONDecoder(strict=False).raw_decode(txt[i:])[0]

def anth(model, prompt, max_tokens=16000, effort=None, think=True):
    body = {"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}
    if effort: body["output_config"] = {"effort": effort}
    if not think: body["thinking"] = {"type": "disabled"}
    for attempt in range(6):
        try:
            r = requests.post(MC["base_url"] + "/anthropic/v1/messages",
                headers={"Authorization": "Bearer " + MC["token"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json=body, timeout=600)
            if r.status_code == 200:
                j = r.json(); u = j.get("usage", {})
                add_spend(model, u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0), u.get("output_tokens", 0))
                txt = "".join(c.get("text", "") for c in j["content"] if c.get("type") == "text")
                return _json(txt)
            log("anth http", model, r.status_code, r.text[:150])
            if r.status_code == 400 and "output_config" in r.text and "output_config" in body:
                body.pop("output_config")
        except Exception as e:
            log("anth err", model, repr(e)[:150])
        time.sleep(6 * (attempt + 1))
    raise RuntimeError("anth failed")

QSCHEMA = {"type": "object", "properties": {"questions": {"type": "array", "items": {"type": "object", "properties": {
    "q": {"type": "string"}, "options": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4}, "answer": {"type": "string", "enum": ["A", "B", "C", "D"]},
    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]}, "explanation": {"type": "string"},
    "py": {"type": ["string", "null"]}, "values": {"type": ["array", "null"], "items": {"type": ["number", "null"]}}},
    "required": ["q", "options", "answer", "difficulty", "explanation"]}}}, "required": ["questions"]}

def anth_tool(model, prompt, max_tokens=12000):
    body = {"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}],
            "tools": [{"name": "submit_questions", "description": "Submit the finished questions.", "input_schema": QSCHEMA}],
            "tool_choice": {"type": "tool", "name": "submit_questions"}}
    for attempt in range(5):
        try:
            r = requests.post(MC["base_url"] + "/anthropic/v1/messages",
                headers={"Authorization": "Bearer " + MC["token"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json=body, timeout=600)
            if r.status_code == 200:
                j = r.json(); u = j.get("usage", {})
                add_spend(model, u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0), u.get("output_tokens", 0))
                for c in j["content"]:
                    if c.get("type") == "tool_use":
                        v = c.get("input") or {}
                        if isinstance(v.get("questions"), str): v["questions"] = _json(v["questions"]).get("questions", [])
                        return v
                log("anth tool: no tool_use", j.get("stop_reason"))
            else:
                log("anth http", model, r.status_code, r.text[:150])
        except Exception as e:
            log("anth err", model, repr(e)[:150])
        time.sleep(5 * (attempt + 1))
    raise RuntimeError("anth failed")

def _gs(props):
    return {"type": "OBJECT", "properties": {"results": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": props, "required": list(props)}}}, "required": ["results"]}
GS_SOLVE = _gs({"id": {"type": "STRING"}, "answer": {"type": "STRING"}, "ambiguous": {"type": "BOOLEAN"}, "note": {"type": "STRING"}})
GS_REVIEW = _gs({"id": {"type": "STRING"}, "ok": {"type": "BOOLEAN"}, "note": {"type": "STRING"}, "pidgin": {"type": "STRING"}})

def oai(model, prompt, effort="medium"):
    for attempt in range(5):
        try:
            r = requests.post(MC["base_url"] + "/openai/v1/chat/completions",
                headers={"Authorization": "Bearer " + MC["token"], "content-type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}, "reasoning_effort": effort}, timeout=600)
            if r.status_code == 200:
                j = r.json(); u = j.get("usage", {})
                add_spend(model, u.get("prompt_tokens", 0), u.get("completion_tokens", 0))
                return _json(j["choices"][0]["message"]["content"])
            log("oai http", model, r.status_code, r.text[:150])
        except Exception as e:
            log("oai err", model, repr(e)[:150])
        time.sleep(6 * (attempt + 1))
    raise RuntimeError("oai failed")

_gi = [0]
def gem(prompt, schema=None):
    delay = 6
    for attempt in range(14):
        combos = [(k, m) for k in range(len(GKEYS)) for m in GMODELS if (k, m) not in GDEAD]
        if not combos: break
        with lock:
            _gi[0] += 1; k, m = combos[_gi[0] % len(combos)]
        try:
            r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent", params={"key": GKEYS[k]},
                json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0, "responseMimeType": "application/json", **({"responseSchema": schema} if schema else {})}}, timeout=240)
        except Exception as e:
            log("gem net", m, repr(e)[:80]); time.sleep(delay); continue
        if r.status_code == 200:
            try:
                txt = "".join(p.get("text", "") for p in r.json()["candidates"][0]["content"]["parts"])
                return _json(txt), m
            except Exception as e:
                log("gem parse", m, str(e)[:80]); time.sleep(2); continue
        if r.status_code == 429 and "PerDay" in r.text:
            GDEAD.add((k, m)); log("gem daily quota", k, m); continue
        if r.status_code == 404:
            GDEAD.add((k, m)); continue
        log("gem http", r.status_code, m, r.text[:100].replace("\n", " "))
        time.sleep(delay + random.random() * 4); delay = min(delay * 1.6, 60)
    log("gem -> fallback gpt-6-sol")
    return oai("gpt-6-sol", prompt), "gpt-6-sol"

EXTRA = {
 "literature": "- Test literary principles: genres, devices, figures of speech, poetic forms, dramatic terms, narrative techniques, and analysis of SHORT ORIGINAL extracts (prose/poem lines) that you write yourself and quote in full in the question. Do NOT ask about specific prescribed set texts (they change yearly and are copyrighted).\n",
 "english": "- Follow JAMB Use of English item formats exactly. Put the target word/phrase in CAPITALS where the format needs it (synonyms, antonyms, stress, sounds). For oral English, use standard British RP as JAMB does; avoid words whose pronunciation is disputed. For comprehension/cloze items, write a short ORIGINAL passage (60-120 words) inside the question and ask ONE question on it.\n",
 "crs": "- Base every item on the Bible passages in the JAMB CRS syllabus (KJV/RSV wording, references allowed). Test events, people, teachings and their lessons as JAMB does. No denominational controversy.\n",
 "geography": "- Map-reading/calculation items must give all numbers needed (scale, map distance, contour values) in words; no figure to draw.\n",
 "accounting": "- Use ₦ amounts; give complete data for calculations; follow standard (IFRS-consistent, as taught in Nigerian schools) terminology.\n",
 "maths": "- About half the items should need a real calculation of 2-4 steps, like real UTME maths.\n",
 "physics": "- About 60% calculation items (take g = 10 m/s^2 unless stated; give every constant needed), 40% concept items.\n",
 "chemistry": "- Mix calculations (give relative atomic masses and constants needed) with concept items. Use IUPAC names as in the JAMB syllabus.\n",
}

GEN = """You are a senior JAMB UTME {subject} examiner and an experienced Nigerian SS3 teacher.
Write {n} ORIGINAL multiple-choice questions for JAMB UTME {subject}, syllabus topic: "{topic}".
Standard: these must feel like REAL UTME items — the same style, register, length and difficulty a candidate meets in the CBT hall.
- JAMB difficulty mix: about 25% easy, 45% medium, 30% hard. Hard means a genuine reasoning or multi-step item, never obscure trivia.
- Cover DIFFERENT sub-areas of the topic across the {n} items, as the JAMB syllabus lists them; do not repeat the same idea twice.
- Original wording and numbers. Do NOT copy or closely paraphrase any real JAMB/WAEC/NECO past question.
- Exactly 4 options. Exactly ONE is correct; the three distractors must be plausible (the typical mistakes candidates make) but clearly wrong to an expert.
- Self-contained: include the full instruction a candidate needs. No diagrams/images/tables to draw; describe any figure in words.
- Plain text maths: x^2, sqrt(3), 3/4, pi, log_2(8), ° for degrees. No LaTeX.
- Nigerian context welcome (names, ₦, places), neutral and respectful.
- No "All of the above"/"None of the above". Options must not repeat. Vary the correct letter. Never refer to options by letter in the explanation.
- Avoid anything time-sensitive or disputed (current office holders, latest statistics, recent policy). Use well-established facts.
- explanation: 2 to 3 short sentences in simple English saying WHY the answer is right (key working for calculations).
{extra}{numeric_rule}
These questions on this topic ALREADY EXIST; do not repeat or closely resemble any of them:
{avoid}
Return ONLY JSON: {{"questions":[{{"q":"...","options":["...","...","...","..."],"answer":"A|B|C|D","difficulty":"easy|medium|hard","explanation":"..."{numeric_field}}}]}}"""

SOLVE = """You are a strict senior JAMB UTME {subject} examiner checking practice questions written by someone else.
Solve each question yourself, independently and carefully (for calculations compute exactly; do not guess).
For each item return:
- "id"
- "answer": the letter A-D of the single correct option, or "X" if no option is correct
- "ambiguous": true if more than one option could reasonably be defended, the question is unclear, depends on a missing figure, or contains a factual/scientific error; else false
{quality}- "note": a few words if there is a problem, else ""
Items (JSON lines):
{items}
Return ONLY JSON: {{"results":[{{"id":"...","answer":"A","ambiguous":false,{qfield}"note":""}}]}}"""
QUALITY = """- "standard": "ok" if this is a fair JAMB UTME-standard item on the stated syllabus topic; "trivial" if it is far below UTME level (a giveaway); "off" if it is outside the JAMB {subject} syllabus
"""

REVIEW = """You are a careful JAMB UTME {subject} examiner and a native Nigerian Pidgin speaker.
Each item below has a claimed key and an explanation. For each item:
1. Check that the keyed option is correct and that the explanation is factually correct and supports the key (and does not mention option letters). Set "ok": false if not, with a short "note".
2. Write "pidgin": the same explanation in natural Nigerian Pidgin English (2 to 3 short sentences; keep numbers, formulas and technical terms exact).
Items (JSON lines):
{items}
Return ONLY JSON: {{"results":[{{"id":"...","ok":true,"note":"","pidgin":"..."}}]}}"""

def review(sname, qs):
    items = "\n".join(json.dumps({"id": q["id"], "question": q["q"], "options": dict(zip("ABCD", q["options"])), "key": q["answer"], "explanation": q["explanation"]}, ensure_ascii=False) for q in qs)
    p = REVIEW.format(subject=sname, items=items)
    for _ in range(2):
        r, m = gem(p, GS_REVIEW)
        mm = {str(x.get("id")): x for x in r.get("results", []) if isinstance(x, dict)}
        if all(q["id"] in mm for q in qs): return mm, m
    return mm, m

def norm(s): return re.sub(r"[^a-z0-9 ]", "", s.lower())
_stems = {}
def stems(subj):
    with lock:
        if subj not in _stems:
            d = json.load(open(os.path.join(DATA, subj + ".json")))
            _stems[subj] = [(q["t"], q["q"]) for q in d["questions"]]
            for f in glob.glob(os.path.join(OUT, f"{subj}_*.json")):
                r = json.load(open(f))
                _stems[subj] += [(r["ti"], q["q"]) for q in r["kept"]]
        return _stems[subj]

def near_dup(subj, q):
    a = norm(q)
    for _, s in stems(subj):
        b = norm(s)
        if a == b: return True
        if abs(len(a) - len(b)) < 0.3 * max(len(a), 1) and difflib.SequenceMatcher(None, a, b).quick_ratio() > 0.9 and difflib.SequenceMatcher(None, a, b).ratio() > 0.88:
            return True
    return False

def solve_all(subj, sname, qs):
    def items(): return "\n".join(json.dumps({"id": q["id"], "topic": q["_topic"], "question": q["q"], "options": dict(zip("ABCD", q["options"]))}, ensure_ascii=False) for q in qs)
    p1 = SOLVE.format(subject=sname, items=items(), quality=QUALITY.format(subject=sname), qfield='"standard":"ok",')
    p2 = SOLVE.format(subject=sname, items=items(), quality="", qfield="")
    with ThreadPoolExecutor(2) as ex:
        f1 = ex.submit(oai, "gpt-6-sol", p1, os.environ.get("SOLVE_EFFORT", "medium"))
        f2 = ex.submit(gem, p2, GS_SOLVE)
        r1 = f1.result(); r2, m2 = f2.result()
    m1 = {str(x.get("id")): x for x in r1.get("results", []) if isinstance(x, dict)}
    mm = {str(x.get("id")): x for x in r2.get("results", []) if isinstance(x, dict)}
    if not all(q["id"] in mm for q in qs):
        r2, m2 = gem(p2, GS_SOLVE); mm = {str(x.get("id")): x for x in r2.get("results", []) if isinstance(x, dict)}
    return m1, mm, m2

def do_batch(subj, ti, b):
    path = os.path.join(OUT, f"{subj}_{ti:02d}_{b:02d}.json")
    if os.path.exists(path): return json.load(open(path))
    if usd() > float(os.environ.get("CAP", "14")):
        log("CAP reached, skip", subj, ti, b); return None
    sname, topics = TOPICS[subj]; topic = topics[ti]
    num = subj in NUMERIC
    have = [s for t, s in stems(subj) if t == ti]
    random.Random(f"{subj}{ti}{b}").shuffle(have)
    avoid = [s.replace("\n", " ")[:110] for s in have[:30]]
    prompt = GEN.format(n=PER, subject=sname, topic=topic, extra=EXTRA.get(subj, ""),
                        numeric_rule=G0.NUMERIC_RULE if num else "",
                        numeric_field=',"py":"...","values":[...]' if num else "",
                        avoid="\n".join("- " + s for s in avoid) or "(none)")
    res = {"subject": subj, "topic": topic, "ti": ti, "b": b, "generated": 0, "kept": [], "rejected": []}
    try:
        data = anth_tool("claude-sonnet-5", prompt.replace("Return ONLY JSON:", "Submit with the submit_questions tool, shaped like:"), 12000)
    except Exception as e:
        log("GEN FAIL", subj, ti, b, e); return None
    qs = data.get("questions", [])
    res["generated"] = len(qs)
    good = []
    for j, q in enumerate(qs[:10]):
        if not isinstance(q, dict) or not G0.valid_shape(q):
            res["rejected"].append({"q": q, "why": "bad-shape"}); continue
        if G0.norm(q["q"]) and near_dup(subj, q["q"]):
            res["rejected"].append({"q": q, "why": "duplicate"}); continue
        q["id"] = f"{subj[:3]}x{ti:02d}{b:02d}{j}"
        q["_topic"] = topic
        good.append(q)
    if good:
        try:
            m1, m2, gm = solve_all(subj, sname, good)
        except Exception as e:
            log("SOLVE FAIL", subj, ti, b, e); return None
        for q in good:
            q.pop("_topic", None)
            a1, a2 = m1.get(q["id"]), m2.get(q["id"])
            q["check"] = {"s1": a1 and a1.get("answer"), "s2": a2 and a2.get("answer"), "s2m": gm, "std": a1 and a1.get("standard")}
            why = None
            if not a1 or not a2: why = "no-solve"
            elif a1.get("answer") != q["answer"]: why = f"solver1-disagrees:{a1.get('answer')}"
            elif a2.get("answer") != q["answer"]: why = f"solver2-disagrees:{a2.get('answer')}"
            elif a1.get("ambiguous") or a2.get("ambiguous"): why = "ambiguous:" + (a1.get("note") or "") + "|" + (a2.get("note") or "")
            elif (a1.get("standard") or "ok") != "ok": why = "standard:" + str(a1.get("standard")) + ":" + (a1.get("note") or "")
            if not why and num and q.get("py") is not None:
                ok, r = G0.py_check(q)
                q["check"]["py"] = r
                if ok is False: why = "python:" + r
            if why: res["rejected"].append({"q": q, "why": why})
            else: res["kept"].append(q)
        if res["kept"]:
            try:
                rv, rm = review(sname, res["kept"])
            except Exception as e:
                log("REVIEW FAIL", subj, ti, b, e); return None
            keep = []
            for q in res["kept"]:
                x = rv.get(q["id"])
                q["check"]["rev"] = rm
                if not x: res["rejected"].append({"q": q, "why": "no-review"}); continue
                if x.get("ok") is False: res["rejected"].append({"q": q, "why": "review:" + str(x.get("note", ""))}); continue
                pg = str(x.get("pidgin") or "").strip()
                if len(pg) > 20: q["pidgin"] = pg
                keep.append(q)
            res["kept"] = keep
    with lock:
        json.dump(res, open(path, "w"), ensure_ascii=False, indent=0)
        _stems.setdefault(subj, [])
        _stems[subj] += [(ti, q["q"]) for q in res["kept"]]
    log(subj, ti, b, "gen", res["generated"], "kept", len(res["kept"]), f"${usd():.2f}")
    return res

def run_topic(subj, ti, nb):
    for b in range(nb):
        do_batch(subj, ti, b)

if __name__ == "__main__":
    subs = sys.argv[1:] or list(PLAN)
    mx = max(nb for s in subs for nb in PLAN[s].values())
    jobs = []
    for b in range(mx):
        rnd = [(s, int(ti), b) for s in subs for ti, nb in PLAN[s].items() if nb > b]
        random.Random(5 + b).shuffle(rnd); jobs += rnd
    for s in subs: stems(s)
    with ThreadPoolExecutor(int(os.environ.get("PAR", "6"))) as ex:
        list(ex.map(lambda j: do_batch(*j), jobs))
    log("DONE", f"${usd():.2f}")
