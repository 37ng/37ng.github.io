/**
 * The onchain-share arithmetic behind the timeline's third readout: issued
 * supply walked from the halving schedule, and the revenue-over-supply
 * percentage printed against it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annualFeeRevenueBtc,
  annualRevenueBtc,
  BARS,
  BARS_PER_YEAR,
  BLOCKS_PER_BAR,
  BLOCKS_PER_HALVING,
  BLOCKS_PER_YEAR,
  feeOnlyShare,
  formatBtcBulk,
  formatShare,
  onchainShare,
  subsidyAt,
  supplyAfter,
  supplyAt,
} from "@/lib/bitcoin-timeline";

test("a year is the bar count the period totals are annualized by", () => {
  assert.equal(BARS_PER_YEAR, BLOCKS_PER_YEAR / BLOCKS_PER_BAR);
});

test("supply follows the halving schedule exactly", () => {
  assert.equal(supplyAt(0), 0);
  assert.equal(supplyAt(1), 50);
  assert.equal(supplyAt(BLOCKS_PER_HALVING), 210_000 * 50);
  assert.equal(supplyAt(2 * BLOCKS_PER_HALVING), 210_000 * 50 + 210_000 * 25);
  assert.equal(
    supplyAt(2 * BLOCKS_PER_HALVING + 10),
    210_000 * 50 + 210_000 * 25 + 10 * 12.5,
  );
});

test("supply converges just under 21 million", () => {
  const final = supplyAt(33 * BLOCKS_PER_HALVING);
  assert.ok(final < 21_000_000);
  assert.ok(final > 20_999_999);
});

test("the share is a year of revenue over the supply behind it", () => {
  const bar = BARS[BARS.length - 1];
  const revenue =
    BARS_PER_YEAR * (bar.feeBtc + BLOCKS_PER_BAR * subsidyAt(bar.startHeight));
  assert.ok(Math.abs(annualRevenueBtc(bar) - revenue) < 1e-6);
  assert.equal(onchainShare(bar), (revenue / supplyAfter(bar)) * 100);
});

test("the price cancels: the share is the same at any BTC/USD", () => {
  const bar = BARS[BARS.length - 1];
  const share = onchainShare(bar);
  const marketCap = supplyAfter(bar) * bar.btcUsd;
  const paidUsd = annualRevenueBtc(bar) * bar.btcUsd;
  assert.ok(Math.abs((paidUsd / marketCap) * 100 - share) < 1e-9);
});

test("fees are a share of the same denominator, never larger than the total", () => {
  for (const bar of BARS) {
    assert.ok(feeOnlyShare(bar) <= onchainShare(bar));
    assert.equal(annualFeeRevenueBtc(bar), BARS_PER_YEAR * bar.feeBtc);
  }
});

test("every bar has a positive denominator, genesis included", () => {
  for (const bar of BARS) {
    assert.ok(supplyAfter(bar) > 0);
    assert.ok(Number.isFinite(onchainShare(bar)));
  }
});

test("the share falls across a halving that adds no fees", () => {
  const halving = BARS.findIndex(
    (bar, i) =>
      i > 0 &&
      subsidyAt(bar.startHeight) !== subsidyAt(BARS[i - 1].startHeight),
  );
  const before = { ...BARS[halving - 1], feeBtc: 0 };
  const after = { ...BARS[halving], feeBtc: 0 };
  assert.ok(onchainShare(after) < onchainShare(before));
});

test("percentages keep precision at both ends", () => {
  assert.equal(formatShare(1204.7), "1,205%");
  assert.equal(formatShare(1.634), "1.63%");
  assert.equal(formatShare(0.0412), "0.041%");
});

test("bulk BTC goes compact only at supply scale", () => {
  assert.equal(formatBtcBulk(19_845_312), "₿19.85M");
  assert.equal(formatBtcBulk(164.25), "₿164.25");
  assert.equal(formatBtcBulk(9_999), "₿9,999");
});
