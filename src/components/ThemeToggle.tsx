import { useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

/** Matches the inline bootstrap in BaseLayout.astro, which already resolved
    system preference into a concrete data-theme before this ever mounts. */
function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Sun/moon toggle, beside the date in the post header. Pins an explicit
 * choice — data-theme on <html> — which the CSS in global.css reads ahead of
 * prefers-color-scheme (see the light/dark note in CLAUDE.md). Persisted to
 * localStorage rather than sessionStorage: a reading preference, unlike the
 * homepage stage, is one a visitor would expect to carry across visits.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === "undefined" ? "dark" : readTheme(),
  );

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage throws outright in some privacy modes — the toggle still
      // works for the rest of this session, it just won't stick.
    }
  };

  // Both glyphs ship; global.css hides one off <html data-theme>. Picking in
  // JSX instead would render the server's guess until this island hydrates,
  // and a light-preferring visitor would watch the sun flip to a moon —
  // exactly the flash the head bootstrap exists to prevent.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "light" ? "Switch to dark theme" : "Switch to light theme"
      }
      className="text-ink-400 transition-colors hover:text-[var(--accent,var(--color-signal-500))]"
    >
      <span className="theme-when-dark">
        <SunIcon />
      </span>
      <span className="theme-when-light">
        <MoonIcon />
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M4.1 4.1l1.85 1.85M18.05 18.05l1.85 1.85M2.5 12h2.6M18.9 12h2.6M4.1 19.9l1.85-1.85M18.05 5.95l1.85-1.85" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.3A8.4 8.4 0 0 1 9.7 4a8.4 8.4 0 1 0 10.3 10.3Z" />
    </svg>
  );
}

export default ThemeToggle;
