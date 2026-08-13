/**
 * The bitcoin timeline widget's data model and geometry.
 *
 * Kept out of the component so the two things worth being careful about — how
 * much room each knot gets on the track, and how the track turns a cursor
 * position into a selection — are testable on their own and shared by the
 * stage and the post.
 *
 * `bitcoin-epochs.json` holds only *finished* halving epochs — a finished
 * epoch's numbers are permanent, so `scripts/generate-bitcoin-epochs.mjs`
 * writes them once, at build time, from downloadable history (blockchain.info
 * charts CSV, mempool.space for halving heights, The Economist's Big Mac
 * Index) and never again. Each row carries that epoch's own average BTC/USD
 * and average US Big Mac price; what a fee was *worth* is derived from those
 * in `feeWorth()` below rather than stored, since it is one division away.
 * The prices are period-matched, not today's: pricing a 2012 fee at 2026
 * rates would measure Bitcoin's appreciation, not the fee.
 *
 * The current, still-running epoch is deliberately not in that file: its
 * totals change every block, and rewriting the build output on every deploy
 * just to chase that is the wrong layer for it. `pendingEpoch()` below
 * derives its fixed facts (id, subsidy, start height/date — all knowable from
 * the last finished epoch) with no network call; its live figures (fees,
 * difficulty, current height) are fetched in the visitor's own browser by
 * `lib/bitcoin-live-epoch.ts` and merged in at render time. It necessarily
 * prices itself at *today's* rates (live BTC/USD, and `LATEST_BIG_MAC_USD`
 * below), having no average over its own span yet.
 */
import epochData from "@/lib/bitcoin-epochs.json";

export interface Epoch {
  id: string;
  /** Shown under the knot — the subsidy, since that is what the epoch is. */
  label: string;
  subsidyBtc: number;
  startHeight: number;
  /** null until the open epoch's live tip height has been fetched. */
  endHeight: number | null;
  startDate: string;
  /** null for the current, still-running epoch. */
  endDate: string | null;
  /** null until the open epoch's live fee total has been fetched, or fetch failed. */
  totalFeesBtc: number | null;
  /** null until the open epoch's live difficulty has been fetched, or fetch failed. */
  avgDifficulty: number | null;
  /** This epoch's own average BTC/USD. Null for the open epoch, which has no
      average over its span yet and uses a live price instead. */
  avgBtcUsd: number | null;
  /** This epoch's own average US Big Mac price. Null for the open epoch, same
      reason — it falls back to LATEST_BIG_MAC_USD. */
  usBigMacUsd: number | null;
}

/** Every finished halving epoch — permanent, baked in at build time. */
export const EPOCHS: Epoch[] = epochData.epochs as Epoch[];

/** The most recent Big Mac Index US dollar price on file, for converting the
    open epoch's live fee into Big Macs — see the module comment. */
export const LATEST_BIG_MAC_USD: number = epochData.latestBigMacUsd;

/**
 * The open epoch's fixed facts, with no live figures yet.
 *
 * Everything here follows deterministically from the last finished epoch: its
 * start is that epoch's end, its subsidy is half of that epoch's, and its id
 * is the next in line. Nothing here needs a network call — only totalFeesBtc,
 * avgDifficulty, and endHeight do, and those start out null.
 */
export function pendingEpoch(closed: Epoch[] = EPOCHS): Epoch {
  const last = closed[closed.length - 1];
  const subsidyBtc = last.subsidyBtc / 2;
  return {
    id: `e${closed.length}`,
    label: String(subsidyBtc),
    subsidyBtc,
    startHeight: last.endHeight as number,
    endHeight: null,
    startDate: last.endDate as string,
    endDate: null,
    totalFeesBtc: null,
    avgDifficulty: null,
    avgBtcUsd: null,
    usBigMacUsd: null,
  };
}

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
 * the very left edge of the track, where the chain itself began. Selection
 * (see `bandAt`) is a range lookup over these spans: the readouts follow
 * whichever band the cursor is inside, not only the instant it crosses a
 * tick.
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
 * The band whose span the cursor is inside — the readouts follow wherever
 * the cursor sits in a band, not only the instant it crosses the tick at the
 * band's start. The last band's end is inclusive, so a cursor dragged all
 * the way to 1 still resolves to it instead of falling off the end.
 */
export function bandAt(bands: Band[], position: number): Band {
  return (
    bands.find(
      (band, i) =>
        position >= band.start &&
        (position < band.end || i === bands.length - 1),
    ) ?? bands[0]
  );
}

/**
 * How far off the row's floor the lowest point sits, in viewBox units, so a
 * 1px stroke on the minimum is not half-clipped by the row's bottom edge.
 * Unlike the bar spines this is *only* clearance — the scale still runs to a
 * true zero, since a line at the baseline is perfectly visible where a bar of
 * no height would not be.
 */
const SPINE_PAD = 4;

/** A normalized height as a percentage up from the row's floor. The SVG and
    the DOM cursor dot both place points with this, so they cannot drift. */
export function spineY(height: number): number {
  return SPINE_PAD + (100 - 2 * SPINE_PAD) * height;
}

export interface StepGeometry {
  /** Every flat run, as one path — the value each epoch actually held. */
  plateaus: string;
  /** The jump at each halving, kept separate so it can be colored by
      direction. One per epoch after the first. */
  risers: { d: string; up: boolean }[];
}

/**
 * The three series as step lines rather than one bar per epoch.
 *
 * A straight line between two knots would draw values that never existed:
 * the subsidy is a step function that holds for a whole epoch and halves in a
 * single block, and the fee and difficulty figures are averages over their
 * whole span. So the value is flat across the band and jumps at the tick,
 * which also puts the band widths `layout()` computes to work — a bar spine
 * throws them away and draws every epoch the same width.
 */
export function stepPath(bands: Band[], heights: number[]): StepGeometry {
  const x = (fraction: number) => (fraction * 100).toFixed(2);
  const y = (height: number) => (100 - spineY(height)).toFixed(2);
  const plateaus = bands
    .map((band, i) => `M${x(band.start)} ${y(heights[i])}H${x(band.end)}`)
    .join("");
  const risers = bands.slice(1).map((band, i) => ({
    d: `M${x(band.start)} ${y(heights[i])}V${y(heights[i + 1])}`,
    up: heights[i + 1] > heights[i],
  }));
  return { plateaus, risers };
}

/**
 * The step's value under a cursor sitting anywhere along the track.
 *
 * The dot rides the raw cursor position, not the selected knot, and on a step
 * line that stays truthful: between two halvings the value really is the one
 * the last halving set.
 */
export function stepAt(
  bands: Band[],
  heights: number[],
  position: number,
): number {
  let index = 0;
  for (let i = 0; i < bands.length; i++) {
    if (position >= bands[i].start) index = i;
  }
  return heights[index];
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

/** An epoch's total fees, spread over its blocks — a fraction of a BTC. Null
    if either figure isn't known yet (the open epoch, before its live fetch
    resolves). */
export function feesPerBlock(epoch: Epoch): number | null {
  if (epoch.endHeight === null || epoch.totalFeesBtc === null) return null;
  const blocks = epoch.endHeight - epoch.startHeight;
  return blocks > 0 ? epoch.totalFeesBtc / blocks : 0;
}

/** ₿ prefix, matching how a $ prefix reads on a dollar figure. One fewer
    digit than a naive BTC amount would use — tx fees and subsidy read as
    the same order of magnitude otherwise, on a track where they need to
    look like clearly different things. */
export function formatBtcPerBlock(btc: number): string {
  return `₿${btc.toFixed(3)}`;
}

/**
 * What a BTC amount was worth in that epoch, in dollars and in Big Macs.
 *
 * The Big Mac count is the point: it is the fee's *purchasing power*, so a
 * 2012 fee and a 2024 fee can be compared without the dollar's own inflation
 * sitting in the middle of the comparison. A finished epoch prices itself at
 * its own averages; the open epoch has none yet, so it uses the live BTC/USD
 * price passed in against the most recent Big Mac price on file.
 *
 * Both are derived, not stored — the JSON keeps only the two source prices.
 */
export function btcWorth(
  btc: number | null,
  epoch: Epoch,
  liveBtcUsd: number | null,
): { usd: number; bigMacs: number } | null {
  if (btc === null) return null;
  const btcUsd = epoch.avgBtcUsd ?? liveBtcUsd;
  const bigMacUsd = epoch.usBigMacUsd ?? LATEST_BIG_MAC_USD;
  if (btcUsd === null || !(bigMacUsd > 0)) return null;
  const usd = btc * btcUsd;
  return { usd, bigMacs: usd / bigMacUsd };
}

/** One block's fees, priced in the epoch that earned them. */
export function feeWorth(epoch: Epoch, liveBtcUsd: number | null) {
  return btcWorth(feesPerBlock(epoch), epoch, liveBtcUsd);
}

/** One block's subsidy, priced the same way — the comparison the fee figure
    only means something against. */
export function subsidyWorth(epoch: Epoch, liveBtcUsd: number | null) {
  return btcWorth(epoch.subsidyBtc, epoch, liveBtcUsd);
}

export function formatUsd(usd: number): string {
  return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
 * Scale a series to [floor, 1] for a spine chart.
 *
 * `floor` is for bars, where the smallest value would otherwise collapse to
 * nothing and read as missing data instead of small data. A step line needs
 * none — it is visible at any height — so callers drawing lines pass 0 and
 * keep a true zero, with `SPINE_PAD` handling stroke clearance instead.
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
