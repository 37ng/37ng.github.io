import { useEffect, useRef, useState } from "react";
import {
  axisMax,
  axisTicks,
  flaggedBlocks,
  FLAGGED_MONTHS,
  formatMonth,
  formatPercent,
  monthShare,
  POOLS,
  poolShare,
  segments,
  yearTicks,
} from "@/lib/flagged-blocks";

const PLOT_HEIGHT = 168;
const accent = "var(--accent,var(--color-signal-500))";

/**
 * The numbers this draws are placeholder — see the header of
 * lib/flagged-blocks.ts. The caption under the chart says so on the page too,
 * and both notes come out together when real counts land.
 */
export function FlaggedBlocks() {
  const rows = FLAGGED_MONTHS;
  const max = axisMax(rows);
  const ticks = axisTicks(max);
  const years = yearTicks(rows);
  const plotRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(rows.length - 1);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGrown(true);
      return;
    }
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const indexFromEvent = (clientX: number) => {
    const plot = plotRef.current;
    if (!plot) return;
    const { left, width } = plot.getBoundingClientRect();
    if (width === 0) return;
    const ratio = (clientX - left) / width;
    const index = Math.floor(ratio * rows.length);
    setActive(Math.min(rows.length - 1, Math.max(0, index)));
  };

  const row = rows[active];
  const flagged = flaggedBlocks(row);
  const share = monthShare(row);

  return (
    <figure className="not-prose my-10 w-full border border-ink-700 p-5 text-ink-300">
      <div className="flex flex-col gap-1 font-mono text-[10px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <span className="whitespace-nowrap" style={{ color: accent }}>
          blocks with ≥1 flagged tx
        </span>
        <span className="whitespace-nowrap tabular-nums">
          monthly · {formatMonth(rows[0].month)} —{" "}
          {formatMonth(rows[rows.length - 1].month)}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div className="font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums text-ink-50 sm:text-3xl">
            {formatPercent(share)}
          </div>
          <div className="font-mono text-[9px] whitespace-nowrap tabular-nums opacity-70">
            {flagged.toLocaleString()} of {row.blocks.toLocaleString()} blocks
          </div>
        </div>
        <div className="text-right font-mono text-[10px] whitespace-nowrap text-ink-50 tabular-nums">
          {formatMonth(row.month)}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <div
          className="relative w-7 shrink-0 font-mono text-[9px] tabular-nums"
          style={{ height: PLOT_HEIGHT }}
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2 opacity-55"
              style={{ bottom: `${(tick / max) * 100}%` }}
            >
              {tick}%
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          role="slider"
          tabIndex={0}
          aria-label="Month"
          aria-valuemin={0}
          aria-valuemax={rows.length - 1}
          aria-valuenow={active}
          aria-valuetext={`${formatMonth(row.month)}: ${formatPercent(share)} of blocks held a flagged tx`}
          className="relative flex-1 cursor-crosshair touch-none select-none"
          style={{ height: PLOT_HEIGHT }}
          onPointerDown={(event) => indexFromEvent(event.clientX)}
          onPointerMove={(event) => indexFromEvent(event.clientX)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowLeft"
                ? active - 1
                : event.key === "ArrowRight"
                  ? active + 1
                  : null;
            if (next === null) return;
            event.preventDefault();
            setActive(Math.min(rows.length - 1, Math.max(0, next)));
          }}
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              className="pointer-events-none absolute inset-x-0 h-px"
              style={{
                bottom: `${(tick / max) * 100}%`,
                background: "currentColor",
                opacity: tick === 0 ? 0.4 : 0.14,
              }}
              aria-hidden="true"
            />
          ))}

          <div className="absolute inset-0 flex items-end">
            {rows.map((entry, index) => {
              const current = index === active;
              return (
                <div
                  key={entry.month}
                  className="relative h-full flex-1"
                  style={{
                    // A bracket in the gutter either side of the column, not a
                    // wash over it — the cursor has to stay legible as chrome
                    // and never read as a sixth pool.
                    background: current
                      ? `color-mix(in srgb, ${accent} 7%, transparent)`
                      : undefined,
                    boxShadow: current
                      ? `inset 1px 0 0 0 ${accent}, inset -1px 0 0 0 ${accent}`
                      : undefined,
                  }}
                >
                  <div
                    className="absolute inset-0 origin-bottom"
                    style={{
                      transform: `scaleY(${grown ? 1 : 0})`,
                      transition: "transform 420ms cubic-bezier(0.2,0.8,0.2,1)",
                      transitionDelay: grown ? `${index * 9}ms` : "0ms",
                    }}
                  >
                    {segments(entry).map(({ pool, base, height }) => (
                      <div
                        key={pool.id}
                        className={`absolute inset-x-px ${pool.id === "other" ? "pool-rest" : ""}`}
                        style={{
                          backgroundColor: pool.color,
                          bottom: `${(base / max) * 100}%`,
                          // The 2px trim is the gap between stacked fills —
                          // adjacent hues never touch, so a boundary reads
                          // even where two segments are close in value.
                          height: `max(1px, calc(${(height / max) * 100}% - 2px))`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex gap-2">
        <div className="w-7 shrink-0" aria-hidden="true" />
        <div className="relative h-3 flex-1 font-mono text-[9px] tabular-nums">
          {years.map(({ index, year }) => (
            <span
              key={`${year}-${index}`}
              className="absolute opacity-60"
              style={{ left: `${(index / rows.length) * 100}%` }}
            >
              {year}
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-2 gap-y-1.5 font-mono text-[10px] whitespace-nowrap tabular-nums sm:gap-x-3">
        <span aria-hidden="true" />
        <span className="text-[9px] opacity-55">pool</span>
        <span className="text-[9px] opacity-55">of blocks</span>
        <span className="text-[9px] opacity-55">of flagged</span>

        {POOLS.map((pool) => {
          const points = poolShare(row, pool.id);
          const cut =
            flagged === 0 ? 0 : (row.flagged[pool.id] / flagged) * 100;
          return (
            <div key={pool.id} className="contents">
              <span
                className={`h-2 w-2 self-center ${pool.id === "other" ? "pool-rest" : ""}`}
                style={{ backgroundColor: pool.color }}
                aria-hidden="true"
              />
              <dt className="text-ink-200">{pool.label}</dt>
              <dd className="text-right text-ink-100">
                {formatPercent(points)}
              </dd>
              <dd className="text-right opacity-70">{formatPercent(cut, 0)}</dd>
            </div>
          );
        })}
      </dl>

      <figcaption className="mt-4 border-t border-ink-700 pt-2 font-mono text-[9px] leading-relaxed opacity-60">
        one block counts once, under the pool that mined it, however many
        flagged txs it holds. sample data — not measured.
      </figcaption>
    </figure>
  );
}

export default FlaggedBlocks;
