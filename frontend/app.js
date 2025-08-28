const API_BASE = localStorage.getItem("API_BASE") || "http://127.0.0.1:8000";

const els = {
  apiUrl: document.getElementById("api-url"),
  health: document.getElementById("health"),
  drop: document.getElementById("drop"),
  file: document.getElementById("file"),
  selected: document.getElementById("selected"),
  filename: document.getElementById("filename"),
  clear: document.getElementById("clear"),
  analyze: document.getElementById("analyze"),
  spinner: document.getElementById("spinner"),
  result: document.getElementById("result"),
};

els.apiUrl.textContent = API_BASE;

let pickedFile = null;

async function checkHealth() {
  try {
    const r = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    const j = await r.json();
    els.health.textContent = j.model_loaded ? "Healthy (model loaded)" : (j.ok ? "Healthy (model pending)" : "Error");
    els.health.className = "badge " + (j.ok ? (j.model_loaded ? "ok" : "warn") : "err");
  } catch (e) {
    els.health.textContent = "Unreachable";
    els.health.className = "badge err";
  }
}
checkHealth();
setInterval(checkHealth, 5000);

// Drag & drop behavior
["dragenter","dragover"].forEach(ev => {
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    els.drop.classList.add("dragover");
  });
});
["dragleave","drop"].forEach(ev => {
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    els.drop.classList.remove("dragover");
  });
});
els.drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) setPicked(f);
});

els.file.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (f) setPicked(f);
});

els.clear.addEventListener("click", () => {
  pickedFile = null;
  els.filename.textContent = "No file selected";
  els.selected.classList.add("hidden");
  els.analyze.disabled = true;
  els.result.className = "card muted";
  els.result.textContent = "No result yet.";
});

els.analyze.addEventListener("click", async () => {
  if (!pickedFile) return;
  toggleBusy(true);
  try {
    const fd = new FormData();
    fd.append("file", pickedFile, pickedFile.name);
    const r = await fetch(`${API_BASE}/review`, { method: "POST", body: fd });
    if (!r.ok) {
      const txt = await r.text();
      showError(`HTTP ${r.status} – ${txt}`);
      return;
    }
    const data = await r.json();
    renderResult(data);
  } catch (e) {
    showError(e?.message || String(e));
  } finally {
    toggleBusy(false);
  }
});

function setPicked(f) {
  pickedFile = f;
  els.filename.textContent = `${f.name} (${Math.round(f.size/1024)} KB)`;
  els.selected.classList.remove("hidden");
  els.analyze.disabled = false;
}

function toggleBusy(b) {
  els.analyze.disabled = b || !pickedFile;
  els.spinner.classList.toggle("hidden", !b);
}

function showError(msg) {
  els.result.className = "card";
  els.result.innerText = `❌ Error\n\n${msg}`;
}

function renderResult(data) {
  // Handles both shapes:
  // A) { flags: [...], summary: "...", meta: {...} }
  // B) { result: "...raw model text..." }
  els.result.className = "card";

  if (data.flags || data.summary) {
    const flags = Array.isArray(data.flags) ? data.flags : [];
    const meta = data.meta || {};
    els.result.innerHTML = `
      <div class="result-keys">
        <div class="kv"><div class="k">Summary</div><div class="v">${escapeHtml(data.summary || "")}</div></div>
        <div class="kv"><div class="k">Flags</div><div class="v">
          ${flags.length ? flags.map(renderFlag).join("") : '<span class="muted">None</span>'}
        </div></div>
        <div class="kv"><div class="k">Meta</div><div class="v">
          <code>${escapeHtml(JSON.stringify(meta, null, 2))}</code>
        </div></div>
      </div>
    `;
  } else {
    els.result.innerHTML = `<div class="kv"><div class="k">Raw</div><div class="v"><code>${escapeHtml(JSON.stringify(data, null, 2))}</code></div></div>`;
  }
}

function renderFlag(fl) {
  if (typeof fl === "string") {
    return `<div class="flag"><div>${escapeHtml(fl)}</div></div>`;
  }
  const issue = fl.issue || "(no issue)";
  const sev = fl.severity || "?";
  const clause = fl.clause || fl.section || "";
  return `
    <div class="flag">
      <div><strong>${escapeHtml(issue)}</strong></div>
      <div class="meta">severity=${escapeHtml(sev)} ${clause ? " | clause: " + escapeHtml(clause) : ""}</div>
      ${fl.note ? `<div class="meta">note: ${escapeHtml(fl.note)}</div>` : ""}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
