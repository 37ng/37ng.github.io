/**
 * Implied off-chain revenue — data model and geometry.
 *
 * For a flagged transaction, `(floor_B − actual feerate) × vsize` is the fee
 * the pool did not collect publicly, so it is a *lower bound* on what it was
 * paid privately to include that transaction anyway. This module holds one
 * month of that measurement, per block, plus the scales the figure draws on.
 *
 * `offchain-revenue-jan2023.json` is PSEUDO DATA — a deterministic stand-in
 * with the shape real measurements will have. Replacing it means replacing
 * that one file: nothing here reads anything else. Only flagged blocks are
 * listed; `totalBlocks` and `blocksPerDay` carry the blocks that were not
 * flagged, which is what the coverage rail is drawn from.
 */
import data from "@/lib/offchain-revenue-jan2023.json";

export interface FlaggedBlock {
  /** Block height. */
  h: number;
  /** Block timestamp, ISO-8601 Z. */
  t: string;
  pool: string;
  /** Flagged transactions in this block. */
  txs: number;
  /** Summed vsize of those transactions, vB. */
  vsize: number;
  /** The block's floor feerate — the bottom of what it accepted, sat/vB. */
  floorB: number;
  /** Vsize-weighted feerate the flagged transactions actually paid, sat/vB. */
  actualFeerate: number;
  /** (floorB − actualFeerate) × vsize, rounded to whole sats. */
  impliedSats: number;
}

export interface MonthData {
  note: string;
  /** YYYY-MM. */
  month: string;
  firstHeight: number;
  lastHeight: number;
  /** Every block found in the month, flagged or not. */
  totalBlocks: number;
  /** Blocks found on each calendar day of the month. */
  blocksPerDay: number[];
  blocks: FlaggedBlock[];
}

export const MONTH: MonthData = data as MonthData;

export const SATS_PER_BTC = 100_000_000;

const MONTH_START = Date.parse(MONTH.month + "-01T00:00:00Z");
const MONTH_END = MONTH_START + MONTH.blocksPerDay.length * 86_400_000;

/** Where a timestamp sits across the month, 0 → 1. */
export function monthFraction(iso: string): number {
  return (Date.parse(iso) - MONTH_START) / (MONTH_END - MONTH_START);
}

/**
 * The vertical scale is log10 sats, and has to be: a month's blocks run from
 * a few hundred sats to over a million, and on a linear axis every block but
 * the handful of consolidations would sit flat on the baseline.
 */
export const Y_DECADES = [1e3, 1e4, 1e5, 1e6];
const Y_MIN = 2.2;
const Y_MAX = 6.25;

/** log10 sats → 0 (baseline) → 1 (top of the plot). */
export function logNorm(sats: number): number {
  const v = (Math.log10(Math.max(sats, 1)) - Y_MIN) / (Y_MAX - Y_MIN);
  return Math.min(Math.max(v, 0), 1);
}

export interface DayCoverage {
  day: number;
  blocks: number;
  flagged: number;
  share: number;
  impliedSats: number;
}

/** Per calendar day: how many of that day's blocks carried a flagged tx. */
export function coverageByDay(m: MonthData = MONTH): DayCoverage[] {
  const flagged = m.blocksPerDay.map(() => 0);
  const implied = m.blocksPerDay.map(() => 0);
  for (const b of m.blocks) {
    const day = Number(b.t.slice(8, 10)) - 1;
    flagged[day] += 1;
    implied[day] += b.impliedSats;
  }
  return m.blocksPerDay.map((blocks, i) => ({
    day: i + 1,
    blocks,
    flagged: flagged[i],
    share: blocks ? flagged[i] / blocks : 0,
    impliedSats: implied[i],
  }));
}

export interface MonthStats {
  totalSats: number;
  totalBtc: number;
  flaggedBlocks: number;
  flaggedShare: number;
  medianSats: number;
  largest: FlaggedBlock;
  /** Pools ordered by implied revenue, largest first. */
  byPool: { pool: string; blocks: number; sats: number }[];
}

export function monthStats(m: MonthData = MONTH): MonthStats {
  const sorted = [...m.blocks].sort((a, b) => a.impliedSats - b.impliedSats);
  const totalSats = sorted.reduce((s, b) => s + b.impliedSats, 0);
  const pools = new Map<
    string,
    { pool: string; blocks: number; sats: number }
  >();
  for (const b of m.blocks) {
    const row = pools.get(b.pool) ?? { pool: b.pool, blocks: 0, sats: 0 };
    row.blocks += 1;
    row.sats += b.impliedSats;
    pools.set(b.pool, row);
  }
  return {
    totalSats,
    totalBtc: totalSats / SATS_PER_BTC,
    flaggedBlocks: m.blocks.length,
    flaggedShare: m.blocks.length / m.totalBlocks,
    medianSats: sorted[Math.floor(sorted.length / 2)]?.impliedSats ?? 0,
    largest: sorted[sorted.length - 1],
    byPool: [...pools.values()].sort((a, b) => b.sats - a.sats),
  };
}

/** The n blocks with the most implied revenue, largest first. */
export function topBlocks(n: number, m: MonthData = MONTH): FlaggedBlock[] {
  return [...m.blocks]
    .sort((a, b) => b.impliedSats - a.impliedSats)
    .slice(0, n);
}

export function formatSats(sats: number): string {
  if (sats >= 1e6) return (sats / 1e6).toFixed(2) + "M";
  if (sats >= 1e4) return Math.round(sats / 1e3) + "K";
  if (sats >= 1e3) return (sats / 1e3).toFixed(1) + "K";
  return String(sats);
}

export function formatHeight(h: number): string {
  return h.toLocaleString("en-US");
}

/** "2023-01-11T04:22:07Z" → "11 JAN · 04:22Z". */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const month = d
    .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())} ${month} · ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}Z`;
}

export function monthLabel(m: MonthData = MONTH): string {
  const d = new Date(m.month + "-01T00:00:00Z");
  return d
    .toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}
