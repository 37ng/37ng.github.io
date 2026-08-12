/**
 * Turns a full-size master in `art-src/` into the one committed webp the site
 * builds from, in `src/assets/`.
 *
 * Why this exists rather than handing the master to Astro: a master is tens of
 * megabytes of lossless pixels, and committing one puts it in git history
 * forever — a second version doubles it, and no amount of build-time
 * optimisation takes it back out. So masters stay out of the repo (`art-src/`
 * is gitignored) and only this derivative is committed.
 *
 * It emits the *stage* width only. The card thumbnail is still Astro's job:
 * `index.astro` runs this file through `getImage()` to get the small one, the
 * same as before. This script exists to cap what enters git, not to replace
 * the build's image pipeline.
 *
 * Run it when a master changes, not on every build.
 *
 *   npm run art                        # every master, default quality
 *   npm run art -- --quality 100       # lossless-ish, bigger file
 *   npm run art -- --sizes 1920        # a different stage width
 *   npm run art -- bitcoin             # just one master, by name
 */
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC_DIR = "art-src";
const OUT_DIR = "src/assets";
/** The full-bleed stage width. Astro derives every smaller size from it. */
const DEFAULT_SIZES = [2560];
const DEFAULT_QUALITY = 90;
const MASTERS = /\.(png|jpe?g|tiff?|webp)$/i;

function parseArgs(argv) {
  const names = [];
  let quality = DEFAULT_QUALITY;
  let sizes = DEFAULT_SIZES;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--quality") {
      quality = Number(argv[(i += 1)]);
    } else if (arg === "--sizes") {
      sizes = argv[(i += 1)]
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(Boolean);
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      names.push(arg);
    }
  }

  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error(`--quality must be 1..100, got ${quality}`);
  }
  if (sizes.length === 0) throw new Error("--sizes needs at least one width");

  return { names, quality, sizes };
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

const { names, quality, sizes } = parseArgs(process.argv.slice(2));

const entries = (await readdir(SRC_DIR)).filter(
  (file) =>
    MASTERS.test(file) &&
    (names.length === 0 || names.includes(path.parse(file).name)),
);

if (entries.length === 0) {
  console.error(
    names.length > 0
      ? `no master in ${SRC_DIR}/ matching: ${names.join(", ")}`
      : `no masters in ${SRC_DIR}/`,
  );
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
console.log(`webp q${quality} · widths ${sizes.join(", ")}`);

for (const file of entries) {
  const name = path.parse(file).name;
  const source = path.join(SRC_DIR, file);
  const master = await stat(source);
  console.log(`\n${name}  (master ${kb(master.size)})`);

  for (const width of sizes) {
    // withoutEnlargement: a master narrower than the target is left alone
    // rather than upscaled into a bigger file with no more detail in it.
    const buffer = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    // One width per master is the normal case, so the plain name is the file
    // the posts import. A second --sizes entry gets the width appended rather
    // than silently overwriting the first.
    const out = path.join(
      OUT_DIR,
      sizes.length === 1 ? `${name}.webp` : `${name}-${width}.webp`,
    );
    await writeFile(out, buffer);
    console.log(`  ${out}  ${kb(buffer.length)}`);
  }
}
