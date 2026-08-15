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
 * just to chase that is the wrong layer for it. `pendingEpochs()` below
 * derives every epoch after the last finished one from block-height
 * arithmetic alone (id, subsidy, start height — no network call needed), and
 * does not assume there is only one. If the site has sat unbuilt across more
 * than one halving, the live tip height (fetched in
 * `lib/bitcoin-live-epoch.ts`) reveals the gap and this function walks it one
 * 210,000-block epoch at a time, so extra halvings are never silently
 * collapsed into "the" open epoch. Only the last one it returns is actually
 * still open; the ones before it are finished in every sense except being
 * written to the JSON file, and their fees/difficulty/dates are fetched live
 * the same way the open epoch's always were. The open epoch necessarily
 * prices itself at *today's* rates — both live BTC/USD and the live Big Mac
 * price (`fetchLatestBigMacUsd` in `lib/bitcoin-live-epoch.ts`, fetched the
 * same way and for the same reason as the epoch data above: "latest" is a
 * moving target, so baking it into the build would go stale) — having no
 * average over its own span yet.
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
  /** null for a pending epoch beyond the first, before its live block
      timestamp has been fetched — see `pendingEpochs()`. */
  startDate: string | null;
  /** null for the current, still-running epoch. */
  endDate: string | null;
  /** The live chain tip height, only for the open epoch (`endHeight: null`).
      `endHeight` stays null until the halving actually happens, but the fee
      total already fetched needs *some* known height to spread over — this
      is that height, so the open epoch's tx fees are not stuck unavailable
      for its entire span. Null for every finished epoch. */
  tipHeight: number | null;
  /** null until the open epoch's live fee total has been fetched, or fetch failed. */
  totalFeesBtc: number | null;
  /** null until the open epoch's live difficulty has been fetched, or fetch failed. */
  avgDifficulty: number | null;
  /** This epoch's own average BTC/USD. Null for the open epoch, which has no
      average over its span yet and uses a live price instead. */
  avgBtcUsd: number | null;
  /** This epoch's own average US Big Mac price. Null for the open epoch, same
      reason — it falls back to a live-fetched price (see
      lib/bitcoin-live-epoch.ts's `fetchLatestBigMacUsd`), never a build-time
      constant: unlike a finished epoch's average, "the latest price" is a
      moving target and goes stale the moment it's baked in. */
  usBigMacUsd: number | null;
}

/** Every finished halving epoch — permanent, baked in at build time. */
export const EPOCHS: Epoch[] = epochData.epochs as Epoch[];

/** Every halving is exactly 210,000 blocks — the one fact that lets an epoch
    after the last finished one be placed without a network call. */
export const BLOCKS_PER_EPOCH = 210_000;

/**
 * Every epoch after the last finished one, up to and including whichever one
 * `tipHeight` currently falls in — fixed facts only, no live figures yet.
 *
 * `tipHeight` defaults to the last finished epoch's own end height, which
 * yields exactly one pending epoch: the optimistic, no-network-call guess
 * that holds until a live tip height is known. Once it is, this walks
 * forward 210,000 blocks at a time — if the real chain has moved two
 * halvings past the last build, this returns three epochs, not one, so
 * nothing gets silently collapsed into a single mislabeled "current" epoch.
 * Every epoch's subsidy and id follow deterministically from its position in
 * that walk; only the *last* one returned is actually still open (`endHeight:
 * null`) — the ones before it are complete but were never written to the
 * static JSON, so their startDate/endDate/fees/difficulty are left null here
 * for the live fetch in `lib/bitcoin-live-epoch.ts` to fill in, exactly like
 * the open epoch's always were.
 */
export function pendingEpochs(
  closed: Epoch[] = EPOCHS,
  tipHeight: number = closed[closed.length - 1].endHeight as number,
): Epoch[] {
  const last = closed[closed.length - 1];
  const lastEndHeight = last.endHeight as number;
  const aheadBlocks = Math.max(tipHeight - lastEndHeight, 0);
  const count = Math.floor(aheadBlocks / BLOCKS_PER_EPOCH) + 1;
  return Array.from({ length: count }, (_, i) => {
    const subsidyBtc = last.subsidyBtc / 2 ** (i + 1);
    const startHeight = lastEndHeight + i * BLOCKS_PER_EPOCH;
    const isOpen = i === count - 1;
    return {
      id: `e${closed.length + i}`,
      label: String(subsidyBtc),
      subsidyBtc,
      startHeight,
      endHeight: isOpen ? null : startHeight + BLOCKS_PER_EPOCH,
      tipHeight: isOpen ? tipHeight : null,
      // The first pending epoch's start is the last finished epoch's end —
      // known with no fetch. Every later one's start (and every non-open
      // one's end) is a real chain timestamp only the live fetch has.
      startDate: i === 0 ? (last.endDate as string) : null,
      endDate: null,
      totalFeesBtc: null,
      avgDifficulty: null,
      avgBtcUsd: null,
      usBigMacUsd: null,
    };
  });
}

/**
 * Which epochs the track should draw.
 *
 * If the live epoch fetch failed outright (`liveEpochsFailed`), `openEpochs`
 * is left holding nothing but `pendingEpochs()`'s no-network-call guess —
 * fixed facts only, no fee/difficulty/date behind them. Drawing that guess
 * as a normal band would show a knot with a date, a fee figure, and a spine
 * height that all *look* like data, when they are actually the one-epoch
 * placeholder computed with no network call at all. So a failed fetch drops
 * the open epoch(s) from the track entirely rather than pass off the guess as
 * real — the widget falls back to only the epochs it has a permanent, sourced
 * answer for. The caller pairs this with a visible note (see
 * `BitcoinTimeline.tsx`) so a visitor sees *why* the track stops early,
 * rather than assuming the chain itself stopped.
 */
export function visibleEpochs(
  closed: Epoch[],
  openEpochs: Epoch[],
  liveEpochsFailed: boolean,
): Epoch[] {
  return liveEpochsFailed ? closed : [...closed, ...openEpochs];
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
 *
 * A pending epoch beyond the first has no startDate until its live block
 * timestamp is fetched (see `pendingEpochs()`) — callers are expected to
 * resolve that before laying out, but a band with no date on file still
 * falls back to `now` rather than crashing mid-render.
 */
export function layout(epochs: Epoch[] = EPOCHS): Band[] {
  const now = Date.now();
  const durations = epochs.map((epoch) => {
    const start = epoch.startDate ? Date.parse(epoch.startDate) : now;
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
  const upToHeight = epoch.endHeight ?? epoch.tipHeight;
  if (upToHeight === null || epoch.totalFeesBtc === null) return null;
  const blocks = upToHeight - epoch.startHeight;
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
 * What a BTC amount was worth in that epoch, in dollars and (where the Big
 * Mac price is known) in Big Macs.
 *
 * `usd` needs only a BTC/USD price, so it resolves whenever one is known — a
 * finished epoch's own average, or the live price for the still-open one.
 * `bigMacs` additionally needs a Big Mac price — a finished epoch's own
 * average, or `liveBigMacUsd` (fetched fresh from the visitor's browser, see
 * `fetchLatestBigMacUsd` in lib/bitcoin-live-epoch.ts) for the still-open
 * one — and is null without one, rather than pulling the whole readout down
 * with it: a caller that only wants purchasing power can treat a null
 * `bigMacs` as unavailable while still showing `usd`.
 *
 * Both are derived, not stored — the JSON keeps only the two source prices.
 */
export function btcWorth(
  btc: number | null,
  epoch: Epoch,
  liveBtcUsd: number | null,
  liveBigMacUsd: number | null,
): { usd: number; bigMacs: number | null } | null {
  if (btc === null) return null;
  const btcUsd = epoch.avgBtcUsd ?? liveBtcUsd;
  if (btcUsd === null) return null;
  const usd = btc * btcUsd;
  const bigMacUsd = epoch.usBigMacUsd ?? liveBigMacUsd;
  const bigMacs = bigMacUsd !== null && bigMacUsd > 0 ? usd / bigMacUsd : null;
  return { usd, bigMacs };
}

/** One block's fees, priced in the epoch that earned them. */
export function feeWorth(
  epoch: Epoch,
  liveBtcUsd: number | null,
  liveBigMacUsd: number | null,
) {
  return btcWorth(feesPerBlock(epoch), epoch, liveBtcUsd, liveBigMacUsd);
}

/** One block's subsidy, priced the same way — the comparison the fee figure
    only means something against. */
export function subsidyWorth(
  epoch: Epoch,
  liveBtcUsd: number | null,
  liveBigMacUsd: number | null,
) {
  return btcWorth(epoch.subsidyBtc, epoch, liveBtcUsd, liveBigMacUsd);
}

/** Which unit the fee/subsidy spines are drawn in. */
export type WorthBasis = "bigMacs" | "usd" | "btc";

/**
 * Pick one basis for the *whole* spine, not per band.
 *
 * Big Macs is the ideal — purchasing power is the one figure actually
 * comparable across epochs, which is the entire point of these two spines
 * (see the module comment on the spines in BitcoinTimeline.tsx). But every
 * band on a spine has to share a basis, or the step from a real Big Mac
 * count at a finished epoch to a 0 at the open one (because the live price
 * didn't resolve) would read as the open epoch's fees or subsidy crashing to
 * nothing, not as a missing conversion. So a live-price failure demotes the
 * *entire* spine, not just the open epoch's own band — even for a finished
 * epoch whose own Big Mac price is sitting right there in bitcoin-epochs.json.
 * That is a deliberate loss: this function looks only at the two live
 * prices, never at any epoch's own on-file average, because the basis has to
 * be something every band can share, including whichever one is still open.
 *
 * The ladder: Big Macs needs both live prices, since the open epoch can only
 * be priced in Big Macs by first pricing it in dollars. Failing that, USD
 * only needs live BTC/USD. Failing that, raw BTC needs nothing live at all —
 * every band already carries its own fee/subsidy amount.
 */
export function worthBasis(
  liveBtcUsd: number | null,
  liveBigMacUsd: number | null,
): WorthBasis {
  if (liveBtcUsd === null) return "btc";
  if (liveBigMacUsd === null) return "usd";
  return "bigMacs";
}

/**
 * One band's spine height, in whichever basis `worthBasis` picked for the
 * whole spine.
 *
 * `"btc"` returns the raw amount untouched — no epoch or live price involved
 * at all, so it can't fail. `"usd"`/`"bigMacs"` go through `btcWorth`, which
 * is guaranteed to resolve here: `worthBasis` only ever returns `"usd"` when
 * `liveBtcUsd` is known (so every band's own average-or-live BTC/USD
 * resolves) and only ever returns `"bigMacs"` when both live prices are
 * known (so both conversions resolve for every band, finished or open). The
 * `?? 0` fallbacks exist for the type checker, not because they are expected
 * to fire.
 */
export function spineValue(
  epoch: Epoch,
  btc: number | null,
  liveBtcUsd: number | null,
  liveBigMacUsd: number | null,
  basis: WorthBasis,
): number {
  if (btc === null) return 0;
  if (basis === "btc") return btc;
  const worth = btcWorth(btc, epoch, liveBtcUsd, liveBigMacUsd);
  if (!worth) return 0;
  return basis === "bigMacs" ? (worth.bigMacs ?? 0) : worth.usd;
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
