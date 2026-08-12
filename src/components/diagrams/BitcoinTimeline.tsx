import { useEffect, useRef, useState } from "react";
import { blockSamples } from "@/lib/bitcoin-blocks";
import {
  INTERVALS,
  bandUnder,
  formatBtc,
  formatCompact,
  hashrateEhs,
  layout,
  type BlockSample,
} from "@/lib/bitcoin-timeline";

interface BitcoinTimelineProps {
  /** Stage furniture is a wide strip; in a post it is a boxed figure. */
  variant?: "stage" | "post";
}

const BANDS = layout();

/** Zeroed readouts, so the panel has its final shape before the chain answers. */
const ZERO_SAMPLES: BlockSample[] = INTERVALS.map((interval) => ({
  intervalId: interval.id,
  height: 0,
  timestamp: 0,
  totalFeesSats: 0,
  difficulty: 0,
  feeRateSatVb: 0,
}));

/** Seconds for the cursor to travel the whole track on its own. */
const SWEEP_SECONDS = 7;

/** How close to a tick counts as touching it, as a fraction of the track. */
const CONTACT = 0.012;

/**
 * A block, read at seven distances from now.
 *
 * The track along the bottom is deliberately not a linear time axis — it is
 * seven knots, spaced by how far back each one looks (see
 * lib/bitcoin-timeline.ts). The readouts change only when the cursor touches a
 * knot, from either direction, and hold that knot until it touches the next
 * one. Left alone, the cursor sweeps from 5y to 1min by itself.
 *
 * The blocks are fetched from the visitor's own browser on mount, so the near
 * knots quote the chain as it is now rather than as it was at the last deploy.
 */
export function BitcoinTimeline({ variant = "post" }: BitcoinTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  // Any deliberate interaction — drag or hover — stops the sweep. It resumes on
  // leaving, from wherever it was left, so the widget never snaps.
  const [held, setHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [samples, setSamples] = useState<BlockSample[]>(ZERO_SAMPLES);
  const [status, setStatus] = useState<"loading" | "live" | "failed">(
    "loading",
  );
  const [selectedId, setSelectedId] = useState(BANDS[0].interval.id);
  const live = status === "live";

  useEffect(() => {
    let mounted = true;
    blockSamples()
      .then((loaded) => {
        if (!mounted) return;
        if (!loaded) {
          setStatus("failed");
          return;
        }
        setSamples(loaded);
        setStatus("live");
      })
      .catch(() => {
        if (mounted) setStatus("failed");
      });
    return () => {
      mounted = false;
    };
  }, []);

  // The cursor stays parked on the first knot until there is something to
  // read: a sweep over zeroed readouts looks like the widget is broken.
  useEffect(() => {
    if (held || !live) return;
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
  }, [held, live]);

  const positionFromEvent = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const { left, width } = track.getBoundingClientRect();
    if (width === 0) return;
    setPosition(Math.min(1, Math.max(0, (clientX - left) / width)));
  };

  const touched = bandUnder(BANDS, position, CONTACT);
  const band =
    BANDS.find((entry) => entry.interval.id === selectedId) ?? BANDS[0];
  const sample =
    samples?.find((s) => s.intervalId === band.interval.id) ?? null;

  useEffect(() => {
    if (touched) setSelectedId(touched.interval.id);
  }, [touched?.interval.id]);

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
          / bitcoin
        </span>
        <span style={{ opacity: live ? 1 : 0.5 }}>
          #{(sample?.height ?? 0).toLocaleString("en-US")}
        </span>
      </div>

      <dl
        className="mt-4 grid grid-cols-3 gap-4"
        style={{ opacity: live ? 1 : 0.5 }}
      >
        <Readout
          label="tx fees"
          value={formatBtc(sample?.totalFeesSats ?? 0)}
          unit="BTC"
          title={title}
        />
        <Readout
          label="difficulty"
          value={formatCompact(sample?.difficulty ?? 0)}
          unit={`${formatCompact(hashrateEhs(sample?.difficulty ?? 0))} EH/s`}
          title={title}
        />
        <Readout
          label="fee rate"
          value={(sample?.feeRateSatVb ?? 0).toFixed(1)}
          unit="sat/vB"
          title={title}
        />
      </dl>

      {/* The track. One element takes the pointer; the knots are painted on top
          and never handle events themselves, so there is nothing to miss. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Time before now"
        aria-valuemin={0}
        aria-valuemax={BANDS.length - 1}
        aria-valuenow={BANDS.indexOf(band)}
        aria-valuetext={band.interval.label}
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
            BANDS[Math.min(BANDS.length - 1, Math.max(0, next))].center,
          );
        }}
      >
        <div
          className="absolute inset-x-0 top-1.5 h-px"
          style={{ background: "currentColor", opacity: 0.35 }}
        />

        {BANDS.map((entry) => {
          const on = entry.interval.id === band.interval.id;
          return (
            <div
              key={entry.interval.id}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${entry.center * 100}%` }}
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
                {entry.interval.label}
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

      {status === "failed" && (
        <p className="mt-2 font-mono text-[10px]" style={{ opacity: 0.7 }}>
          internet not ok for real time data
        </p>
      )}
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
