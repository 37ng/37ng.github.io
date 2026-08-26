import { useMemo, useRef, useState } from "react";
import {
  BARS,
  barAt,
  barX,
  BLOCKS_PER_BAR,
  blockWorth,
  feeOnlyShare,
  feeWorth,
  formatBigMacs,
  formatBtc,
  formatBtcBulk,
  formatHeight,
  formatShare,
  formatSubsidy,
  formatUsd,
  halvingIndices,
  normalize,
  onchainShare,
  spineY,
  subsidyAt,
  subsidyWorth,
  supplyAfter,
} from "@/lib/bitcoin-timeline";

/**
 * The bottom of the scale, in Big Macs.
 *
 * A 2009 fee is worth about a billionth of a burger. Left in, that one end
 * stretches the log scale across thirteen orders of magnitude and every bar
 * from 2012 on ends up pinned near the top — a solid slab that says nothing.
 * Anything under a hundredth of a burger is the same fact ("that block paid
 * nobody anything"), so the scale starts there and spends its whole height
 * on the seven orders where the numbers differ.
 */
const MIN_BIG_MACS = 0.01;

function floorBigMacs(count: number): number {
  return Math.max(count, MIN_BIG_MACS);
}

/**
 * The one lightness the bars are drawn in.
 *
 * One tone, not two: the bar is a single payment, and the hovered bar goes
 * to full strength so the reader can see which one the numbers above belong
 * to. Colour is left to the accent, which marks position, not data.
 */
const BAR_TONE = 0.55;

interface BitcoinTimelineProps {
  /** Stage furniture is a wide strip; in a post it is a boxed figure. */
  variant?: "stage" | "post";
}

/**
 * Seventeen years of onchain revenue, one bar per 4,375 blocks.
 *
 * One bar per period, and one bar only: a block pays its miner the subsidy
 * *and* the fees, so the bar is what that block was worth, drawn as a single
 * mark in a single tone. How that total splits is two numbers, and the
 * readouts above the chart print both for whichever bar is being read —
 * putting the split in the picture instead only adds a boundary the reader
 * has to decode, and one series per row would be worse still: each would
 * fill its own box, and a fee a hundredth the size of a subsidy would look
 * just as tall.
 *
 * The bar is drawn and read in **Big Macs**, not BTC. In BTC the subsidy is
 * just the halving — a staircase saying only what the label already says —
 * and the fee is a number whose unit changed value ten-thousandfold along
 * the axis it is plotted against. Priced in what it bought at the time, the
 * same figures say the thing the raw numbers hide: for three halvings a
 * block's pay kept growing in real terms even as the subsidy behind it
 * halved.
 *
 * The axis is block height, not the calendar: 4,375 blocks is 210,000 / 48,
 * so a halving is always a bar edge. Nothing is fetched — every figure is in
 * `bitcoin-bars.json`, which is currently pseudo data (real heights,
 * invented fees and prices). The widget says so under the chart rather than
 * letting a stand-in pass as a measurement.
 *
 * Reading is by hover: the bar under the pointer is the one the readouts
 * describe, and it stays there when the pointer leaves — until one has been
 * read, they describe the most recent bar.
 * Nothing moves on its own.
 */
export function BitcoinTimeline({ variant = "post" }: BitcoinTimelineProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  // null = never read; the readouts fall back to the most recent bar, so the
  // panel always states something rather than sitting blank. Nothing sets it
  // back to null: where the pointer left is where the cursor stays, so a
  // reader can look away from the chart to the numbers without the bar they
  // were reading snapping back to today.
  const [hovered, setHovered] = useState<number | null>(null);
  const selected = hovered ?? BARS.length - 1;
  const bar = BARS[selected];
  const subsidy = subsidyAt(bar.startHeight);
  const halvings = useMemo(() => halvingIndices(BARS), []);

  // The bar heights, computed once: 220 rects is enough geometry that
  // redoing it on every pointer move would be waste, and none of it depends
  // on which bar is under the cursor.
  const barHeights = useMemo(
    () =>
      normalize(
        BARS.map((entry) => floorBigMacs(blockWorth(entry).bigMacs)),
        { log: true, floor: 0.03 },
      ),
    [],
  );

  const readFromEvent = (clientX: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const { left, width } = chart.getBoundingClientRect();
    if (width === 0) return;
    setHovered(barAt((clientX - left) / width, BARS.length));
  };

  const stage = variant === "stage";
  // One palette for both homes. On the stage these resolve against whichever
  // backdrop is up; in a post --stage-* is unset and they fall back to the ink
  // ramp, which the light theme has already re-pointed at paper.
  const title = "var(--stage-title,var(--color-ink-50))";
  const body = "var(--stage-body,var(--color-ink-300))";
  // --hero-accent is only set on the homepage stage; on a post it is unset,
  // so this falls through to --accent (the post's own frontmatter color, set
  // by PostLayout), and only to signal-500 if neither is present.
  const accent = "var(--hero-accent,var(--accent,var(--color-signal-500)))";

  return (
    <div
      className={
        stage
          ? "pointer-events-auto w-full max-w-lg"
          : "not-prose my-10 w-full border border-ink-700 p-5"
      }
      style={{ color: body }}
    >
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span style={{ color: accent }}>onchain revenue</span>
        {/* The height box reserves its widest value and left-aligns inside it,
            so stepping #0 → #496,875 → #958,125 never drags the month label
            sideways with it. Pinning the right edge instead would move the
            digits. */}
        <span className="tabular-nums">
          {bar.month}{" "}
          <span className="inline-block w-[9ch] text-left">
            #{formatHeight(bar.startHeight)}
          </span>
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Readout
          label="tx fees / block"
          value={formatBtc(bar.feePerBlockBtc)}
          worth={feeWorth(bar)}
          title={title}
        />
        <Readout
          label="subsidy / block"
          value={formatSubsidy(subsidy)}
          worth={subsidyWorth(bar)}
          title={title}
        />
        {/* The same payment as a share of what it defends: a year of it over
            every coin issued. Both sides are BTC, so the price cancels and
            this column is protocol arithmetic — it does not move with the
            two prices the columns beside it are priced in. */}
        <div className="col-span-2 sm:col-span-1">
          <dt className="font-mono text-[9px]" style={{ opacity: 0.7 }}>
            onchain % / year
          </dt>
          <dd
            className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums"
            style={{ color: title }}
          >
            {formatShare(onchainShare(bar))}
          </dd>
          <dd className="font-mono text-[9px]" style={{ opacity: 0.7 }}>
            of {formatBtcBulk(supplyAfter(bar))} · fees{" "}
            {formatShare(feeOnlyShare(bar))}
          </dd>
        </div>
      </dl>

      {/* The chart takes the pointer as a single surface — the bars are
          painted inside an SVG and never handle events themselves, so there
          is no gap between them to fall into. */}
      <div
        ref={chartRef}
        role="slider"
        tabIndex={0}
        aria-label="Block height"
        aria-valuemin={0}
        aria-valuemax={BARS.length - 1}
        aria-valuenow={selected}
        aria-valuetext={`${bar.month}, block ${bar.startHeight}, ${subsidy} BTC subsidy, ${formatShare(onchainShare(bar))} of all BTC paid to miners per year`}
        className="mt-4 cursor-crosshair touch-none select-none"
        onPointerMove={(event) => readFromEvent(event.clientX)}
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowLeft"
              ? selected - 1
              : event.key === "ArrowRight"
                ? selected + 1
                : null;
          if (next === null) return;
          event.preventDefault();
          setHovered(Math.min(BARS.length - 1, Math.max(0, next)));
        }}
      >
        {/* One bar per period, one tone. The bar is what a block paid its
            miner — subsidy plus fees — and it is drawn as one mark, because
            that is one payment. Splitting it into two shades put a boundary
            in the picture that a reader has to decode; the split is a pair of
            numbers, and the readouts above already print them. */}
        <div className="relative h-20">
          {/* Drawn at full height from the first paint. An earlier version
              grew the bars in from the floor on mount, gated on a
              requestAnimationFrame — which never fires while the tab is
              hidden, so the chart could stay at scaleY(0) forever. A chart
              that can be invisible is worse than one that does not announce
              itself. */}
          <svg
            viewBox={`0 0 ${BARS.length} 100`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {/* The bars are drawn once and never redrawn: only the highlight
                moves with the pointer, so a pointer move does not re-diff 220
                rects. */}
            <g fill="currentColor" opacity={BAR_TONE}>
              {barHeights.map((height, i) => (
                <rect
                  key={i}
                  x={i + 0.08}
                  width={0.84}
                  y={100 - spineY(height)}
                  height={spineY(height)}
                />
              ))}
            </g>
            {/* The bar being read, redrawn in the accent. One mark, not two:
                an earlier version put a faint full-height column behind it as
                well, on the theory that one bar among 220 is hard to find —
                but a bar that changes *colour* is found at a glance, and the
                column only added a second highlight to read past. The axis
                tick below is the same accent, so the cursor stays one colour
                wherever it appears. Set through `style` because a CSS
                variable is not read from an SVG presentation attribute. */}
            <rect
              x={selected + 0.08}
              width={0.84}
              y={100 - spineY(barHeights[selected])}
              height={spineY(barHeights[selected])}
              style={{ fill: accent }}
            />
          </svg>

          {/* Top left, where every bar is shortest: seventeen years ago the
              whole payment was near nothing, so a note there never covers a
              mark. */}
          <div
            className="pointer-events-none absolute top-0 left-0 font-mono text-[8px]"
            style={{ opacity: 0.5 }}
          >
            fees + subsidy · per block · big macs · log
          </div>
        </div>

        {/* The axis. Only the halvings are ticked: a tick per bar would be
            220 of them, and a calendar year is an arbitrary grid on an axis
            that is block height. A halving is what this axis marks exactly —
            4,375 blocks a bar, 48 bars an epoch. */}
        <div className="relative mt-1.5 h-8">
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: "currentColor", opacity: 0.35 }}
          />
          {/* The knot is the 1px line, and it has to land on the boundary
              exactly: this row and the bars above it are the same axis, and
              the cursor tick below is placed the same way. So the label is
              taken out of flow — inside a flex column it made the box as wide
              as "2009" and centred the line inside that, which pushed every
              knot half a label to the right of the halving it marks and left
              genesis floating inside the chart instead of on its left edge.
              The first label is left-aligned rather than centred, since half
              of it would hang off the edge. */}
          {halvings.map((index, order) => (
            <div
              key={index}
              className="absolute top-0"
              style={{ left: `${barX(index, BARS.length) * 100}%` }}
            >
              <div
                className="w-px"
                style={{ height: 5, background: "currentColor", opacity: 0.5 }}
              />
              <span
                className={`absolute top-[9px] font-mono text-[9px] whitespace-nowrap ${
                  order === 0 ? "left-0" : "left-0 -translate-x-1/2"
                }`}
                style={{ opacity: 0.6 }}
              >
                {BARS[index].month.slice(0, 4)}
              </span>
            </div>
          ))}
          {/* Where the pointer is, on the same axis as the ticks. */}
          <div
            className="absolute top-0 w-px"
            style={{
              left: `${(barX(selected, BARS.length) + 0.5 / BARS.length) * 100}%`,
              height: 5,
              background: accent,
            }}
          />
        </div>
      </div>

      {/* The figures are a stand-in until the real per-bar measurements land
          — see lib/bitcoin-timeline.ts. Said on the widget's face, not only
          in the source, since every other number on this page is real. */}
      <p
        className="mt-1 font-mono text-[9px] whitespace-nowrap"
        style={{ opacity: 0.6 }}
      >
        pseudo data · {formatHeight(BLOCKS_PER_BAR)} blocks per bar
      </p>
    </div>
  );
}

function Readout({
  label,
  value,
  worth,
  title,
}: {
  label: string;
  value: string;
  /** What that amount bought in the bar that earned it — the dollar figure,
      then the one comparable across the whole chart. */
  worth: { usd: number; bigMacs: number };
  title: string;
}) {
  return (
    <div>
      <dt className="font-mono text-[9px]" style={{ opacity: 0.7 }}>
        {label}
      </dt>
      <dd
        className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums"
        style={{ color: title }}
      >
        {value}
      </dd>
      <dd
        className="font-mono text-[9px] whitespace-nowrap"
        style={{ opacity: 0.7 }}
      >
        {formatUsd(worth.usd)} · {formatBigMacs(worth.bigMacs)} big macs
      </dd>
    </div>
  );
}
