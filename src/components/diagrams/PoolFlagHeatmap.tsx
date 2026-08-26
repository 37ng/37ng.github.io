import { useMemo, useState } from "react";
import { FLAG_ROWS } from "@/lib/pool-flag-sample";
import {
  buildHeatmap,
  formatBlocks,
  formatMonth,
  formatRate,
  shade,
  type Cell,
  type Series,
} from "@/lib/pool-flag-rate";

interface Hover {
  pool: string;
  cell: Cell;
}

export function PoolFlagHeatmap() {
  const heatmap = useMemo(() => buildHeatmap(FLAG_ROWS), []);
  const [hover, setHover] = useState<Hover | null>(null);

  const { months, years, pools, network, maxRate } = heatmap;
  const columns = `repeat(${months.length}, minmax(0, 1fr))`;
  const span = `${formatMonth(months[0])} — ${formatMonth(months[months.length - 1])}`;

  return (
    <div className="not-prose my-10 w-full border border-ink-700 p-5 text-ink-300">
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span className="text-signal-500">flagged blocks / blocks won</span>
        <span className="tabular-nums">{span}</span>
      </div>

      <Readout hover={hover} network={network} span={span} />

      <div className="mt-4 overflow-x-auto">
        <div
          className="grid gap-x-3"
          style={{
            gridTemplateColumns: "5.5rem minmax(0, 1fr) 3rem",
            minWidth: "26rem",
          }}
          onMouseLeave={() => setHover(null)}
        >
          {pools.map((series, row) => (
            <Row
              key={series.pool}
              series={series}
              columns={columns}
              maxRate={maxRate}
              row={row}
              hover={hover}
              onHover={setHover}
            />
          ))}

          <div className="col-span-3 my-2 h-px bg-ink-700" />

          <Row
            series={network}
            columns={columns}
            maxRate={maxRate}
            row={pools.length + 1}
            hover={hover}
            onHover={setHover}
          />

          <div />
          <div
            className="mt-2 grid font-mono text-[9px] text-ink-400"
            style={{ gridTemplateColumns: columns }}
          >
            {years.map((year) => (
              <div
                key={year.year}
                className="border-l border-ink-700 pl-1 tabular-nums"
                style={{ gridColumn: `span ${year.span}` }}
              >
                {year.year}
              </div>
            ))}
          </div>
          <div />
        </div>
      </div>

      <Legend maxRate={maxRate} />
    </div>
  );
}

interface RowProps {
  series: Series;
  columns: string;
  maxRate: number;
  row: number;
  hover: Hover | null;
  onHover: (hover: Hover | null) => void;
}

function Row({ series, columns, maxRate, row, hover, onHover }: RowProps) {
  const active = hover?.pool === series.pool;

  return (
    <>
      <div
        className="self-center text-right font-mono text-[9px] transition-colors"
        style={{ color: active ? "var(--color-signal-500)" : undefined }}
      >
        {series.pool}
      </div>

      <div
        className="grid gap-[2px] py-[1px]"
        style={{ gridTemplateColumns: columns }}
        aria-label={`${series.pool}: ${formatRate(series.rate)} of ${formatBlocks(series.blocksWon)} blocks flagged`}
        role="img"
      >
        {series.cells.map((cell, column) => {
          const lit = !hover || hover.cell.month === cell?.month;
          return (
            <div
              key={column}
              className="heat-cell h-3 transition-opacity duration-150"
              title={
                cell
                  ? `${series.pool} · ${formatMonth(cell.month)} · ${formatRate(cell.rate)} (${formatBlocks(cell.flaggedBlocks)} of ${formatBlocks(cell.blocksWon)})`
                  : undefined
              }
              onMouseEnter={() => cell && onHover({ pool: series.pool, cell })}
              style={{
                background: cell
                  ? shade(cell.rate, maxRate)
                  : "var(--color-ink-900)",
                boxShadow: cell
                  ? undefined
                  : "inset 0 0 0 1px var(--color-ink-800)",
                opacity: lit ? 1 : 0.28,
                animationDelay: `${column * 6 + row * 14}ms`,
              }}
            />
          );
        })}
      </div>

      <div
        className="self-center font-mono text-[9px] tabular-nums transition-colors"
        style={{ color: active ? "var(--color-signal-500)" : undefined }}
      >
        {formatRate(series.rate)}
      </div>
    </>
  );
}

function Readout({
  hover,
  network,
  span,
}: {
  hover: Hover | null;
  network: Series;
  span: string;
}) {
  const pool = hover ? hover.pool : "all pools";
  const when = hover ? formatMonth(hover.cell.month) : span;
  const won = hover ? hover.cell.blocksWon : network.blocksWon;
  const flagged = hover ? hover.cell.flaggedBlocks : network.flaggedBlocks;
  const rate = hover ? hover.cell.rate : network.rate;

  return (
    <div className="mt-4 flex items-baseline justify-between gap-4 border-b border-ink-700 pb-3">
      <div>
        <div className="font-mono text-[9px] text-ink-400">
          {pool} · {when}
        </div>
        <div className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums text-ink-100">
          {formatRate(rate)}
        </div>
      </div>
      <div className="text-right font-mono text-[9px] tabular-nums text-ink-400">
        <div>{formatBlocks(flagged)} flagged</div>
        <div>{formatBlocks(won)} won</div>
      </div>
    </div>
  );
}

function Legend({ maxRate }: { maxRate: number }) {
  const steps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-[9px] text-ink-400">
      <div className="flex items-center gap-2">
        <span className="tabular-nums">0%</span>
        <div className="flex gap-[2px]">
          {steps.map((step) => (
            <div
              key={step}
              className="h-3 w-6"
              style={{ background: shade(step * maxRate, maxRate) }}
            />
          ))}
        </div>
        <span className="tabular-nums">{formatRate(maxRate)}</span>
      </div>
      <span>one cell = one pool-month · hollow = no blocks won</span>
    </div>
  );
}
