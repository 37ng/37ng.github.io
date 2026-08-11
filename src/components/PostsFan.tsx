import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  getStage,
  setStage,
  stageServerSnapshot,
  subscribeStage,
} from "@/lib/stage";

export interface PostSummary {
  id: string;
  title: string;
  description?: string;
  date: string;
  heroImage?: string;
}

interface PostsFanProps {
  posts: PostSummary[];
}

/** Curated order for the fan — edit this to reorder. Anything not listed falls in after, newest first. */
const CURATED_ORDER: string[] = [
  "prologue",
  "bitcoin",
  "mini-mpt",
  "rust-vecdb",
];

function sortCurated(posts: PostSummary[]): PostSummary[] {
  return [...posts].sort((a, b) => {
    const rankA = CURATED_ORDER.indexOf(a.id);
    const rankB = CURATED_ORDER.indexOf(b.id);
    const ra = rankA === -1 ? CURATED_ORDER.length : rankA;
    const rb = rankB === -1 ? CURATED_ORDER.length : rankB;
    if (ra !== rb) return ra - rb;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

const cardNo = (i: number) => "N-" + String(i).padStart(3, "0");

/**
 * The homepage index, as a hand of cream index cards held at the bottom edge.
 * It is not an overlay any more — the fan is the landing page's own furniture:
 * always on screen, peeking above the bottom edge, rising when the pointer
 * reaches it. The stage behind it — backdrop, live furniture and caption —
 * stays alive underneath, pushed back and desaturated via the
 * `data-posts-open` bridge in global.css.
 *
 * Hovering a card raises that post's stage (src/lib/stage.ts), which is also
 * what lifts the card: the stage is the single source of truth, shared with
 * HeroStage, and nothing clears it. So the last card you touched is still the
 * stage after the fan drops. The prologue (id "prologue") is just another post
 * in `posts` — pinned first by CURATED_ORDER — not a bespoke card, so it goes
 * through this same rendering and linking path.
 */
export function PostsFan({ posts }: PostsFanProps) {
  const sorted = sortCurated(posts);
  const count = sorted.length;
  const mid = (count - 1) / 2;

  const [raised, setRaised] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const sensorRef = useRef<HTMLDivElement>(null);
  const raisedRef = useRef(raised);

  raisedRef.current = raised;

  const stageId = useSyncExternalStore(
    subscribeStage,
    getStage,
    stageServerSnapshot,
  );
  const found = sorted.findIndex((post) => post.id === stageId);
  const active = found === -1 ? Math.floor(mid) : found;
  const activePost = sorted[active];

  // Raising and lowering are decided from pointer geometry rather than from
  // enter/leave on the dock: the dock is pointer-events:none (so the hero
  // stays reachable through the gaps between cards), and an element that
  // never receives the pointer never fires a leave event either.
  useEffect(() => {
    // Measured once per resize rather than per move: the reach zone only
    // depends on the viewport (its width is a calc() over vw-based clamps),
    // and a getBoundingClientRect on every pointermove forces a layout.
    let reach = sensorRef.current?.getBoundingClientRect() ?? null;
    const measure = () => {
      reach = sensorRef.current?.getBoundingClientRect() ?? null;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (raisedRef.current) {
        // Measured against the cards themselves, not the dock: the dock's box
        // reaches all the way up past the caption, which meant the hand stayed
        // up until you had travelled the whole height of the title to get out
        // of it. Read live rather than cached — it tracks the lifted card, so
        // it moves whenever a different card takes the stage.
        const fan = fanRef.current;
        const lifted = fan?.querySelector<HTMLElement>('[data-active="true"]');
        const cards = (lifted ?? fan)?.getBoundingClientRect();
        if (!cards) return;
        const off =
          e.clientY < cards.top - 8 ||
          (reach !== null &&
            (e.clientX < reach.left || e.clientX > reach.right));
        if (off) setRaised(false);
        return;
      }
      if (
        reach &&
        e.clientY >= reach.top &&
        e.clientX >= reach.left &&
        e.clientX <= reach.right
      ) {
        setRaised(true);
      }
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.postsOpen = raised ? "true" : "false";
    if (!raised) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRaised(false);
    };
    // Touch has no hover, so the geometry above never lowers the fan for it —
    // a press anywhere outside the dock is what puts the cards back down.
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if (!dockRef.current?.contains(e.target as Node)) setRaised(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [raised]);

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.postsOpen;
    };
  }, []);

  // A click on a resting card raises the fan instead of opening the post —
  // on touch there is no hover pass to raise it first, and on mouse a click
  // on the sliver that shows is more likely a reach for the stack than for
  // that one post.
  const guardTap = (e: { preventDefault: () => void }) => {
    if (!raisedRef.current) {
      e.preventDefault();
      setRaised(true);
    }
  };

  return (
    <div style={{ "--fan-count": count } as CSSProperties}>
      <div
        ref={sensorRef}
        aria-hidden="true"
        onClick={() => setRaised(true)}
        style={{ pointerEvents: raised ? "none" : "auto" }}
        className="posts-sensor"
      />

      <div
        ref={dockRef}
        // Keyboard gets the same affordance the pointer does: tabbing into a
        // card raises the hand, tabbing back out puts it down.
        onFocusCapture={() => setRaised(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setRaised(false);
          }
        }}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center px-6 pb-6 text-center"
      >
        <div
          style={{ pointerEvents: raised ? "auto" : "none" }}
          className={`mb-32 max-w-md transition-opacity duration-500 motion-reduce:duration-0 sm:mb-40 ${
            raised ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* The hovered card is the stage, so this panel wears the stage's
              own variables rather than reading activePost.color itself —
              --hero-accent for the index line, and the same title/body ink
              the stage caption uses, which is what keeps this readable over a
              light backdrop instead of white-on-manila. */}
          {activePost && (
            <div>
              <p className="font-mono text-xs text-[var(--hero-accent,var(--color-signal-500))]">
                {cardNo(active)} · {activePost.date}
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--stage-title,var(--color-ink-50))] sm:text-4xl">
                {activePost.title}
              </h2>
              {activePost.description && (
                <p className="mt-2 font-[family-name:var(--font-display)] text-[var(--stage-body,var(--color-ink-300))]">
                  {activePost.description}
                </p>
              )}
            </div>
          )}
        </div>

        <div ref={fanRef} data-raised={raised} className="posts-fan w-full">
          {sorted.map((post, i) => (
            <a
              key={post.id}
              href={`/blog/${post.id}`}
              onMouseEnter={() => setStage(post.id)}
              onFocus={() => setStage(post.id)}
              onClick={guardTap}
              data-active={active === i}
              style={{ "--d": i - mid, "--i": i } as CSSProperties}
              className="posts-fan-card pointer-events-auto block overflow-hidden bg-paper-200 no-underline"
            >
              <div className="relative m-3 h-[38%] overflow-hidden">
                {post.heroImage ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${post.heroImage})`,
                      filter: "saturate(0.86) contrast(1.02)",
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-paper-100 to-paper-200" />
                )}
              </div>
              <div className="relative px-3.5 pt-1 font-[family-name:var(--font-display)] text-[15px] leading-[1.12] font-semibold text-paper-ink">
                {post.title}
              </div>
              <div className="absolute right-3.5 bottom-3 left-3.5 flex justify-between font-mono text-[9px] text-paper-muted">
                <span>{cardNo(i)}</span>
                <span>{post.date}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PostsFan;
