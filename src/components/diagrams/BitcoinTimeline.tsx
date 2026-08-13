import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchBtcUsd,
  fetchLiveEpoch,
  type LiveEpoch,
} from "@/lib/bitcoin-live-epoch";
import {
  bandUnder,
  EPOCHS,
  feesPerBlock,
  feeWorth,
  formatBtcPerBlock,
  formatCompact,
  formatHeight,
  formatUsd,
  hashrateEhs,
  layout,
  normalize,
  pendingEpoch,
  spineY,
  stepAt,
  stepPath,
  subsidyWorth,
  type Epoch,
} from "@/lib/bitcoin-timeline";

interface BitcoinTimelineProps {
  /** Stage furniture is a wide strip; in a post it is a boxed figure. */
  variant?: "stage" | "post";
}

// The open epoch's fixed facts (id, subsidy, start) are knowable with no
// network call — only its fees and difficulty need the live fetch below — so
// the track's layout is stable at module scope like everything else.
const PENDING = pendingEpoch(EPOCHS);
const ALL_EPOCHS = [...EPOCHS, PENDING];
const BANDS = layout(ALL_EPOCHS);

/** Seconds for the cursor to travel the whole track on its own. */
const SWEEP_SECONDS = 6;

/** How close to a tick counts as touching it, as a fraction of the track. */
const CONTACT = 0.012;

/**
 * A halving epoch, read at five knots along a track.
 *
 * Every epoch but the last is finished, permanent history — see
 * lib/bitcoin-timeline.ts — so there is nothing to wait on for those. The
 * last one is still open: its fees and difficulty are fetched live from the
 * visitor's browser on mount (lib/bitcoin-live-epoch.ts) and show as
 * unavailable if that fetch fails, rather than a stale or invented number.
 * The track itself is deliberately not a linear block-height axis; each
 * knot's band is sized by that epoch's duration (see `layout`), and the
 * readouts change only when the cursor touches a knot, from either
 * direction, holding it until the next.
 */
export function BitcoinTimeline({ variant = "post" }: BitcoinTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  // Any deliberate interaction — drag or hover — stops the sweep. It resumes on
  // leaving, from wherever it was left, so the widget never snaps.
  const [held, setHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState(BANDS[0].epoch.id);
  // Spines grow in from the floor on mount rather than appearing whole — a
  // static spec sheet should still announce that this panel just switched on.
  const [grown, setGrown] = useState(false);
  const [live, setLive] = useState<LiveEpoch | "loading" | "failed">("loading");
  // Independent of the epoch fetch: every epoch's fee readout converts into
  // today's dollars off the same live price, not just the open epoch's.
  const [btcUsd, setBtcUsd] = useState<number | "loading" | "failed">(
    "loading",
  );

  useEffect(() => {
    let mounted = true;
    fetchLiveEpoch(PENDING.startHeight, PENDING.startDate).then((result) => {
      if (mounted) setLive(result ?? "failed");
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchBtcUsd().then((price) => {
      if (mounted) setBtcUsd(price ?? "failed");
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGrown(true);
      return;
    }
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (held) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      setPosition((previous) => (previous + elapsed / SWEEP_SECONDS) % 1);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [held]);

  const positionFromEvent = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const { left, width } = track.getBoundingClientRect();
    if (width === 0) return;
    setPosition(Math.min(1, Math.max(0, (clientX - left) / width)));
  };

  const touched = bandUnder(BANDS, position, CONTACT);
  const band = BANDS.find((entry) => entry.epoch.id === selectedId) ?? BANDS[0];
  // The live fetch only ever fills in the open epoch — every other epoch's
  // fields are already final, so merging is a no-op for them.
  const resolveEpoch = (epoch: Epoch): Epoch =>
    epoch.id === PENDING.id && typeof live === "object"
      ? { ...epoch, ...live }
      : epoch;
  const epoch = resolveEpoch(band.epoch);
  // A finished epoch prices itself at its own averages and ignores this; only
  // the open one needs the live price, and it is null until that fetch lands.
  const price = typeof btcUsd === "number" ? btcUsd : null;

  useEffect(() => {
    if (touched) setSelectedId(touched.epoch.id);
  }, [touched?.epoch.id]);

  // Spine heights react to the live fetch: 0 until it resolves (grows in
  // once real data lands, same as the mount animation), 0 forever if it
  // fails rather than a fabricated reading.
  //
  // Fees and subsidy are drawn in Big Macs, not BTC. In BTC the subsidy spine
  // is just the halving — four steps, each half the last, saying only what
  // the label already says. Priced in what it bought at the time, the same series
  // says something the numbers alone don't: the subsidy kept growing in real
  // terms for three halvings. Difficulty stays on its own log scale; it is not
  // a value and has nothing to convert.
  const spines = useMemo(() => {
    const resolved = BANDS.map((b) => resolveEpoch(b.epoch));
    const rows = [
      {
        id: "tx fees",
        note: null,
        heights: normalize(
          resolved.map((e) => feeWorth(e, price)?.bigMacs ?? 0),
          { floor: 0 },
        ),
      },
      {
        id: "subsidy",
        note: null,
        heights: normalize(
          resolved.map((e) => subsidyWorth(e, price)?.bigMacs ?? 0),
          { floor: 0 },
        ),
      },
      {
        // Difficulty spans five orders of magnitude, so a linear row would
        // pin every epoch but the last to the floor. Saying so is not
        // pedantry: a log line's shape is not the growth's shape.
        id: "difficulty",
        note: "log",
        heights: normalize(
          resolved.map((e) => e.avgDifficulty ?? 0),
          { log: true, floor: 0 },
        ),
      },
    ];
    return rows.map((row) => ({ ...row, ...stepPath(BANDS, row.heights) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, price]);

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

  const fees = feesPerBlock(epoch);
  const unavailable = live === "failed" && epoch.id === PENDING.id;
  // What each amount could buy, priced in the epoch that earned it — its own
  // averages if it is finished, today's live price if it is still running.
  // The Big Mac count is the comparable figure across epochs; the dollar
  // figure above it is only there to make the count legible.
  const feesUnit = worthLines(feeWorth(epoch, price));
  const subsidyUnit = worthLines(subsidyWorth(epoch, price));

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
        <span style={{ color: accent }}>mining</span>
        {/* The height box reserves its widest value and left-aligns inside it,
            so stepping #0 → #420,000 → #1,050,000 never drags the epoch label
            sideways with it. Pinning the right edge instead would move the
            digits. */}
        <span className="tabular-nums">
          epoch {epoch.id.slice(1)}{" "}
          <span className="inline-block w-[10ch] text-left">
            #{formatHeight(epoch.startHeight)}
          </span>
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
        <Readout
          label="tx fees"
          value={fees === null ? null : formatBtcPerBlock(fees)}
          unit={feesUnit}
          unavailable={unavailable}
          title={title}
        />
        <Readout
          label="subsidy"
          value={`₿${epoch.label}`}
          unit={subsidyUnit}
          unavailable={false}
          title={title}
        />
        <Readout
          label="difficulty"
          value={
            epoch.avgDifficulty === null
              ? null
              : formatCompact(epoch.avgDifficulty)
          }
          unit={
            epoch.avgDifficulty === null
              ? "EH/s"
              : `${formatCompact(hashrateEhs(epoch.avgDifficulty))} EH/s`
          }
          unavailable={unavailable}
          title={title}
        />
      </dl>

      {/* One spine per readout above, sharing the track's x axis below —
          the spines and the track read as one instrument, not two.
          Each is a step line: flat for the epoch's whole band, jumping at
          the halving, so it never draws a value the chain did not hold. */}
      <div className="mt-4 space-y-2">
        {spines.map((spine) => (
          <div key={spine.id} className="relative h-3">
            {BANDS.map((entry, i) => {
              const on = entry.epoch.id === epoch.id;
              return (
                <div
                  key={entry.epoch.id}
                  className="absolute bottom-0 w-[3px] -translate-x-1/2 origin-bottom transition-transform duration-500 ease-out"
                  style={{
                    left: `${entry.tick * 100}%`,
                    height: "100%",
                    transform: `scaleY(${grown ? spine.heights[i] : 0})`,
                    background: on ? accent : "currentColor",
                    opacity: on ? 1 : 0.35,
                    transitionDelay: grown ? `${i * 40}ms` : "0ms",
                  }}
                />
                {/* The riser marks a halving, not a direction — every epoch's
                    step gets the same accent, up or down. */}
                {spine.risers.map((riser, i) => (
                  <path
                    key={i}
                    d={riser.d}
                    fill="none"
                    stroke="var(--hero-accent,var(--color-signal-500))"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>

              {/* Drawn in the DOM rather than the SVG: the viewBox is scaled
                  non-uniformly to fill the row, which would squash a circle
                  drawn inside it. Same bead as the cursor dot on the track
                  below — one dot travelling four rails, not four different
                  marks. */}
              <div
                className="absolute h-[2px] w-[2px] -translate-x-1/2 translate-y-1/2 rounded-full"
                style={{
                  left: `${position * 100}%`,
                  bottom: `${spineY(cursor)}%`,
                  background: "var(--hero-accent,var(--color-signal-500))",
                  opacity: grown ? 1 : 0,
                }}
              />

              {spine.note && (
                <span
                  className="pointer-events-none absolute right-0 bottom-0 font-mono text-[8px]"
                  style={{ opacity: 0.45 }}
                >
                  {spine.note}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* The track. One element takes the pointer; the knots are painted on top
          and never handle events themselves, so there is nothing to miss. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Halving epoch"
        aria-valuemin={0}
        aria-valuemax={BANDS.length - 1}
        aria-valuenow={BANDS.indexOf(band)}
        aria-valuetext={`${epoch.subsidyBtc} BTC subsidy, ${epoch.startDate} to ${epoch.endDate ?? "present"}`}
        className="relative mt-6 h-10 cursor-ew-resize touch-none select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          setHeld(true);
          positionFromEvent(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging) positionFromEvent(event.clientX);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDragging(false);
        }}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => {
          if (!dragging) setHeld(false);
        }}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        onKeyDown={(event) => {
          const index = BANDS.indexOf(band);
          const next =
            event.key === "ArrowLeft"
              ? index - 1
              : event.key === "ArrowRight"
                ? index + 1
                : null;
          if (next === null) return;
          event.preventDefault();
          setPosition(
            BANDS[Math.min(BANDS.length - 1, Math.max(0, next))].tick,
          );
        }}
      >
        <div
          className="absolute inset-x-0 top-1.5 h-0.5"
          style={{ background: "currentColor", opacity: 0.35 }}
        />

        {BANDS.map((entry) => (
          <div
            key={entry.epoch.id}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${entry.tick * 100}%` }}
          >
            <div
              className="w-px"
              style={{ height: 6, background: "currentColor", opacity: 0.5 }}
            />
            <span
              className="mt-1.5 font-mono text-[9px] whitespace-nowrap"
              style={{ opacity: 0.6 }}
            >
              <div
                className="w-px transition-all duration-200"
                style={{
                  height: on ? 12 : 6,
                  background: on ? accent : "currentColor",
                  opacity: on ? 1 : 0.5,
                }}
              />
              <span
                className="mt-1.5 font-mono text-[9px] whitespace-nowrap transition-colors duration-200"
                style={{
                  color: on ? accent : undefined,
                  opacity: on ? 1 : 0.6,
                }}
              >
                {entry.epoch.startDate.slice(0, 4)}
              </span>
            </div>
          );
        })}

        {/* The cursor rides the raw position, not the selected knot's centre —
            it has to sit where the pointer actually is, or dragging inside a
            wide band looks like the widget stopped responding. A dot centred
            on the rule, matching the spine dots above it: one bead travelling
            four rails, rather than a line here and dots up there. */}
        <div
          className="absolute h-[2px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${position * 100}%`,
            background: accent,
          }}
        />
      </div>

      {/* The basis, stated rather than assumed. A Big Mac count is only
          comparable across epochs if the reader knows it is one country's
          burger and each epoch's own average price — not a world index, and
          not today's rate applied backwards. */}
      <p className="mt-1 font-mono text-[9px]" style={{ opacity: 0.55 }}>
        average data per block during each epoch
        <br />
        Big Mac price is the US average
      </p>
    </div>
  );
}

/** Dollars over Big Macs, always two lines whether or not the conversion
    resolved — a cell that grows a line when the live price lands would shove
    the spines and the track down with it. */
function worthLines(worth: { usd: number; bigMacs: number } | null): string[] {
  if (!worth) return ["—", "— Big Macs"];
  return [
    formatUsd(worth.usd),
    `${worth.bigMacs.toLocaleString("en-US", { maximumFractionDigits: 0 })} Big Macs`,
  ];
}

function Readout({
  label,
  value,
  unit,
  unavailable,
  title,
}: {
  label: string;
  value: string | null;
  /** One line, or several stacked under the value. */
  unit: string | string[];
  unavailable: boolean;
  title: string;
}) {
  const units = Array.isArray(unit) ? unit : [unit];
  return (
    <div>
      <dt className="font-mono text-[9px]" style={{ opacity: 0.7 }}>
        {label}
      </dt>
      {unavailable ? (
        <dd className="mt-1 font-mono text-[10px]" style={{ opacity: 0.6 }}>
          unavailable
        </dd>
      ) : (
        <>
          <dd
            className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums"
            style={{ color: title, opacity: value === null ? 0.4 : 1 }}
          >
            {value ?? "—"}
          </dd>
          {units.map((line) => (
            <dd
              key={line}
              className="font-mono text-[9px] whitespace-nowrap"
              style={{ opacity: 0.7 }}
            >
              {line}
            </dd>
          ))}
        </>
      )}
    </div>
  );
}

export default BitcoinTimeline;
