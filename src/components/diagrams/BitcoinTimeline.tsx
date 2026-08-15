import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchBtcUsd,
  fetchLatestBigMacUsd,
  fetchLiveEpochs,
} from "@/lib/bitcoin-live-epoch";
import {
  bandAt,
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
  pendingEpochs,
  spineValue,
  spineY,
  stepAt,
  stepPath,
  subsidyWorth,
  visibleEpochs,
  worthBasis,
  type Epoch,
} from "@/lib/bitcoin-timeline";

interface BitcoinTimelineProps {
  /** Stage furniture is a wide strip; in a post it is a boxed figure. */
  variant?: "stage" | "post";
}

// The optimistic, no-network-call guess: exactly one pending epoch, its
// fixed facts (id, subsidy, start) knowable purely from the last finished
// one. This is what a first paint shows before the live tip height is
// known — so the layout is stable at module scope for that first paint, the
// same as before. If the live fetch below discovers more than one epoch is
// actually pending (the site sat unbuilt across a halving), `openEpochs`
// replaces this guess with the real count and the track relays out.
const INITIAL_PENDING = pendingEpochs(EPOCHS);

/** Seconds for the cursor to travel the whole track on its own. */
const SWEEP_SECONDS = 6;

/**
 * A halving epoch, read at five knots along a track.
 *
 * Every epoch baked into bitcoin-epochs.json is finished, permanent history
 * — see lib/bitcoin-timeline.ts — so there is nothing to wait on for those.
 * Everything after it, one epoch or several, is fetched live from the
 * visitor's browser on mount (lib/bitcoin-live-epoch.ts). If that fetch
 * fails outright, the track falls back to only the finished epochs — no
 * open-epoch knot drawn from an unresolved guess — and a note below it says
 * why (see `visibleEpochs` in lib/bitcoin-timeline.ts and the `liveFailed`
 * note near the end of this component's render). The two live prices
 * (BTC/USD, latest Big Mac) are independent of that and of each other: a
 * missing BTC/USD price blanks a readout's whole sub-body line, a missing
 * Big Mac price only drops the Big Macs half of it and still shows the
 * dollar figure (see `worthLine` below and `btcWorth` in
 * lib/bitcoin-timeline.ts). The two fee/subsidy *spines* (the sparklines
 * under the readouts, not the readout text) go further: they pick one basis
 * — Big Macs, USD, or raw BTC — for the *whole* spine from those same two
 * live prices, via `worthBasis` + `spineValue` in lib/bitcoin-timeline.ts.
 * A missing live price there demotes every band on the spine, even a
 * finished epoch whose own average is sitting right there in
 * bitcoin-epochs.json — see `worthBasis`'s doc comment for why. Nothing here
 * ever shows a stale or invented number in place of a real one. The track
 * itself is deliberately not a linear block-height axis; each knot's band is
 * sized by that epoch's duration (see `layout`), and the readouts change
 * only when the cursor touches a knot, from either direction, holding it
 * until the next.
 *
 * To see the failure states in a real browser: open devtools' Network panel,
 * switch throttling to "Offline" (or block the `mempool.space` and
 * `raw.githubusercontent.com` requests specifically — real devtools request
 * blocking survives a reload, unlike a `window.fetch` monkey-patch, which a
 * fresh navigation always discards along with the rest of the JS realm),
 * then reload the page with this widget on it. Reloading with only
 * `raw.githubusercontent.com` blocked drops the spines to a USD basis and
 * the readouts to showing only the dollar figure; blocking `mempool.space`
 * too drops the open epoch, the spines to a raw-BTC basis, and shows the
 * "live data unavailable" note.
 *
 * For an agent without a real devtools panel: the fastest reliable check is
 * calling the live-fetch functions directly against the real network with
 * `fetch` monkey-patched to reject one endpoint, then feeding the results
 * into `worthBasis` — e.g. `npx tsx -e "..."` importing
 * `fetchBtcUsd`/`fetchLatestBigMacUsd` from lib/bitcoin-live-epoch.ts and
 * `worthBasis` from lib/bitcoin-timeline.ts. That exercises the same code
 * this component calls, without a browser's navigation/HMR state (a stale
 * browser tab reused across many rapid reloads can wedge a fetch in
 * "loading" forever — a tab or environment artifact, not a bug in this
 * widget — so prefer a fresh tab, or this direct-fetch check, over reusing
 * one tab across many simulated-failure reloads).
 */
export function BitcoinTimeline({ variant = "post" }: BitcoinTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  // Any deliberate interaction — drag or hover — stops the sweep. It resumes on
  // leaving, from wherever it was left, so the widget never snaps.
  const [held, setHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState(EPOCHS[0].id);
  // Spines grow in from the floor on mount rather than appearing whole — a
  // static spec sheet should still announce that this panel just switched on.
  const [grown, setGrown] = useState(false);
  // Starts as the optimistic single-epoch guess and is replaced wholesale
  // once the live tip height reveals how many epochs are actually pending —
  // see the INITIAL_PENDING comment above.
  const [openEpochs, setOpenEpochs] = useState<Epoch[]>(INITIAL_PENDING);
  const [liveFailed, setLiveFailed] = useState(false);
  // Independent of the epoch fetch: every epoch's fee readout converts into
  // today's dollars off the same live price, not just the open epoch's.
  const [btcUsd, setBtcUsd] = useState<number | "loading" | "failed">(
    "loading",
  );
  // Same independence as btcUsd: every epoch's Big Macs figure converts off
  // this one live price, fetched fresh rather than baked in at build time —
  // "the latest Big Mac price" goes stale the moment it's written down.
  const [bigMacUsd, setBigMacUsd] = useState<number | "loading" | "failed">(
    "loading",
  );

  useEffect(() => {
    let mounted = true;
    fetchLiveEpochs(EPOCHS).then((result) => {
      if (!mounted) return;
      if (result) setOpenEpochs(result);
      else setLiveFailed(true);
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
    let mounted = true;
    fetchLatestBigMacUsd().then((price) => {
      if (mounted) setBigMacUsd(price ?? "failed");
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
    let pauseUntil = 0;
    const step = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      if (now < pauseUntil) {
        frame = requestAnimationFrame(step);
        return;
      }
      const resuming = pauseUntil !== 0;
      pauseUntil = 0;
      setPosition((previous) => {
        const base = resuming ? 0 : previous;
        const next = base + elapsed / SWEEP_SECONDS;
        if (next >= 1) {
          pauseUntil = now + 1000;
          return 1;
        }
        return next;
      });
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

  // Every epoch after the last finished one lives in `openEpochs`, already
  // fully resolved by the time the live fetch lands — no separate merge step
  // needed here the way a single always-open epoch used to require. If that
  // fetch failed outright, `visibleEpochs` drops the unresolved guess from
  // the track rather than draw it as if it were real data — see its doc
  // comment in lib/bitcoin-timeline.ts.
  const bands = useMemo(
    () => layout(visibleEpochs(EPOCHS, openEpochs, liveFailed)),
    [openEpochs, liveFailed],
  );
  const touched = bandAt(bands, position);
  const band = bands.find((entry) => entry.epoch.id === selectedId) ?? bands[0];
  const epoch = band.epoch;
  // A finished epoch prices itself at its own averages and ignores this; only
  // a still-pending one needs the live price, and it is null until that
  // fetch lands.
  const price = typeof btcUsd === "number" ? btcUsd : null;
  const bigMacPrice = typeof bigMacUsd === "number" ? bigMacUsd : null;

  useEffect(() => {
    setSelectedId(touched.epoch.id);
  }, [touched.epoch.id]);

  // Spine heights react to the live fetch: 0 until it resolves (grows in
  // once real data lands, same as the mount animation), 0 forever if it
  // fails rather than a fabricated reading.
  //
  // Fees and subsidy are drawn in Big Macs where possible, not BTC. In BTC
  // the subsidy spine is just the halving — four steps, each half the last,
  // saying only what the label already says. Priced in what it bought at the
  // time, the same series says something the numbers alone don't: the
  // subsidy kept growing in real terms for three halvings. `worthBasis`
  // picks one unit for *both* spines together, from the two live prices
  // only — see its doc comment in lib/bitcoin-timeline.ts for why a missing
  // live price demotes the whole spine rather than just the open epoch's own
  // band, even when a finished epoch's own Big Mac price is sitting right
  // there on file. Difficulty stays on its own log scale regardless; it is
  // not a value and has nothing to convert.
  const basis = worthBasis(price, bigMacPrice);
  const spines = useMemo(() => {
    const resolved = bands.map((b) => b.epoch);
    const basisNote =
      basis === "bigMacs" ? null : basis === "usd" ? "usd" : "raw ₿";
    const rows = [
      {
        id: "tx fees",
        note: basisNote,
        heights: normalize(
          resolved.map((e) =>
            spineValue(e, feesPerBlock(e), price, bigMacPrice, basis),
          ),
          { floor: 0 },
        ),
      },
      {
        id: "subsidy",
        note: basisNote,
        heights: normalize(
          resolved.map((e) =>
            spineValue(e, e.subsidyBtc, price, bigMacPrice, basis),
          ),
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
    return rows.map((row) => ({ ...row, ...stepPath(bands, row.heights) }));
  }, [bands, price, bigMacPrice, basis]);

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
  // What each amount could buy, priced in the epoch that earned it — its own
  // averages if it is finished, today's live price if it is still running.
  const feesUnit = worthLine(feeWorth(epoch, price, bigMacPrice));
  const subsidyUnit = worthLine(subsidyWorth(epoch, price, bigMacPrice));

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
          title={title}
        />
        <Readout
          label="subsidy"
          value={`₿${epoch.label}`}
          unit={subsidyUnit}
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
          title={title}
        />
      </dl>

      {/* One spine per readout above, sharing the track's x axis below —
          the spines and the track read as one instrument, not two.
          Each is a step line: flat for the epoch's whole band, jumping at
          the halving, so it never draws a value the chain did not hold. */}
      <div className="mt-4 space-y-2">
        {spines.map((spine, row) => {
          const cursor = stepAt(bands, spine.heights, position);
          return (
            <div key={spine.id} className="relative h-4">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full origin-bottom transition-transform duration-500 ease-out"
                style={{
                  transform: `scaleY(${grown ? 1 : 0})`,
                  transitionDelay: grown ? `${row * 60}ms` : "0ms",
                }}
                aria-hidden="true"
              >
                <path
                  d={spine.plateaus}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  opacity={0.55}
                  vectorEffect="non-scaling-stroke"
                />
                {/* A rising riser reads as the same line as the plateau; only
                    a drop gets the accent, so orange means "down". */}
                {spine.risers.map((riser, i) => (
                  <path
                    key={i}
                    d={riser.d}
                    fill="none"
                    stroke={riser.up ? "currentColor" : accent}
                    strokeWidth={2}
                    opacity={riser.up ? 0.55 : 1}
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
                  background: accent,
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
        aria-valuemax={bands.length - 1}
        aria-valuenow={bands.indexOf(band)}
        aria-valuetext={`${epoch.subsidyBtc} BTC subsidy, ${epoch.startDate ?? "unknown"} to ${epoch.endDate ?? "present"}`}
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
          const index = bands.indexOf(band);
          const next =
            event.key === "ArrowLeft"
              ? index - 1
              : event.key === "ArrowRight"
                ? index + 1
                : null;
          if (next === null) return;
          event.preventDefault();
          setPosition(
            bands[Math.min(bands.length - 1, Math.max(0, next))].tick,
          );
        }}
      >
        <div
          className="absolute inset-x-0 top-1.5 h-0.5"
          style={{ background: "currentColor", opacity: 0.35 }}
        />

        {bands.map((entry) => (
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
              {entry.epoch.startDate?.slice(0, 4) ?? "—"}
            </span>
          </div>
        ))}

        {/* The cursor rides the raw position, not the selected knot's centre —
            it has to sit where the pointer actually is, or dragging inside a
            wide band looks like the widget stopped responding. A dot centred
            on the rule, matching the spine dots above it: one bead travelling
            four rails, rather than a line here and dots up there. */}
        <div
          className="absolute h-[2px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${position * 100}%`,
            top: 6.5,
            background: accent,
          }}
        />
      </div>

      {/* Only shown once the live fetch has actually failed, never while it's
          still loading — see the useEffect above and `visibleEpochs`'s doc
          comment for why the open epoch itself is dropped from the track
          rather than drawn from its no-network-call guess. */}
      {liveFailed && (
        <p
          className="mt-3 font-mono text-[9px] whitespace-nowrap"
          style={{ opacity: 0.6 }}
        >
          live data unavailable — showing finished epochs only
        </p>
      )}
    </div>
  );
}

/** The dollar figure, or nothing at all if even that isn't known — no dash,
    since a dash under a value that's already shown reads as a second, empty
    fact rather than a missing one. */
function worthLine(
  worth: { usd: number; bigMacs: number | null } | null,
): string | null {
  return worth ? formatUsd(worth.usd) : null;
}

function Readout({
  label,
  value,
  unit,
  title,
}: {
  label: string;
  /** null renders as a dimmed "—" — the epoch's band is on the track, its
      figure just isn't known yet (or ever, for a dropped live epoch's stub
      that never reaches the track — see `visibleEpochs`). */
  value: string | null;
  /** One line, or several stacked under the value. A null entry (or unit
      itself being null) renders no sub-body line at all, rather than a dash. */
  unit: string | (string | null)[] | null;
  title: string;
}) {
  const units = (Array.isArray(unit) ? unit : [unit]).filter(
    (line): line is string => line !== null,
  );
  return (
    <div>
      <dt className="font-mono text-[9px]" style={{ opacity: 0.7 }}>
        {label}
      </dt>
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
    </div>
  );
}

export default BitcoinTimeline;
