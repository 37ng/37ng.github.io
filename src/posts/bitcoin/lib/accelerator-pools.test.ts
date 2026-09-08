import assert from "node:assert/strict";
import { test } from "node:test";
import PRICE from "../data/price.json";
import {
  amountOf,
  axisMax,
  axisTicks,
  formatBtc,
  formatMonth,
  formatShare,
  formatUsd,
  GRAND_TOTAL,
  GRAND_TOTAL_USD,
  grandTotal,
  lifetimeShare,
  MONTHS,
  POOLS,
  poolTotal,
  position,
  SATS_PER_BTC,
  segments,
  shareOfMonth,
  toBtc,
  totalOf,
  unitMark,
  yearTicks,
  type Unit,
} from "./accelerator-pools";

const POOL_IDS = POOLS.map((pool) => pool.id);
const UNITS: Unit[] = ["btc", "usd"];

test("months are in calendar order", () => {
  const order = MONTHS.map((row) => row.month);
  assert.deepEqual(order, [...order].sort());
});

test("every stored sum matches its own pools", () => {
  for (const row of MONTHS) {
    const added = Object.values(row.pools).reduce((sum, v) => sum + v, 0);
    assert.equal(added, row.sum, row.month);
  }
});

test("the dollar side carries the same pools, and adds up too", () => {
  for (const row of MONTHS) {
    const paid = Object.keys(row.pools);
    for (const pool of paid) {
      assert.notEqual(amountOf(row, pool, "usd"), undefined, row.month);
    }
    const added = paid.reduce(
      (sum, pool) => sum + (amountOf(row, pool, "usd") ?? 0),
      0,
    );
    assert.ok(Math.abs(added - totalOf(row, "usd")) < 0.005, row.month);
  }
});

test("every month priced has a price, so a gap never reads as free", () => {
  const price = PRICE as Record<string, number>;
  for (const row of MONTHS) {
    assert.ok(price[row.month] > 0, row.month);
    assert.equal(row.btcUsd, price[row.month], row.month);
  }
});

test("dollars are that month's own price, so a month is never repriced", () => {
  for (const row of MONTHS) {
    for (const [pool, sats] of Object.entries(row.pools)) {
      const own = toBtc(sats) * (PRICE as Record<string, number>)[row.month];
      assert.ok(
        Math.abs((amountOf(row, pool, "usd") ?? 0) - own) < 1e-9,
        `${row.month} ${pool}`,
      );
    }
  }
});

test("a pool keeps its rank and colour whichever unit is shown", () => {
  const byUsd = [...POOLS].sort((a, b) => b.totalUsd - a.totalUsd);
  assert.equal(byUsd[0].id, POOLS[0].id);
  for (const pool of POOLS) {
    assert.ok(pool.totalUsd > 0, pool.id);
  }
});

test("pools rank by total and each takes one palette slot", () => {
  const totals = POOLS.map((pool) => pool.total);
  assert.deepEqual(
    totals,
    [...totals].sort((a, b) => b - a),
  );
  assert.equal(new Set(POOLS.map((pool) => pool.color)).size, POOLS.length);
});

test("pool totals add up to the grand total", () => {
  const added = POOLS.reduce((sum, pool) => sum + pool.total, 0);
  assert.equal(added, GRAND_TOTAL);
});

test("a stack piles the month's own amount, floor to top, in either unit", () => {
  for (const unit of UNITS) {
    for (const row of MONTHS) {
      const stack = segments(row, unit);
      const top = stack[stack.length - 1];
      assert.ok(
        Math.abs(top.base + top.value - totalOf(row, unit)) < 0.005,
        `${row.month} ${unit}`,
      );
      for (let i = 1; i < stack.length; i += 1) {
        assert.equal(stack[i].base, stack[i - 1].base + stack[i - 1].value);
      }
    }
  }
});

test("a stack carries only the pools that were paid that month", () => {
  for (const row of MONTHS) {
    const stack = segments(row);
    assert.equal(stack.length, Object.keys(row.pools).length, row.month);
    for (const segment of stack) {
      assert.equal(segment.value, row.pools[segment.pool.id]);
    }
  }
});

test("stack order follows the pool ranking, biggest on the floor", () => {
  const rank = new Map(POOLS.map((pool, index) => [pool.id, index]));
  for (const row of MONTHS) {
    const order = segments(row).map((segment) => rank.get(segment.pool.id)!);
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
      row.month,
    );
  }
});

test("shares are a percentage of the month, absent pools are zero", () => {
  const row = MONTHS[MONTHS.length - 1];
  const total = Object.keys(row.pools).reduce(
    (sum, pool) => sum + shareOfMonth(row, pool),
    0,
  );
  assert.ok(Math.abs(total - 100) < 1e-9);
  assert.equal(shareOfMonth(row, "not a pool"), 0);
});

test("lifetime shares add up to a whole", () => {
  const total = POOLS.reduce((sum, pool) => sum + lifetimeShare(pool), 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test("the axis clears the tallest column it has to draw, in either unit", () => {
  for (const unit of UNITS) {
    const whole = axisMax(null, unit);
    assert.ok(whole >= Math.max(...MONTHS.map((row) => totalOf(row, unit))));
    for (const pool of POOL_IDS) {
      const alone = axisMax(pool, unit);
      const tallest = Math.max(
        ...MONTHS.map((row) => amountOf(row, pool, unit) ?? 0),
      );
      assert.ok(alone >= tallest, `${pool} ${unit}`);
      assert.ok(alone <= whole, `${pool} ${unit}`);
    }
  }
});

test("shares ignore the unit, since one price prices a whole month", () => {
  for (const row of MONTHS) {
    for (const pool of Object.keys(row.pools)) {
      const btc = shareOfMonth(row, pool, "btc");
      const usd = shareOfMonth(row, pool, "usd");
      assert.ok(Math.abs(btc - usd) < 0.01, `${row.month} ${pool}`);
    }
  }
});

test("a pool's dollar total is its own months, not the lot repriced", () => {
  for (const pool of POOLS) {
    const added = MONTHS.reduce(
      (sum, row) => sum + (amountOf(row, pool.id, "usd") ?? 0),
      0,
    );
    assert.ok(Math.abs(added - poolTotal(pool, "usd")) < 0.005, pool.id);
  }
  const added = POOLS.reduce((sum, pool) => sum + pool.totalUsd, 0);
  assert.ok(Math.abs(added - grandTotal("usd")) < 0.005);
  assert.equal(grandTotal("btc"), GRAND_TOTAL);
  assert.equal(grandTotal("usd"), GRAND_TOTAL_USD);
});

test("axis ticks start at zero and step evenly to the ceiling", () => {
  for (const pool of [null, ...POOL_IDS]) {
    const max = axisMax(pool);
    const ticks = axisTicks(max);
    assert.equal(ticks[0], 0);
    assert.equal(ticks[ticks.length - 1], max);
    assert.ok(ticks.length >= 3 && ticks.length <= 6, `${pool}`);
    ticks.forEach((tick, i) => assert.equal(tick, ticks[1] * i));
  }
});

test("position is the plain ratio, so a band's height is its amount", () => {
  const max = axisMax(null);
  assert.equal(position(0, max), 0);
  assert.equal(position(max, max), 1);
  assert.equal(position(max / 4, max), 0.25);
  assert.equal(position(1, 0), 0);
});

test("a stack's bands are exactly their own share of the plot", () => {
  const max = axisMax(null);
  for (const row of MONTHS) {
    const drawn = segments(row).reduce(
      (sum, segment) =>
        sum +
        (position(segment.base + segment.value, max) -
          position(segment.base, max)),
      0,
    );
    assert.ok(Math.abs(drawn - position(row.sum, max)) < 1e-12, row.month);
  }
});

test("a stack's boundaries climb, so no band is drawn upside down", () => {
  const max = axisMax(null);
  for (const row of MONTHS) {
    for (const segment of segments(row)) {
      const bottom = position(segment.base, max);
      const top = position(segment.base + segment.value, max);
      assert.ok(top >= bottom, row.month);
    }
  }
});

test("year labels never collide with the first month", () => {
  const ticks = yearTicks();
  const gaps = ticks.slice(1).map((tick, i) => tick.index - ticks[i].index);
  assert.ok(gaps.every((gap) => gap >= 3));
});

test("sats convert to btc at a hundred million to one", () => {
  assert.equal(toBtc(SATS_PER_BTC), 1);
  assert.equal(toBtc(289_390_500), 2.893905);
});

test("btc reads to three figures, never as an exponent", () => {
  assert.equal(formatBtc(0), "0");
  assert.equal(formatBtc(896_077_178), "8.96");
  assert.equal(formatBtc(289_390_500), "2.89");
  assert.equal(formatBtc(100_000_000), "1");
  assert.equal(formatBtc(427_250), "0.00427");
  assert.equal(formatBtc(1_000), "0.00001");
  for (const pool of POOLS) {
    assert.ok(!formatBtc(pool.total).includes("e"), pool.id);
  }
});

test("dollars read to three figures under a thousand, grouped above it", () => {
  assert.equal(formatUsd(0), "0");
  assert.equal(formatUsd(124162.99), "124,163");
  assert.equal(formatUsd(999.4), "999");
  assert.equal(formatUsd(191.87), "192");
  assert.equal(formatUsd(0.0421), "0.0421");
  for (const pool of POOLS) {
    assert.ok(!formatUsd(pool.totalUsd).includes("e"), pool.id);
  }
});

test("the mark follows the unit", () => {
  assert.equal(unitMark("btc"), "₿");
  assert.equal(unitMark("usd"), "$");
});

test("a share too small to round is marked, not shown as zero", () => {
  assert.equal(formatShare(0), "0%");
  assert.equal(formatShare(0.02), "<0.1%");
  assert.equal(formatShare(67.47), "67.5%");
});

test("months read as a name and a year", () => {
  assert.equal(formatMonth("2024-01"), "jan 2024");
  assert.equal(formatMonth("2026-08"), "aug 2026");
});
