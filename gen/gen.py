
"""Score300 question generator.
Pass 1: gemini (generator model) writes original JAMB-syllabus MCQs per topic.
Pass 2: a second, independent gemini call answers each question blind and flags problems.
Maths/Physics/Chemistry: a Python check expression is evaluated and compared to the keyed option.
Kept = both passes agree, no flag, python check (if any) passes, not a duplicate.
Usage: GEMINI_API_KEY=... python gen.py [subject ...]
"""
import os, sys, json, time, math, re, random, hashlib, threading
from fractions import Fraction
from concurrent.futures import ThreadPoolExecutor
import requests

KEY = os.environ["GEMINI_API_KEY"]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
GEN_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.7-flash", "gemini-3.1-flash-lite-preview"]
VER_MODELS = ["gemini-3.1-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3.1-flash-lite-preview"]
TOPICS = json.load(open(os.path.join(HERE, "topics.json")))
TARGET = {"english": 250, "maths": 260, "biology": 240, "economics": 240}
DEFAULT_TARGET = 200
NUMERIC = {"maths", "physics", "chemistry"}
lock = threading.Lock()
DEAD = set()
_real_sleep = time.sleep
def nap(sec):
    end = time.time() + sec
    while time.time() < end:
        try:
            _real_sleep(max(0.05, min(1.0, end - time.time())))
        except BaseException as e:
            if isinstance(e, KeyboardInterrupt) and os.environ.get("STRICT_INT"): raise
            continue

def log(*a):
    with lock:
        print(time.strftime("%H:%M:%S"), *a, flush=True)

def call(models, prompt, temp):
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temp, "responseMimeType": "application/json"}}
    delay = 8
    for attempt in range(16):
        live = [m for m in models if m not in DEAD] or [models[0]]
        model = live[attempt % len(live)]
        try:
            r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                              params={"key": KEY}, json=body, timeout=200)
        except Exception as e:
            log("net", model, e); nap(delay); continue
        if r.status_code == 200:
            try:
                txt = r.json()["candidates"][0]["content"]["parts"][0]["text"]
                return json.loads(txt), model
            except Exception as e:
                log("parse", model, str(e)[:80]); nap(2); continue
        log("http", r.status_code, model, r.text[:120].replace("\n", " "))
        if r.status_code == 429 and "PerDay" in r.text:
            DEAD.add(model); log("DAILY QUOTA HIT", model)
            if all(m in DEAD for m in models): raise RuntimeError("all models out of daily quota")
            continue
        if r.status_code in (429, 500, 503, 504):
            nap(delay + random.random() * 4); delay = min(delay * 1.7, 90)
        else:
            nap(3)
    raise RuntimeError("gave up")

GEN_PROMPT = """You are an experienced Nigerian secondary-school teacher and JAMB UTME examiner.
Write {n} ORIGINAL multiple-choice questions for JAMB UTME {subject}, syllabus topic: "{topic}".
Rules:
- Original wording and numbers. Do NOT copy or paraphrase any real JAMB/WAEC/NECO past question.
- Exactly 4 options. Exactly ONE option is correct; the other three are plausible but clearly wrong.
- JAMB style and level. Mix difficulty: about 40% easy, 40% medium, 20% hard.
- The q text must include the full instruction a candidate needs, so the item makes sense on its own (e.g. "Choose the option OPPOSITE in meaning to the word in capitals: ...", "Choose the option that best completes the gap: ...", "Which of the following words has the same vowel sound as the letters in capitals in ...").
- Self-contained text only: no diagrams, no images, no tables that need drawing. Describe any figure fully in words.
- Use plain text maths: x^2, sqrt(3), 3/4, pi, log_2(8), degrees as "deg" or the ° sign. No LaTeX.
- Nigerian context is welcome where natural (names, naira ₦, places), but keep it neutral and respectful.
- Do not use "All of the above" or "None of the above". Options must not repeat.
- Vary which letter is correct.
- explanation: 2 to 4 short sentences in simple, clear English saying WHY the answer is right (show the key working for calculations).
- pidgin: the same explanation in natural Nigerian Pidgin English (2 to 4 short sentences, keep any maths/terms exact).
{numeric_rule}
Return JSON: {{"questions":[{{"q":"...","options":["...","...","...","..."],"answer":"A|B|C|D","difficulty":"easy|medium|hard","explanation":"...","pidgin":"..."{numeric_field}}}]}}"""

NUMERIC_RULE = """- For every question whose answer is a single number, ALSO give "py": a Python expression (math module allowed as math.*, Fraction allowed) that computes the correct answer value from the question's data, and "values": a list of the 4 options' numeric values in order (null for any non-numeric option). If the answer is not a single number, set "py": null and "values": null."""

VER_PROMPT = """You are a strict JAMB UTME {subject} examiner checking questions written by someone else.
Solve each question yourself, independently and carefully (work it out; do not guess).
For each, return:
- "id"
- "answer": the letter A-D of the single correct option, or "X" if no option is correct
- "ambiguous": true if more than one option could be argued correct, the question is unclear, depends on a missing diagram, or contains a factual error; else false
- "note": a few words if there is a problem, else ""
Questions:
{items}
Return JSON: {{"results":[{{"id":"...","answer":"A","ambiguous":false,"note":""}}]}}"""

def norm(s):
    return re.sub(r"\s+", " ", s).strip()

def parse_num(s):
    t = s.strip().replace(",", "").replace("₦", "").replace("N", "", 1) if re.fullmatch(r"\s*[₦N]?[\d.,/\- ]+\s*", s) else s.strip()
    t = t.strip()
    try:
        if re.fullmatch(r"-?\d+/\d+", t): return float(Fraction(t))
        if re.fullmatch(r"-?\d+(\.\d+)?", t): return float(t)
    except Exception:
        return None
    return None

SAFE = {"math": math, "Fraction": Fraction, "abs": abs, "round": round, "min": min, "max": max, "sum": sum,
        "pow": pow, "int": int, "float": float, "sqrt": math.sqrt, "pi": math.pi, "log": math.log, "comb": math.comb, "perm": math.perm, "factorial": math.factorial}

def py_check(q):
    """returns (ok, reason). ok None = no check possible"""
    expr = q.get("py")
    vals = q.get("values")
    if isinstance(expr, (int, float)): expr = repr(expr)
    if expr is not None and not isinstance(expr, str): return False, "bad-py"
    if not expr or not isinstance(vals, list) or len(vals) != 4:
        return None, "no-py"
    if re.search(r"__|import|open|exec|eval|lambda|os\.|sys\.", expr):
        return False, "unsafe-py"
    try:
        v = float(eval(expr, {"__builtins__": {}}, SAFE))
    except Exception as e:
        return False, "py-error"
    idx = "ABCD".index(q["answer"])
    # prefer values parsed from the visible option text when it is a plain number
    nums = []
    for i, opt in enumerate(q["options"]):
        p = parse_num(opt)
        m = vals[i]
        if p is not None and m is not None:
            try:
                if not math.isclose(p, float(m), rel_tol=1e-3, abs_tol=1e-6): return False, "values-mismatch-text"
            except Exception:
                return False, "bad-values"
        nums.append(p if p is not None else (float(m) if isinstance(m, (int, float)) else None))
    if nums[idx] is None:
        return False, "keyed-not-numeric"
    close = lambda a, b: math.isclose(a, b, rel_tol=2e-3, abs_tol=1e-6)
    if not close(v, nums[idx]):
        return False, "py-disagrees-key"
    if sum(1 for n in nums if n is not None and close(v, n)) > 1:
        return False, "duplicate-value"
    return True, "py-ok"

def fix_answer(q):
    a = q.get("answer")
    if isinstance(a, int) and 0 <= a < 4: q["answer"] = "ABCD"[a]; return
    if isinstance(a, str):
        m = re.fullmatch(r"\s*(?:option\s*)?\(?([A-Da-d])\)?[.):]?\s*", a, re.I) or re.match(r"\s*(?:option\s*)?\(?([A-D])\)?[.):\s]", a)
        if m: q["answer"] = m.group(1).upper(); return
        opts = q.get("options") or []
        if a in opts: q["answer"] = "ABCD"[opts.index(a)]

def valid_shape(q):
    try:
        fix_answer(q)
        return (isinstance(q["q"], str) and len(q["q"]) > 8 and isinstance(q["options"], list) and len(q["options"]) == 4
                and all(isinstance(o, str) and o.strip() for o in q["options"]) and q["answer"] in "ABCD" and len(q["answer"]) == 1
                and len({norm(o) for o in q["options"]}) == 4 and isinstance(q.get("explanation"), str) and len(q["explanation"]) > 20
                and not re.search(r"(all|none) of the above", " ".join(q["options"]).lower()))
    except Exception:
        return False

def do_topic(subj, ti, topic, n):
    path = os.path.join(OUT, f"{subj}_{ti:02d}.json")
    if os.path.exists(path):
        return json.load(open(path))
    sname = TOPICS[subj][0]
    num = subj in NUMERIC
    res = {"subject": subj, "topic": topic, "generated": 0, "kept": [], "rejected": []}
    remaining = n
    batch_no = 0
    while remaining > 0:
        k = min(12, remaining); remaining -= k; batch_no += 1
        prompt = GEN_PROMPT.format(n=k, subject=sname, topic=topic,
                                   numeric_rule=NUMERIC_RULE if num else "",
                                   numeric_field=',"py":"...","values":[...]' if num else "")
        try:
            data, gm = call(GEN_MODELS, prompt, 0.9)
        except Exception as e:
            log("GEN FAIL", subj, topic, e); continue
        qs = data.get("questions", []) if isinstance(data, dict) else data
        res["generated"] += len(qs)
        good = []
        for j, q in enumerate(qs):
            if not isinstance(q, dict) or not valid_shape(q):
                res["rejected"].append({"q": q, "why": "bad-shape"}); continue
            q["id"] = f"{subj[:3]}{ti:02d}{batch_no}{j:02d}"
            good.append(q)
        if not good: continue
        items = "\n".join(json.dumps({"id": q["id"], "question": q["q"], "options": dict(zip("ABCD", q["options"]))}, ensure_ascii=False) for q in good)
        try:
            vd, vm = call(VER_MODELS, VER_PROMPT.format(subject=sname, items=items), 0.0)
        except Exception as e:
            log("VER FAIL", subj, topic, e)
            for q in good: res["rejected"].append({"q": q, "why": "verify-failed"})
            continue
        vmap = {str(x.get("id")): x for x in (vd.get("results", []) if isinstance(vd, dict) else vd) if isinstance(x, dict)}
        for q in good:
            v = vmap.get(q["id"])
            if not v: res["rejected"].append({"q": q, "why": "no-verdict"}); continue
            if v.get("ambiguous"): res["rejected"].append({"q": q, "why": "ambiguous: " + str(v.get("note", ""))}); continue
            if v.get("answer") != q["answer"]: res["rejected"].append({"q": q, "why": f"disagree {q['answer']} vs {v.get('answer')}: {v.get('note','')}"}); continue
            if num:
                try:
                    ok, why = py_check(q)
                except Exception:
                    ok, why = False, "py-crash"
                if ok is False: res["rejected"].append({"q": q, "why": why}); continue
                q["check"] = why
            q["gen_model"], q["ver_model"] = gm, vm
            res["kept"].append(q)
    if res["generated"] > 0:
        json.dump(res, open(path, "w"), ensure_ascii=False, indent=1)
    log(f"{subj} [{ti}] {topic[:40]}: gen {res['generated']} kept {len(res['kept'])}")
    return res

def main():
    subs = sys.argv[1:] or list(TOPICS)
    jobs = []
    for s in subs:
        topics = TOPICS[s][1]
        per = math.ceil(TARGET.get(s, DEFAULT_TARGET) / len(topics))
        for i, t in enumerate(topics):
            jobs.append((s, i, t, per))
    with ThreadPoolExecutor(int(os.environ.get("PAR", "3"))) as ex:
        def safe(j):
            try:
                return do_topic(*j)
            except Exception as e:
                log("TOPIC CRASH", j[0], j[2][:30], repr(e)[:120])
        list(ex.map(safe, jobs))
    log("DONE")

if __name__ == "__main__":
    main()
