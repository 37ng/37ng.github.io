#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(
  new URL("../src/posts/bitcoin/data/price.json", import.meta.url),
);
const SOURCE =
  "https://api.blockchain.info/charts/market-price?timespan=all&format=csv&sampled=false";

async function fetchDailyPrices() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${SOURCE} -> HTTP ${res.status}`);
  return (await res.text())
    .trim()
    .split("\n")
    .map((line) => {
      const [stamp, value] = line.split(",");
      return { month: stamp.slice(0, 7), usd: Number(value) };
    });
}

function monthlyAverages(days) {
  const buckets = new Map();
  // Days before the first exchange quote are reported as 0, not as missing.
  // Averaging them in would drag a month's price below what it ever traded at.
  for (const { month, usd } of days) {
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

const prices = monthlyAverages(await fetchDailyPrices());
const months = Object.keys(prices);
if (months.length === 0) throw new Error("no priced months in source series");

await writeFile(OUT, JSON.stringify(prices, null, 2) + "\n");
console.log(
  `price.json: ${months.length} months, ${months[0]} to ${months[months.length - 1]}`,
);
