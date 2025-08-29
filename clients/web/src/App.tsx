import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewResponse } from "./types";
import { applyTheme, getInitialTheme } from "./theme";

const MAX_SIZE_MB = 15;
const ACCEPTED = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/pdf",
  "text/plain",
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme());
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const parsed = useMemo(() => {
    if (!raw) return null;
    if ("flags" in raw || "summary" in raw) return raw as any;
    if ("result" in raw && typeof raw.result === "string") {
      try {
        return JSON.parse(raw.result);
      } catch {
        return { summary: raw.result, flags: [] };
      }
    }
    return raw;
  }, [raw]);

  function reset() {
    setError(null);
    setProgress(0);
    setRaw(null);
    setShowRaw(false);
  }

  function validate(f: File) {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      throw new Error(`File too large. Limit is ${MAX_SIZE_MB} MB.`);
    }
    if (!ACCEPTED.includes(f.type)) {
      const name = f.name.toLowerCase();
      const okByExt = name.endsWith(".docx") || name.endsWith(".pdf") || name.endsWith(".txt");
      if (!okByExt) throw new Error("Unsupported file type. Use .docx, .pdf, or .txt");
    }
  }

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setError(null);
  }

  async function onUpload() {
    try {
      if (!file) {
        setError("Please choose a file first.");
        return;
      }
      validate(file);
      reset();
      setLoading(true);

      const form = new FormData();
      form.append("file", file);

      const res = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/review");
        xhr.responseType = "json";

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            setProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
          else reject(new Error(`Server error (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.ontimeout = () => reject(new Error("Request timed out"));
        xhr.send(form);
      });

      setRaw(res);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  function copySummary() {
    const txt =
      (parsed && "summary" in parsed ? parsed.summary : null) ??
      (typeof raw === "string" ? raw : JSON.stringify(raw, null, 2));
    navigator.clipboard.writeText(String(txt ?? "")).catch(() => {});
  }

  function copyFlags() {
    const flags = parsed?.flags ?? [];
    const txt = Array.isArray(flags) ? JSON.stringify(flags, null, 2) : String(flags);
    navigator.clipboard.writeText(txt).catch(() => {});
  }

  function downloadJSON() {
    const toSave = parsed ?? raw ?? {};
    const blob = new Blob([JSON.stringify(toSave, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = file?.name?.replace(/\.[^.]+$/, "") || "result";
    a.href = url;
    a.download = `${base}-review.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-4xl p-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Legal Review MVP</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "Light" : "Dark"} mode
            </button>
            <a
              href="https://github.com/ankushtalwar/legal-ai"
              target="_blank"
              rel="noreferrer"
              className="text-sm underline opacity-75 hover:opacity-100"
            >
              Repo
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-950">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">Upload a contract</div>
              <div className="text-sm opacity-70">
                Accepted: .docx / .pdf / .txt, up to {MAX_SIZE_MB} MB
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-md border px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700"
              >
                Choose file
              </button>
              <button
                onClick={onUpload}
                disabled={!file || loading}
                className="rounded-md bg-indigo-600 text-white px-3 py-1 text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? "Uploading…" : "Upload & Review"}
              </button>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={onSelect}
              />
            </div>
          </div>

          {file && (
            <div className="mt-3 text-sm opacity-80">
              <span className="font-medium">Selected:</span> {file.name} (
              {(file.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}

          {loading && (
            <div className="mt-4">
              <div className="h-2 w-full rounded bg-gray-200 dark:bg-gray-800 overflow-hidden">
                <div className="h-2 bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 text-xs opacity-70">{progress}%</div>
            </div>
          )}

          {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
        </div>

        {parsed && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-950 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Result</div>
              <div className="flex gap-2">
                <button
                  onClick={copySummary}
                  className="rounded-md border px-3 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700"
                >
                  Copy Summary
                </button>
                <button
                  onClick={copyFlags}
                  className="rounded-md border px-3 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700"
                >
                  Copy Flags
                </button>
                <button
                  onClick={downloadJSON}
                  className="rounded-md border px-3 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700"
                >
                  Download JSON
                </button>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
                  Show raw JSON
                </label>
              </div>
            </div>

            {"summary" in parsed && (
              <section>
                <h3 className="text-sm font-semibold mb-1">Summary</h3>
                <p className="text-sm whitespace-pre-wrap opacity-90">{parsed.summary}</p>
              </section>
            )}

            {"flags" in parsed && Array.isArray(parsed.flags) && (
              <section>
                <h3 className="text-sm font-semibold mb-1">Flags</h3>
                {parsed.flags.length === 0 ? (
                  <div className="text-sm opacity-70">No flags detected.</div>
                ) : (
                  <ul className="space-y-2">
                    {parsed.flags.map((f: any, i: number) => (
                      <li key={i} className="rounded-md border border-gray-200 dark:border-gray-800 p-2">
                        <div className="text-sm">
                          <span className="font-medium">Clause:</span> {f.clause ?? "—"}
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Reason:</span> {f.reason ?? "—"}
                        </div>
                        {f.severity && <div className="text-xs opacity-70">Severity: {f.severity}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {showRaw && (
              <section>
                <h3 className="text-sm font-semibold mb-1">Raw JSON</h3>
                <pre className="text-xs overflow-auto rounded-md bg-gray-100 dark:bg-gray-900 p-3">
{JSON.stringify(raw ?? parsed, null, 2)}
                </pre>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

import { useEffect } from "react";

export function useThemeHotkey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const root = document.documentElement;
        const next = root.classList.contains("dark") ? "light" : "dark";
        root.classList.toggle("dark", next === "dark");
        try { localStorage.setItem("theme", next); } catch {}
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
