# training/eval_harness.py
import os, sys, time, json, glob
from typing import Dict, Any, List
import requests

REVIEW_URL = os.environ.get("REVIEW_URL", "http://127.0.0.1:8000/review")
OUT_PATH   = os.environ.get("EVAL_OUT", "data/eval/results.jsonl")
EVAL_GLOB  = os.environ.get("EVAL_GLOB", "data/eval/*.docx")  # default batch

# network settings
TIMEOUT_SECS = int(os.environ.get("EVAL_TIMEOUT", "90"))
RETRIES      = int(os.environ.get("EVAL_RETRIES", "2"))
RETRY_SLEEP  = float(os.environ.get("EVAL_RETRY_SLEEP", "2.0"))

def post_doc(file_path: str) -> Dict[str, Any]:
    """
    POST a single DOCX or text file to /review.
    Returns parsed JSON from server. Raises on HTTP/network errors after retries.
    """
    for attempt in range(RETRIES + 1):
        try:
            with open(file_path, "rb") as f:
                files = {"file": (os.path.basename(file_path), f, "application/octet-stream")}
                start = time.time()
                r = requests.post(REVIEW_URL, files=files, timeout=TIMEOUT_SECS)
                lat_ms = int((time.time() - start) * 1000)
                r.raise_for_status()
                data = r.json()

                # Accept both structured and raw outputs:
                # - Structured: {"flags": [...], "summary": "...", "meta": {...}}
                # - Raw:       {"result": "...raw model text..."}
                if "flags" in data and "summary" in data:
                    return {
                        "ok": True,
                        "latency_ms": lat_ms,
                        "flags": data.get("flags", []),
                        "summary": data.get("summary", ""),
                        "meta": data.get("meta", {}),
                        "raw": None,
                    }
                else:
                    return {
                        "ok": True,
                        "latency_ms": lat_ms,
                        "flags": [],
                        "summary": "",
                        "meta": {},
                        "raw": data,
                    }
        except Exception as e:
            if attempt < RETRIES:
                time.sleep(RETRY_SLEEP)
            else:
                return {"ok": False, "error": repr(e)}

def run_single(path: str) -> Dict[str, Any]:
    res = post_doc(path)
    record = {
        "file": path,
        "ok": res.get("ok", False),
        "latency_ms": res.get("latency_ms"),
        "flags": res.get("flags"),
        "summary": res.get("summary"),
        "meta": res.get("meta"),
        "raw": res.get("raw"),
        "error": res.get("error"),
        "ts": int(time.time()),
    }
    return record

def save_jsonl(records: List[Dict[str, Any]], out_path: str):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "a", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

def pretty_print(record: Dict[str, Any]):
    print("\n---")
    print(f"File: {record['file']}")
    if not record["ok"]:
        print("❌ ERROR:", record["error"])
        return
    print(f"✅ OK in {record['latency_ms']} ms")
    if record.get("summary"):
        print("\nSummary:\n", record["summary"])
    if record.get("flags"):
        print("\nFlags:")
        for i, fl in enumerate(record["flags"], 1):
            if isinstance(fl, dict):
                print(f"  {i}. {fl.get('issue','(no issue)')}  |  severity={fl.get('severity','?')}")
            else:
                print(f"  {i}. {fl}")

    if record.get("raw") and not record.get("summary"):
        print("\nRaw server response:\n", json.dumps(record["raw"], indent=2)[:1500], "...")

def main():
    # Usage:
    #   python training/eval_harness.py                # batch over data/eval/*.docx
    #   python training/eval_harness.py path/to/file   # single file
    args = sys.argv[1:]
    if args:
        files = args
    else:
        files = sorted(glob.glob(EVAL_GLOB))

    if not files:
        print(f"No files found. Drop test docs in {os.path.dirname(EVAL_GLOB)}/ (e.g., sample.docx)")
        sys.exit(1)

    print(f"Target URL: {REVIEW_URL}")
    print(f"Timeout: {TIMEOUT_SECS}s  Retries: {RETRIES}  Saving to: {OUT_PATH}")
    print(f"Evaluating {len(files)} file(s)...")

    records = []
    for p in files:
        rec = run_single(p)
        records.append(rec)
        pretty_print(rec)

    save_jsonl(records, OUT_PATH)
    print(f"\nSaved {len(records)} result(s) to {OUT_PATH}")

if __name__ == "__main__":
    main()
