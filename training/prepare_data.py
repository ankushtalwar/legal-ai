import json, re, glob, pathlib
from pathlib import Path

RAW = Path("data/raw"); OUT = Path("data/processed"); OUT.mkdir(parents=True, exist_ok=True)

def to_examples(txt: str):
    # extremely simple extractor; replace with your parser
    clauses = re.findall(r"(Clause[:\-]\s*.+)", txt, flags=re.I)
    prompt = "You are a venture-doc reviewer. Flag off-market terms and summarize risks."
    target = "Return JSON with keys: flags[], summary."
    return {"instruction": prompt, "input": "\n".join(clauses) or txt, "output": target}

def main():
    items = []
    for p in glob.glob(str(RAW / "*.txt")):
        txt = Path(p).read_text(encoding="utf-8", errors="ignore")
        items.append(to_examples(txt))
    with open(OUT / "train.jsonl", "w", encoding="utf-8") as f:
        for ex in items: f.write(json.dumps(ex) + "\n")

if __name__ == "__main__": main()
