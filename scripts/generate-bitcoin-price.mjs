#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(
  new URL("../src/posts/bitcoin/data/price.json", import.meta.url),
);
const CHART = "https://api.blockchain.info/charts/market-price";
const MONTH = /^\d{4}-\d{2}$/;

function nextMonth(month) {
  const [year, index] = month.split("-").map(Number);
  return index === 12
    ? `${year + 1}-01`
    : `${year}-${String(index + 1).padStart(2, "0")}`;
}

function lastDayOf(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
}

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
      return { day: stamp.slice(0, 10), usd: Number(value) };
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day));
}

function completeMonthlyAverages(days) {
  if (days.length === 0) return {};
  // A month is only averaged once the source covers its final calendar day.
  // The month in progress would otherwise be written as a part-month average
  // and then be wrong until the next run.
  const covered = days[days.length - 1].day;
  const buckets = new Map();
  // Days before the first exchange quote are reported as 0, not as missing.
  // Averaging them in would drag a month below what it ever traded at.
  for (const { day, usd } of days) {
    if (!Number.isFinite(usd) || usd <= 0) continue;
    const month = day.slice(0, 7);
    const bucket = buckets.get(month) ?? { sum: 0, n: 0 };
    bucket.sum += usd;
    bucket.n += 1;
    buckets.set(month, bucket);
  }
  const out = {};
  for (const month of [...buckets.keys()].sort()) {
    if (lastDayOf(month) > covered) continue;
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
        ([month, usd]) => MONTH.test(month) && Number.isFinite(usd) && usd > 0,
      ),
    );
  } catch {
    return {};
  }
}

const existing = await readExisting();
const known = Object.keys(existing).sort();
// Every committed month is a finished month, so the newest one is final and
// the window can start after it.
const from = known.length > 0 ? nextMonth(known.at(-1)) : undefined;

let fetched;
try {
  fetched = completeMonthlyAverages(await fetchDailyPrices(from));
} catch (error) {
  if (known.length === 0) throw error;
  console.warn(`price.json: kept ${known.length} committed months — ${error}`);
  process.exit(0);
}

const merged = { ...existing, ...fetched };
const months = Object.keys(merged).sort();
if (months.length === 0) throw new Error("no complete month in source series");

const added = months.filter((month) => !(month in existing));
await writeFile(
  OUT,
  JSON.stringify(
    Object.fromEntries(months.map((month) => [month, merged[month]])),
    null,
    2,
  ) + "\n",
);
console.log(
  `price.json: ${months.length} months, ${months[0]} to ${months.at(-1)} (+${added.length})`,
);
