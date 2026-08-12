import type { HTMLAttributes, ReactNode } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  label?: string; // optional eyebrow, e.g. a file path or step marker
}

/**
 * Panel: the base container for cards, code demos, diagram frames.
 * Deliberately sharp-edged and bordered — a "drafting table" surface,
 * not a soft elevated card.
 */
export function Panel({
  children,
  label,
  className = "",
  ...props
}: PanelProps) {
  return (
    <div
      className={`relative rounded-md border border-ink-700 bg-ink-900 shadow-panel ${className}`}
      {...props}
    >
      {label && (
        <div className="border-b border-ink-700 px-4 py-2 font-mono text-xs text-ink-400">
          {label}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
