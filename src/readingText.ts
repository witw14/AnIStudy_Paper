import type { ReadingAnnotation, ReadingBlock } from "./types";

export function textRange(element: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0,
    begun = false;
  while (walker.nextNode()) {
    const node = walker.currentNode,
      length = node.textContent?.length || 0;
    if (!begun && start <= offset + length) {
      range.setStart(node, Math.max(0, start - offset));
      begun = true;
    }
    if (begun && end <= offset + length) {
      range.setEnd(node, Math.max(0, end - offset));
      return range;
    }
    offset += length;
  }
  return null;
}

export function searchOccurrences(blocks: ReadingBlock[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return blocks.flatMap((block) => {
    const text = block.text.toLocaleLowerCase(),
      hits = [];
    let start = text.indexOf(needle);
    while (start >= 0) {
      hits.push({ blockId: block.id, start, end: start + needle.length });
      start = text.indexOf(needle, start + needle.length);
    }
    return hits;
  });
}

// Only decorate text nodes in HTML already sanitized by the server. Keeping the
// text unchanged preserves stored offsets, including selections across tags.
export function annotatedHtml(html: string, annotations: ReadingAnnotation[]) {
  if (!annotations.length) return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let offset = 0;
  for (const node of nodes) {
    const value = node.data,
      start = offset,
      end = start + value.length;
    offset = end;
    // HTML marks must not be inserted into MathML; CSS Highlights still paint it.
    if (node.parentElement?.closest("math")) continue;
    const relevant = annotations.filter((a) => a.start < end && a.end > start);
    if (!relevant.length) continue;
    const boundaries = [
      ...new Set([
        start,
        end,
        ...relevant.flatMap((a) => [
          Math.max(start, a.start),
          Math.min(end, a.end),
        ]),
      ]),
    ].sort((a, b) => a - b);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < boundaries.length - 1; i++) {
      const from = boundaries[i],
        to = boundaries[i + 1];
      const active = relevant.filter((a) => a.start < to && a.end > from);
      const text = document.createTextNode(
        value.slice(from - start, to - start),
      );
      if (!active.length) fragment.append(text);
      else {
        const mark = document.createElement("mark");
        mark.className = `reading-highlight reading-highlight-${active.at(-1)!.color}`;
        mark.dataset.annotationIds = active.map((a) => a.id).join(" ");
        if (active.some((a) => a.note.trim())) mark.classList.add("has-note");
        mark.append(text);
        fragment.append(mark);
      }
    }
    node.replaceWith(fragment);
  }
  return root.innerHTML;
}
