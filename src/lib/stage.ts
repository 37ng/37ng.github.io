/** How bright a backdrop is, and therefore what colour the type over it takes. */
export type StageTone = "dark" | "light";

export interface StageSummary {
  id: string;
  title: string;
  description?: string;
  /** Written beside the index number on the caption. */
  date: string;
  /** Identity, not legibility — the index line, the caption hover, the post page. */
  color?: string;
  /** Full-bleed art for the backdrop. Absent means the fallback sheet. */
  stageImage?: string;
  /** Only meaningful alongside stageImage — see backdropFor. */
  stageTone?: StageTone;
}

/**
 * What a stage draws behind everything, and how bright that is.
 *
 * The tone belongs to the backdrop, not to the post. That is the whole point
 * of this type: whatever decides *what* gets drawn also decides what colour
 * the type over it has to be, so the two can never drift apart. Add a variant
 * and the union makes you state its tone.
 */
export type Backdrop =
  | { kind: "art"; src: string; tone: StageTone }
  | { kind: "paper"; tone: "light" };

/**
 * The fallback backdrop: PaperSheet, which is manila. Its tone is a fact
 * about that component, declared here because this is where the fact is used.
 * If it ever stops being pale, change it here and every reader follows.
 */
const PAPER = { kind: "paper", tone: "light" } as const satisfies Backdrop;

export function backdropFor(stage: StageSummary): Backdrop {
  return stage.stageImage
    ? { kind: "art", src: stage.stageImage, tone: stage.stageTone ?? "dark" }
    : PAPER;
}

const EVENT = "stage:change";
// Read back by the bootstrap script in index.astro, which restores the stage
// before the page is painted. Keep the key in step with it.
const SAVED_STAGE = "stage";

// The live state is on <html> and the bus is a window event, rather than a
// module-level variable. Three unrelated things read it — the generated CSS
// that shows the stage, the head bootstrap in index.astro, and PostsFan — and
// only the last of those is React at all.
export function getStage(): string {
  if (typeof document === "undefined") return "";
  return document.documentElement.dataset.stage ?? "";
}

export function setStage(id: string): void {
  if (typeof document === "undefined" || getStage() === id) return;
  document.documentElement.dataset.stage = id;
  try {
    sessionStorage.setItem(SAVED_STAGE, id);
  } catch {
    // Storage throws outright in some privacy modes, and a lost stage is not
    // worth taking the page down for.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeStage(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** No DOM to read during SSR — PostsFan falls back to its middle card. */
export const stageServerSnapshot = (): string => "";
