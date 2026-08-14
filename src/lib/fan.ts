/**
 * The fan's order, and the index number that comes out of it.
 *
 * Shared rather than owned by PostsFan because two things now show that
 * number: the raised panel above the hand, and the stage caption underneath
 * it. They are different components on different sides of the hydration line —
 * one React island, one static Astro — so the order has to live somewhere both
 * can reach, or the same post gets two different numbers.
 */

/** Curated order for the fan — edit this to reorder. Anything not listed falls in after, newest first. */
export const CURATED_ORDER: string[] = ["prologue", "bitcoin", "rust-vecdb"];

export function sortCurated<T extends { id: string; date: string }>(
  posts: T[],
): T[] {
  return [...posts].sort((a, b) => {
    const rankA = CURATED_ORDER.indexOf(a.id);
    const rankB = CURATED_ORDER.indexOf(b.id);
    const ra = rankA === -1 ? CURATED_ORDER.length : rankA;
    const rb = rankB === -1 ? CURATED_ORDER.length : rankB;
    if (ra !== rb) return ra - rb;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export const cardNo = (i: number) => String(i).padStart(3, "0");
