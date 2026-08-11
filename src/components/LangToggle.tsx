import { useState } from "react";

const LANG_LABELS = { en: "EN", zh: "中文" } as const;

type Lang = keyof typeof LANG_LABELS;

interface LangToggleProps {
  /** id of the element whose data-lang attribute this toggle drives — see PostLayout.astro. */
  targetId: string;
}

/**
 * Rendered in the post header, next to the date — separate from the content
 * div it controls, so there's no shared React state between them (they're
 * independent islands). Flips the target's data-lang attribute directly;
 * the [data-lang] CSS rules in global.css do the actual show/hide.
 */
export function LangToggle({ targetId }: LangToggleProps) {
  const [lang, setLang] = useState<Lang>("en");

  // Same shape as ThemeToggle: show only the language you would switch to.
  const other: Lang = lang === "en" ? "zh" : "en";

  const toggle = () => {
    setLang(other);
    document.getElementById(targetId)?.setAttribute("data-lang", other);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={other === "zh" ? "切换到中文" : "Switch to English"}
      className="text-ink-400 font-mono text-xs transition-colors hover:text-[var(--accent,var(--color-signal-500))]"
    >
      {LANG_LABELS[other]}
    </button>
  );
}

export default LangToggle;
