import raw from "../data/mempool-space-by-month.json";

type Raw = Record<string, { pools: Record<string, number>; sum: number }>;

export interface MonthRow {
  month: string;
  pools: Record<string, number>;
  sum: number;
}

export interface PoolSeries {
  id: string;
  color: string;
  total: number;
}

export interface Segment {
  pool: PoolSeries;
  value: number;
  base: number;
}

export const SERIES_SLOTS = 14;
export const SATS_PER_BTC = 100_000_000;

export const MONTHS: MonthRow[] = Object.entries(raw as Raw)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([month, row]) => ({ month, pools: row.pools, sum: row.sum }));

export const POOLS: PoolSeries[] = buildPools();

function buildPools(): PoolSeries[] {
  const totals = new Map<string, number>();
  for (const row of MONTHS) {
    for (const [pool, value] of Object.entries(row.pools)) {
      totals.set(pool, (totals.get(pool) ?? 0) + value);
    }
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, total], rank) => ({
      id,
      color: `var(--series-${(rank % SERIES_SLOTS) + 1})`,
      total,
    }));
}

export const GRAND_TOTAL = MONTHS.reduce((sum, row) => sum + row.sum, 0);

export function shareOfMonth(row: MonthRow, pool: string): number {
  const value = row.pools[pool];
  if (value === undefined || row.sum === 0) return 0;
  return (value / row.sum) * 100;
}

export function lifetimeShare(pool: PoolSeries): number {
  return GRAND_TOTAL === 0 ? 0 : (pool.total / GRAND_TOTAL) * 100;
}

export function segments(row: MonthRow): Segment[] {
  let base = 0;
  return POOLS.flatMap((pool) => {
    const value = row.pools[pool.id];
    if (value === undefined) return [];
    const segment = { pool, value, base };
    base += value;
    return [segment];
  });
}

export function axisMax(pool: string | null): number {
  const top = MONTHS.reduce(
    (max, row) =>
      Math.max(max, pool === null ? row.sum : (row.pools[pool] ?? 0)),
    0,
  );
  const step = axisStep(top);
  return Math.ceil(top / step) * step;
}

function axisStep(max: number): number {
  const rough = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normal = rough / magnitude;
  const step = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
  return step * magnitude;
}

export function axisTicks(max: number): number[] {
  const step = axisStep(max);
  const ticks: number[] = [];
  for (let value = 0; value <= max; value += step) ticks.push(value);
  return ticks;
}

export function position(value: number, max: number): number {
  return max === 0 ? 0 : value / max;
}

export function toBtc(sats: number): number {
  return sats / SATS_PER_BTC;
}

export function formatBtc(sats: number): string {
  const btc = toBtc(sats);
  if (btc === 0) return "0";
  if (btc >= 100) return btc.toFixed(0);
  const fixed = btc.toPrecision(3);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

export function formatShare(value: number): string {
  if (value === 0) return "0%";
  return value < 0.1 ? "<0.1%" : `${value.toFixed(1)}%`;
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

export function formatMonth(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTH_NAMES[Number(index) - 1]} ${year}`;
}

export function yearTicks(): { index: number; year: string }[] {
  const januaries = MONTHS.flatMap((row, index) => {
    const [year, month] = row.month.split("-");
    return month === "01" ? [{ index, year }] : [];
  });
  const [firstYear] = MONTHS[0].month.split("-");
  const crowded = januaries.length > 0 && januaries[0].index < 3;
  return crowded ? januaries : [{ index: 0, year: firstYear }, ...januaries];
}
