/**
 * The parts of the bar timeline a reader could catch being wrong.
 *
 * Nothing in this widget is fetched any more, so there are no "the figure
 * never arrived" paths left to cover. What is left is the arithmetic that
 * has to agree with the chain — the subsidy at a height, and the claim the
 * whole 4,375-block grid rests on: that a halving is always a bar *edge* and
 * never a point inside a bar — plus the two things a 220-bar chart does
 * differently from the old five-knot track: a log scale whose values are
 * almost all *below* 1, and a bar that is one payment rather than two
 * series.
 *
 * These are pure functions specifically so that behavior can be pinned down
 * without a browser: BitcoinTimeline.tsx only wires each result to a
 * `<Readout>`, a rect, or the axis.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BARS,
  barAt,
  barX,
  BLOCKS_PER_BAR,
  BLOCKS_PER_HALVING,
  blockWorth,
  btcWorth,
  feeWorth,
  formatBigMacs,
  formatBtc,
  formatSubsidy,
  formatUsd,
  halvingIndices,
  normalize,
  subsidyAt,
  subsidyWorth,
  type Bar,
} from "@/lib/bitcoin-timeline";

const BAR = (over: Partial<Bar> = {}): Bar => ({
  startHeight: 240_000,
  month: "2013-06",
  feePerBlockBtc: 0.06,
  btcUsd: 100,
  bigMacUsd: 4,
  ...over,
});

test("a halving is always a bar edge — the reason the axis is height, not the calendar", () => {
  assert.equal(BLOCKS_PER_HALVING % BLOCKS_PER_BAR, 0);
  assert.equal(BLOCKS_PER_HALVING / BLOCKS_PER_BAR, 48);
});

test("every bar covers exactly one subsidy, start to last block", () => {
  for (const bar of BARS) {
    assert.equal(
      subsidyAt(bar.startHeight),
      subsidyAt(bar.startHeight + BLOCKS_PER_BAR - 1),
      `bar at #${bar.startHeight} straddles a halving`,
    );
  }
});

test("bars tile the chain with no gap and no overlap", () => {
  BARS.forEach((bar, i) => {
    assert.equal(bar.startHeight, i * BLOCKS_PER_BAR);
  });
});

test("subsidyAt: halves at every 210,000th block, exactly on the boundary", () => {
  assert.equal(subsidyAt(0), 50);
  assert.equal(subsidyAt(209_999), 50);
  assert.equal(subsidyAt(210_000), 25);
  assert.equal(subsidyAt(419_999), 25);
  assert.equal(subsidyAt(420_000), 12.5);
  assert.equal(subsidyAt(840_000), 3.125);
});

test("subsidyAt: pays nothing from the 33rd halving on, where a satoshi rounds away", () => {
  assert.equal(subsidyAt(32 * 210_000) > 0, true);
  assert.equal(subsidyAt(33 * 210_000), 0);
});

test("barAt: a uniform grid, with both ends landing inside the chart", () => {
  assert.equal(barAt(0, 220), 0);
  assert.equal(barAt(0.5, 220), 110);
  // Dragged past the last bar's left edge, and exactly to the end.
  assert.equal(barAt(219.5 / 220, 220), 219);
  assert.equal(barAt(1, 220), 219);
});

test("barX: a bar's left edge is its share of the chart", () => {
  assert.equal(barX(0, 220), 0);
  assert.equal(barX(110, 220), 0.5);
});

test("halvingIndices: every 48th bar, starting at genesis", () => {
  const marks = halvingIndices(BARS);
  assert.deepEqual(marks.slice(0, 5), [0, 48, 96, 144, 192]);
  assert.deepEqual(
    marks.map((i) => subsidyAt(BARS[i].startHeight)),
    [50, 25, 12.5, 6.25, 3.125],
  );
});

test("halvingIndices: the marked bars are the months the halvings happened", () => {
  assert.deepEqual(
    halvingIndices(BARS).map((i) => BARS[i].month),
    ["2009-01", "2012-11", "2016-07", "2020-05", "2024-04"],
  );
});

test("btcWorth: prices an amount in the bar's own two prices, never a live one", () => {
  assert.deepEqual(btcWorth(2, BAR()), { usd: 200, bigMacs: 50 });
});

test("feeWorth / subsidyWorth: the same conversion over the two amounts on the row", () => {
  const bar = BAR({ feePerBlockBtc: 0.5, startHeight: 240_000 });
  assert.deepEqual(feeWorth(bar), { usd: 50, bigMacs: 12.5 });
  // 240,000 is inside the second epoch, so 25 BTC — not a stored figure.
  assert.deepEqual(subsidyWorth(bar), { usd: 2500, bigMacs: 625 });
});

test("normalize: a log series of sub-1 values keeps its shape instead of collapsing", () => {
  // Every value here is far below 1, which a fixed clamp at 1 would flatten
  // to a single row — the first decade of Big Mac counts is exactly this.
  assert.deepEqual(
    normalize([0.000001, 0.0001, 0.01], { log: true, floor: 0 }),
    [0, 0.5, 1],
  );
});

test("normalize: a zero in a log series sits at the floor, not at -Infinity", () => {
  const heights = normalize([0, 0.5, 1], { log: true, floor: 0 });
  assert.equal(Number.isFinite(heights[0]), true);
  assert.equal(heights[0], 0);
});

test("blockWorth: the bar is the whole payment, subsidy plus fees", () => {
  const bar = BAR({ feePerBlockBtc: 0.5, startHeight: 240_000 });
  const total = blockWorth(bar);
  assert.equal(total.usd, feeWorth(bar).usd + subsidyWorth(bar).usd);
  assert.equal(
    total.bigMacs,
    feeWorth(bar).bigMacs + subsidyWorth(bar).bigMacs,
  );
});

test("formatBtc: three significant figures, so both ends of the range stay readable", () => {
  assert.equal(formatBtc(3.2), "₿3.2");
  assert.equal(formatBtc(0.0203), "₿0.0203");
  // Below COMPACT_BELOW, a bare exponent rather than a wall of leading
  // zeros — see compactExponent.
  assert.equal(formatBtc(0.0000029), "₿29e-8");
});

test("formatSubsidy: the protocol's exact fraction, not a rounded measurement", () => {
  assert.equal(formatSubsidy(50), "₿50");
  assert.equal(formatSubsidy(6.25), "₿6.25");
  assert.equal(formatSubsidy(3.125), "₿3.125");
});

test("formatUsd / formatBigMacs: precision follows the size of the amount", () => {
  // At $1,000 and up, k/m rather than comma grouping — see compactSuffix.
  assert.equal(formatUsd(15530), "$15.5k");
  assert.equal(formatUsd(2_400_000), "$2.4m");
  assert.equal(formatUsd(412.5), "$412.50");
  // Below COMPACT_BELOW, a bare exponent — see compactExponent.
  assert.equal(formatUsd(0.0000024), "$24e-7");
  assert.equal(formatBigMacs(2947), "2,947");
  assert.equal(formatBigMacs(12.34), "12.3");
  assert.equal(formatBigMacs(0.00042), "0.00042");
});
