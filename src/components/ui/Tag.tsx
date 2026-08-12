import type { HTMLAttributes, ReactNode } from "react";

type Tone = "neutral" | "signal" | "warn" | "danger";

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: Tone;
}

const toneStyles: Record<Tone, string> = {
  neutral: "border-ink-600 text-ink-400",
  signal: "border-signal-500/40 text-signal-500",
  warn: "border-warn-500/40 text-warn-500",
  danger: "border-danger-500/40 text-danger-500",
};

export function Tag({
  children,
  tone = "neutral",
  className = "",
  ...props
}: TagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-0.5
        font-mono text-xs uppercase tracking-wide ${toneStyles[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
