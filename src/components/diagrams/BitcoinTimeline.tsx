import { useEffect, useRef, useState } from "react";
import {
  bandUnder,
  feesPerBlock,
  formatBtcPerBlock,
  formatCompact,
  formatHeight,
  hashrateEhs,
  layout,
} from "@/lib/bitcoin-timeline";

interface BitcoinTimelineProps {
  /** Stage furniture is a wide strip; in a post it is a boxed figure. */
  variant?: "stage" | "post";
}

const BANDS = layout();

/** Seconds for the cursor to travel the whole track on its own. */
const SWEEP_SECONDS = 7;

/** How close to a tick counts as touching it, as a fraction of the track. */
const CONTACT = 0.012;

/**
 * A halving epoch, read at five knots along a track.
 *
 * The data is static — see lib/bitcoin-timeline.ts — so there is nothing to
 * wait on: the widget starts sweeping the moment it mounts. The track is
 * deliberately not a linear block-height axis; each knot's band is sized by
 * that epoch's duration (see `layout`), and the readouts change only when the
 * cursor touches a knot, from either direction, holding it until the next.
 */
export function BitcoinTimeline({ variant = "post" }: BitcoinTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  // Any deliberate interaction — drag or hover — stops the sweep. It resumes on
  // leaving, from wherever it was left, so the widget never snaps.
  const [held, setHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState(BANDS[0].epoch.id);

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
  const epoch = band.epoch;

  useEffect(() => {
    if (touched) setSelectedId(touched.epoch.id);
  }, [touched?.epoch.id]);

  const stage = variant === "stage";
  // One palette for both homes. On the stage these resolve against whichever
  // backdrop is up; in a post --stage-* is unset and they fall back to the ink
  // ramp, which the light theme has already re-pointed at paper.
  const title = "var(--stage-title,var(--color-ink-50))";
  const body = "var(--stage-body,var(--color-ink-300))";

  return (
    <div
      className={
        stage
          ? "pointer-events-auto w-full max-w-md"
          : "not-prose my-10 w-full border border-ink-700 p-5"
      }
      style={{ color: body }}
    >
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span style={{ color: "var(--hero-accent,var(--color-signal-600))" }}>
          mining
        </span>
        <span>
          #{formatHeight(epoch.startHeight)} {epoch.startDate} 
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
        <Readout
          label="tx fees"
          value={formatBtcPerBlock(feesPerBlock(epoch))}
          unit="BTC / block"
          title={title}
        />
        <Readout
          label="subsidy"
          value={epoch.label}
          unit="BTC / block"
          title={title}
        />
        <Readout
          label="difficulty"
          value={formatCompact(epoch.avgDifficulty)}
          unit={`${formatCompact(hashrateEhs(epoch.avgDifficulty))} EH/s`}
          title={title}
        />
      </dl>

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
          className="absolute inset-x-0 top-1.5 h-px"
          style={{ background: "currentColor", opacity: 0.35 }}
        />

        {BANDS.map((entry) => {
          const on = entry.epoch.id === epoch.id;
          return (
            <div
              key={entry.epoch.id}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${entry.tick * 100}%` }}
            >
              <div
                className="w-px transition-all duration-200"
                style={{
                  height: on ? 12 : 6,
                  background: on
                    ? "var(--hero-accent,var(--color-signal-500))"
                    : "currentColor",
                  opacity: on ? 1 : 0.5,
                }}
              />
              <span
                className="mt-1.5 font-mono text-[9px] whitespace-nowrap transition-colors duration-200"
                style={{
                  color: on
                    ? "var(--hero-accent,var(--color-signal-500))"
                    : undefined,
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
            wide band looks like the widget stopped responding. */}
        <div
          className="absolute top-0 h-3 w-px -translate-x-1/2"
          style={{
            left: `${position * 100}%`,
            background: "var(--hero-accent,var(--color-signal-500))",
          }}
        />
      </div>
    </div>
  );
}

function Readout({
  label,
  value,
  unit,
  title,
}: {
  label: string;
  value: string;
  unit: string;
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
      <dd className="font-mono text-[9px]" style={{ opacity: 0.7 }}>
        {unit}
      </dd>
    </div>
  );
}

export default BitcoinTimeline;
