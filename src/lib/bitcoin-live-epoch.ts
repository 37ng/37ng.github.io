/**
 * Live figures fetched from the visitor's browser: the open halving epoch's
 * fees and difficulty, and the current BTC/USD price used to convert the tx
 * fees readout into dollars (and Big Macs — see bitcoin-timeline.ts).
 *
 * Every finished epoch in bitcoin-epochs.json is permanent and baked in at
 * build time (see bitcoin-timeline.ts). The open one is not — its fees and
 * difficulty change every block, and price changes by the second — so
 * instead of rewriting the build output to chase either, the widget asks
 * mempool.space directly, once, on mount. mempool.space is the only source
 * used here, unlike the build script, which also uses blockchain.info:
 * mempool.space is the only one of the two that serves
 * `Access-Control-Allow-Origin: *`. blockchain.info's charts API sends no
 * CORS headers at all, so a browser fetch to it is blocked before it starts —
 * fine for the build script, which runs in Node and isn't subject to CORS,
 * but unusable from here.
 *
 * Every failure path returns null and the widget shows that figure as
 * unavailable. Nothing here ever invents a number.
 */
const API = "https://mempool.space/api";
const TIMEOUT_MS = 8000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/** [timestamp, height, difficulty, adjustmentFactor] — one row per 2016-block
    retarget, newest first, full history in one ~20KB call. */
type DifficultyAdjustment = [number, number, number, number];

/** One row per ~day of average fees. avgFees is sats per block, averaged
    over that bucket — not a total. */
interface FeeBucket {
  avgHeight: number;
  avgFees: number;
}

/** The smallest interval mempool.space's fee-bucket endpoint accepts that
    still covers the epoch's whole age — a fresh epoch fetches a small,
    cheap window instead of always paying for full chain history. A halving
    epoch is at most ~4 years old, so "all" is the necessary fallback near
    the end of one. */
function feeIntervalFor(ageDays: number): string {
  const ladder = [
    { days: 90, param: "3m" },
    { days: 365, param: "1y" },
    { days: 730, param: "2y" },
    { days: 1095, param: "3y" },
  ];
  return ladder.find((step) => ageDays <= step.days)?.param ?? "all";
}

export interface LiveEpoch {
  endHeight: number;
  totalFeesBtc: number;
  avgDifficulty: number;
}

/**
 * Weighted-average a [height, value] series over [fromHeight, toHeight),
 * weighting each row by however many blocks it covers until the next row (or
 * `toHeight` for the last one). Used for both difficulty (mean) and fees
 * (sum) — the two callers just multiply differently.
 */
function spanBlocks<T>(
  rows: T[],
  heightOf: (row: T) => number,
  fromHeight: number,
  toHeight: number,
): Array<{ row: T; blocks: number }> {
  const inRange = rows
    .filter((row) => heightOf(row) >= fromHeight)
    .sort((a, b) => heightOf(a) - heightOf(b));
  return inRange.map((row, i) => {
    const next = inRange[i + 1] ? heightOf(inRange[i + 1]) : toHeight;
    return { row, blocks: Math.max(next - heightOf(row), 0) };
  });
}

export async function fetchLiveEpoch(
  startHeight: number,
  startDate: string,
): Promise<LiveEpoch | null> {
  try {
    const ageDays = (Date.now() - Date.parse(startDate)) / 86_400_000;
    const [tipText, adjustments, feeBuckets] = await Promise.all([
      getText(`${API}/blocks/tip/height`),
      getJson(
        `${API}/v1/mining/difficulty-adjustments`,
      ) as Promise<DifficultyAdjustment[]>,
      getJson(
        `${API}/v1/mining/blocks/fees/${feeIntervalFor(ageDays)}`,
      ) as Promise<FeeBucket[]>,
    ]);

    const endHeight = Number(tipText.trim());
    if (!Number.isFinite(endHeight)) return null;

    const difficultySpans = spanBlocks(
      adjustments,
      (row) => row[1],
      startHeight,
      endHeight,
    );
    const difficultyBlocks = difficultySpans.reduce((s, r) => s + r.blocks, 0);
    const avgDifficulty =
      difficultyBlocks > 0
        ? difficultySpans.reduce((s, r) => s + r.row[2] * r.blocks, 0) /
          difficultyBlocks
        : 0;

    const feeSpans = spanBlocks(
      feeBuckets,
      (row) => row.avgHeight,
      startHeight,
      endHeight,
    );
    const totalFeesSats = feeSpans.reduce(
      (s, r) => s + r.row.avgFees * r.blocks,
      0,
    );

    return { endHeight, totalFeesBtc: totalFeesSats / 1e8, avgDifficulty };
  } catch (error) {
    console.warn("[bitcoin-timeline] live epoch unavailable:", error);
    return null;
  }
}

/** Live BTC/USD, for converting a fee readout into today's dollars. Same
    source and same reasoning as fetchLiveEpoch: this changes far too often
    to bake in at build time. */
export async function fetchBtcUsd(): Promise<number | null> {
  try {
    const price = (await getJson(`${API}/v1/prices`)) as { USD?: number };
    return typeof price.USD === "number" ? price.USD : null;
  } catch (error) {
    console.warn("[bitcoin-timeline] BTC/USD price unavailable:", error);
    return null;
  }
}
