import json, requests, sys, time
URL = "http://127.0.0.1:8000/review"

def eval_one(text: str):
    # send as txt file
    import io
    buf = io.BytesIO(text.encode("utf-8"))
    files = {"file": ("doc.txt", buf, "text/plain")}
    r = requests.post(URL, files=files, timeout=60)
    r.raise_for_status()
    return r.json()

tp = fp = fn = 0
with open("data/eval/gold.jsonl","r",encoding="utf-8") as f:
    for line in f:
        ex = json.loads(line)
        pred = eval_one(ex["input"])
        exp = set([s.lower() for s in ex["expected_flags"]])
        got = set([s.lower() for s in pred.get("flags", [])])
        tp += len(exp & got)
        fn += len(exp - got)
        fp += len(got - exp)

prec = round(tp / (tp + fp + 1e-9), 3)
rec  = round(tp / (tp + fn + 1e-9), 3)
print({"precision": prec, "recall": rec, "tp": tp, "fp": fp, "fn": fn})
