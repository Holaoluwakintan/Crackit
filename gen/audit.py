
"""Third check: an independent strict reviewer model re-solves every kept question and rejects
wrong keys, ambiguous items, factual errors and explanations that don't match the key."""
import os, json, glob, re, sys, time, threading
from concurrent.futures import ThreadPoolExecutor
import requests
HERE = os.path.dirname(os.path.abspath(__file__))
MC = json.load(open("/home/user/tab/.model-capability.json"))
TOPICS = json.load(open(os.path.join(HERE, "topics.json")))
AUD = os.path.join(HERE, "audit"); os.makedirs(AUD, exist_ok=True)
lock = threading.Lock()

PROMPT = """You are a meticulous senior JAMB UTME {subject} examiner reviewing practice questions for Nigerian candidates before publication.
For EACH item: solve it yourself first (work carefully, show no working), then compare with the key and the explanation.
Return "ok": false if ANY of these is true:
- the key is wrong, or no option is correct
- a well-prepared candidate could reasonably defend a different option (ambiguous), or two options are both correct
- a factual/scientific/historical error in the question, options or explanation, or the explanation contradicts the key
- the item depends on a missing diagram/table, or is unclear/garbled
Otherwise "ok": true. Be strict on correctness, but do not reject for style alone.
Items (JSON lines; "key" is the claimed answer):
{items}
Return ONLY JSON: {{"results":[{{"id":"...","answer":"A|B|C|D|X","ok":true,"reason":""}}]}}"""

def call(prompt):
    for attempt in range(6):
        try:
            r = requests.post(MC["base_url"] + "/anthropic/v1/messages",
                headers={"Authorization": "Bearer " + MC["token"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-sonnet-5", "max_tokens": 12000, "messages": [{"role": "user", "content": prompt}]}, timeout=400)
            if r.status_code == 200:
                txt = "".join(c.get("text", "") for c in r.json()["content"] if c.get("type") == "text")
                m = re.search(r"\{.*\}", txt, re.S)
                return json.loads(m.group(0))
            print("http", r.status_code, r.text[:150], flush=True)
        except Exception as e:
            print("err", repr(e)[:150], flush=True)
        time.sleep(5 * (attempt + 1))
    raise RuntimeError("audit call failed")

def run(subj):
    path = os.path.join(AUD, subj + ".json")
    done = json.load(open(path)) if os.path.exists(path) else {}
    items = []
    for f in sorted(glob.glob(os.path.join(HERE, "out", subj + "_*.json"))):
        for q in json.load(open(f))["kept"]:
            if q["id"] not in done: items.append(q)
    batches = [items[i:i + 20] for i in range(0, len(items), 20)]
    def one(b):
        lines = "\n".join(json.dumps({"id": q["id"], "question": q["q"], "options": dict(zip("ABCD", q["options"])), "key": q["answer"], "explanation": q["explanation"]}, ensure_ascii=False) for q in b)
        try:
            res = call(PROMPT.format(subject=TOPICS[subj][0], items=lines))
        except Exception as e:
            print("FAIL batch", subj, e, flush=True); return
        with lock:
            for x in res.get("results", []):
                done[str(x.get("id"))] = {"answer": x.get("answer"), "ok": bool(x.get("ok")), "reason": x.get("reason", "")}
            json.dump(done, open(path, "w"), indent=0, ensure_ascii=False)
    with ThreadPoolExecutor(int(os.environ.get("PAR", "4"))) as ex:
        list(ex.map(one, batches))
    bad = sum(1 for k, v in done.items() if not v["ok"])
    print(subj, "audited", len(done), "flagged", bad, flush=True)

if __name__ == "__main__":
    for s in sys.argv[1:]: run(s)
