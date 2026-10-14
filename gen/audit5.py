
"""CrackIt v5 audit of the EXISTING JAMB bank (Oct 13 2026).
Pass A: gpt-6-sol reviews every shipped item (question, options as shipped, key, explanation) for JAMB standard.
Pass B: every item pass A flags is re-reviewed by claude-opus-5-5 (no hint of pass A's verdict). An item is removed only when
both passes flag it (any non-ok category). Output: audit5/<subj>.json {id: {a:{...}, b:{...}}}."""
import os, sys, json, re
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gen5
DATA = os.path.join(HERE, "..", "app", "public", "data")
AUD = os.path.join(HERE, "audit5"); os.makedirs(AUD, exist_ok=True)
lock = gen5.lock
PROMPT = """You are a meticulous senior JAMB UTME {subject} examiner reviewing a published practice bank for Nigerian candidates.
For EACH item: solve it yourself first, then compare with the key and the explanation, and give ONE verdict:
- "ok": a fair JAMB UTME-standard item (easy items are fine if they are real UTME-level knowledge)
- "wrong_key": the keyed option is wrong, or no option is correct
- "ambiguous": a well-prepared candidate could reasonably defend another option, or two options are correct
- "error": a factual/scientific/historical error in the question, options or explanation, or the explanation contradicts the key
- "garbled": unclear wording, missing data, depends on a missing diagram/table/passage
- "off_syllabus": clearly outside the JAMB UTME {subject} syllabus
- "trivial": far below UTME level — a giveaway a JSS student would get (do NOT use this for normal easy UTME items)
Be strict on correctness; do not flag for style alone.
Items (JSON lines; topic is the syllabus topic; key is the claimed answer):
{items}
Return ONLY JSON: {{"results":[{{"id":"...","answer":"A|B|C|D|X","verdict":"ok","reason":""}}]}}"""

def fmt(sid, b, qs):
    tp = b["topics"]
    return "\n".join(json.dumps({"id": q["id"], "topic": tp[q["t"]], "question": q["q"], "options": dict(zip("ABCD", q["o"])), "key": "ABCD"[q["a"]], "explanation": q["e"]}, ensure_ascii=False) for q in qs)

def run(sid):
    path = os.path.join(AUD, sid + ".json")
    done = json.load(open(path)) if os.path.exists(path) else {}
    b = json.load(open(os.path.join(DATA, sid + ".json")))
    sname = gen5.TOPICS[sid][0]
    todo = [q for q in b["questions"] if q["id"] not in done or "a" not in done[q["id"]]]
    def one(batch):
        try:
            res = gen5.oai("gpt-6-sol", PROMPT.format(subject=sname, items=fmt(sid, b, batch)), "medium")
        except Exception as e:
            gen5.log("A FAIL", sid, e); return
        with lock:
            for x in res.get("results", []):
                if isinstance(x, dict): done.setdefault(str(x.get("id")), {})["a"] = {"ans": x.get("answer"), "v": x.get("verdict"), "r": x.get("reason", "")}
            json.dump(done, open(path, "w"), indent=0, ensure_ascii=False)
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(one, [todo[i:i + 20] for i in range(0, len(todo), 20)]))
    flag = [q for q in b["questions"] if done.get(q["id"], {}).get("a", {}).get("v", "ok") != "ok" and "b" not in done[q["id"]]]
    def two(batch):
        try:
            res = gen5.anth("claude-opus-5-5", PROMPT.format(subject=sname, items=fmt(sid, b, batch)), 16000)
        except Exception as e:
            gen5.log("B FAIL", sid, e); return
        with lock:
            for x in res.get("results", []):
                if isinstance(x, dict) and str(x.get("id")) in done: done[str(x.get("id"))]["b"] = {"ans": x.get("answer"), "v": x.get("verdict"), "r": x.get("reason", "")}
            json.dump(done, open(path, "w"), indent=0, ensure_ascii=False)
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(two, [flag[i:i + 15] for i in range(0, len(flag), 15)]))
    rm = [k for k, v in done.items() if v.get("a", {}).get("v", "ok") != "ok" and v.get("b", {}).get("v", "ok") != "ok" and "b" in v]
    gen5.log("AUDIT", sid, "items", len(b["questions"]), "reviewed", sum(1 for v in done.values() if "a" in v), "flagA", len(flag) + sum(1 for v in done.values() if "b" in v and False), "remove", len(rm), f"${gen5.usd():.2f}")

if __name__ == "__main__":
    subs = sys.argv[1:] or list(gen5.TOPICS)
    with ThreadPoolExecutor(2) as ex: list(ex.map(run, subs))
