/**
 * PLACEHOLDER DATA — every number in FLAGGED_MONTHS below is generated, not
 * measured. Replace the array with real per-month counts; nothing else in this
 * file or in FlaggedBlocks.tsx needs to change, as long as the shape holds:
 * one row per month, `blocks` = every block mined that month, `flagged` =
 * blocks holding at least one flagged tx, split by the pool that mined them.
 * A block is counted once, under one pool, however many flagged txs it holds.
 */

export type PoolId = "foundry" | "antpool" | "viabtc" | "f2pool" | "other";

export interface FlaggedMonth {
  /** YYYY-MM */
  month: string;
  blocks: number;
  flagged: Record<PoolId, number>;
}

export interface Pool {
  id: PoolId;
  label: string;
  /** Slot in the validated categorical palette — see global.css. */
  color: string;
}

/** Stack order, floor first. Fixed: a pool keeps its color as the mix moves. */
export const POOLS: Pool[] = [
  { id: "foundry", label: "Foundry USA", color: "var(--pool-1)" },
  { id: "antpool", label: "AntPool", color: "var(--pool-2)" },
  { id: "viabtc", label: "ViaBTC", color: "var(--pool-3)" },
  { id: "f2pool", label: "F2Pool", color: "var(--pool-4)" },
  { id: "other", label: "Other pools", color: "var(--pool-5)" },
];

export const FLAGGED_MONTHS: FlaggedMonth[] = [
  {
    month: "2023-01",
    blocks: 4428,
    flagged: { foundry: 114, antpool: 94, viabtc: 57, f2pool: 59, other: 74 },
  },
  {
    month: "2023-02",
    blocks: 4132,
    flagged: { foundry: 125, antpool: 106, viabtc: 50, f2pool: 64, other: 68 },
  },
  {
    month: "2023-03",
    blocks: 4446,
    flagged: { foundry: 155, antpool: 126, viabtc: 74, f2pool: 71, other: 91 },
  },
  {
    month: "2023-04",
    blocks: 4419,
    flagged: { foundry: 160, antpool: 137, viabtc: 85, f2pool: 89, other: 108 },
  },
  {
    month: "2023-05",
    blocks: 4470,
    flagged: { foundry: 184, antpool: 159, viabtc: 92, f2pool: 93, other: 101 },
  },
  {
    month: "2023-06",
    blocks: 4319,
    flagged: { foundry: 167, antpool: 143, viabtc: 82, f2pool: 85, other: 112 },
  },
  {
    month: "2023-07",
    blocks: 4536,
    flagged: {
      foundry: 197,
      antpool: 166,
      viabtc: 92,
      f2pool: 105,
      other: 119,
    },
  },
  {
    month: "2023-08",
    blocks: 4506,
    flagged: {
      foundry: 210,
      antpool: 156,
      viabtc: 88,
      f2pool: 108,
      other: 104,
    },
  },
  {
    month: "2023-09",
    blocks: 4394,
    flagged: {
      foundry: 189,
      antpool: 161,
      viabtc: 98,
      f2pool: 101,
      other: 105,
    },
  },
  {
    month: "2023-10",
    blocks: 4474,
    flagged: {
      foundry: 222,
      antpool: 154,
      viabtc: 91,
      f2pool: 110,
      other: 169,
    },
  },
  {
    month: "2023-11",
    blocks: 4293,
    flagged: { foundry: 214, antpool: 167, viabtc: 99, f2pool: 84, other: 111 },
  },
  {
    month: "2023-12",
    blocks: 4494,
    flagged: {
      foundry: 235,
      antpool: 197,
      viabtc: 111,
      f2pool: 102,
      other: 161,
    },
  },
  {
    month: "2024-01",
    blocks: 4355,
    flagged: {
      foundry: 282,
      antpool: 189,
      viabtc: 122,
      f2pool: 105,
      other: 140,
    },
  },
  {
    month: "2024-02",
    blocks: 4160,
    flagged: {
      foundry: 243,
      antpool: 174,
      viabtc: 105,
      f2pool: 115,
      other: 179,
    },
  },
  {
    month: "2024-03",
    blocks: 4518,
    flagged: {
      foundry: 316,
      antpool: 222,
      viabtc: 138,
      f2pool: 139,
      other: 142,
    },
  },
  {
    month: "2024-04",
    blocks: 4196,
    flagged: {
      foundry: 311,
      antpool: 189,
      viabtc: 116,
      f2pool: 129,
      other: 152,
    },
  },
  {
    month: "2024-05",
    blocks: 4389,
    flagged: {
      foundry: 331,
      antpool: 221,
      viabtc: 153,
      f2pool: 116,
      other: 168,
    },
  },
  {
    month: "2024-06",
    blocks: 4376,
    flagged: {
      foundry: 335,
      antpool: 192,
      viabtc: 134,
      f2pool: 126,
      other: 159,
    },
  },
  {
    month: "2024-07",
    blocks: 4564,
    flagged: {
      foundry: 331,
      antpool: 224,
      viabtc: 141,
      f2pool: 128,
      other: 129,
    },
  },
  {
    month: "2024-08",
    blocks: 4554,
    flagged: {
      foundry: 350,
      antpool: 226,
      viabtc: 139,
      f2pool: 116,
      other: 230,
    },
  },
  {
    month: "2024-09",
    blocks: 4393,
    flagged: {
      foundry: 350,
      antpool: 216,
      viabtc: 162,
      f2pool: 116,
      other: 193,
    },
  },
  {
    month: "2024-10",
    blocks: 4483,
    flagged: {
      foundry: 337,
      antpool: 227,
      viabtc: 141,
      f2pool: 140,
      other: 215,
    },
  },
  {
    month: "2024-11",
    blocks: 4402,
    flagged: {
      foundry: 329,
      antpool: 221,
      viabtc: 136,
      f2pool: 122,
      other: 215,
    },
  },
  {
    month: "2024-12",
    blocks: 4558,
    flagged: {
      foundry: 355,
      antpool: 241,
      viabtc: 153,
      f2pool: 122,
      other: 207,
    },
  },
  {
    month: "2025-01",
    blocks: 4480,
    flagged: {
      foundry: 411,
      antpool: 230,
      viabtc: 161,
      f2pool: 121,
      other: 220,
    },
  },
  {
    month: "2025-02",
    blocks: 3957,
    flagged: {
      foundry: 358,
      antpool: 220,
      viabtc: 151,
      f2pool: 120,
      other: 226,
    },
  },
  {
    month: "2025-03",
    blocks: 4434,
    flagged: {
      foundry: 395,
      antpool: 234,
      viabtc: 143,
      f2pool: 127,
      other: 164,
    },
  },
  {
    month: "2025-04",
    blocks: 4377,
    flagged: {
      foundry: 388,
      antpool: 211,
      viabtc: 158,
      f2pool: 128,
      other: 222,
    },
  },
  {
    month: "2025-05",
    blocks: 4369,
    flagged: {
      foundry: 460,
      antpool: 241,
      viabtc: 186,
      f2pool: 142,
      other: 211,
    },
  },
  {
    month: "2025-06",
    blocks: 4429,
    flagged: {
      foundry: 476,
      antpool: 285,
      viabtc: 203,
      f2pool: 140,
      other: 185,
    },
  },
  {
    month: "2025-07",
    blocks: 4579,
    flagged: {
      foundry: 415,
      antpool: 250,
      viabtc: 194,
      f2pool: 133,
      other: 185,
    },
  },
  {
    month: "2025-08",
    blocks: 4534,
    flagged: {
      foundry: 439,
      antpool: 239,
      viabtc: 207,
      f2pool: 121,
      other: 230,
    },
  },
  {
    month: "2025-09",
    blocks: 4421,
    flagged: {
      foundry: 521,
      antpool: 244,
      viabtc: 208,
      f2pool: 139,
      other: 227,
    },
  },
  {
    month: "2025-10",
    blocks: 4394,
    flagged: {
      foundry: 489,
      antpool: 240,
      viabtc: 198,
      f2pool: 131,
      other: 189,
    },
  },
  {
    month: "2025-11",
    blocks: 4228,
    flagged: {
      foundry: 443,
      antpool: 254,
      viabtc: 217,
      f2pool: 117,
      other: 260,
    },
  },
  {
    month: "2025-12",
    blocks: 4484,
    flagged: {
      foundry: 524,
      antpool: 242,
      viabtc: 200,
      f2pool: 124,
      other: 224,
    },
  },
  {
    month: "2026-01",
    blocks: 4374,
    flagged: {
      foundry: 502,
      antpool: 270,
      viabtc: 187,
      f2pool: 112,
      other: 188,
    },
  },
  {
    month: "2026-02",
    blocks: 4036,
    flagged: {
      foundry: 473,
      antpool: 248,
      viabtc: 203,
      f2pool: 134,
      other: 294,
    },
  },
  {
    month: "2026-03",
    blocks: 4397,
    flagged: {
      foundry: 465,
      antpool: 238,
      viabtc: 219,
      f2pool: 119,
      other: 258,
    },
  },
  {
    month: "2026-04",
    blocks: 4317,
    flagged: {
      foundry: 484,
      antpool: 249,
      viabtc: 186,
      f2pool: 111,
      other: 276,
    },
  },
  {
    month: "2026-05",
    blocks: 4582,
    flagged: {
      foundry: 612,
      antpool: 307,
      viabtc: 240,
      f2pool: 138,
      other: 330,
    },
  },
  {
    month: "2026-06",
    blocks: 4351,
    flagged: {
      foundry: 602,
      antpool: 279,
      viabtc: 214,
      f2pool: 121,
      other: 231,
    },
  },
  {
    month: "2026-07",
    blocks: 4457,
    flagged: {
      foundry: 520,
      antpool: 260,
      viabtc: 201,
      f2pool: 118,
      other: 303,
    },
  },
];

export function flaggedBlocks(row: FlaggedMonth): number {
  return POOLS.reduce((sum, pool) => sum + (row.flagged[pool.id] ?? 0), 0);
}

/** Percent of the month's blocks that held a flagged tx, 0–100. */
export function monthShare(row: FlaggedMonth): number {
  return row.blocks === 0 ? 0 : (flaggedBlocks(row) / row.blocks) * 100;
}

/** One pool's contribution to that share, in the same percentage points. */
export function poolShare(row: FlaggedMonth, pool: PoolId): number {
  return row.blocks === 0 ? 0 : ((row.flagged[pool] ?? 0) / row.blocks) * 100;
}

/** Cumulative floor and height, in percentage points, for each stack segment. */
export function segments(
  row: FlaggedMonth,
): { pool: Pool; base: number; height: number }[] {
  let base = 0;
  return POOLS.map((pool) => {
    const height = poolShare(row, pool.id);
    const segment = { pool, base, height };
    base += height;
    return segment;
  });
}

/** Axis ceiling: the next 10-point step above the tallest month. */
export function axisMax(rows: FlaggedMonth[]): number {
  const tallest = rows.reduce((max, row) => Math.max(max, monthShare(row)), 0);
  return Math.max(10, Math.ceil(tallest / 10) * 10);
}

export function axisTicks(max: number): number[] {
  const step = max > 50 ? 20 : 10;
  const ticks: number[] = [];
  for (let value = 0; value <= max; value += step) ticks.push(value);
  return ticks;
}

/** Index of every January in the series — the only x labels the axis carries. */
export function yearTicks(
  rows: FlaggedMonth[],
): { index: number; year: string }[] {
  return rows.flatMap((row, index) => {
    const [year, month] = row.month.split("-");
    return month === "01" || index === 0 ? [{ index, year }] : [];
  });
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

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}
