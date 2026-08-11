/**
 * Fetches the blocks the timeline widget shows, from mempool.space's public
 * REST API.
 *
 * This runs in the visitor's browser, when the widget scrolls into view. The
 * figures are therefore current at read time rather than at deploy time, which
 * is what the knots — 1min, 1h, 1d — claim to be. mempool.space serves
 * `Access-Control-Allow-Origin: *` and needs no key, so no proxy is involved.
 * The cost is that the numbers arrive after first paint: the widget renders its
 * frame immediately and fills the readouts when the data lands.
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
    // A visitor who is offline, or whose network blocks the API, still gets
    // the page.
    console.warn("[bitcoin-timeline] block data unavailable:", error);
    return null;
  }
}

/**
 * Per-tab cache, with the time the load started.
 *
 * The widget can mount more than once in one session — the homepage stage and
 * the bitcoin post are separate documents, but a view transition keeps the same
 * window — and a remount must not re-run fourteen requests. The stamp is what
 * lets a stale entry be refetched instead of served for the whole visit.
 *
 * A load is never cancelled by its caller: the promise is shared, so aborting
 * it for one unmounting widget would hand every other consumer a failure.
 */
const MAX_AGE_MS = 5 * 60 * 1000;

let cached: { at: number; promise: Promise<BlockSample[] | null> } | null =
  null;

export function blockSamples(): Promise<BlockSample[] | null> {
  const now = Date.now();
  if (cached && now - cached.at < MAX_AGE_MS) return cached.promise;
  const entry = {
    at: now,
    // A failed load is not cached — the next mount should try again.
    promise: loadBlockSamples().then((samples) => {
      if (samples === null && cached === entry) cached = null;
      return samples;
    }),
  };
  cached = entry;
  return entry.promise;
}
