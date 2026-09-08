import { useId, useMemo, useRef, useState } from "react";
import {
  bandLine,
  bandPath,
  bandY,
  bestLag,
  blocksOfDay,
  DAYS,
  flagShare,
  formatDate,
  FRAME,
  pearson,
  percentile,
  quarterTicks,
  RESPONSE_LAG,
  xAt,
} from "@/lib/flag-rate";

// Both ceilings come from the data with a little headroom — a fixed one
// silently flat-tops the tallest spike, which is the one column that matters.
const FEE_MAX = Math.ceil(Math.max(...DAYS.map((d) => d.feeRate)) / 20) * 20;
const FLAG_MAX = Math.ceil(Math.max(...DAYS.map(flagShare)) * 20) / 20;

export function FlagRateMempool() {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [index, setIndex] = useState(() => defaultIndex());
  const [held, setHeld] = useState(false);

  const fees = useMemo(() => DAYS.map((d) => d.feeRate), []);
  const flags = useMemo(() => DAYS.map(flagShare), []);

  const feePath = useMemo(() => bandPath(fees, FEE_MAX, true, "log"), [fees]);
  const feeLine = useMemo(() => bandLine(fees, FEE_MAX, true, "log"), [fees]);
  const flagPath = useMemo(() => bandPath(flags, FLAG_MAX, false), [flags]);
  const flagLine = useMemo(() => bandLine(flags, FLAG_MAX, false), [flags]);

  const cospikes = useMemo(() => {
    const feeCut = percentile(fees, 0.9);
    const flagCut = percentile(flags, 0.9);
    return DAYS.map((_, i) => i).filter(
      (i) => fees[i] >= feeCut && flags[i] >= flagCut,
    );
  }, [fees, flags]);

  const r0 = useMemo(() => pearson(fees, flags, 0), [fees, flags]);
  const lag = useMemo(() => bestLag(fees, flags), [fees, flags]);
  const rLag = useMemo(() => pearson(fees, flags, lag), [fees, flags, lag]);

  const day = DAYS[index];
  const share = flagShare(day);
  const ribbon = useMemo(() => blocksOfDay(index), [index]);
  const ticks = useMemo(() => quarterTicks(), []);

  const title = "var(--stage-title,var(--color-ink-50))";
  const body = "var(--stage-body,var(--color-ink-300))";
  const accent = "var(--hero-accent,var(--accent,var(--color-signal-500)))";

  const indexFromEvent = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const { left, width } = svg.getBoundingClientRect();
    if (width === 0) return;
    const t = Math.min(1, Math.max(0, (clientX - left) / width));
    setIndex(Math.round(t * (DAYS.length - 1)));
  };

  const cursorX = xAt(index);

  return (
    <div
      className="not-prose my-10 w-full border border-ink-700 p-5"
      style={{ color: body }}
    >
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span style={{ color: accent }}>flag rate vs mempool congestion</span>
        <span className="tabular-nums">{formatDate(day.date)}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Readout
          label="median fee rate"
          value={day.feeRate.toFixed(1)}
          unit="sat/vB · public"
          title={title}
        />
        <Readout
          label="private inclusion"
          value={`${(share * 100).toFixed(1)}%`}
          unit={`${day.flagged} of ${day.blocks} blocks`}
          title={title}
        />
        <Readout
          label="correlation"
          value={r0.toFixed(2)}
          unit="ρ · same day"
          title={title}
        />
        <Readout
          label={`correlation +${lag}d`}
          value={rLag.toFixed(2)}
          unit={`ρ · flag rate trails by ${lag}d`}
          title={title}
        />
      </dl>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${FRAME.width} ${FRAME.axisY + FRAME.extent + 22}`}
        className="mt-5 w-full cursor-crosshair touch-none select-none"
        role="slider"
        tabIndex={0}
        aria-label="Day"
        aria-valuemin={0}
        aria-valuemax={DAYS.length - 1}
        aria-valuenow={index}
        aria-valuetext={`${day.date}: ${day.feeRate} sat per vbyte, ${(share * 100).toFixed(1)} percent of blocks flagged`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setHeld(true);
          indexFromEvent(event.clientX);
        }}
        onPointerMove={(event) => {
          if (held || event.pointerType === "mouse")
            indexFromEvent(event.clientX);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setHeld(false);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 7 : 1;
          const next =
            event.key === "ArrowLeft"
              ? index - step
              : event.key === "ArrowRight"
                ? index + step
                : null;
          if (next === null) return;
          event.preventDefault();
          setIndex(Math.min(DAYS.length - 1, Math.max(0, next)));
        }}
      >
        <defs>
          <linearGradient id={`${gradientId}-fee`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.34} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id={`${gradientId}-flag`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.05} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.4} />
          </linearGradient>
        </defs>

        {/* Where both series sit in their own top decile on the same day — the
            question the chart is asking, marked rather than left to the eye. */}
        {cospikes.map((i) => (
          <line
            key={i}
            x1={xAt(i)}
            x2={xAt(i)}
            y1={FRAME.axisY - FRAME.extent}
            y2={FRAME.axisY + FRAME.extent}
            stroke={accent}
            strokeWidth={1}
            opacity={0.12}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={feePath} fill={`url(#${gradientId}-fee)`} />
        <path
          d={feeLine}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.75}
          vectorEffect="non-scaling-stroke"
        />
        <path d={flagPath} fill={`url(#${gradientId}-flag)`} />
        <path
          d={flagLine}
          fill="none"
          stroke={accent}
          strokeWidth={1}
          opacity={0.9}
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={0}
          x2={FRAME.width}
          y1={FRAME.axisY}
          y2={FRAME.axisY}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.45}
          vectorEffect="non-scaling-stroke"
        />

        {ticks.map((tick) => (
          <g key={tick.index}>
            <line
              x1={xAt(tick.index)}
              x2={xAt(tick.index)}
              y1={FRAME.axisY - 3}
              y2={FRAME.axisY + 3}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.45}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={xAt(tick.index)}
              y={FRAME.axisY + FRAME.extent + 16}
              textAnchor={
                xAt(tick.index) < 20
                  ? "start"
                  : xAt(tick.index) > FRAME.width - 20
                    ? "end"
                    : "middle"
              }
              fill="currentColor"
              opacity={0.55}
              className="font-mono"
              style={{ fontSize: 9 }}
            >
              {tick.label}
            </text>
          </g>
        ))}

        <text
          x={2}
          y={FRAME.axisY - FRAME.extent + 8}
          fill="currentColor"
          opacity={0.55}
          className="font-mono"
          style={{ fontSize: 9 }}
        >
          ▲ public fee rate · {FEE_MAX} sat/vB · log
        </text>
        <text
          x={2}
          y={FRAME.axisY + FRAME.extent - 3}
          fill={accent}
          opacity={0.75}
          className="font-mono"
          style={{ fontSize: 9 }}
        >
          ▼ private inclusion · {Math.round(FLAG_MAX * 100)}%
        </text>

        <line
          x1={cursorX}
          x2={cursorX}
          y1={FRAME.axisY - FRAME.extent}
          y2={FRAME.axisY + FRAME.extent}
          stroke={accent}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={cursorX}
          cy={bandY(day.feeRate, FEE_MAX, true, "log")}
          r={2}
          fill={accent}
        />
        <circle
          cx={cursorX}
          cy={bandY(share, FLAG_MAX, false)}
          r={2}
          fill={accent}
        />
      </svg>

      {/* Per-block, for the day under the cursor: every block that day, in
          order, accent if it carried a flagged transaction. */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between font-mono text-[9px]">
          <span style={{ opacity: 0.7 }}>blocks · {day.date}</span>
          <span className="tabular-nums" style={{ opacity: 0.7 }}>
            {day.flagged} flagged
          </span>
        </div>
        <div className="mt-1.5 flex h-5 gap-[1px]">
          {ribbon.map((flagged, i) => (
            <span
              key={i}
              className="h-full flex-1"
              style={{
                background: flagged ? accent : "currentColor",
                opacity: flagged ? 1 : 0.2,
              }}
            />
          ))}
        </div>
      </div>

      <p className="mt-4 font-mono text-[9px]" style={{ opacity: 0.55 }}>
        pseudo data · flag response lagged {RESPONSE_LAG}d by construction
      </p>
    </div>
  );
}

/** Open on the sharpest co-spike, so a still screenshot shows the point. */
function defaultIndex(): number {
  let best = 0;
  let bestScore = -Infinity;
  DAYS.forEach((day, i) => {
    const score = day.feeRate * (day.flagged / day.blocks);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
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
      <dd
        className="font-mono text-[9px] whitespace-nowrap"
        style={{ opacity: 0.7 }}
      >
        {unit}
      </dd>
    </div>
  );
}

export default FlagRateMempool;
