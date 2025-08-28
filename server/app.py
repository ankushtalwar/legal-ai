# server/app.py
import os, io, time, json, re
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# ---------------- Prompt (inline) ----------------
SYSTEM = (
    "You are a precise venture financing document reviewer. "
    "Return STRICT JSON only with keys: flags (array of strings) and summary (string)."
)
USER_PREFIX = (
    "Review the following document. Identify off-market terms "
    "(e.g., liquidation preference >1x, participating without cap, full ratchet anti-dilution, "
    "investor-majority board at seed, broad veto rights, oversized ESOP). "
    "Then return JSON with fields flags[] and summary."
)

# ---------------- Post-processor (inline) ----------------
def coerce_json(model_out: str):
    """Make sure we ALWAYS return {'flags': [...], 'summary': '...'}."""
    # 1) Try direct JSON
    try:
        data = json.loads(model_out)
        return {
            "flags": list(map(str, data.get("flags", [])))[:20],
            "summary": str(data.get("summary", ""))[:4000],
        }
    except Exception:
        pass
    # 2) Try to extract a JSON-looking block
    m = re.search(r"\{[\s\S]*\}", model_out)
    if m:
        try:
            data = json.loads(m.group(0))
            return {
                "flags": list(map(str, data.get("flags", [])))[:20],
                "summary": str(data.get("summary", ""))[:4000],
            }
        except Exception:
            pass
    # 3) Heuristic fallback
    lines = [ln.strip() for ln in model_out.splitlines() if ln.strip()]
    keywords = [
        "liquidation","preference","participating","cap",
        "anti-dilution","ratchet","board","veto","drag","tag","rofr","esop","pool"
    ]
    flags = [ln for ln in lines if any(k in ln.lower() for k in keywords)]
    summary = " ".join(lines[:5])[:4000]
    return {"flags": flags[:12], "summary": summary}

# ---------------- Runtime knobs (CPU-friendly) ----------------
MAX_INPUT_CHARS = 3000
MAX_NEW_TOKENS  = 256
DEVICE_MAP      = "cpu"   # Mac dev -> CPU; switch to "auto" on GPU

app = FastAPI(title="Venture Review API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_headers=["*"],
    allow_methods=["*"],
)

pipe = None
load_error = None

def _prepare_text(raw: bytes) -> str:
    """DOCX -> text if possible, else UTF-8 decode; then trim."""
    try:
        import docx
        d = docx.Document(io.BytesIO(raw))
        text = "\n".join(p.text for p in d.paragraphs)
    except Exception:
        text = raw.decode(errors="ignore")
    return text[:MAX_INPUT_CHARS]

@app.on_event("startup")
def load_model():
    """Lazy load; try gated models, then open fallbacks so dev never blocks."""
    global pipe, load_error
    try:
        from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
        from huggingface_hub import login as hf_login

        token = os.environ.get("HUGGINGFACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")
        if token:
            try:
                hf_login(token=token)
            except Exception:
                pass

        model_ids = [
            os.environ.get("BASE_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct"),  # gated
            "mistralai/Mistral-7B-Instruct-v0.3",                                  # gated
            "TinyLlama/TinyLlama-1.1B-Chat-v1.0",                                  # OPEN
            "Qwen/Qwen2.5-0.5B-Instruct",                                          # OPEN + tiny
        ]

        def build_pipeline(model_id: str):
            tok = AutoTokenizer.from_pretrained(model_id, token=token)
            base = AutoModelForCausalLM.from_pretrained(
                model_id, token=token, device_map=DEVICE_MAP
            )
            # Optional: attach LoRA adapter if present
            adapter_path = "outputs/lora/adapter"
            if os.path.isdir(adapter_path):
                from peft import PeftModel
                lm = PeftModel.from_pretrained(base, adapter_path)
            else:
                lm = base
            return pipeline("text-generation", model=lm, tokenizer=tok, device_map=DEVICE_MAP)

        last_err = None
        for mid in model_ids:
            try:
                candidate = build_pipeline(mid)
                # warmup
                _ = candidate("Summarize:\nHello", max_new_tokens=16, do_sample=False)
                globals()["pipe"] = candidate
                globals()["load_error"] = None
                return
            except Exception as e:
                last_err = e
                continue
        raise RuntimeError(f"Failed to load any model. Last error: {repr(last_err)}")
    except Exception as e:
        load_error = repr(e)
        pipe = None

@app.get("/health")
def health():
    return {"ok": True, "model_loaded": pipe is not None, "load_error": load_error}

@app.post("/review")
async def review(file: UploadFile = File(...)):
    if pipe is None:
        raise HTTPException(status_code=500, detail=f"Model not loaded: {load_error}")

    raw = await file.read()
    text = _prepare_text(raw)

    prompt = f"{USER_PREFIX}\n{text}\n"

    t0 = time.time()
    gen = pipe(
        prompt,
        max_new_tokens=MAX_NEW_TOKENS,
        do_sample=False,
        temperature=0.0,
    )[0]["generated_text"]

    body = coerce_json(gen)
    latency = int((time.time() - t0) * 1000)

    return {
        "flags": body["flags"],
        "summary": body["summary"],
        "meta": {
            "model_id": os.environ.get("BASE_MODEL", "auto"),
            "adapter": "outputs/lora/adapter" if os.path.isdir("outputs/lora/adapter") else None,
            "tokens": {"prompt": 0, "completion": 0},
            "latency_ms": latency,
        },
    }
