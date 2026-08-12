#!/usr/bin/env node
/**
 * Updates src/lib/bitcoin-epochs.json — one row per halving epoch, aggregated
 * from public history rather than sampled live from the visitor's browser.
 *
 * A finished epoch's numbers are permanent: once a halving has happened, its
 * fee total, average difficulty, and date range never change. So this only
 * ever recomputes the *previously-open* epoch (finalizing it, if a new
 * halving happened since the last run) and any newly-opened epoch — every
 * earlier row in the committed file is left untouched. If the tip hasn't
 * crossed a new halving since the last run, nothing has to change and the
 * script makes exactly one network call (the tip height) to confirm that.
 *
 * Sources: mempool.space for the current tip and each halving's exact block
 * timestamp; blockchain.info's charts CSV export (daily totals, full history)
 * for tx fees and difficulty, fetched only when there's new ground to cover.
 * All of this runs at build time — `npm run build` runs it automatically via
 * the `prebuild` script in package.json — and the widget reads the committed
 * JSON with no runtime fetch, so a visitor's numbers are current as of the
 * last build, not as of the moment the page loads. The tradeoff of wiring
 * this into every build: a build now needs network access to reach
 * mempool.space, and fails if that one call does not succeed, even when
 * every epoch on file is already up to date.
 */
import { readFile, writeFile } from "node:fs/promises";
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

async function main() {
  const tipHeight = Number(
    (await getText("https://mempool.space/api/blocks/tip/height")).trim(),
  );

  // One epoch per completed halving, plus the current, still-running one.
  const completedHalvings = Math.floor(tipHeight / HALVING_INTERVAL);
  const totalEpochs = completedHalvings + 1;
  const halvingHeights = Array.from(
    { length: totalEpochs },
    (_, i) => i * HALVING_INTERVAL,
  );

  const existing = await readExisting();

  // Every epoch before the last one on file is already finished and was
  // written once, permanently — the only rows that can still change are the
  // last one on file (it may have just finalized) and any brand-new epoch
  // past it. If the file already accounts for every epoch the tip implies,
  // there is nothing to finalize or add.
  if (existing.length >= totalEpochs) {
    console.log(
      `up to date: ${existing.length} epochs on file, tip #${tipHeight} implies ${totalEpochs}`,
    );
    return;
  }

  const staleFrom = Math.max(0, existing.length - 1);
  const affectedHeights = halvingHeights.slice(staleFrom);

  const halvingTimes = await Promise.all(affectedHeights.map(blockTimestamp));
  const now = Math.floor(Date.now() / 1000);

  const [fees, difficulty] = await Promise.all([
    fetchSeries("transaction-fees"),
    fetchSeries("difficulty"),
  ]);

  const recomputed = affectedHeights.map((startHeight, offset) => {
    const i = staleFrom + offset;
    const endHeight = halvingHeights[i + 1] ?? tipHeight;
    const startAt = halvingTimes[offset];
    const endAt = halvingTimes[offset + 1] ?? now;
    const subsidyBtc = INITIAL_SUBSIDY_BTC / 2 ** i;

    return {
      id: `e${i + 1}`,
      label: String(subsidyBtc),
      subsidyBtc,
      startHeight,
      endHeight,
      startDate: new Date(startAt * 1000).toISOString().slice(0, 10),
      endDate:
        i + 1 < halvingHeights.length
          ? new Date(endAt * 1000).toISOString().slice(0, 10)
          : null,
      totalFeesBtc: sumInRange(fees, startAt, endAt),
      avgDifficulty: meanInRange(difficulty, startAt, endAt),
    };
  });

  const epochs = [...existing.slice(0, staleFrom), ...recomputed];

  await writeFile(OUT, JSON.stringify(epochs, null, 2) + "\n");
  console.log(
    `wrote ${epochs.length} epochs (${recomputed.length} recomputed) to ${OUT}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
