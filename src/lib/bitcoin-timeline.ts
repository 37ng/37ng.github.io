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
 * month the chain reached it (a label, not the axis), the **total** tx fees
 * paid over those blocks, and the BTC/USD price needed to say what that
 * total was worth at the time. The figure is a period total, not an average
 * per block — a month of fees is what the chain earned, and dividing it by
 * the blocks that happened to be mined only hides that behind a rate. The
 * subsidy is not stored, because it is arithmetic on the height already in
 * the row (`subsidyAt` below); neither is the dollar figure, which is one
 * multiplication away from the price (`usdWorth`).
 *
 * `bitcoin-bars.json` is currently **pseudo data**: the heights are exact
 * and the month labels follow the real halving boundaries, but the fees and
 * the price are invented, so the widget could be built before the real
 * per-bar numbers exist. It is a stand-in, the widget says so on its face,
 * and real data replaces that one file and nothing else.
 *
 * The price is period-matched, not today's: pricing a 2012 fee at 2026
 * rates would measure Bitcoin's appreciation, not the fee. That is why every
 * bar carries its own price rather than one live price being applied to all
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
  /** Total tx fees paid to miners over the whole bar — not a per-block
      average. */
  feeBtc: number;
  /** This bar's own average BTC/USD. */
  btcUsd: number;
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
 * What a BTC amount was worth in the bar that earned it, in dollars.
 *
 * The bar's own price, never a live one — see the module comment. Not
 * stored: it is one multiplication away from the price already on the row.
 */
export function usdWorth(btc: number, bar: Bar): number {
  return btc * bar.btcUsd;
}

/** The bar's whole month of fees, priced in the bar that earned them. */
export function feeWorth(bar: Bar): number {
  return usdWorth(bar.feeBtc, bar);
}

/** The subsidy paid over the bar — `BLOCKS_PER_BAR` blocks at this height's
    subsidy. Derived from the halving schedule, never stored. */
export function subsidyBtcOverBar(bar: Bar): number {
  return BLOCKS_PER_BAR * subsidyAt(bar.startHeight);
}

/**
 * What the chain paid its miners over the bar in total — subsidy plus fees.
 *
 * The two are not competing series; they are the two halves of one payment.
 */
export function barWorth(bar: Bar): number {
  return usdWorth(bar.feeBtc + subsidyBtcOverBar(bar), bar);
}

/** The bar's subsidy, priced the same way — the comparison the fee figure
    only means something against. */
export function subsidyWorth(bar: Bar): number {
  return usdWorth(subsidyBtcOverBar(bar), bar);
}

/** Below this, decimal notation runs at least three digits deeper than the
    three that matter — "₿0.000524" is a wall of zeros in front of "524",
    and a readout showing two of these side by side (onchain/offchain, each
    already carrying a BTC and a dollar figure) doesn't have the width to
    spare. Set well above the point where decimal notation merely looks
    long, since it's the combined line's width that has to fit, not any one
    number's on its own. */
const COMPACT_BELOW = 0.01;

/** ₿ prefix, matching how a $ prefix reads on a dollar figure. Three
    significant figures rather than a fixed number of decimals: a bar's fees
    run from hundredths of a BTC to several thousand, and any fixed
    width prints one end of that as ₿0.000. Below COMPACT_BELOW, switches to
    a bare exponent (145e-7) rather than counting zeros — see
    compactExponent. */
export function formatBtc(btc: number): string {
  if (btc > 0 && btc < COMPACT_BELOW) return `₿${compactExponent(btc, 3)}`;
  // At a thousand and up, k/m — the same treatment formatUsd gives a large
  // dollar figure. Without it toPrecision hands back "3.38e+3", which reads
  // as an exponent only because the number got big, right beside a "$15.3m"
  // that did not.
  if (btc >= 1000) return `₿${compactSuffix(btc, 3)}`;
  return `₿${trimZeros(btc.toPrecision(3))}`;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/**
 * A tiny number as a bare integer mantissa times ten-to-the — "145e-7"
 * rather than "1.45e-7" or "0.0000145" — so a readout with several of these
 * side by side stays one line wide instead of each number's width varying
 * with how many leading zeros it has.
 *
 * Built from `toExponential`, which already gives `sigFigs` significant
 * digits as `d.ddde±X`; the decimal point is dropped and its digits folded
 * into the exponent (145e-7 is exactly 1.45e-5 with the point moved two
 * places), and any trailing zeros the mantissa picked up from rounding are
 * trimmed the same way `trimZeros` does for decimal notation.
 */
function compactExponent(value: number, sigFigs: number): string {
  const decimals = sigFigs - 1;
  const [mantissa, exponent] = value.toExponential(decimals).split("e");
  const digits = mantissa.replace(".", "").replace(/0+$/, "") || "0";
  return `${digits}e${Number(exponent) - decimals}`;
}

/**
 * A large number as "89.7k" or "1.23m" rather than "$89,700" or
 * "$1,234,000" — comma grouping keeps every digit, which is exactly what
 * makes it grow without bound; a reader gets the same "how big" read from
 * three significant figures and a letter.
 */
function compactSuffix(value: number, sigFigs: number): string {
  const [divisor, suffix] =
    Math.abs(value) >= 1_000_000 ? [1_000_000, "m"] : [1000, "k"];
  return `${trimZeros((value / divisor).toPrecision(sigFigs))}${suffix}`;
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
 * rule for both prints either "$0" or "$412.00". At either extreme it
 * compacts rather than growing wider: below COMPACT_BELOW as a bare exponent
 * (see formatBtc), at or above $1,000 as k/m (see compactSuffix) — a
 * comma-grouped "$1,234,000" has no upper bound on width the way those two
 * do.
 */
export function formatUsd(usd: number): string {
  if (usd >= 1000) return `$${compactSuffix(usd, 3)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd > 0 && usd < COMPACT_BELOW) return `$${compactExponent(usd, 2)}`;
  return `$${trimZeros(usd.toPrecision(2))}`;
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
 * smallest *positive* value in the series rather than a fixed 1: a series
 * can sit entirely below 1, and clamping there would collapse it into one
 * flat row.
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

/** 6 blocks an hour, 24 hours, 365 days — the nominal year the annualized
    figures below are stated over. */
export const BLOCKS_PER_YEAR = 52_560;

/** How many bars a year is. The rows are period *totals*, so annualizing one
    is a multiplication by this rather than by a block count. */
export const BARS_PER_YEAR = BLOCKS_PER_YEAR / BLOCKS_PER_BAR;

/**
 * Coins issued by `height`, from the subsidy schedule alone.
 *
 * Every completed halving epoch paid 210,000 × its subsidy; the current one
 * has paid for the blocks it has run so far. Nothing is stored, the same way
 * `subsidyAt` stores nothing, and no lost or unspendable coin is subtracted
 * — this is issued supply.
 */
export function supplyAt(height: number): number {
  const halvings = Math.floor(height / BLOCKS_PER_HALVING);
  let supply = 0;
  for (let epoch = 0; epoch < Math.min(halvings, 33); epoch += 1) {
    supply += BLOCKS_PER_HALVING * (INITIAL_SUBSIDY_BTC / 2 ** epoch);
  }
  return supply + (height % BLOCKS_PER_HALVING) * subsidyAt(height);
}

/** Issued supply at the end of the bar — the denominator the bar's own
    blocks are already counted in, and never zero the way genesis is. */
export function supplyAfter(bar: Bar): number {
  return supplyAt(bar.startHeight + BLOCKS_PER_BAR);
}

/** What the chain would pay its miners over a year at this bar's rate. */
export function annualRevenueBtc(bar: Bar): number {
  return BARS_PER_YEAR * (bar.feeBtc + subsidyBtcOverBar(bar));
}

/** Same, fees only — what is left once the subsidy rounds to nothing. */
export function annualFeeRevenueBtc(bar: Bar): number {
  return BARS_PER_YEAR * bar.feeBtc;
}

/**
 * A year of that payment as a share of every coin in existence, in percent.
 *
 * Priced in dollars this would be annual revenue over market cap — the same
 * number, because the price is a factor of both and cancels. So this figure
 * is protocol arithmetic, and neither price the bar carries can move it.
 */
export function onchainShare(bar: Bar): number {
  return (annualRevenueBtc(bar) / supplyAfter(bar)) * 100;
}

/** The same share from fees alone. */
export function feeOnlyShare(bar: Bar): number {
  return (annualFeeRevenueBtc(bar) / supplyAfter(bar)) * 100;
}

/** Percentages that run from four digits in 2009 to thousandths today, so
    the precision follows the value rather than a fixed width. */
export function formatShare(percent: number): string {
  if (percent >= 100) {
    return `${percent.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`;
  }
  if (percent >= 1) return `${percent.toFixed(2)}%`;
  return `${trimZeros(percent.toPrecision(2))}%`;
}

/** BTC at supply scale — eight digits where `formatBtc` prints ₿0.00123, and
    compact so a readout column stays one line wide. */
export function formatBtcBulk(btc: number): string {
  if (btc < 10_000) {
    return `₿${btc.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  return `₿${btc.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })}`;
}
