import { visitParents } from "unist-util-visit-parents";
import { pangu } from "pangu";
import type { Root, Element, Text } from "hast";
import type {
  MdxJsxFlowElementHast,
  MdxJsxTextElementHast,
} from "mdast-util-mdx-jsx";

const SKIP_TAGS = new Set(["code", "pre", "script", "style"]);

/**
 * pangu.spacingText() inserts a plain space (U+0020) at every CJK/Latin-or-digit
 * boundary but never touches anything else — it only ever adds characters, never
 * removes or reorders them. So a lock-step walk against the original string can
 * tell inserted spaces apart from spaces the author already typed (e.g. between
 * two English words embedded in Chinese prose): where the two strings still
 * match, keep the original character; wherever pangu's output has an extra
 * character, that's a boundary space, swapped for a real thin space (U+2009)
 * instead of pangu's default full space.
 */
function panguThinSpace(text: string): string {
  const spaced = pangu.spacingText(text);
  let result = "";
  let i = 0;
  let j = 0;
  while (j < spaced.length) {
    if (i < text.length && spaced[j] === text[i]) {
      result += spaced[j];
      i++;
      j++;
    } else {
      result += " "; // thin space (U+2009), not pangu's default full space
      j++;
    }
  }
  return result;
}

type MdxJsxElement = MdxJsxFlowElementHast | MdxJsxTextElementHast;
type LangAncestor = Element | MdxJsxElement;

function isMdxJsxElement(node: unknown): node is MdxJsxElement {
  const type = (node as { type?: string }).type;
  return type === "mdxJsxFlowElement" || type === "mdxJsxTextElement";
}

function tagName(node: LangAncestor): string | undefined {
  return isMdxJsxElement(node) ? (node.name ?? undefined) : node.tagName;
}

/**
 * .mdx files author `<div lang="zh">` as literal JSX — through the rehype phase
 * that stays an mdxJsxFlowElement/mdxJsxTextElement node (attributes in an
 * `attributes` array), not a plain hast `element` (properties.lang). Plain
 * markdown's HTML-in-Markdown, by contrast, produces real hast elements. Every
 * post in this repo is .mdx, so the JSX shape is the one that actually matters,
 * but both are handled since either could appear.
 */
function langOf(node: LangAncestor): string | undefined {
  if (isMdxJsxElement(node)) {
    const attr = node.attributes.find(
      (a) => a.type === "mdxJsxAttribute" && a.name === "lang",
    );
    return typeof attr?.value === "string" ? attr.value : undefined;
  }
  const lang = node.properties?.lang;
  return typeof lang === "string" ? lang : undefined;
}

function nearestLang(ancestors: LangAncestor[]): string | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const lang = langOf(ancestors[i]);
    if (lang) return lang;
  }
  return undefined;
}

/**
 * Build-time rehype plugin: inserts thin spaces at Han/Latin and Han/digit
 * boundaries inside lang="zh" content, baked into the static HTML rather than
 * depending on CSS text-autospace (not yet broadly supported).
 */
export function rehypePanguSpacing() {
  return (tree: Root) => {
    visitParents(tree, "text", (node: Text, ancestors) => {
      const langAncestors = ancestors.filter(
        (a): a is LangAncestor => a.type === "element" || isMdxJsxElement(a),
      );
      if (
        langAncestors.some((a) => {
          const t = tagName(a);
          return t !== undefined && SKIP_TAGS.has(t);
        })
      ) {
        return;
      }
      if (nearestLang(langAncestors) !== "zh") return;
      node.value = panguThinSpace(node.value);
    });
  };
}

export default rehypePanguSpacing;
