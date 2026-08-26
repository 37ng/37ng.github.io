/**
 * Deterministic pseudo data for the implied off-chain revenue figure
 * (src/components/diagrams/OffchainRevenue.tsx).
 *
 * This is a STAND-IN, not a measurement: it invents a month of blocks with
 * the shape real data will have, so the figure can be built and read before
 * the real numbers exist. Nothing about it is evidence of anything. When the
 * real Jan 2023 measurements land, they replace the JSON file this writes and
 * this script goes away — the component reads the file, never this.
 *
 * The seed is fixed, so re-running it reproduces the committed file exactly.
 *
 *   npm run offchain-pseudo
 */
import { writeFileSync } from "node:fs";
import { format } from "prettier";

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20230101);
const between = (lo, hi) => lo + rnd() * (hi - lo);

const POOLS = [
  ["Foundry USA", 0.32],
  ["AntPool", 0.19],
  ["F2Pool", 0.15],
  ["ViaBTC", 0.11],
  ["Binance Pool", 0.09],
  ["Braiins Pool", 0.06],
  ["Luxor", 0.04],
  ["Unknown", 0.04],
];
function pickPool() {
  let r = rnd();
  for (const [name, w] of POOLS) {
    if ((r -= w) <= 0) return name;
  }
  return "Unknown";
}
// Pools that sell direct submission are flagged far more often.
const FLAG_BIAS = {
  "Foundry USA": 0.9,
  AntPool: 1.6,
  F2Pool: 2.1,
  ViaBTC: 1.3,
  "Binance Pool": 0.7,
  "Braiins Pool": 0.3,
  Luxor: 0.5,
  Unknown: 2.6,
};

const FIRST_HEIGHT = 769795;
const START = Date.UTC(2023, 0, 1, 0, 0, 0);
const END = Date.UTC(2023, 1, 1, 0, 0, 0);

// Walk the month one block at a time with exponential inter-block gaps.
const blocks = [];
let t = START;
let h = FIRST_HEIGHT;
while (t < END) {
  blocks.push({ h, t });
  t += -600 * Math.log(1 - rnd()) * 1000;
  h += 1;
}
const totalBlocks = blocks.length;

// Mempool pressure over the month: a slow swell mid-month plus noise. It
// drives both the floor feerate and how often a below-floor tx shows up.
function pressure(ts) {
  const day = (ts - START) / 86400000;
  return (
    1 +
    0.55 * Math.sin(((day - 4) / 31) * Math.PI * 1.8) +
    0.22 * Math.sin(day / 1.7)
  );
}

const flagged = [];
for (const b of blocks) {
  const pool = pickPool();
  const p = pressure(b.t);
  const floorB = Math.max(1.6, between(2.4, 5.2) * p);
  const rate = 0.055 * FLAG_BIAS[pool] * (0.6 + 0.7 * p);
  if (rnd() > rate) continue;

  // One flagged tx is the common case; a batch of them is the interesting one.
  const txs = rnd() < 0.78 ? 1 : rnd() < 0.75 ? 2 : 2 + Math.floor(rnd() * 4);
  let vsize = 0;
  let weighted = 0;
  for (let i = 0; i < txs; i++) {
    // Heavy tail: most are ordinary payments, a few are big consolidations.
    const v =
      rnd() < 0.72
        ? Math.round(between(180, 1400))
        : Math.round(between(9000, 240000));
    // Below the floor by anything from a hair to the whole floor.
    const actual = Math.max(0.1, floorB * between(0.02, 0.72));
    vsize += v;
    weighted += actual * v;
  }
  // Round the two feerates first, then derive the implied figure from the
  // rounded pair: the tooltip shows both, and a reader who multiplies them
  // out has to land on the number printed underneath.
  const floor2 = Math.round(floorB * 100) / 100;
  const actual2 = Math.round((weighted / vsize) * 100) / 100;
  const impliedSats = Math.round((floor2 - actual2) * vsize);
  if (impliedSats < 200) continue;

  flagged.push({
    h: b.h,
    t: new Date(b.t).toISOString().slice(0, 19) + "Z",
    pool,
    txs,
    vsize,
    floorB: floor2,
    actualFeerate: actual2,
    impliedSats,
  });
}

// Blocks found per calendar day — the denominator the coverage rail needs.
const blocksPerDay = Array.from({ length: 31 }, () => 0);
for (const b of blocks) blocksPerDay[new Date(b.t).getUTCDate() - 1] += 1;

const out = {
  note: "PSEUDO DATA — deterministic stand-in, replace with real Jan 2023 measurements.",
  month: "2023-01",
  firstHeight: FIRST_HEIGHT,
  lastHeight: blocks[blocks.length - 1].h,
  totalBlocks,
  blocksPerDay,
  blocks: flagged,
};
// Formatted by prettier rather than JSON.stringify, so re-running the script
// never leaves the repo's own format check with something to say.
writeFileSync(
  process.argv[2],
  await format(JSON.stringify(out), { parser: "json" }),
);
console.log(
  totalBlocks,
  "blocks,",
  flagged.length,
  "flagged,",
  (flagged.reduce((s, b) => s + b.impliedSats, 0) / 1e8).toFixed(4),
  "BTC implied, max",
  Math.max(...flagged.map((b) => b.impliedSats)),
  "min",
  Math.min(...flagged.map((b) => b.impliedSats)),
);
