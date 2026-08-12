/**
 * The bitcoin timeline widget's data model and geometry.
 *
 * Kept out of the component so the two things worth being careful about — how
 * much room each knot gets on the track, and how the track turns a cursor
 * position into a selection — are testable on their own and shared by the
 * stage and the post.
 *
 * The data itself is not fetched: `bitcoin-epochs.json` is generated at build
 * time by `scripts/generate-bitcoin-epochs.mjs` from downloadable history
 * (blockchain.info's charts CSV export, mempool.space for halving heights),
 * aggregated one row per halving epoch. See that script for how each figure
 * is computed. Reading a committed file means the widget has no loading or
 * failed state and nothing to fetch in the visitor's browser — the cost is
 * that its numbers are current as of the last run of that script, not as of
 * the moment the page loads.
 */
import epochData from "@/lib/bitcoin-epochs.json";

export interface Epoch {
  id: string;
  /** Shown under the knot — the subsidy, since that is what the epoch is. */
  label: string;
  subsidyBtc: number;
  startHeight: number;
  endHeight: number;
  startDate: string;
  /** null for the current, still-running epoch. */
  endDate: string | null;
  totalFeesBtc: number;
  avgDifficulty: number;
}

export const EPOCHS: Epoch[] = epochData as Epoch[];

/** One knot's span of the track, as fractions of the whole. */
export interface Band {
  epoch: Epoch;
  start: number;
  end: number;
  /** Where the knot's tick is drawn — the band's start, i.e. the halving. */
  tick: number;
}

/**
 * Lay the knots out along the track, one band per epoch.
 *
 * Each epoch's share of the track is its duration — the ongoing epoch is
 * younger than the four finished ones, so it gets a visibly narrower band
 * rather than claiming equal room for unequal time. The tick sits at the
 * band's *start*, not its middle: the subsidy is a step function that takes
 * its new value exactly at the halving height, so the 50 BTC tick belongs at
 * the very left edge of the track, where the chain itself began. Selection is
 * not a range lookup: the readouts change only when the cursor touches a
 * tick, so the spans exist purely to space the ticks apart.
 */
export function layout(epochs: Epoch[] = EPOCHS): Band[] {
  const now = Date.now();
  const durations = epochs.map((epoch) => {
    const start = Date.parse(epoch.startDate);
    const end = epoch.endDate ? Date.parse(epoch.endDate) : now;
    return Math.max(end - start, 1);
  });
  const total = durations.reduce((sum, d) => sum + d, 0);
  let cursor = 0;
  return epochs.map((epoch, i) => {
    const start = cursor / total;
    cursor += durations[i];
    const end = cursor / total;
    return { epoch, start, end, tick: start };
  });
}

/**
 * The knot the cursor is touching, or `null` between knots. `tolerance` is a
 * fraction of the track's width — the tick's contact width, half on each side,
 * so a cursor arriving from either direction picks it up at the same distance.
 */
export function bandUnder(
  bands: Band[],
  position: number,
  tolerance: number,
): Band | null {
  for (const band of bands) {
    if (Math.abs(position - band.tick) <= tolerance) return band;
  }
  return null;
}

/**
 * Hashrate implied by difficulty, in EH/s.
 *
 * Difficulty is a target, not a measurement: this is the hashrate the network
 * would need for the 10-minute block interval the difficulty was set for, so
 * it is what the network was *aimed at*, not what it actually ran at over any
 * particular stretch.
 */
export function hashrateEhs(difficulty: number): number {
  const TARGET_BLOCK_SECONDS = 600;
  return (difficulty * 2 ** 32) / TARGET_BLOCK_SECONDS / 1e18;
}

/** An epoch's total fees, spread over its blocks — a fraction of a BTC. */
export function feesPerBlock(epoch: Epoch): number {
  const blocks = epoch.endHeight - epoch.startHeight;
  return blocks > 0 ? epoch.totalFeesBtc / blocks : 0;
}

export function formatBtcPerBlock(btc: number): string {
  return btc.toFixed(4);
}

/** Difficulty and hashrate are both order-1e13 numbers nobody reads digit by digit. */
export function formatCompact(value: number, digits = 2): string {
  const units = [
    { limit: 1e12, suffix: "T" },
    { limit: 1e9, suffix: "G" },
    { limit: 1e6, suffix: "M" },
    { limit: 1e3, suffix: "K" },
  ];
  for (const { limit, suffix } of units) {
    if (value >= limit) return (value / limit).toFixed(digits) + suffix;
  }
  return value.toFixed(digits);
}

/** Block heights, comma-grouped, no decimals. */
export function formatHeight(height: number): string {
  return Math.round(height).toLocaleString("en-US");
}

/**
 * Scale a series to [floor, 1] for a spine chart's bar heights.
 *
 * `floor` keeps the smallest bar visible rather than collapsing to nothing —
 * a spine that vanishes at one end reads as missing data, not as small data.
 * `log` is for series like difficulty that span many orders of magnitude,
 * where a linear scale would flatten every early epoch to the floor.
 */
export function normalize(
  values: number[],
  { log = false, floor = 0.08 }: { log?: boolean; floor?: number } = {},
): number[] {
  const scaled = log ? values.map((v) => Math.log(Math.max(v, 1))) : values;
  const min = Math.min(...scaled);
  const max = Math.max(...scaled);
  if (max === min) return values.map(() => 1);
  return scaled.map((v) => floor + (1 - floor) * ((v - min) / (max - min)));
}
