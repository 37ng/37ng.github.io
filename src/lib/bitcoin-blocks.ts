/**
 * Fetches the blocks the timeline widget shows, from mempool.space's public
 * REST API.
 *
 * This runs at *build* time, not in the visitor's browser. The widget then
 * ships as static numbers: no key to keep, no CORS to negotiate, no third-party
 * request on the critical path of a page whose whole point is that it paints
 * immediately. The trade is that the figures are as fresh as the last deploy,
 * which is why the widget prints the block height and timestamp it is quoting
 * rather than implying it is live.
 *
 * Every failure path returns null and the widget renders an explicit
 * unavailable state. Nothing here ever invents a number: a plausible-looking
 * fee total is worse than a blank, because the reader has no way to tell.
 */
import {
  INTERVALS,
  type BlockSample,
  type Interval,
} from "@/lib/bitcoin-timeline";

const API = "https://mempool.space/api";
const TIMEOUT_MS = 8000;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

/** Narrowing helper — the API is external, so nothing from it is trusted. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

async function sampleAt(
  interval: Interval,
  now: number,
): Promise<BlockSample | null> {
  const target = now - interval.seconds;

  // The mining endpoint answers "which block was around at this time", which
  // is the question the timeline is actually asking. Height alone is not
  // enough — the fee total lives on the block's `extras`.
  const nearest = record(
    await getJson(`${API}/v1/mining/blocks/timestamp/${target}`),
  );
  const hash = nearest?.hash;
  if (typeof hash !== "string" || hash.length === 0) return null;

  const block = record(await getJson(`${API}/v1/block/${hash}`));
  if (!block) return null;
  const extras = record(block.extras);

  const height = num(block.height);
  const timestamp = num(block.timestamp);
  const difficulty = num(block.difficulty);
  const totalFeesSats = num(extras?.totalFees);
  // avgFeeRate is the block's own weighted rate; medianFee is the fallback
  // when a block is small enough that the average is not meaningful.
  const feeRateSatVb = num(extras?.avgFeeRate) ?? num(extras?.medianFee);

  if (
    height === null ||
    timestamp === null ||
    difficulty === null ||
    totalFeesSats === null ||
    feeRateSatVb === null
  ) {
    return null;
  }

  return {
    intervalId: interval.id,
    height,
    timestamp,
    difficulty,
    totalFeesSats,
    feeRateSatVb,
  };
}

/**
 * One sample per knot, or null if any of them could not be resolved.
 *
 * All-or-nothing on purpose: a track where three knots have numbers and four
 * are blank reads as a broken widget, and the reader cannot tell a missing
 * block from a zero-fee one.
 */
export async function loadBlockSamples(): Promise<BlockSample[] | null> {
  const now = Math.floor(Date.now() / 1000);
  try {
    const samples = await Promise.all(
      INTERVALS.map((interval) => sampleAt(interval, now)),
    );
    if (samples.some((sample) => sample === null)) {
      console.warn(
        "[bitcoin-timeline] incomplete block data — widget will render empty",
      );
      return null;
    }
    return samples as BlockSample[];
  } catch (error) {
    // A blog that cannot reach mempool.space still has to build.
    console.warn("[bitcoin-timeline] block data unavailable:", error);
    return null;
  }
}

/**
 * Module-level cache. The widget appears on the homepage stage and inside the
 * bitcoin post, which are separate pages built in the same process — without
 * this they would each pay for the whole fetch, and quote different blocks.
 */
let pending: Promise<BlockSample[] | null> | null = null;

export function blockSamples(): Promise<BlockSample[] | null> {
  pending ??= loadBlockSamples();
  return pending;
}
