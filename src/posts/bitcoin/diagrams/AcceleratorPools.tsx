import { useMemo, useState } from "react";
import {
  amountOf,
  axisMax,
  axisTicks,
  formatMonth,
  formatShare,
  formatValue,
  grandTotal,
  lifetimeShare,
  MONTHS,
  POOLS,
  poolTotal,
  position,
  segments,
  shareOfMonth,
  totalOf,
  unitMark,
  yearTicks,
  type MonthRow,
  type PoolSeries,
  type Segment,
  type Unit,
} from "../lib/accelerator-pools";

const PLOT_HEIGHT = 240;
const YEARS = yearTicks();
const STACKS: Record<Unit, Segment[][]> = {
  btc: MONTHS.map((row) => segments(row, "btc")),
  usd: MONTHS.map((row) => segments(row, "usd")),
};

export function AcceleratorPools() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>("btc");

  const focus = selected ?? hovered;
  const row = cursor === null ? null : MONTHS[cursor];
  const ceiling = useMemo(() => axisMax(selected, unit), [selected, unit]);
  const ticks = useMemo(() => axisTicks(ceiling), [ceiling]);
  const toggle = (id: string) =>
    setSelected((current) => (current === id ? null : id));

  return (
    <figure className="not-prose my-10 w-full border border-ink-700 p-5 text-ink-300">
      <div className="flex flex-col gap-1 font-mono text-[10px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <span className="text-signal-500">
          BTC offchain fee, published by mempool.space
        </span>
        <span className="whitespace-nowrap tabular-nums">
          {formatMonth(MONTHS[0].month)} —{" "}
          {formatMonth(MONTHS[MONTHS.length - 1].month)}
        </span>
      </div>

      <Readout selected={selected} row={row} unit={unit} onUnit={setUnit} />

      <div
        className="mt-5 flex gap-2"
        onPointerLeave={() => {
          setCursor(null);
          setHovered(null);
        }}
      >
        <div
          className="relative w-12 shrink-0 font-mono text-[9px] tabular-nums"
          style={{ height: PLOT_HEIGHT }}
          aria-hidden="true"
        >
          {ticks.map((tick, slot) => (
            <span
              key={slot}
              className="chart-move absolute right-0 translate-y-1/2 opacity-55"
              style={{ bottom: `${position(tick, ceiling) * 100}%` }}
            >
              {formatValue(tick, unit)}
            </span>
          ))}
        </div>

        <div
          className="relative flex-1 touch-none select-none"
          style={{ height: PLOT_HEIGHT }}
          role="img"
          aria-label={`Offchain fees published by mempool.space, in ${unit === "btc" ? "BTC" : "US dollars"} per month, stacked by the pool that took them.${selected ? ` Showing ${selected} alone.` : ""}`}
        >
          {ticks.map((tick, slot) => (
            <div
              key={slot}
              className="chart-move pointer-events-none absolute inset-x-0 h-px"
              style={{
                bottom: `${position(tick, ceiling) * 100}%`,
                background: "currentColor",
                opacity: tick === 0 ? 0.4 : 0.12,
              }}
              aria-hidden="true"
            />
          ))}

          <div className="absolute inset-0 flex">
            {MONTHS.map((month, index) => (
              <Column
                key={month.month}
                stack={STACKS[unit][index]}
                ceiling={ceiling}
                index={index}
                cursor={cursor}
                selected={selected}
                focus={focus}
                unit={unit}
                onCursor={setCursor}
                onHover={setHovered}
                onToggle={toggle}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex gap-2">
        <div className="w-12 shrink-0" aria-hidden="true" />
        <div className="relative h-3 flex-1 font-mono text-[9px] tabular-nums">
          {YEARS.map(({ index, year }) => (
            <span
              key={`${year}-${index}`}
              className="absolute opacity-60"
              style={{ left: `${(index / MONTHS.length) * 100}%` }}
            >
              {year}
            </span>
          ))}
        </div>
      </div>

      <Legend
        selected={selected}
        focus={focus}
        row={row}
        unit={unit}
        onHover={setHovered}
        onToggle={toggle}
        onClear={() => setSelected(null)}
      />
    </figure>
  );
}

function Column({
  stack,
  ceiling,
  index,
  cursor,
  selected,
  focus,
  unit,
  onCursor,
  onHover,
  onToggle,
}: {
  stack: Segment[];
  ceiling: number;
  index: number;
  cursor: number | null;
  selected: string | null;
  focus: string | null;
  unit: Unit;
  onCursor: (index: number) => void;
  onHover: (id: string | null) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className="relative h-full flex-1 cursor-pointer"
      onPointerEnter={() => onCursor(index)}
    >
      {cursor === index && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "color-mix(in srgb, var(--color-signal-500) 9%, transparent)",
            boxShadow:
              "inset 1px 0 0 0 var(--color-signal-500), inset -1px 0 0 0 var(--color-signal-500)",
          }}
          aria-hidden="true"
        />
      )}
      {stack.map((segment) => {
        const alone = selected === segment.pool.id;
        const gone = selected !== null && !alone;
        const base = alone ? 0 : segment.base;
        const bottom = gone ? 0 : position(base, ceiling);
        const top = gone ? 0 : position(base + segment.value, ceiling);
        const sweep = `${index * 6}ms`;
        return (
          <div
            key={segment.pool.id}
            className="chart-move absolute inset-x-px"
            title={`${segment.pool.id} · ${formatValue(segment.value, unit)} ${unitMark(unit)}`}
            onPointerEnter={() => onHover(segment.pool.id)}
            onClick={() => onToggle(segment.pool.id)}
            style={{
              background: segment.pool.color,
              bottom: `${bottom * 100}%`,
              height: `${(top - bottom) * 100}%`,
              opacity: gone
                ? 0
                : !focus || focus === segment.pool.id
                  ? 1
                  : 0.12,
              pointerEvents: gone ? "none" : undefined,
              transitionDelay: `${sweep}, ${sweep}, 0ms`,
            }}
          />
        );
      })}
    </div>
  );
}

function Readout({
  selected,
  row,
  unit,
  onUnit,
}: {
  selected: string | null;
  row: MonthRow | null;
  unit: Unit;
  onUnit: (unit: Unit) => void;
}) {
  const pool = selected
    ? POOLS.find((entry) => entry.id === selected)
    : undefined;
  const value = row
    ? selected
      ? (amountOf(row, selected, unit) ?? 0)
      : totalOf(row, unit)
    : pool
      ? poolTotal(pool, unit)
      : grandTotal(unit);
  const share = selected
    ? row
      ? shareOfMonth(row, selected, unit)
      : pool
        ? lifetimeShare(pool, unit)
        : 0
    : null;

  return (
    <div className="mt-4 flex items-end justify-between gap-4">
      <div>
        <div className="font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums text-ink-50 sm:text-3xl">
          <UnitToggle unit={unit} onChange={onUnit} />
          <span className="ml-3">{formatValue(value, unit)}</span>
        </div>
        <div className="h-[1.2em] font-mono text-[9px] leading-[1.2em] whitespace-nowrap tabular-nums opacity-70">
          {share === null
            ? ""
            : `${formatShare(share)} of ${row ? "the month" : "the total"}`}
        </div>
      </div>
      <div className="text-right font-mono text-[10px] whitespace-nowrap text-ink-50 tabular-nums">
        <div>{selected ?? "all pools"}</div>
        <div className="text-[9px] opacity-60">
          {row ? formatMonth(row.month) : "all months"}
        </div>
      </div>
    </div>
  );
}

function UnitToggle({
  unit,
  onChange,
}: {
  unit: Unit;
  onChange: (unit: Unit) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(unit === "btc" ? "usd" : "btc")}
      aria-label={`Showing ${unit === "btc" ? "BTC" : "US dollars"}, switch to ${unit === "btc" ? "US dollars" : "BTC"}`}
      className="mr-4 inline-flex cursor-pointer items-baseline gap-0.5 font-mono text-[1em] font-normal"
    >
      <span style={{ opacity: unit === "btc" ? 1 : 0.35 }}>₿</span>
      <span className="opacity-35">/</span>
      <span style={{ opacity: unit === "usd" ? 1 : 0.35 }}>$</span>
    </button>
  );
}

function Legend({
  selected,
  focus,
  row,
  unit,
  onHover,
  onToggle,
  onClear,
}: {
  selected: string | null;
  focus: string | null;
  row: MonthRow | null;
  unit: Unit;
  onHover: (id: string | null) => void;
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-5" onPointerLeave={() => onHover(null)}>
      <div className="flex h-[1.2em] items-baseline justify-end font-mono text-[9px] leading-[1.2em]">
        {selected && (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer text-signal-500 uppercase"
          >
            show all
          </button>
        )}
      </div>

      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] tabular-nums">
        {POOLS.map((pool) => (
          <LegendItem
            key={pool.id}
            pool={pool}
            selected={selected}
            focus={focus}
            row={row}
            unit={unit}
            onHover={onHover}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </div>
  );
}

function LegendItem({
  pool,
  selected,
  focus,
  row,
  unit,
  onHover,
  onToggle,
}: {
  pool: PoolSeries;
  selected: string | null;
  focus: string | null;
  row: MonthRow | null;
  unit: Unit;
  onHover: (id: string | null) => void;
  onToggle: (id: string) => void;
}) {
  const paid = row === null ? undefined : amountOf(row, pool.id, unit);
  const absent = row !== null && paid === undefined;
  const value = row ? (paid ?? 0) : poolTotal(pool, unit);
  const sats = row ? (row.pools[pool.id] ?? 0) : pool.total;
  const share = row
    ? shareOfMonth(row, pool.id, unit)
    : lifetimeShare(pool, unit);
  const dim = focus !== null && focus !== pool.id;

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected === pool.id}
        onPointerEnter={() => onHover(pool.id)}
        onFocus={() => onHover(pool.id)}
        onBlur={() => onHover(null)}
        onClick={() => onToggle(pool.id)}
        title={`${pool.id} · ${sats.toLocaleString()} sats · ${formatShare(share)}`}
        className="flex w-full cursor-pointer items-baseline gap-2 py-0.5 text-left"
        style={{ opacity: dim ? 0.35 : 1, transition: "opacity 140ms linear" }}
      >
        <span
          className="h-2 w-2 shrink-0 translate-y-[-1px]"
          style={{ background: pool.color }}
          aria-hidden="true"
        />
        <span className="flex-1 truncate text-ink-200">{pool.id}</span>
        <span className="text-ink-100">
          {absent ? "—" : formatValue(value, unit)}
          {!absent && <span className="ml-1 opacity-50">{unitMark(unit)}</span>}
        </span>
      </button>
    </li>
  );
}

export default AcceleratorPools;
