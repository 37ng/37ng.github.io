/**
 * The bitcoin timeline widget's data model and geometry.
 *
 * Kept out of the component so the two things worth being careful about —
 * what one bar covers, and how the chart turns a cursor position into a
 * selection — are testable on their own and shared by the stage and the post.
 *
 * The x axis is **block height, not the calendar**: one bar per 4,375
 * blocks. That number is 210,000 / 48 — a nominal month at one block every
 * ten minutes — so every halving lands exactly on a bar edge and no bar ever
 * straddles two subsidies. A calendar month would not: the chain has run
 * fast enough over seventeen years that a month-wide bar would drift across
 * halving boundaries, and the subsidy step would land in the middle of a bar
 * rather than between two.
 *
 * Each row carries only what cannot be derived: the bar's start height, the
 * month the chain reached it (a label, not the axis), the average fee per
 * block over those blocks, and the two prices needed to say what that fee
 * was *worth* at the time — its own BTC/USD and its own US Big Mac price.
 * The subsidy is not stored, because it is arithmetic on the height already
 * in the row (`subsidyAt` below); neither are the dollar and Big Mac
 * figures, which are one division away from the two prices (`btcWorth`).
 *
 * `bitcoin-bars.json` is currently **pseudo data**: the heights are exact
 * and the month labels follow the real halving boundaries, but the fees and
 * both prices are invented, so the widget could be built before the real
 * per-bar numbers exist. It is a stand-in, the widget says so on its face,
 * and real data replaces that one file and nothing else.
 *
 * The prices are period-matched, not today's: pricing a 2012 fee at 2026
 * rates would measure Bitcoin's appreciation, not the fee. That is why every
 * bar carries its own pair rather than one live price being applied to all
 * of history — which also means nothing here is fetched at runtime, and no
 * figure on the chart can be unavailable.
 */
import barData from "@/lib/bitcoin-bars.json";

export interface Bar {
  /** The first block this bar covers; it covers `BLOCKS_PER_BAR` of them. */
  startHeight: number;
  /** `YYYY-MM` — when the chain reached `startHeight`. A label for the
      reader, not the axis: the axis is height. */
  month: string;
  /** Average tx fees paid to the miner of one block, over the bar. */
  feePerBlockBtc: number;
  /** This bar's own average BTC/USD. */
  btcUsd: number;
  /** This bar's own US Big Mac price. */
  bigMacUsd: number;
}

/** Every bar from genesis to the last one whose blocks are all mined. */
export const BARS: Bar[] = barData.bars as Bar[];

/** 210,000 / 48 — one nominal month of blocks, chosen so a halving is always
    a bar edge and never a point inside a bar. */
export const BLOCKS_PER_BAR = barData.blocksPerBar;

/** The protocol's two constants — every subsidy figure on the chart comes
    from these and a block height, never from stored data. */
export const BLOCKS_PER_HALVING = 210_000;
export const INITIAL_SUBSIDY_BTC = 50;

/**
 * The block subsidy at a height.
 *
 * The last halving that pays anything is the 32nd — the subsidy is an
 * integer number of satoshis, and 50 BTC halved 33 times rounds to none.
 */
export function subsidyAt(height: number): number {
  const halvings = Math.floor(height / BLOCKS_PER_HALVING);
  return halvings >= 33 ? 0 : INITIAL_SUBSIDY_BTC / 2 ** halvings;
}

/**
 * Which bar a cursor at `position` (0..1 across the chart) is over.
 *
 * Bars are a uniform grid, so this is one division rather than a range
 * lookup — the whole reason the axis is block height and not the calendar.
 * A cursor dragged exactly to 1 lands on the last bar rather than off the
 * end.
 */
export function barAt(position: number, count: number = BARS.length): number {
  return Math.min(count - 1, Math.max(0, Math.floor(position * count)));
}

/** The left edge of a bar, as a fraction of the chart's width. */
export function barX(index: number, count: number = BARS.length): number {
  return index / count;
}

/**
 * The bars a halving lands on — the first bar of each new subsidy, plus the
 * first bar of the chart.
 *
 * These are the only ticks the axis labels. A tick per bar would be 220 of
 * them, and a tick per calendar year is an arbitrary grid on an axis that is
 * not the calendar. A halving is the one event this axis marks exactly.
 */
export function halvingIndices(bars: Bar[] = BARS): number[] {
  return bars
    .map((bar, i) => i)
    .filter(
      (i) =>
        i === 0 ||
        subsidyAt(bars[i].startHeight) !== subsidyAt(bars[i - 1].startHeight),
    );
}

/**
 * How far off the row's floor the shortest bar sits, in viewBox units, so
 * the smallest value is still a visible mark rather than nothing.
 */
const SPINE_PAD = 4;

/** A normalized height as a percentage of the row. The SVG bars and any DOM
    overlay both place marks with this, so they cannot drift. */
export function spineY(height: number): number {
  return SPINE_PAD + (100 - 2 * SPINE_PAD) * height;
}

/**
 * What a BTC amount was worth in the bar that earned it — in dollars, and in
 * Big Macs.
 *
 * Big Macs is the figure the whole widget is built around: a fee in BTC says
 * nothing across seventeen years, and a fee in dollars mostly measures the
 * dollar. What the fee would buy is the one thing comparable end to end.
 * Both are derived from the bar's own two prices; neither is stored.
 */
export function btcWorth(
  btc: number,
  bar: Bar,
): { usd: number; bigMacs: number } {
  const usd = btc * bar.btcUsd;
  return { usd, bigMacs: usd / bar.bigMacUsd };
}

/** One block's fees, priced in the bar that earned them. */
export function feeWorth(bar: Bar) {
  return btcWorth(bar.feePerBlockBtc, bar);
}

/**
 * What one block paid its miner in total — subsidy plus fees.
 *
 * This is the figure the chart's bar height is, with the subsidy as the
 * boundary inside it: the two are not competing series, they are the two
 * halves of one payment.
 */
export function blockWorth(bar: Bar) {
  return btcWorth(bar.feePerBlockBtc + subsidyAt(bar.startHeight), bar);
}

/** One block's subsidy, priced the same way — the comparison the fee figure
    only means something against. */
export function subsidyWorth(bar: Bar) {
  return btcWorth(subsidyAt(bar.startHeight), bar);
}

/** ₿ prefix, matching how a $ prefix reads on a dollar figure. Three
    significant figures rather than a fixed number of decimals: fee per block
    runs from a few thousandths of a satoshi to several BTC, and any fixed
    width prints one end of that as ₿0.000. */
export function formatBtc(btc: number): string {
  return `₿${trimZeros(btc.toPrecision(3))}`;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/**
 * The subsidy is an exact binary fraction the protocol defines, not a
 * measurement — 3.125, never 3.13. Printed in full while that stays short,
 * and to three significant figures below a hundredth of a BTC, where the
 * exact value starts running to twenty digits.
 */
export function formatSubsidy(btc: number): string {
  return btc >= 0.01 ? `₿${btc}` : formatBtc(btc);
}

/**
 * Dollars, at whatever precision the amount deserves: a 2009 fee is worth
 * small fractions of a cent, a 2017 one several hundred dollars, and one
 * rule for both prints either "$0" or "$412.00".
 */
export function formatUsd(usd: number): string {
  if (usd >= 1000) {
    return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${trimZeros(usd.toPrecision(2))}`;
}

/** Big Macs, same spread and the same treatment — down to a millionth of a
    burger in 2009, up to thousands of them at the 2017 peak. */
export function formatBigMacs(count: number): string {
  if (count >= 100) {
    return count.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (count >= 1) return count.toFixed(1);
  return trimZeros(count.toPrecision(2));
}

/** Block heights, comma-grouped, no decimals. */
export function formatHeight(height: number): string {
  return Math.round(height).toLocaleString("en-US");
}

/**
 * Scale a series to [floor, 1] for a bar chart.
 *
 * `floor` keeps the smallest value a visible mark: a bar of no height reads
 * as missing data rather than small data.
 *
 * `log` is for series that span many orders of magnitude, where a linear
 * scale would flatten every early bar to the floor. Its zero-guard is the
 * smallest *positive* value in the series rather than a fixed 1: these
 * series are Big Mac counts, where every early bar is far below 1 and
 * clamping there would collapse the whole first decade into one flat row.
 */
export function normalize(
  values: number[],
  { log = false, floor = 0.08 }: { log?: boolean; floor?: number } = {},
): number[] {
  const positive = values.filter((value) => value > 0);
  const smallest = positive.length > 0 ? Math.min(...positive) : 1;
  const scaled = log
    ? values.map((value) => Math.log(Math.max(value, smallest)))
    : values;
  const min = Math.min(...scaled);
  const max = Math.max(...scaled);
  if (max === min) return values.map(() => 1);
  return scaled.map((v) => floor + (1 - floor) * ((v - min) / (max - min)));
}
