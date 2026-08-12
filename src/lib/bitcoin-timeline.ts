/**
 * The bitcoin timeline widget's data model and geometry.
 *
 * Kept out of the component so the two things worth being careful about — how
 * far back each knot looks, and how the track turns a cursor position into a
 * selection — are testable on their own and shared by the stage and the post.
 */

export interface Interval {
  id: string;
  /** Shown under the knot. "1M" is avoided outright: the issue's list has both
      one month and one minute in it, and on a track this small the reader gets
      no other clue which is which. */
  label: string;
  /** How far back from now this knot looks. */
  seconds: number;
  /**
   * The knot's share of the track. These are the issue's pixel figures (5y is
   * 50 wide, 1y is 30) kept as *weights* rather than fixed widths, so the same
   * proportions survive being laid out in a post column and across a stage.
   * Longer lookbacks get more room, which is also what makes the far end of
   * the track — where the numbers move slowest — the easiest part to hit.
   */
  weight: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const INTERVALS: Interval[] = [
  { id: "5y", label: "5Y", seconds: 5 * 365 * DAY, weight: 50 },
  { id: "1y", label: "1Y", seconds: 365 * DAY, weight: 30 },
  { id: "1mo", label: "1MO", seconds: 30 * DAY, weight: 24 },
  { id: "1w", label: "1W", seconds: 7 * DAY, weight: 20 },
  { id: "1d", label: "1D", seconds: DAY, weight: 18 },
  { id: "1h", label: "1H", seconds: HOUR, weight: 16 },
  { id: "1min", label: "1MIN", seconds: MINUTE, weight: 14 },
];

/** One knot's span of the track, as fractions of the whole. */
export interface Band {
  interval: Interval;
  start: number;
  end: number;
  /** Where the knot's tick is drawn — the middle of its own band. */
  center: number;
}

/**
 * Lay the knots out along the track.
 *
 * The weights decide how much of the track each knot's span covers, and the
 * knot's tick is drawn in the middle of its own span. Selection is not a range
 * lookup: the readouts change only when the cursor touches a tick, so the
 * spans exist purely to space the ticks apart.
 */
export function layout(intervals: Interval[] = INTERVALS): Band[] {
  const total = intervals.reduce((sum, interval) => sum + interval.weight, 0);
  let cursor = 0;
  return intervals.map((interval) => {
    const start = cursor / total;
    cursor += interval.weight;
    const end = cursor / total;
    return { interval, start, end, center: (start + end) / 2 };
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
    if (Math.abs(position - band.center) <= tolerance) return band;
  }
  return null;
}

/** One block, as the widget needs it. */
export interface BlockSample {
  intervalId: string;
  height: number;
  /** Block time, unix seconds. */
  timestamp: number;
  /** Transaction fees only — the coinbase subsidy is not in here. */
  totalFeesSats: number;
  difficulty: number;
  feeRateSatVb: number;
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

export function formatBtc(sats: number): string {
  return (sats / 1e8).toFixed(3);
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

/** Block time as a plain UTC stamp — the widget is a spec sheet, not a feed. */
export function formatStamp(timestamp: number): string {
  return new Date(timestamp * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}
