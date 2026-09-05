import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/posts" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      date: z.string(),
      updated: z.string().optional(),
      tags: z.array(z.string()).default([]),
      feat: z.boolean(), // whether this is showed in main stage
      stageImage: image().optional(),
      stageTone: z.enum(["dark", "light"]).default("dark"),
      color: z.string().optional(),
      github: z.url().optional(),
    }),
});

export const collections = { posts };
