import { useEffect, useState } from "react";

function getInitialTheme(): "light" | "dark" {
  // Keep in lockstep with the inline script in index.html
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "light";
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  // Apply theme to <html> and persist
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [theme]);

  // Keep in sync if OS preference changes and user hasn't explicitly chosen
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const saved = localStorage.getItem("theme");
      if (!saved) {
        setTheme(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm
                 border border-zinc-700/50 bg-zinc-900/40 text-zinc-200
                 hover:bg-zinc-800/60 transition-colors
                 dark:border-zinc-600/40 dark:bg-zinc-800/60 dark:text-zinc-100
                 dark:hover:bg-zinc-700/70"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {/* Sun / Moon icons (no deps) */}
      <span aria-hidden="true" className="grid h-4 w-4 place-items-center">
        {isDark ? (
          // Sun
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zm10.48 0l1.79-1.79-1.41-1.41-1.8 1.79 1.42 1.41zM12 4V1h-2v3h2zm0 19v-3h-2v3h2zm7-9h3v-2h-3v2zM4 12H1v-2h3v2zm13.24 7.16l1.8 1.79 1.41-1.41-1.79-1.8-1.42 1.42zM4.84 17.24l-1.79 1.8 1.41 1.41 1.8-1.79-1.42-1.42zM18 12a6 6 0 11-12 0 6 6 0 0112 0z"/>
          </svg>
        ) : (
          // Moon
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d="M20.742 13.045A8.002 8.002 0 0110.955 3.258a8.003 8.003 0 1010.787 9.787z"/>
          </svg>
        )}
      </span>
      <span className="tabular-nums">{isDark ? "Dark" : "Light"}</span>
      <kbd className="ml-1 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono uppercase
                      dark:bg-white/10">T</kbd>
    </button>
  );
}
