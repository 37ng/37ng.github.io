# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # dev server at localhost:4321
npm run build         # production build
npm run preview       # preview the production build
npm run format        # prettier --write
npm run format:check  # prettier --check
npx astro check       # type-check .astro files
```

Prettier runs automatically on staged files via the `.githooks/pre-commit` hook. No test suite is configured.

## Website structure

- **The stage** (`src/components/HeroStage.astro`): one full-screen subject at a time — backdrop art, live furniture (the bitcoin coin), and the bottom-left caption, all belonging to the same post and swapping together. Every post in the fan has a stage; a post with no `heroImage` gets `stages/PaperSheet.astro`, a sheet of manila with the site's own spec in its corner — and `index.astro` derives `light` for it rather than reading `stageTone`, since paper is always light and trusting the field there fails invisibly (white type on cream) instead of visibly. **The homepage does not scroll** — every layer is fixed to the viewport and the fan is the only way through the work; `LANDING_STAGE` in `index.astro` is what a first visit sees. Which subject is up is `<html data-stage="…">`. Hovering a card is the only thing that writes it (`setStage`, `src/lib/stage.ts`) and **nothing clears it**: a stage stays up after the fan drops, and is saved to `sessionStorage` so opening a post and coming home returns you to it rather than to the landing stage. **Visibility is pure CSS, and it has to be** — the browser paints `HeroStage`'s markup long before the island hydrates, so a stage chosen in JSX shows the landing stage first and cross-fades off it on the way home. So `HeroStage.astro` renders every stage and holds no state — it is **not an island**; only `<BitcoinCoin3D client:idle />` inside it runs on the client. The per-id rules and the `<head>` bootstrap that sets `data-stage` before the body is parsed are both **generated from the post list in `index.astro`** (adding a post needs no edit). Adding new per-stage furniture means writing another block in `HeroStage.astro` by hand: a client directive is compile-time, so it can't be looked up from a map the way the old React version did. Two traps if you touch that bootstrap: the storage key must stay in step with `stage.ts`, and it must stay one `var`-only IIFE — a view transition re-executes it in the same window, so a top-level `const` (what `define:vars` emits) throws on the second run. It also re-applies on `astro:after-swap`, since a swap replaces `<html>`'s attributes.
- **Stage → post**: clicking the stage caption opens that blog post, which has richer interactive animations per concept and an optional link to the project's GitHub repo.
- **Index**: `src/components/PostsFan.tsx` (`client:load`) — a hand of cream index cards fanned along the bottom edge of the landing page. It is furniture, not an overlay: `--fan-peek` of each card stays on screen at rest, and the hand rises when the pointer reaches it (or on focus, or on tap). Every card is a link — hovering raises that post onto the stage (`setStage`), which is also what lifts the card out of the hand; the fan keeps no selection state of its own. While the hand is up, the card's title and description are written centered above it and the stage caption steps aside — same content, only the position changes, so lowering the hand is a handover rather than a reset. Card **N-000** is the prologue: not a bespoke component, just `src/content/blog/prologue.mdx` pinned first by `CURATED_ORDER` in `PostsFan.tsx`, same as every other post. Live per-stage furniture (the bitcoin coin) lives in `STAGE_FURNITURE` in `HeroStage.tsx`, mounted once into a fixed layer rather than inside a snap section: a card can raise it from any scroll position, and one WebGL context is enough.
- **Header**: site label on the left, live clock on the right. No nav links.

## Blog

Each blog is an MDX file that combines article content with interactive illustrations — whether it's explaining Bitcoin with visual demos or showcasing mini-mpt and rust-vecdb with conceptual, hand-built animations. Everything appears as a unified feed of interactive, aesthetic pieces on 37ng.github.io; the real, fully functional demos live in each project's own repo (or, for mini-mpt/rust-vecdb, the GPUI desktop app).

## Architecture

**Static site with React islands.** Astro renders everything to static HTML by default. React is only used for interactive components, which must be explicitly hydrated with `client:load` or `client:visible` directives at the MDX/Astro call site.

**Routing:** File-based. `src/pages/index.astro` is the homepage. `src/pages/blog/[slug].astro` is the dynamic blog route — it calls `getStaticPaths()` to pre-render one page per MDX post at build time.

**Content:** Blog posts live in `src/content/blog/*.mdx`. The schema (title, description, date, tags) is enforced in `src/content.config.ts` via Zod. Posts can import and render any React component inline.

**Per-post color — two axes, deliberately separate.** `color` in frontmatter is **identity**: one custom hue per post, free to be loud, never required to be legible over anything. It drives `--hero-accent` (the fan's `N-00x · date` line, the stage caption's hover) and the post page's own `--accent`. `stageTone: "dark" | "light"` is **legibility**: it declares whether that post's hero art is dark or light, and selects a whole set of readable tones — `--stage-title` and `--stage-body` for the caption, and the same `--stage-title` for the header chrome (site label + clock), which sits directly on the art. Both are emitted as per-id rules generated in `index.astro`; the light pair is named in `global.css` (`--stage-title-light`/`--stage-body-light`) because Tailwind drops any `@theme` token that nothing in that stylesheet references, and the generated CSS is invisible to it. A post that sets neither gets signal orange and the dark tones.

**Light theme — dark is blueprint, light is paper.** `ThemeToggle.tsx` sits beside `LangToggle` in the post header and pins `<html data-theme>`, persisted to `localStorage` (a reading preference outlives a visit, unlike the homepage stage's `sessionStorage`). No component knows about it: `global.css` re-points the whole `--color-ink-*` ramp at warm paper tones, and since that ramp is a _value_ ramp (950 furthest back, 50 furthest forward) every existing `bg-ink-900`/`text-ink-300` flips at once with its contrast relationship intact. **It is scoped `html[data-theme="light"]:has(#post)`** — the homepage is full-bleed art whose legibility comes from each post's `stageTone`, and inverting the ramp under it would put near-black type on a dark photograph. `--color-ink-400` is pinned by measured contrast (4.6:1), not by eye, because it carries the date and every mono label. The `<head>` bootstrap in `BaseLayout.astro` resolves `localStorage` then `prefers-color-scheme` before the body is parsed, and the toggle ships both glyphs with CSS hiding one — picking in JSX would flip the icon at hydration, which is the flash the bootstrap exists to prevent. Same `var`-only IIFE + `astro:after-swap` rules as the stage bootstrap.

**Design tokens:** All colors, fonts, and spacing live in `src/styles/global.css` under the `@theme` block (Tailwind v4 CSS-native config). Tailwind generates utility classes directly from these CSS variables — e.g. `bg-ink-900`, `text-signal-500`. Never hardcode colors in components; always use token-derived utilities.

**Design language:** "Engineering plan set / spec sheet." Cold blue-slate `ink` neutrals + one oxide-orange `signal` accent (`#c2410c`-family) — signal appears only on rules, indices, and hover states, never on body text. Mono (`font-mono`, JetBrains Mono) carries all UI chrome — nav, labels, dates — uppercase with wide tracking (enforced globally by a `.font-mono` rule in `global.css`, not per-component). Fraunces drives its variable axes (`opsz`/`SOFT`/`WONK`) on every heading, sitewide, not just in prose. Zero radius everywhere (`--radius-*: 0`); panels use hairline rules (`shadow-panel` token), not blurred drop shadows. Interactions are mechanical — no opacity fades or translate-Y lifts; see `.spec-card` (hard offset border, print-misregistration style) and `.nav-index` (mono index number that shutters open, not fades in) in `global.css`. Apply `prose-tech` class to article content for the blog prose styles — includes auto-numbered `§01`/`§02` section counters on `h2`. Every `h2`/`h3` also gets a hover-revealed `#` permalink (`.heading-anchor`, injected at build time by `rehype-autolink-headings` in `astro.config.mjs`).

**Interactive diagrams:** `src/components/diagrams/` holds heavier React components (e.g. `BitcoinCoin3D.tsx`, `three` + `@react-three/fiber`). They must be hydrated explicitly at the call site — `client:load` in MDX posts, `client:idle` for the stage furniture in `HeroStage.astro`.

**Path alias:** `@/` maps to `src/` (used in MDX imports like `import { FlowDiagram } from '@/components/diagrams/FlowDiagram'`).

**Bilingual posts:** every post is authored in English and Chinese. Mark each language block with a plain `lang="en"` / `lang="zh"` attribute directly in the MDX body (no import needed). `PostLayout.astro` renders the EN/中文 toggle (`LangToggle.tsx`) next to the date, in the header; `data-lang="en"` lives on `<main id="post">` — the common ancestor of both the title (`<h1 lang="en">`/`<h1 lang="zh">`, from optional `titleZh` frontmatter) and the article body — so one attribute flip covers both. `LangToggle` and the rest of the page are separate islands with no shared React state: the toggle flips `#post`'s `data-lang` attribute directly by id, and the `[data-lang]` CSS rules in `global.css` do the actual show/hide. See `bitcoin.mdx` for the content pattern.

**Chinese typography:** driven entirely off `:lang(zh)` in `global.css` (not a class), so it applies to any correctly-tagged element automatically — Noto Serif SC (self-hosted via `@fontsource/noto-serif-sc`, imported in `BaseLayout.astro`) for both body and headings, Fraunces kept first in the stack only to catch stray Latin/digits since it has no CJK glyphs itself; looser line-height, positive letter-spacing, a slight size step-down, `font-synthesis: none`, and dot emphasis instead of italic. `src/lib/rehype-pangu-spacing.ts` (wired via `markdown.processor` in `astro.config.mjs`) inserts real thin-space (U+2009) characters between Han and Latin/digit runs at build time — note MDX parses `<div lang="zh">` as `mdxJsxFlowElement`/`mdxJsxTextElement`, not a plain hast `element`, which the plugin has to check for explicitly.

## Adding content

**New blog post:** Create `src/content/blog/my-post.mdx` with frontmatter:

```mdx
---
title: "Post title"
description: "Optional summary"
date: "2026-01-15"
tags: ["tag1"]
---
```

Import React components at the top of the MDX file and hydrate with `client:load` where needed.

**New UI primitive:** Follow the pattern in `components/ui/Button.tsx` — typed variant maps, no data fetching, Tailwind token classes only.

**Fonts:** Fraunces (variable, `opsz`/`SOFT`/`WONK` axes), Inter, and JetBrains Mono are loaded via a Google Fonts `<link>` in `BaseLayout.astro`'s `<head>` — no `@fontsource/*` packages installed.

## Misc

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): prefix with `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, etc. These map to Semantic Versioning bumps (`feat` → minor, `fix` → patch, `BREAKING CHANGE:` footer or `!` after the type → major).
