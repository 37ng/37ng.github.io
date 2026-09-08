interface PrologueSheetProps {
  /** SVG filter ids are document-global, so each sheet on the page needs
      its own or they collide. */
  filterId: string;
  /** The card thumbnail rules the grid at a smaller cell size, so the sheet
      reads as a miniature rather than a 1:1 crop of the full backdrop. */
  grid?: "stage" | "card";
}

/**
 * A sheet of manila drawing paper: the prologue's backdrop, and the same look
 * on the prologue's card in the fan. It belongs to that one post — no other
 * post falls back to it. Its tone is declared as `PAPER` in src/lib/stage.ts,
 * which is what tells the caption to use dark ink — if this ever stops being
 * pale, change it there too.
 *
 * React rather than Astro so both homes draw one copy of the signature. The
 * stage renders it with no client directive, so it stays static HTML.
 */
export function PrologueSheet({
  filterId,
  grid = "stage",
}: PrologueSheetProps) {
  return (
    <div className="paper-sheet absolute inset-0">
      <div
        className={
          grid === "card"
            ? "paper-grid paper-grid-card absolute inset-0"
            : "paper-grid absolute inset-0"
        }
      />

      {/* Pencil marks on the sheet. Drawn, not photographed — the wobble is a
          displacement filter over clean paths, which is what keeps a
          hand-drawn look at any viewport size without shipping an image.

          Placed away from the bottom-left caption and the fan's own strip. The
          plane sits near the horizontal centre on purpose: the viewBox is
          sliced, so on a phone only the middle band survives and anything
          parked at an edge is cropped out entirely. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves={3}
            seed={7}
            result="grain"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="grain"
            scale={3}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* A signature, in two strokes — the long one the hand makes without
            lifting, and the short flick that follows it. Written as beziers
            rather than traced from an image, so it scales with the sheet; the
            displacement filter above is what keeps it off a machine curve. It
            signs nothing and spells nothing. */}
        <g className="paper-doodle" filter={`url(#${filterId})`}>
          <path d="M300 430 C430 355 590 320 720 336 C660 405 545 500 470 585 C440 625 470 648 505 612 C524 562 542 498 566 498 C592 498 602 578 628 578 C656 578 664 534 690 534 C716 534 724 574 752 574 C778 574 786 550 812 550 C838 550 846 570 872 566 C888 562 898 550 908 530" />
          <path d="M980 384 C1006 326 1016 294 1024 352 C1032 296 1050 282 1064 318 C1078 350 1104 354 1130 318" />
        </g>
      </svg>

      <div className="paper-fibre absolute inset-0" />
    </div>
  );
}
