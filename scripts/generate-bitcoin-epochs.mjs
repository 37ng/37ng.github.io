#!/usr/bin/env node
/**
 * Updates src/lib/bitcoin-epochs.json — one row per *finished* halving epoch,
 * aggregated from public history.
 *
 * A finished epoch's numbers are permanent: once a halving has happened, its
 * fee total, average difficulty, and date range never change. The open,
 * still-running epoch is deliberately never written here — its totals change
 * every block, and this script only runs once per build, so anything it wrote
 * for the open epoch would already be stale by the time a visitor loads the
 * page. That epoch's live figures are instead fetched straight from the
 * visitor's own browser (see src/lib/bitcoin-live-epoch.ts); this file only
 * ever needs to grow when a halving actually finishes one.
 *
 * Steady state costs exactly one network call — the current tip height, to
 * check whether a new halving has happened. If it hasn't, nothing is written.
 * If it has, this fetches the newly-finished epoch's boundary timestamps from
 * mempool.space and its totals from blockchain.info's charts CSV export, and
 * appends one row.
 *
 * All of this runs at build time — `npm run build` runs it automatically via
 * the `prebuild` script in package.json — and the widget reads the committed
 * JSON with no runtime fetch for any *finished* epoch.
 *
 * A failed fetch does not fail the build: the committed JSON is already a
 * valid, usable epoch list, so a network hiccup during CI just means this
 * deploy ships with the same data as the last one, logged as a warning. The
 * only case that still fails the build is having no committed file to fall
 * back on at all — a first run with no data and no network is a real error,
 * not a stale-but-fine one.
 */
import { access, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(
  new URL("../src/lib/bitcoin-epochs.json", import.meta.url),
);

// The protocol's own constants — a halving every 210,000 blocks, subsidy
// halving each time from 50 BTC. Deriving epoch heights and subsidies from
// these means the script keeps working past the next halving (block
// 1,050,000, ~2028) with no code change: it reads the current tip and grows
// the epoch list to match.
const HALVING_INTERVAL = 210000;
const INITIAL_SUBSIDY_BTC = 50;

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

async function blockTimestamp(height) {
  const hash = await getText(`https://mempool.space/api/block-height/${height}`);
  const block = await getJson(`https://mempool.space/api/block/${hash.trim()}`);
  return block.timestamp;
}

/** blockchain.info charts CSV: "YYYY-MM-DD HH:MM:SS,value" per line. */
function parseCsv(text) {
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const [stamp, value] = line.split(",");
      return { at: Date.parse(stamp + "Z") / 1000, value: Number(value) };
    });
}

async function fetchSeries(chart) {
  const csv = await getText(
    `https://api.blockchain.info/charts/${chart}?timespan=all&format=csv&sampled=false`,
  );
  return parseCsv(csv);
}

function meanInRange(series, start, end) {
  const rows = series.filter((row) => row.at >= start && row.at < end);
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
}

function sumInRange(series, start, end) {
  return series
    .filter((row) => row.at >= start && row.at < end)
    .reduce((sum, row) => sum + row.value, 0);
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return [];
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const tipHeight = Number(
    (await getText("https://mempool.space/api/blocks/tip/height")).trim(),
  );

  // Epoch i (0-indexed) is finished once the tip has passed its own end, i.e.
  // reached height (i+1)*HALVING_INTERVAL. floor(tip/HALVING_INTERVAL) is
  // exactly how many epochs that describes.
  const finishedCount = Math.floor(tipHeight / HALVING_INTERVAL);

  const existing = await readExisting();
  if (existing.length >= finishedCount) {
    console.log(
      `up to date: ${existing.length} finished epochs on file, tip #${tipHeight} implies ${finishedCount}`,
    );
    return;
  }

  // Only the boundary heights bracketing newly-finished epochs need a fresh
  // mempool.space lookup — existing.length of them are already on file with
  // their startDate known, so only the ones from there through finishedCount
  // (inclusive, since each new epoch needs both its start and end) are new.
  const boundaryHeights = Array.from(
    { length: finishedCount - existing.length + 1 },
    (_, k) => (existing.length + k) * HALVING_INTERVAL,
  );
  const boundaryTimes = await Promise.all(boundaryHeights.map(blockTimestamp));

  const [fees, difficulty] = await Promise.all([
    fetchSeries("transaction-fees"),
    fetchSeries("difficulty"),
  ]);

  const newEpochs = [];
  for (let i = existing.length; i < finishedCount; i++) {
    const k = i - existing.length;
    const startAt = boundaryTimes[k];
    const endAt = boundaryTimes[k + 1];
    const subsidyBtc = INITIAL_SUBSIDY_BTC / 2 ** i;

    newEpochs.push({
      id: `e${i + 1}`,
      label: String(subsidyBtc),
      subsidyBtc,
      startHeight: i * HALVING_INTERVAL,
      endHeight: (i + 1) * HALVING_INTERVAL,
      startDate: new Date(startAt * 1000).toISOString().slice(0, 10),
      endDate: new Date(endAt * 1000).toISOString().slice(0, 10),
      totalFeesBtc: sumInRange(fees, startAt, endAt),
      avgDifficulty: meanInRange(difficulty, startAt, endAt),
    });
  }

  const epochs = [...existing, ...newEpochs];

  await writeFile(OUT, JSON.stringify(epochs, null, 2) + "\n");
  console.log(`wrote ${epochs.length} epochs (${newEpochs.length} newly finished) to ${OUT}`);
}

main().catch(async (error) => {
  if (await fileExists(OUT)) {
    console.warn(
      `[bitcoin-epochs] update failed, keeping committed data: ${error.message}`,
    );
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
