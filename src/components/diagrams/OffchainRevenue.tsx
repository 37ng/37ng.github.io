import { useMemo, useRef, useState } from "react";
import {
  coverageByDay,
  formatHeight,
  formatSats,
  formatStamp,
  logNorm,
  MONTH,
  monthFraction,
  monthLabel,
  monthStats,
  SATS_PER_BTC,
  topBlocks,
  Y_DECADES,
  type FlaggedBlock,
} from "@/lib/offchain-revenue";

// The viewBox is sized close to the width this figure actually renders at
// inside the prose measure, so the 9-unit labels land near 9 real pixels
// instead of being scaled down into illegibility.
const VB_W = 640;
const VB_H = 244;
const PLOT_L = 40;
const PLOT_R = 632;
const PLOT_W = PLOT_R - PLOT_L;
const PLOT_TOP = 14;
const BASELINE = 168;
const PLOT_H = BASELINE - PLOT_TOP;
const RAIL_TOP = 196;
const RAIL_H = 28;

/** The coverage rail is drawn against a fixed ceiling, not its own maximum —
    a day's share has to mean the same thing in every month's figure. */
const RAIL_CEILING = 0.2;
/** Over this, a block gets a stem down to the baseline instead of a bare dot. */
const NOTABLE_SATS = 500_000;

const x = (frac: number) => PLOT_L + frac * PLOT_W;
const y = (sats: number) => BASELINE - logNorm(sats) * PLOT_H;

interface Placed extends FlaggedBlock {
  px: number;
  py: number;
}

export function OffchainRevenue() {
  const [hover, setHover] = useState<Placed | null>(null);
  const [ledger, setLedger] = useState(false);
  const plotRef = useRef<SVGRectElement>(null);

  const placed = useMemo<Placed[]>(
    () =>
      MONTH.blocks.map((b) => ({
        ...b,
        px: x(monthFraction(b.t)),
        py: y(b.impliedSats),
      })),
    [],
  );
  const stats = useMemo(() => monthStats(), []);
  const days = useMemo(() => coverageByDay(), []);
  // The biggest blocks carry their own label, but only as many as fit: a
  // second label within 110 units of one already placed would overprint it.
  const marked = useMemo(() => {
    const kept: FlaggedBlock[] = [];
    for (const b of topBlocks(8)) {
      const px = x(monthFraction(b.t));
      if (kept.every((k) => Math.abs(x(monthFraction(k.t)) - px) > 110)) {
        kept.push(b);
      }
      if (kept.length === 3) break;
    }
    return kept;
  }, []);
  const top20 = useMemo(() => topBlocks(20), []);

  // One overlay rect picks the nearest mark rather than each mark carrying its
  // own hit target: a month of flagged blocks sits closer together than a
  // fingertip, so nearest-by-x is both easier to hit and the only thing that
  // works on touch.
  function pickNearest(clientX: number) {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (clientX - rect.left) / rect.width;
    const target = PLOT_L + frac * PLOT_W;
    let best: Placed | null = null;
    let bestGap = Infinity;
    for (const b of placed) {
      const gap = Math.abs(b.px - target);
      if (gap < bestGap) {
        bestGap = gap;
        best = b;
      }
    }
    setHover(bestGap <= 8 ? best : null);
  }

  return (
    <figure
      id="offchain-revenue"
      className="not-prose my-10 w-full border border-ink-700 p-5"
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink-800 pb-2 font-mono text-[10px]">
        <span className="chart-mark">implied off-chain revenue</span>
        <span className="text-ink-400">{monthLabel()} · pseudo data</span>
        <button
          type="button"
          onClick={() => setLedger((v) => !v)}
          className="border border-ink-600 px-2 py-0.5 text-ink-300 hover:border-ink-300 hover:text-ink-100"
          aria-pressed={ledger}
        >
          {ledger ? "Chart" : "Ledger"}
        </button>
      </figcaption>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 py-4 sm:grid-cols-4">
        <Stat
          label="Implied total"
          value={stats.totalBtc.toFixed(4)}
          unit="BTC"
        />
        <Stat
          label="Blocks flagged"
          value={`${stats.flaggedBlocks}/${MONTH.totalBlocks}`}
          unit={`${(stats.flaggedShare * 100).toFixed(1)}%`}
        />
        <Stat
          label="Median block"
          value={formatSats(stats.medianSats)}
          unit="sats"
        />
        <Stat
          label="Largest block"
          value={formatSats(stats.largest.impliedSats)}
          unit={`sats · ${formatHeight(stats.largest.h)}`}
        />
      </dl>

      {ledger ? (
        <Ledger rows={top20} />
      ) : (
        /* The inner box carries both the min-width and the positioning
           context: a tooltip placed against the scroller instead would drift
           off its own stem as soon as the reader scrolled the plot sideways.
           The min-width is what keeps the labels legible on a phone, where the
           prose column leaves this figure under 300px. */
        <div className="overflow-x-auto">
          <div className="relative min-w-[30rem]">
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              className="w-full"
              style={{ fontFamily: "var(--font-mono)" }}
              role="img"
              aria-label={`Implied off-chain revenue per block, ${monthLabel()}. ${stats.flaggedBlocks} of ${MONTH.totalBlocks} blocks carried a below-floor transaction, ${stats.totalBtc.toFixed(4)} BTC implied in total. Switch to the ledger view for the figures.`}
            >
              {/* Decade rules — the vertical scale is log10, so each one is ten
                times the last. */}
              {Y_DECADES.map((d) => (
                <g key={d}>
                  <line
                    x1={PLOT_L}
                    x2={PLOT_R}
                    y1={y(d)}
                    y2={y(d)}
                    className="stroke-ink-800"
                    strokeWidth={1}
                  />
                  <text
                    x={PLOT_L - 10}
                    y={y(d) + 3}
                    textAnchor="end"
                    fontSize={9}
                    className="fill-ink-400"
                  >
                    {formatSats(d)}
                  </text>
                </g>
              ))}

              {/* Day rules every five days. */}
              {days
                .filter((d) => d.day % 5 === 0 || d.day === 1)
                .map((d) => (
                  <line
                    key={d.day}
                    x1={x((d.day - 1) / days.length)}
                    x2={x((d.day - 1) / days.length)}
                    y1={PLOT_TOP}
                    y2={BASELINE}
                    className="stroke-ink-800"
                    strokeWidth={1}
                  />
                ))}

              <text
                x={PLOT_L - 10}
                y={PLOT_TOP + 4}
                textAnchor="end"
                fontSize={9}
                className="fill-ink-400"
              >
                sats
              </text>

              {/* One mark per flagged block: (floor_B − actual) × vsize. Only
                the blocks over the notable threshold plant a stem — at four
                hundred marks in a month, giving every one a stem fills the
                plot in solid and nothing can be read out of it. */}
              {placed.map((b) => {
                const on = hover?.h === b.h;
                const stem = b.impliedSats >= NOTABLE_SATS;
                return (
                  <g key={b.h} className="chart-mark">
                    {(stem || on) && (
                      <line
                        x1={b.px}
                        x2={b.px}
                        y1={BASELINE}
                        y2={b.py}
                        strokeWidth={1}
                        stroke={on ? "var(--color-ink-100)" : "currentColor"}
                        opacity={on ? 1 : 0.5}
                      />
                    )}
                    <rect
                      x={b.px - (on ? 2 : 1.2)}
                      y={b.py - (on ? 2 : 1.2)}
                      width={on ? 4 : 2.4}
                      height={on ? 4 : 2.4}
                      fill={on ? "var(--color-ink-100)" : "currentColor"}
                      opacity={on ? 1 : 0.9}
                    />
                  </g>
                );
              })}

              {/* The month's three biggest blocks carry their own label — the
                rest are read off the tooltip or the ledger. */}
              {marked.map((b) => {
                const px = x(monthFraction(b.t));
                const py = y(b.impliedSats);
                const flip = px > PLOT_R - 130;
                return (
                  <g key={"m" + b.h}>
                    <line
                      x1={px}
                      x2={flip ? px - 8 : px + 8}
                      y1={py}
                      y2={py}
                      className="stroke-ink-600"
                      strokeWidth={1}
                    />
                    <text
                      x={flip ? px - 12 : px + 12}
                      y={py + 3}
                      textAnchor={flip ? "end" : "start"}
                      fontSize={9}
                      className="fill-ink-300"
                    >
                      {formatHeight(b.h)} · {formatSats(b.impliedSats)}
                    </text>
                  </g>
                );
              })}

              <line
                x1={PLOT_L}
                x2={PLOT_R}
                y1={BASELINE}
                y2={BASELINE}
                className="stroke-ink-600"
                strokeWidth={1}
              />

              {hover && (
                <line
                  x1={hover.px}
                  x2={hover.px}
                  y1={PLOT_TOP}
                  y2={RAIL_TOP + RAIL_H}
                  className="stroke-ink-600"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
              )}

              {/* Coverage rail — the blocks that carried nothing. Each cell is
                one calendar day; the filled part is the share of that day's
                blocks that were flagged. */}
              <text
                x={PLOT_L}
                y={RAIL_TOP - 7}
                fontSize={9}
                className="fill-ink-400"
              >
                share of blocks flagged, per day
              </text>
              <text
                x={PLOT_L - 10}
                y={RAIL_TOP + 4}
                textAnchor="end"
                fontSize={9}
                className="fill-ink-400"
              >
                20%
              </text>
              <text
                x={PLOT_L - 10}
                y={RAIL_TOP + RAIL_H}
                textAnchor="end"
                fontSize={9}
                className="fill-ink-400"
              >
                0
              </text>
              {days.map((d) => {
                const cw = PLOT_W / days.length;
                const cx = PLOT_L + (d.day - 1) * cw;
                const h = Math.min(d.share / RAIL_CEILING, 1) * RAIL_H;
                const on = hover
                  ? Number(hover.t.slice(8, 10)) === d.day
                  : false;
                return (
                  <g key={"c" + d.day}>
                    <title>{`${MONTH.month}-${String(d.day).padStart(2, "0")} — ${d.flagged} of ${d.blocks} blocks flagged`}</title>
                    <rect
                      x={cx + 1}
                      y={RAIL_TOP + RAIL_H - h}
                      width={cw - 2}
                      height={h}
                      className={on ? "fill-ink-100" : "fill-ink-600"}
                    />
                  </g>
                );
              })}
              <line
                x1={PLOT_L}
                x2={PLOT_R}
                y1={RAIL_TOP + RAIL_H}
                y2={RAIL_TOP + RAIL_H}
                className="stroke-ink-600"
                strokeWidth={1}
              />
              {days
                .filter((d) => d.day % 5 === 0 || d.day === 1)
                .map((d) => (
                  <text
                    key={"d" + d.day}
                    x={x((d.day - 1) / days.length) + 2}
                    y={RAIL_TOP + RAIL_H + 14}
                    fontSize={9}
                    className="fill-ink-400"
                  >
                    {String(d.day).padStart(2, "0")}
                  </text>
                ))}

              <rect
                ref={plotRef}
                x={PLOT_L}
                y={PLOT_TOP}
                width={PLOT_W}
                height={BASELINE - PLOT_TOP}
                fill="transparent"
                onPointerMove={(e) => pickNearest(e.clientX)}
                onPointerLeave={() => setHover(null)}
              />
            </svg>

            {hover && <Tooltip block={hover} />}
          </div>
        </div>
      )}

      {/* Deliberately not font-mono: the global mono rule uppercases, and four
          lines of a sentence in caps is a wall. Mono stays on the labels. */}
      <p className="mt-3 border-t border-ink-800 pt-2 text-xs leading-relaxed text-ink-400">
        One mark per block that mined a transaction paying under its own floor;
        blocks over {formatSats(NOTABLE_SATS)} sats carry a stem. Height is
        (floor_B − actual feerate) × vsize on a log scale — the fee the pool
        declined to collect publicly, and so the least it can have been paid
        privately.
      </p>
    </figure>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div>
      <dt className="font-mono text-[9px] text-ink-400">{label}</dt>
      <dd className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-ink-100">
        {value}
      </dd>
      <dd className="font-mono text-[9px] whitespace-nowrap text-ink-400">
        {unit}
      </dd>
    </div>
  );
}

function Tooltip({ block }: { block: FlaggedBlock }) {
  const px = (x(monthFraction(block.t)) / VB_W) * 100;
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-56 border border-ink-600 bg-ink-900 p-2 font-mono text-xs text-ink-300"
      style={{
        left: `${Math.min(Math.max(px, 14), 86)}%`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="flex justify-between text-ink-100">
        <span>{formatHeight(block.h)}</span>
        <span className="chart-mark">{block.pool}</span>
      </div>
      <div className="text-ink-400">{formatStamp(block.t)}</div>
      <Row k="floor_B" v={`${block.floorB.toFixed(2)} sat/vB`} />
      <Row k="actual" v={`${block.actualFeerate.toFixed(2)} sat/vB`} />
      <Row k="vsize" v={`${block.vsize.toLocaleString("en-US")} vB`} />
      <Row k="flagged tx" v={String(block.txs)} />
      <div className="mt-1 flex justify-between border-t border-ink-700 pt-1 text-ink-100">
        <span>implied</span>
        <span>{block.impliedSats.toLocaleString("en-US")} sats</span>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-400">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Ledger({ rows }: { rows: FlaggedBlock[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse font-mono text-xs">
        <caption className="sr-only">
          The twenty blocks with the most implied off-chain revenue
        </caption>
        <thead className="text-ink-400">
          <tr className="border-b border-ink-700 text-left">
            <th className="py-1 pr-3 font-normal">Block</th>
            <th className="py-1 pr-3 font-normal">Time</th>
            <th className="py-1 pr-3 font-normal">Pool</th>
            <th className="py-1 pr-3 text-right font-normal">Floor</th>
            <th className="py-1 pr-3 text-right font-normal">Actual</th>
            <th className="py-1 pr-3 text-right font-normal">vsize</th>
            <th className="py-1 text-right font-normal">Implied</th>
          </tr>
        </thead>
        <tbody className="text-ink-200">
          {rows.map((b) => (
            <tr key={b.h} className="border-b border-ink-800">
              <td className="py-1 pr-3">{formatHeight(b.h)}</td>
              <td className="py-1 pr-3 text-ink-400">{formatStamp(b.t)}</td>
              <td className="py-1 pr-3">{b.pool}</td>
              <td className="py-1 pr-3 text-right">{b.floorB.toFixed(2)}</td>
              <td className="py-1 pr-3 text-right">
                {b.actualFeerate.toFixed(2)}
              </td>
              <td className="py-1 pr-3 text-right">
                {b.vsize.toLocaleString("en-US")}
              </td>
              <td className="py-1 text-right text-ink-100">
                {b.impliedSats.toLocaleString("en-US")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 font-mono text-xs text-ink-400">
        Top 20 of {MONTH.blocks.length} flagged blocks ·{" "}
        {(rows.reduce((s, b) => s + b.impliedSats, 0) / SATS_PER_BTC).toFixed(
          4,
        )}{" "}
        BTC of {monthStats().totalBtc.toFixed(4)} BTC
      </p>
    </div>
  );
}
