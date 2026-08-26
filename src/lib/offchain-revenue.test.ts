/**
 * These check the data file, not the arithmetic around it. The figure is
 * currently drawn from a pseudo-data stand-in that real measurements will
 * replace (see the module comment in offchain-revenue.ts), and the swap is
 * where it can quietly go wrong: a file whose rows do not match the formula
 * printed under the figure, or whose flagged blocks outnumber the blocks it
 * claims were found that day, would still render — it would just be lying.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coverageByDay,
  logNorm,
  MONTH,
  monthFraction,
  monthStats,
} from "@/lib/offchain-revenue";

test("every row matches the formula the figure prints", () => {
  for (const b of MONTH.blocks) {
    assert.equal(
      Math.round((b.floorB - b.actualFeerate) * b.vsize),
      b.impliedSats,
      `block ${b.h}`,
    );
  }
});

test("a flagged transaction paid under its block's floor", () => {
  for (const b of MONTH.blocks) {
    assert.ok(b.actualFeerate < b.floorB, `block ${b.h}`);
    assert.ok(b.impliedSats > 0, `block ${b.h}`);
    assert.ok(b.txs >= 1 && b.vsize > 0, `block ${b.h}`);
  }
});

test("blocks are in order and inside the month", () => {
  let last = -Infinity;
  for (const b of MONTH.blocks) {
    assert.ok(b.h >= MONTH.firstHeight && b.h <= MONTH.lastHeight);
    const f = monthFraction(b.t);
    assert.ok(f >= 0 && f <= 1, `block ${b.h} outside ${MONTH.month}`);
    assert.ok(f >= last, "blocks out of chronological order");
    last = f;
  }
});

test("no day flags more blocks than it found", () => {
  const days = coverageByDay();
  assert.equal(
    days.reduce((s, d) => s + d.blocks, 0),
    MONTH.totalBlocks,
    "blocksPerDay must sum to totalBlocks",
  );
  for (const d of days) {
    assert.ok(d.flagged <= d.blocks, `day ${d.day}`);
    assert.ok(d.share >= 0 && d.share <= 1, `day ${d.day}`);
  }
  assert.equal(
    days.reduce((s, d) => s + d.flagged, 0),
    MONTH.blocks.length,
  );
});

test("stats total the same sats the rows carry", () => {
  const stats = monthStats();
  assert.equal(
    stats.totalSats,
    MONTH.blocks.reduce((s, b) => s + b.impliedSats, 0),
  );
  assert.equal(
    stats.byPool.reduce((s, p) => s + p.sats, 0),
    stats.totalSats,
  );
  assert.equal(
    stats.largest.impliedSats,
    Math.max(...MONTH.blocks.map((b) => b.impliedSats)),
  );
});

test("the log scale stays inside the plot", () => {
  // Every real row has to land in the drawn band, not clamped against an
  // edge: a clamped mark reads as a value it does not have.
  for (const b of MONTH.blocks) {
    const n = logNorm(b.impliedSats);
    assert.ok(n > 0 && n < 1, `block ${b.h} (${b.impliedSats} sats) clamped`);
  }
  assert.equal(logNorm(0), 0);
  assert.equal(logNorm(1e12), 1);
});
