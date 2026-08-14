/**
 * `fetchLiveEpochs` is the piece that must not assume only one epoch is
 * pending — see the module comment in bitcoin-live-epoch.ts. These tests
 * drive it against a fake `fetch` so both the ordinary case (one pending
 * epoch) and the case that used to be silently wrong (two halvings skipped,
 * three pending epochs) can be checked without hitting mempool.space.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { fetchLiveEpochs } from "@/lib/bitcoin-live-epoch";
import type { Epoch } from "@/lib/bitcoin-timeline";

const LAST_FINISHED: Epoch = {
  id: "e0",
  label: "50",
  subsidyBtc: 50,
  startHeight: 0,
  endHeight: 210_000,
  startDate: "2009-01-03",
  endDate: "2012-11-28",
  totalFeesBtc: 1,
  avgDifficulty: 1,
  avgBtcUsd: 1,
  usBigMacUsd: 1,
};

/** [timestamp, height, difficulty, adjustmentFactor] rows, newest first —
    same shape mempool.space's difficulty-adjustments endpoint returns. */
type DifficultyRow = [number, number, number, number];

/**
 * A minimal fake of the four mempool.space endpoints fetchLiveEpochs calls,
 * keyed by URL substring so each test only has to describe the chain state
 * it cares about. block-height/block are a two-step hash lookup in the real
 * API; `blockDates` maps height straight to a date to keep fixtures short.
 */
function mockChain({
  tipHeight,
  difficulty,
  feeBuckets,
  blockDates,
}: {
  tipHeight: number;
  difficulty: DifficultyRow[];
  feeBuckets: Array<{ avgHeight: number; avgFees: number }>;
  blockDates: Record<number, string>;
}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/blocks/tip/height")) {
      return new Response(String(tipHeight));
    }
    if (url.includes("/v1/mining/difficulty-adjustments")) {
      return new Response(JSON.stringify(difficulty));
    }
    if (url.includes("/v1/mining/blocks/fees/")) {
      return new Response(JSON.stringify(feeBuckets));
    }
    const heightMatch = url.match(/\/block-height\/(\d+)/);
    if (heightMatch) {
      // Stand-in "hash" — just the height itself, threaded through to the
      // matching /block/ lookup below.
      return new Response(String(heightMatch[1]));
    }
    const hashMatch = url.match(/\/block\/(\d+)$/);
    if (hashMatch) {
      const height = Number(hashMatch[1]);
      const date = blockDates[height];
      if (!date)
        throw new Error(`mockChain: no blockDate fixture for height ${height}`);
      return new Response(
        JSON.stringify({ timestamp: Date.parse(date) / 1000 }),
      );
    }
    throw new Error(`mockChain: unhandled URL ${url}`);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

let restoreFetch: () => void;
beforeEach(() => {
  restoreFetch = () => {};
});
afterEach(() => {
  restoreFetch();
});

test("one pending epoch — tip just past the last finished epoch", async () => {
  restoreFetch = mockChain({
    tipHeight: 210_100,
    difficulty: [[Date.parse("2012-12-01") / 1000, 210_000, 100, 1]],
    feeBuckets: [{ avgHeight: 210_000, avgFees: 5000 }],
    blockDates: {},
  });

  const result = await fetchLiveEpochs([LAST_FINISHED]);

  assert.ok(result);
  assert.equal(result.length, 1);
  assert.deepEqual(
    result.map((e) => e.id),
    ["e1"],
  );
  const open = result[0];
  assert.equal(open.subsidyBtc, 25);
  assert.equal(open.startHeight, 210_000);
  assert.equal(open.endHeight, null);
  assert.equal(open.startDate, "2012-11-28");
  assert.equal(open.endDate, null);
  // 210_100 - 210_000 = 100 blocks at 5000 sats each, in BTC.
  assert.equal(open.totalFeesBtc, (100 * 5000) / 1e8);
  assert.equal(open.avgDifficulty, 100);
});

test("three pending epochs — site sat unbuilt across two halvings", async () => {
  // Last build knew only up to height 210_000. The real chain has since
  // moved two full epochs past that, plus 100 blocks into a third.
  const tipHeight = 210_000 + 2 * 210_000 + 100; // 630_100
  const boundaryA = 420_000; // e1 -> e2
  const boundaryB = 630_000; // e2 -> e3 (open)

  restoreFetch = mockChain({
    tipHeight,
    // One difficulty retarget per epoch, so each epoch's average is just
    // that epoch's own value once spanBlocks correctly excludes rows past
    // its own end.
    difficulty: [
      [0, 210_000, 100, 1],
      [0, boundaryA, 200, 1],
      [0, boundaryB, 300, 1],
    ],
    // One fee bucket per epoch, same reasoning.
    feeBuckets: [
      { avgHeight: 210_000, avgFees: 1000 },
      { avgHeight: boundaryA, avgFees: 2000 },
      { avgHeight: boundaryB, avgFees: 3000 },
    ],
    blockDates: {
      [boundaryA]: "2016-07-09",
      [boundaryB]: "2020-05-11",
    },
  });

  const result = await fetchLiveEpochs([LAST_FINISHED]);

  assert.ok(result);
  assert.equal(
    result.length,
    3,
    "must not collapse two skipped halvings into one epoch",
  );

  const [e1, e2, e3] = result;

  assert.equal(e1.id, "e1");
  assert.equal(e1.subsidyBtc, 25);
  assert.equal(e1.startHeight, 210_000);
  assert.equal(e1.endHeight, boundaryA);
  assert.equal(e1.startDate, "2012-11-28"); // known with no fetch
  assert.equal(e1.endDate, "2016-07-09"); // fetched live
  assert.equal(e1.avgDifficulty, 100);
  assert.equal(e1.totalFeesBtc, (210_000 * 1000) / 1e8);

  assert.equal(e2.id, "e2");
  assert.equal(e2.subsidyBtc, 12.5);
  assert.equal(e2.startHeight, boundaryA);
  assert.equal(e2.endHeight, boundaryB);
  assert.equal(e2.startDate, "2016-07-09");
  assert.equal(e2.endDate, "2020-05-11");
  assert.equal(e2.avgDifficulty, 200);
  assert.equal(e2.totalFeesBtc, (210_000 * 2000) / 1e8);

  assert.equal(e3.id, "e3");
  assert.equal(e3.subsidyBtc, 6.25);
  assert.equal(e3.startHeight, boundaryB);
  assert.equal(e3.endHeight, null, "only the last epoch is still open");
  assert.equal(e3.startDate, "2020-05-11");
  assert.equal(e3.endDate, null);
  assert.equal(e3.avgDifficulty, 300);
  // Only 100 blocks into this epoch so far.
  assert.equal(e3.totalFeesBtc, (100 * 3000) / 1e8);
});

test("returns null, and invents nothing, when the tip height fetch fails", async () => {
  restoreFetch = mockChain({
    tipHeight: NaN as unknown as number,
    difficulty: [],
    feeBuckets: [],
    blockDates: {},
  });
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  const result = await fetchLiveEpochs([LAST_FINISHED]);
  assert.equal(result, null);
});
