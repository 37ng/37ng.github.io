import type { FlagRow } from "./pool-flag-rate";

/* PSEUDO DATA — not measured, generated. Replace this whole file's default
   export with the real rows; nothing else reads the generator. */

interface PoolSpec {
  name: string;
  share: number;
  base: number;
  drift: number;
  from?: string;
  until?: string;
}

const POOL_SPECS: PoolSpec[] = [
  { name: "foundry usa", share: 0.29, base: 0.16, drift: 0.13 },
  { name: "antpool", share: 0.21, base: 0.05, drift: 0.03 },
  { name: "viabtc", share: 0.11, base: 0.04, drift: 0.02 },
  { name: "f2pool", share: 0.1, base: 0.14, drift: -0.11 },
  { name: "binance pool", share: 0.07, base: 0.03, drift: 0.01 },
  { name: "mara pool", share: 0.05, base: 0.21, drift: 0.14 },
  { name: "luxor", share: 0.04, base: 0.15, drift: 0.07 },
  { name: "spiderpool", share: 0.05, base: 0.02, drift: 0.01, from: "2023-10" },
  { name: "braiins", share: 0.03, base: 0.01, drift: 0.0 },
  {
    name: "sbi crypto",
    share: 0.02,
    base: 0.09,
    drift: 0.02,
    until: "2025-08",
  },
  { name: "other", share: 0.06, base: 0.03, drift: 0.02 },
];

const FIRST_MONTH = "2023-01";
const LAST_MONTH = "2026-06";
const BLOCKS_PER_MONTH = 4380;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function monthRange(first: string, last: string): string[] {
  const months: string[] = [];
  let [year, month] = first.split("-").map(Number);
  const [lastYear, lastMonth] = last.split("-").map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function generate(): FlagRow[] {
  const random = mulberry32(0x9c1f37);
  const months = monthRange(FIRST_MONTH, LAST_MONTH);
  const rows: FlagRow[] = [];

  for (const spec of POOL_SPECS) {
    for (const [index, month] of months.entries()) {
      if (spec.from && month < spec.from) continue;
      if (spec.until && month > spec.until) continue;

      const t = index / (months.length - 1);
      const share = spec.share * (0.78 + random() * 0.44);
      const blocksWon = Math.round(BLOCKS_PER_MONTH * share);
      if (blocksWon === 0) continue;

      // An S-curve, not a straight line: policy changes land over a quarter or
      // two rather than one month.
      const ramp = 1 / (1 + Math.exp(-(t - 0.45) * 7));
      const rate = Math.min(
        0.94,
        Math.max(0, spec.base + spec.drift * ramp + (random() - 0.5) * 0.045),
      );
      rows.push({
        pool: spec.name,
        month,
        blocksWon,
        flaggedBlocks: Math.round(blocksWon * rate),
      });
    }
  }

  return rows;
}

export const FLAG_ROWS: FlagRow[] = generate();
