# server/postprocess.py
import json, re

def coerce_json(model_out: str):
    """
    Try to coerce the raw model output into {flags, summary}.
    Always returns a dict with both keys.
    """
    # 1) Try to parse JSON directly
    try:
        data = json.loads(model_out)
        return {
            "flags": list(map(str, data.get("flags", []))),
            "summary": str(data.get("summary", "")),
        }
    except Exception:
        pass

    # 2) Extract first JSON-looking block
    m = re.search(r"\{[\s\S]*\}", model_out)
    if m:
        try:
            data = json.loads(m.group(0))
            return {
                "flags": list(map(str, data.get("flags", []))),
                "summary": str(data.get("summary", "")),
            }
        except Exception:
            pass

    # 3) Heuristic fallback: split into lines and flag suspicious clauses
    lines = [ln.strip() for ln in model_out.splitlines() if ln.strip()]
    keywords = [
        "liquidation", "preference", "participating", "cap",
        "anti-dilution", "ratchet", "board", "veto",
        "drag", "tag", "rofr", "esop", "pool"
    ]
    flags = [ln for ln in lines if any(k in ln.lower() for k in keywords)]
    summary = " ".join(lines[:5])[:2000]

    return {"flags": flags, "summary": summary}
