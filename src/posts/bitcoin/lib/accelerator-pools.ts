import raw from "../data/mempool-space-by-month.json";
import priceRaw from "../data/price.json";

type Raw = Record<string, { pools: Record<string, number>; sum: number }>;

const PRICE = priceRaw as Record<string, number>;

export type Unit = "btc" | "usd";

export interface MonthRow {
  month: string;
  pools: Record<string, number>;
  sum: number;
  /** That month's own BTC/USD, so a fee is never repriced at another month's rate. */
  btcUsd: number;
}

export interface PoolSeries {
  id: string;
  color: string;
  total: number;
  totalUsd: number;
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
  .map(([month, row]) => ({
    month,
    pools: row.pools,
    sum: row.sum,
    btcUsd: PRICE[month] ?? 0,
  }));

export const POOLS: PoolSeries[] = buildPools();

function buildPools(): PoolSeries[] {
  const totals = new Map<string, number>();
  const totalsUsd = new Map<string, number>();
  for (const row of MONTHS) {
    for (const [pool, value] of Object.entries(row.pools)) {
      totals.set(pool, (totals.get(pool) ?? 0) + value);
      totalsUsd.set(pool, (totalsUsd.get(pool) ?? 0) + usdWorth(value, row));
    }
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, total], rank) => ({
      id,
      color: `var(--series-${(rank % SERIES_SLOTS) + 1})`,
      total,
      totalUsd: totalsUsd.get(id) ?? 0,
    }));
}

export const GRAND_TOTAL = MONTHS.reduce((sum, row) => sum + row.sum, 0);
export const GRAND_TOTAL_USD = MONTHS.reduce(
  (sum, row) => sum + usdWorth(row.sum, row),
  0,
);

export function usdWorth(sats: number, row: MonthRow): number {
  return toBtc(sats) * row.btcUsd;
}

export function amountOf(
  row: MonthRow,
  pool: string,
  unit: Unit,
): number | undefined {
  const sats = row.pools[pool];
  if (sats === undefined) return undefined;
  return unit === "btc" ? sats : usdWorth(sats, row);
}

export function totalOf(row: MonthRow, unit: Unit): number {
  return unit === "btc" ? row.sum : usdWorth(row.sum, row);
}

export function poolTotal(pool: PoolSeries, unit: Unit): number {
  return unit === "btc" ? pool.total : pool.totalUsd;
}

export function grandTotal(unit: Unit): number {
  return unit === "btc" ? GRAND_TOTAL : GRAND_TOTAL_USD;
}

export function shareOfMonth(
  row: MonthRow,
  pool: string,
  unit: Unit = "btc",
): number {
  const value = amountOf(row, pool, unit);
  const total = totalOf(row, unit);
  if (value === undefined || total === 0) return 0;
  return (value / total) * 100;
}

export function lifetimeShare(pool: PoolSeries, unit: Unit = "btc"): number {
  const total = grandTotal(unit);
  return total === 0 ? 0 : (poolTotal(pool, unit) / total) * 100;
}

export function segments(row: MonthRow, unit: Unit = "btc"): Segment[] {
  let base = 0;
  return POOLS.flatMap((pool) => {
    const value = amountOf(row, pool.id, unit);
    if (value === undefined) return [];
    const segment = { pool, value, base };
    base += value;
    return [segment];
  });
}

export function axisMax(pool: string | null, unit: Unit = "btc"): number {
  const top = MONTHS.reduce(
    (max, row) =>
      Math.max(
        max,
        pool === null ? totalOf(row, unit) : (amountOf(row, pool, unit) ?? 0),
      ),
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

export function formatUsd(usd: number): string {
  if (usd === 0) return "0";
  if (usd >= 1000) return Math.round(usd).toLocaleString("en-US");
  const fixed = usd.toPrecision(3);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

export function formatValue(value: number, unit: Unit): string {
  return unit === "btc" ? formatBtc(value) : formatUsd(value);
}

export function unitMark(unit: Unit): string {
  return unit === "btc" ? "₿" : "$";
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
