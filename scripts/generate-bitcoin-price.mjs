#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(
  new URL("../src/posts/bitcoin/data/price.json", import.meta.url),
);
const CHART = "https://api.blockchain.info/charts/market-price";

async function fetchDailyPrices(fromMonth) {
  const range = fromMonth ? `start=${fromMonth}-01` : "timespan=all";
  const url = `${CHART}?${range}&format=csv&sampled=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [stamp, value] = line.split(",");
      return { month: stamp.slice(0, 7), usd: Number(value) };
    });
}

function monthlyAverages(days) {
  const buckets = new Map();
  // Days before the first exchange quote are reported as 0, not as missing.
  // Averaging them in would drag a month below what it ever traded at.
  for (const { month, usd } of days) {
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (!Number.isFinite(usd) || usd <= 0) continue;
    const bucket = buckets.get(month) ?? { sum: 0, n: 0 };
    bucket.sum += usd;
    bucket.n += 1;
    buckets.set(month, bucket);
  }
  const out = {};
  for (const month of [...buckets.keys()].sort()) {
    const { sum, n } = buckets.get(month);
    out[month] = Number((sum / n).toPrecision(6));
  }
  return out;
}

async function readExisting() {
  try {
    const parsed = JSON.parse(await readFile(OUT, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([month, usd]) =>
          /^\d{4}-\d{2}$/.test(month) && Number.isFinite(usd) && usd > 0,
      ),
    );
  } catch {
    return {};
  }
}

const existing = await readExisting();
const known = Object.keys(existing).sort();
// The newest month on file was the open month when it was written, so its
// average covered a part-month. Refetch from its first day, never after it.
const from = known.at(-1);

let fetched;
try {
  fetched = monthlyAverages(await fetchDailyPrices(from));
} catch (error) {
  if (known.length === 0) throw error;
  console.warn(`price.json: kept ${known.length} committed months — ${error}`);
  process.exit(0);
}

const merged = { ...existing, ...fetched };
const months = Object.keys(merged).sort();
if (months.length === 0) throw new Error("no priced months in source series");

const added = months.filter((month) => !(month in existing));
const revised = Object.keys(fetched).filter(
  (month) => month in existing && existing[month] !== fetched[month],
);

await writeFile(
  OUT,
  JSON.stringify(
    Object.fromEntries(months.map((m) => [m, merged[m]])),
    null,
    2,
  ) + "\n",
);
console.log(
  from
    ? `price.json: ${months.length} months to ${months.at(-1)} (+${added.length} new, ${revised.length} revised)`
    : `price.json: ${months.length} months, ${months[0]} to ${months.at(-1)}`,
);
