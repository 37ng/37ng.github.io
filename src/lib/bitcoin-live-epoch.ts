/**
 * Live figures fetched from the visitor's browser: every halving epoch after
 * the last one baked into bitcoin-epochs.json, the current BTC/USD price
 * used to convert the tx fees readout into dollars, and the latest US Big
 * Mac price used to convert that into Big Macs (see bitcoin-timeline.ts).
 *
 * Every finished epoch in bitcoin-epochs.json is permanent and baked in at
 * build time (see bitcoin-timeline.ts). Whatever comes after it is not — so
 * instead of rewriting the build output to chase it, the widget asks
 * mempool.space directly, once, on mount. mempool.space is the only source
 * used here, unlike the build script, which also uses blockchain.info:
 * mempool.space is the only one of the two that serves
 * `Access-Control-Allow-Origin: *`. blockchain.info's charts API sends no
 * CORS headers at all, so a browser fetch to it is blocked before it starts —
 * fine for the build script, which runs in Node and isn't subject to CORS,
 * but unusable from here.
 *
 * This deliberately does not assume only one epoch is pending: it reads the
 * live tip height first and walks forward from the last finished epoch
 * 210,000 blocks at a time (`pendingEpochs()` in bitcoin-timeline.ts). If the
 * site sat unbuilt across two halvings, this fetches and returns three
 * epochs' worth of figures, not one — nothing gets silently collapsed into a
 * single mislabeled "current" epoch.
 *
 * Every failure path returns null and the widget shows that figure as
 * unavailable. Nothing here ever invents a number.
 */
import { type Epoch, pendingEpochs } from "@/lib/bitcoin-timeline";

const API = "https://mempool.space/api";
const TIMEOUT_MS = 8000;

/** Same CSV `scripts/generate-bitcoin-epochs.mjs` reads at build time for
    each finished epoch's own average — see that script for why United
    States only and why this dataset over a world figure. raw.githubusercontent.com
    serves it with `Access-Control-Allow-Origin: *`, so a browser fetch works. */
const BIG_MAC_SOURCE =
  "https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-full-index.csv";

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
    still covers every pending epoch's whole age — a fresh single epoch
    fetches a small, cheap window instead of always paying for full chain
    history. Once two or more epochs are pending the span is already at
    least one full halving old, so "all" is the necessary fallback there. */
function feeIntervalFor(ageDays: number): string {
  const ladder = [
    { days: 90, param: "3m" },
    { days: 365, param: "1y" },
    { days: 730, param: "2y" },
    { days: 1095, param: "3y" },
  ];
  return ladder.find((step) => ageDays <= step.days)?.param ?? "all";
}

/**
 * Weighted-average a [height, value] series over [fromHeight, toHeight),
 * weighting each row by however many blocks it covers until the next row (or
 * `toHeight` for the last one). Used for both difficulty (mean) and fees
 * (sum) — the two callers just multiply differently.
 *
 * Rows at or past `toHeight` are excluded up front, not just left to fall
 * out of the weighting: with a single ever-open epoch (`toHeight` always the
 * live tip) every row belonged to it, so an unbounded upper end never
 * mattered. Once multiple bounded epochs share one adjustments/fee-bucket
 * array, a row that starts inside this epoch but is followed by a row from
 * the *next* epoch would otherwise borrow blocks past this epoch's own end —
 * silently pulling a later epoch's data into this one's average.
 */
function spanBlocks<T>(
  rows: T[],
  heightOf: (row: T) => number,
  fromHeight: number,
  toHeight: number,
): Array<{ row: T; blocks: number }> {
  const inRange = rows
    .filter((row) => heightOf(row) >= fromHeight && heightOf(row) < toHeight)
    .sort((a, b) => heightOf(a) - heightOf(b));
  return inRange.map((row, i) => {
    const next = inRange[i + 1] ? heightOf(inRange[i + 1]) : toHeight;
    return { row, blocks: Math.max(next - heightOf(row), 0) };
  });
}

/** The block timestamp at a given height, as a `YYYY-MM-DD` date — the only
    way to date a halving that happened after the last build, since it has
    no entry in bitcoin-epochs.json to read a date from. */
async function blockDateAt(height: number): Promise<string> {
  const hash = await getText(`${API}/block-height/${height}`);
  const block = (await getJson(`${API}/block/${hash.trim()}`)) as {
    timestamp: number;
  };
  return new Date(block.timestamp * 1000).toISOString().slice(0, 10);
}

/**
 * Every epoch after the last finished one, fully resolved against the live
 * chain — one entry per 210,000-block span between the last build and
 * today's tip, not just one. Each is a complete `Epoch`: only `avgBtcUsd`
 * and `usBigMacUsd` stay null, since those are period averages a
 * still-unfinished (or not-yet-built) epoch has no fixed value for.
 */
export async function fetchLiveEpochs(
  closed: Epoch[],
): Promise<Epoch[] | null> {
  try {
    const last = closed[closed.length - 1];
    const tipText = await getText(`${API}/blocks/tip/height`);
    const tipHeight = Number(tipText.trim());
    if (!Number.isFinite(tipHeight)) return null;

    const stubs = pendingEpochs(closed, tipHeight);
    const ageDays =
      (Date.now() - Date.parse(last.endDate as string)) / 86_400_000;

    // Boundary heights this run didn't already know a date for: every stub
    // after the first needs its start dated, and every non-open stub needs
    // its end dated — both are the same height (one epoch's end is the
    // next's start), so each boundary is fetched once and reused for both.
    const boundaryHeights = stubs.slice(1).map((stub) => stub.startHeight);
    const [adjustments, feeBuckets, boundaryDates] = await Promise.all([
      getJson(`${API}/v1/mining/difficulty-adjustments`) as Promise<
        DifficultyAdjustment[]
      >,
      getJson(
        `${API}/v1/mining/blocks/fees/${feeIntervalFor(ageDays)}`,
      ) as Promise<FeeBucket[]>,
      Promise.all(boundaryHeights.map(blockDateAt)),
    ]);

    return stubs.map((stub, i) => {
      const isOpen = stub.endHeight === null;
      const startDate =
        i === 0 ? (last.endDate as string) : boundaryDates[i - 1];
      const endDate = isOpen ? null : boundaryDates[i];
      const endHeight = stub.endHeight ?? tipHeight;

      const difficultySpans = spanBlocks(
        adjustments,
        (row) => row[1],
        stub.startHeight,
        endHeight,
      );
      const difficultyBlocks = difficultySpans.reduce(
        (s, r) => s + r.blocks,
        0,
      );
      const avgDifficulty =
        difficultyBlocks > 0
          ? difficultySpans.reduce((s, r) => s + r.row[2] * r.blocks, 0) /
            difficultyBlocks
          : 0;

      const feeSpans = spanBlocks(
        feeBuckets,
        (row) => row.avgHeight,
        stub.startHeight,
        endHeight,
      );
      const totalFeesSats = feeSpans.reduce(
        (s, r) => s + r.row.avgFees * r.blocks,
        0,
      );

      return {
        ...stub,
        startDate,
        endDate,
        totalFeesBtc: totalFeesSats / 1e8,
        avgDifficulty,
      };
    });
  } catch (error) {
    console.warn("[bitcoin-timeline] live epochs unavailable:", error);
    return null;
  }
}

/** Live BTC/USD, for converting a fee readout into today's dollars. Same
    source and same reasoning as fetchLiveEpochs: this changes far too often
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

/** Latest US Big Mac Index price, for converting the still-open epoch's
    fee/subsidy readouts into Big Macs. The Economist publishes about twice a
    year, so this isn't chasing a fast-moving number the way BTC/USD is — but
    it does move, and a build-time constant goes stale the moment a new
    edition lands. There's no per-country endpoint, so this downloads the same
    full CSV the build script parses and picks the most recent United States
    row, rather than baking "the latest one at last build" into the JSON. */
export async function fetchLatestBigMacUsd(): Promise<number | null> {
  try {
    const csv = await getText(BIG_MAC_SOURCE);
    const [header, ...lines] = csv.trim().split("\n");
    const columns = header.split(",");
    const dateCol = columns.indexOf("date");
    const nameCol = columns.indexOf("name");
    const priceCol = columns.indexOf("dollar_price");
    if (dateCol < 0 || nameCol < 0 || priceCol < 0) return null;

    const usRows = lines
      .map((line) => line.split(","))
      .filter((cells) => cells[nameCol] === "United States")
      .map((cells) => ({
        at: Date.parse(cells[dateCol] + "T00:00:00Z"),
        price: Number(cells[priceCol]),
      }))
      .filter((row) => Number.isFinite(row.at) && Number.isFinite(row.price));
    if (usRows.length === 0) return null;

    return usRows.reduce((latest, row) => (row.at > latest.at ? row : latest))
      .price;
  } catch (error) {
    console.warn("[bitcoin-timeline] Big Mac price unavailable:", error);
    return null;
  }
}
