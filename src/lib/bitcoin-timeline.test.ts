/**
 * Coverage for the four "what if a live figure never arrives" paths a
 * visitor can hit:
 *
 *  1. BTC/USD is unknown (open epoch, live price fetch failed or hasn't
 *     landed) -> `btcWorth` returns null outright, so the widget shows no
 *     dollar or Big Mac line at all rather than a "$NaN" or a stale number.
 *  2. BTC/USD is known but the Big Mac price isn't -> `btcWorth` still
 *     returns a usable `usd`, only `bigMacs` is null, so the widget falls
 *     back to showing the dollar figure alone.
 *  3. The live epoch fetch itself fails -> `visibleEpochs` drops the
 *     unresolved open-epoch guess from the track instead of drawing it as
 *     if it were real data.
 *  4. The tx-fees/subsidy *spines* (the sparklines, not the readout text)
 *     pick one basis for every band at once, via `worthBasis` +
 *     `spineValue`: Big Macs only if both live prices resolved, else USD
 *     only if live BTC/USD resolved, else raw BTC. A missing live price
 *     demotes the whole spine, even for a finished epoch whose own average
 *     is sitting right there in bitcoin-epochs.json — see `worthBasis`'s doc
 *     comment for why a per-band basis would misread as a value crash.
 *
 * These are pure functions specifically so this behavior can be pinned down
 * without a browser: BitcoinTimeline.tsx just wires each one's result to a
 * `<Readout>`/a spine/the track — see that component's top-of-file doc
 * comment for how to reproduce all four live, in a real browser, with
 * devtools network throttling.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  btcWorth,
  feeWorth,
  spineValue,
  subsidyWorth,
  visibleEpochs,
  worthBasis,
  type Epoch,
} from "@/lib/bitcoin-timeline";

/** A finished epoch: both period averages on file, nothing live needed. */
const FINISHED: Epoch = {
  id: "e0",
  label: "50",
  subsidyBtc: 50,
  startHeight: 0,
  endHeight: 210_000,
  startDate: "2009-01-03",
  endDate: "2012-11-28",
  tipHeight: null,
  totalFeesBtc: 10,
  avgDifficulty: 1,
  avgBtcUsd: 10,
  usBigMacUsd: 2,
};

/** The still-open epoch: no averages of its own yet — everything about its
    worth depends on whatever live prices the caller passes in. */
const OPEN: Epoch = {
  id: "e1",
  label: "25",
  subsidyBtc: 25,
  startHeight: 210_000,
  endHeight: null,
  startDate: "2012-11-28",
  endDate: null,
  tipHeight: 210_100,
  totalFeesBtc: 1,
  avgDifficulty: 1,
  avgBtcUsd: null,
  usBigMacUsd: null,
};

test("btcWorth: a finished epoch prices itself, ignoring the live prices entirely", () => {
  const worth = btcWorth(2, FINISHED, 999, 999);
  assert.deepEqual(worth, { usd: 20, bigMacs: 10 });
});

test("btcWorth: no BTC/USD anywhere (open epoch, live price unknown) -> null, not a half-answer", () => {
  assert.equal(btcWorth(2, OPEN, null, 5), null);
});

test("btcWorth: BTC/USD known, Big Mac price unknown -> usd resolves, bigMacs falls back to null", () => {
  const worth = btcWorth(2, OPEN, 10, null);
  assert.deepEqual(worth, { usd: 20, bigMacs: null });
});

test("btcWorth: both live prices known -> both resolve", () => {
  const worth = btcWorth(2, OPEN, 10, 4);
  assert.deepEqual(worth, { usd: 20, bigMacs: 5 });
});

test("btcWorth: a zero or negative Big Mac price is treated as unknown, not a divide-by-zero", () => {
  assert.deepEqual(btcWorth(2, OPEN, 10, 0), { usd: 20, bigMacs: null });
  assert.deepEqual(btcWorth(2, OPEN, 10, -1), { usd: 20, bigMacs: null });
});

test("btcWorth: null btc amount -> null, no matter what prices are available", () => {
  assert.equal(btcWorth(null, FINISHED, 10, 10), null);
});

test("feeWorth: the open epoch's fees aren't fetched yet -> null, same as btcWorth(null, ...)", () => {
  const stillLoading: Epoch = { ...OPEN, totalFeesBtc: null };
  assert.equal(feeWorth(stillLoading, 10, 10), null);
});

test("subsidyWorth: prices the fixed subsidy the same way feeWorth prices fees", () => {
  assert.deepEqual(subsidyWorth(OPEN, 10, 4), { usd: 250, bigMacs: 62.5 });
});

test("visibleEpochs: live fetch succeeded -> open epochs are appended to the track", () => {
  const result = visibleEpochs([FINISHED], [OPEN], false);
  assert.deepEqual(result, [FINISHED, OPEN]);
});

test("visibleEpochs: live fetch failed -> open epochs (even a stale guess) are dropped entirely", () => {
  const result = visibleEpochs([FINISHED], [OPEN], true);
  assert.deepEqual(result, [FINISHED]);
});

test("visibleEpochs: failed fetch with no open epochs pending is a no-op either way", () => {
  assert.deepEqual(visibleEpochs([FINISHED], [], true), [FINISHED]);
  assert.deepEqual(visibleEpochs([FINISHED], [], false), [FINISHED]);
});

test("worthBasis: both live prices known -> Big Macs, the ideal basis", () => {
  assert.equal(worthBasis(10, 4), "bigMacs");
});

test("worthBasis: live BTC/USD known, live Big Mac price missing -> usd", () => {
  assert.equal(worthBasis(10, null), "usd");
});

test("worthBasis: live BTC/USD missing -> btc, regardless of the Big Mac price", () => {
  assert.equal(worthBasis(null, 4), "btc");
  assert.equal(worthBasis(null, null), "btc");
});

test("spineValue: btc basis returns the raw amount, ignoring the epoch's own on-file prices entirely", () => {
  // FINISHED carries its own avgBtcUsd/usBigMacUsd, but the btc basis must
  // still render the untouched amount — this is the "even a finished epoch
  // with its own Big Mac price on file doesn't get shown in Big Macs" rule.
  assert.equal(spineValue(FINISHED, 3, 999, 999, "btc"), 3);
  assert.equal(spineValue(OPEN, 3, null, null, "btc"), 3);
});

test("spineValue: usd basis converts every band to dollars, even one with its own Big Mac price on file", () => {
  assert.equal(spineValue(FINISHED, 3, 999, 999, "usd"), 30); // 3 * FINISHED.avgBtcUsd (10), not live
  assert.equal(spineValue(OPEN, 3, 10, null, "usd"), 30); // 3 * live btcUsd (10)
});

test("spineValue: bigMacs basis converts every band to Big Macs, own price or live", () => {
  assert.equal(spineValue(FINISHED, 3, 999, 999, "bigMacs"), 15); // (3*10) / usBigMacUsd (2)
  assert.equal(spineValue(OPEN, 3, 10, 5, "bigMacs"), 6); // (3*10) / live bigMacUsd (5)
});

test("spineValue: null btc amount (still-loading band) -> 0, no matter the basis", () => {
  assert.equal(spineValue(FINISHED, null, 10, 10, "btc"), 0);
  assert.equal(spineValue(FINISHED, null, 10, 10, "usd"), 0);
  assert.equal(spineValue(FINISHED, null, 10, 10, "bigMacs"), 0);
});
