#!/usr/bin/env node
/**
 * Builds src/lib/bitcoin-epochs.json — one row per halving epoch, aggregated
 * from public history rather than sampled live from the visitor's browser.
 *
 * Sources: blockchain.info's charts CSV export (daily totals, full history)
 * for tx fees, difficulty, and block size; mempool.space for the exact block
 * heights/timestamps at each halving and the current chain tip. All of this
 * runs once, at build time — the widget reads the committed JSON with no
 * runtime fetch, so a visitor's numbers are current as of the last deploy,
 * not as of the moment they loaded the page.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(
  new URL("../src/lib/bitcoin-epochs.json", import.meta.url),
);

// The protocol's own constants — a halving every 210,000 blocks, subsidy
// halving each time from 50 BTC. Deriving HALVING_HEIGHTS and SUBSIDY_BTC
// from these means the script keeps working past the next halving (block
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

async function main() {
  const tipHeight = Number((await getText("https://mempool.space/api/blocks/tip/height")).trim());

  // One epoch per completed halving, plus the current, still-running one —
  // however many that now is. completedHalvings=4 today (tip past 840,000)
  // means 5 epoch starts: 0, 210000, ..., 840000.
  const completedHalvings = Math.floor(tipHeight / HALVING_INTERVAL);
  const halvingHeights = Array.from(
    { length: completedHalvings + 1 },
    (_, i) => i * HALVING_INTERVAL,
  );

  const halvingTimes = await Promise.all(halvingHeights.map(blockTimestamp));
  const now = Math.floor(Date.now() / 1000);

  const [fees, difficulty] = await Promise.all([
    fetchSeries("transaction-fees"),
    fetchSeries("difficulty"),
  ]);

  const epochs = halvingHeights.map((startHeight, i) => {
    const endHeight = halvingHeights[i + 1] ?? tipHeight;
    const startAt = halvingTimes[i];
    const endAt = halvingTimes[i + 1] ?? now;
    const subsidyBtc = INITIAL_SUBSIDY_BTC / 2 ** i;

    const totalFeesBtc = sumInRange(fees, startAt, endAt);
    const avgDifficulty = meanInRange(difficulty, startAt, endAt);

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
      totalFeesBtc,
      avgDifficulty,
    };
  });

  await writeFile(OUT, JSON.stringify(epochs, null, 2) + "\n");
  console.log(`wrote ${epochs.length} epochs to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
