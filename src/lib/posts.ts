import { getCollection, type CollectionEntry } from "astro:content";

/** All posts, newest first. The fan's own order is pinned in lib/fan.ts. */
export async function getSortedPosts(): Promise<CollectionEntry<"posts">[]> {
  const posts = await getCollection("posts");
  return posts.sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );
}
