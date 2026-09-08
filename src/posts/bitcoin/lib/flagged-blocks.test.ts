import assert from "node:assert/strict";
import { test } from "node:test";
import {
  axisMax,
  axisTicks,
  flaggedBlocks,
  FLAGGED_MONTHS,
  formatMonth,
  monthShare,
  POOLS,
  segments,
  yearTicks,
  type FlaggedMonth,
} from "./flagged-blocks.ts";

const row: FlaggedMonth = {
  month: "2023-01",
  blocks: 1000,
  flagged: { foundry: 100, antpool: 50, viabtc: 30, f2pool: 20, other: 10 },
};

test("monthShare counts every pool once against the month's blocks", () => {
  assert.equal(flaggedBlocks(row), 210);
  assert.equal(monthShare(row), 21);
});

test("segments stack without gaps and end at the month's share", () => {
  const stacked = segments(row);
  assert.equal(stacked.length, POOLS.length);
  assert.equal(stacked[0].base, 0);
  stacked.forEach((segment, index) => {
    if (index === 0) return;
    const previous = stacked[index - 1];
    assert.equal(segment.base, previous.base + previous.height);
  });
  const last = stacked[stacked.length - 1];
  assert.equal(last.base + last.height, monthShare(row));
});

test("a month with no blocks reads as zero rather than NaN", () => {
  const empty: FlaggedMonth = { ...row, blocks: 0 };
  assert.equal(monthShare(empty), 0);
  assert.equal(segments(empty)[0].height, 0);
});

test("the axis clears the tallest month", () => {
  const max = axisMax(FLAGGED_MONTHS);
  const tallest = Math.max(...FLAGGED_MONTHS.map(monthShare));
  assert.ok(max >= tallest);
  assert.equal(max % 10, 0);
  assert.equal(axisTicks(max)[0], 0);
});

test("one x label per year, the first one on the opening month", () => {
  const years = yearTicks(FLAGGED_MONTHS);
  assert.equal(years[0].index, 0);
  assert.deepEqual(
    years.map((tick) => tick.year),
    ["2023", "2024", "2025", "2026"],
  );
});

test("formatMonth reads as a month, not an ISO string", () => {
  assert.equal(formatMonth("2023-01"), "jan 2023");
  assert.equal(formatMonth("2026-07"), "jul 2026");
});
