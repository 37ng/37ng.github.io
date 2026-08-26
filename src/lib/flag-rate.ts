/**
 * PSEUDO DATA — every number below is synthesised, not measured. Swap
 * `buildDays` for a real loader (mempool.space fee history + whatever marks a
 * block as carrying privately-relayed transactions) and the widget is
 * unchanged. The shape is what a real loader has to produce.
 */

export interface DayBucket {
  /** ISO date, UTC. */
  date: string;
  /** Blocks mined that day. */
  blocks: number;
  /** Blocks that carried at least one flagged (privately included) tx. */
  flagged: number;
  /** Median public fee rate, sat/vB. */
  feeRate: number;
}

export const FLAG_START = "2023-01-01";
const DAYS_COUNT = 731;

// Deterministic: the island renders on the server and again in the browser,
// and a Math.random() series would differ between the two.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Episode {
  /** Day index the congestion starts. */
  at: number;
  /** Days it lasts. */
  len: number;
  /** Peak median fee rate, sat/vB. */
  peak: number;
}

const EPISODES: Episode[] = [
  { at: 118, len: 22, peak: 78 },
  { at: 131, len: 16, peak: 168 },
  { at: 199, len: 12, peak: 62 },
  { at: 320, len: 34, peak: 246 },
  { at: 412, len: 14, peak: 71 },
  { at: 468, len: 20, peak: 132 },
  { at: 475, len: 9, peak: 301 },
  { at: 560, len: 18, peak: 96 },
  { at: 651, len: 26, peak: 154 },
];

/** How many days private inclusion trails the public spike. */
export const RESPONSE_LAG = 2;

function episodeLift(index: number): number {
  let lift = 0;
  for (const episode of EPISODES) {
    const t = (index - episode.at) / episode.len;
    if (t < 0 || t > 1) continue;
    // Fast in, slow out — congestion arrives quicker than it drains.
    const shape = t < 0.28 ? t / 0.28 : Math.pow(1 - (t - 0.28) / 0.72, 1.7);
    lift += episode.peak * shape;
  }
  return lift;
}

function buildDays(): DayBucket[] {
  const random = mulberry32(0x5eed_1337);
  const start = Date.UTC(2023, 0, 1);

  const feeRates: number[] = [];
  for (let i = 0; i < DAYS_COUNT; i += 1) {
    const base = 9 + 3.5 * Math.sin(i / 47) + 2 * Math.sin(i / 11);
    const noise = (random() - 0.45) * 6;
    feeRates.push(Math.max(1.4, base + noise + episodeLift(i)));
  }

  return feeRates.map((feeRate, i) => {
    // Private inclusion answers the *earlier* public spike, not today's — the
    // whole point of the chart is that the two curves are offset, not glued.
    const driver = feeRates[Math.max(0, i - RESPONSE_LAG)];
    const pressure = Math.min(1, Math.log10(1 + driver / 9) / 1.35);
    const share = Math.min(
      0.62,
      Math.max(0.01, 0.055 + 0.44 * pressure + (random() - 0.5) * 0.045),
    );
    const blocks = 132 + Math.round(random() * 22);
    return {
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      blocks,
      flagged: Math.round(blocks * share),
      feeRate: Math.round(feeRate * 10) / 10,
    };
  });
}

export const DAYS: DayBucket[] = buildDays();

export function flagShare(day: DayBucket): number {
  return day.flagged / day.blocks;
}

/**
 * One day's blocks, flagged or not. Runs rather than a coin flip per block:
 * a pool that just won a private-order-flow deal wins several blocks in a
 * row, so the real ribbon clusters.
 */
export function blocksOfDay(index: number): boolean[] {
  const day = DAYS[index];
  const random = mulberry32(0xb10c + index * 2654435761);
  const out: boolean[] = [];
  let remaining = day.flagged;
  while (out.length < day.blocks) {
    const left = day.blocks - out.length;
    const gapRoom = left - remaining;
    if (remaining <= 0) {
      out.push(false);
      continue;
    }
    if (gapRoom <= 0) {
      out.push(true);
      remaining -= 1;
      continue;
    }
    const gap = 1 + Math.floor(random() * Math.min(gapRoom, 6));
    for (let i = 0; i < gap; i += 1) out.push(false);
    const run = 1 + Math.floor(random() * Math.min(remaining, 4));
    for (let i = 0; i < run; i += 1) out.push(true);
    remaining -= run;
  }
  return out.slice(0, day.blocks);
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * p;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

export function pearson(a: number[], b: number[], lag = 0): number {
  const x = lag > 0 ? a.slice(0, a.length - lag) : a;
  const y = lag > 0 ? b.slice(lag) : b;
  const n = Math.min(x.length, y.length);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a0 = x[i] - mx;
    const b0 = y[i] - my;
    num += a0 * b0;
    dx += a0 * a0;
    dy += b0 * b0;
  }
  return num / Math.sqrt(dx * dy);
}

/** The lag, in days, at which the two series line up best. */
export function bestLag(a: number[], b: number[], maxLag = 10): number {
  let best = 0;
  let bestR = -Infinity;
  for (let lag = 0; lag <= maxLag; lag += 1) {
    const r = pearson(a, b, lag);
    if (r > bestR) {
      bestR = r;
      best = lag;
    }
  }
  return best;
}

export interface Frame {
  width: number;
  /** Where the two mirrored bands meet. */
  axisY: number;
  /** Tallest either band gets. */
  extent: number;
}

export const FRAME: Frame = { width: 720, axisY: 108, extent: 96 };

export function xAt(index: number, count = DAYS.length): number {
  return (index / (count - 1)) * FRAME.width;
}

export type Scale = "linear" | "log";

/**
 * Fee rate spans 1.4 → 350 sat/vB, so a linear band pins two years of
 * ordinary days flat against the axis and shows only the spikes. Log keeps
 * the quiet weeks readable — and the band is labelled "log", because a log
 * band's shape is not the growth's shape.
 */
function norm(value: number, max: number, scale: Scale): number {
  const clamped = Math.min(max, Math.max(0, value));
  if (scale === "linear") return clamped / max;
  return Math.log10(1 + clamped) / Math.log10(1 + max);
}

/**
 * A mirrored band: `up` draws above the axis, otherwise below. Each band is
 * normalised against its own max — sat/vB and a percentage have nothing to
 * say to each other on one scale.
 */
export function bandLine(
  values: number[],
  max: number,
  up: boolean,
  scale: Scale = "linear",
): string {
  return values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)} ${bandY(v, max, up, scale).toFixed(2)}`,
    )
    .join(" ");
}

/** The same line closed down to the axis, for the fill only — stroking this
    would paint the baseline and the left edge as if they were data. */
export function bandPath(
  values: number[],
  max: number,
  up: boolean,
  scale: Scale = "linear",
): string {
  return `${bandLine(values, max, up, scale)} L${FRAME.width} ${FRAME.axisY} L0 ${FRAME.axisY} Z`;
}

export function bandY(
  value: number,
  max: number,
  up: boolean,
  scale: Scale = "linear",
): number {
  const { axisY, extent } = FRAME;
  const h = norm(value, max, scale) * extent;
  return up ? axisY - h : axisY + h;
}

/** First day of each month that starts a quarter, for the axis ticks. */
export function quarterTicks(): { index: number; label: string }[] {
  const out: { index: number; label: string }[] = [];
  DAYS.forEach((day, index) => {
    const [year, month, dayOfMonth] = day.date.split("-");
    if (dayOfMonth !== "01") return;
    if (!["01", "04", "07", "10"].includes(month)) return;
    const quarter = Math.floor(Number(month) / 3) + 1;
    out.push({ index, label: `${year.slice(2)}·Q${quarter}` });
  });
  return out;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const names = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  return `${day} ${names[Number(month) - 1]} ${year}`;
}
