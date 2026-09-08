export interface FlagRow {
  pool: string;
  month: string;
  blocksWon: number;
  flaggedBlocks: number;
}

export interface Cell {
  month: string;
  blocksWon: number;
  flaggedBlocks: number;
  rate: number;
}

export interface Series {
  pool: string;
  cells: (Cell | null)[];
  blocksWon: number;
  flaggedBlocks: number;
  rate: number;
}

export interface YearSpan {
  year: string;
  start: number;
  span: number;
}

export interface Heatmap {
  months: string[];
  years: YearSpan[];
  pools: Series[];
  network: Series;
  maxRate: number;
}

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function toCell(month: string, won: number, flagged: number): Cell {
  return {
    month,
    blocksWon: won,
    flaggedBlocks: flagged,
    rate: won === 0 ? 0 : flagged / won,
  };
}

function summarize(pool: string, cells: (Cell | null)[]): Series {
  let blocksWon = 0;
  let flaggedBlocks = 0;
  for (const cell of cells) {
    if (!cell) continue;
    blocksWon += cell.blocksWon;
    flaggedBlocks += cell.flaggedBlocks;
  }
  return {
    pool,
    cells,
    blocksWon,
    flaggedBlocks,
    rate: blocksWon === 0 ? 0 : flaggedBlocks / blocksWon,
  };
}

export function buildHeatmap(rows: FlagRow[]): Heatmap {
  const months = [...new Set(rows.map((row) => row.month))].sort();
  const index = new Map(months.map((month, i) => [month, i]));

  const byPool = new Map<string, (Cell | null)[]>();
  const networkCells: (Cell | null)[] = months.map(() => null);
  const networkWon = months.map(() => 0);
  const networkFlagged = months.map(() => 0);

  for (const row of rows) {
    const column = index.get(row.month);
    if (column === undefined) continue;
    let cells = byPool.get(row.pool);
    if (!cells) {
      cells = months.map(() => null);
      byPool.set(row.pool, cells);
    }
    cells[column] = toCell(row.month, row.blocksWon, row.flaggedBlocks);
    networkWon[column] += row.blocksWon;
    networkFlagged[column] += row.flaggedBlocks;
  }

  for (const [column, month] of months.entries()) {
    if (networkWon[column] === 0) continue;
    networkCells[column] = toCell(
      month,
      networkWon[column],
      networkFlagged[column],
    );
  }

  const pools = [...byPool.entries()]
    .map(([pool, cells]) => summarize(pool, cells))
    .sort((a, b) => b.blocksWon - a.blocksWon);

  const years: YearSpan[] = [];
  for (const [column, month] of months.entries()) {
    const year = month.slice(0, 4);
    const last = years[years.length - 1];
    if (last && last.year === year) last.span += 1;
    else years.push({ year, start: column, span: 1 });
  }

  let maxRate = 0;
  for (const series of pools) {
    for (const cell of series.cells) {
      if (cell && cell.rate > maxRate) maxRate = cell.rate;
    }
  }

  return {
    months,
    years,
    pools,
    network: summarize("network", networkCells),
    maxRate: maxRate || 1,
  };
}

/** Cell fill: one hue, surface → signal, gamma-eased so the low end stays legible. */
export function shade(rate: number, maxRate: number): string {
  const t = Math.min(1, Math.max(0, rate / maxRate)) ** 0.78;
  const mix = (5 + 90 * t).toFixed(1);
  return `color-mix(in oklab, var(--color-signal-500) ${mix}%, var(--color-ink-800))`;
}

export function formatMonth(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTH_NAMES[Number(index) - 1]} ${year}`;
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatBlocks(count: number): string {
  return count.toLocaleString("en-US");
}
