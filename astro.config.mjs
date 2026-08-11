// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { unified, rehypeHeadingIds } from "@astrojs/markdown-remark";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { rehypePanguSpacing } from "./src/lib/rehype-pangu-spacing.ts";

// https://astro.build/config
export default defineConfig({
  site: "https://37ng.github.io",
  integrations: [react(), mdx()],
  markdown: {
    processor: unified({
      rehypePlugins: [
        // Astro's own heading-id step normally runs *after* user rehypePlugins,
        // so rehypeAutolinkHeadings below would find headings with no `id` yet
        // and silently skip them. Running the same id generator here first
        // (Astro's internal one still runs again later — a harmless no-op once
        // ids exist) fixes that without duplicating its slugging logic.
        rehypeHeadingIds,
        rehypePanguSpacing,
        [
          rehypeAutolinkHeadings,
          {
            // "wrap" puts the whole heading text inside the <a>, not just the
            // "#" — so hovering/clicking the heading title itself does the
            // same thing as hovering/clicking the "#".
            behavior: "wrap",
            properties: {
              className: ["heading-anchor"],
              ariaLabel: "link to this section",
            },
            // The "#" stays its own span so it can still be styled/hover-
            // revealed independently of the heading text around it. Must be a
            // plain node, not a function — with behavior:"wrap", a function
            // *replaces* the heading's existing text instead of appending
            // after it.
            content: {
              type: "element",
              tagName: "span",
              properties: { className: ["heading-anchor-glyph"] },
              children: [{ type: "text", value: "#" }],
            },
          },
        ],
      ],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
