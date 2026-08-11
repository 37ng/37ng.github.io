import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      titleZh: z.string().optional(),
      description: z.string().optional(),
      descriptionZh: z.string().optional(),
      date: z.string(),
      tags: z.array(z.string()).default([]),
      heroImage: image().optional(),
      github: z.url().optional(),
      /* This post's one custom color. It carries identity, not legibility —
         the index line on the fan, the caption's hover, and the post page's
         own accent. Anything that has to stay readable over the art reads
         stageTone instead. */
      color: z.string().optional(),
      /* Whether this post's hero art is dark or light. Picks the whole set of
         readable tones for that stage: caption title and body, and the header
         chrome above it. A light backdrop can't use ink meant for a dark one,
         and it can't recede behind the fan the same way either.

         Only consulted when the post actually has heroImage. Without one the
         backdrop is PaperSheet, and index.astro derives light from that — the
         default here would otherwise put white type on cream, which fails
         invisibly instead of visibly. */
      stageTone: z.enum(["dark", "light"]).default("dark"),
    }),
});

export const collections = { blog };
