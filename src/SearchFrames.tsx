import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { textRange } from "./readingText";

type Match = { blockId: string; start: number; end: number };
type Frame = {
  left: number;
  top: number;
  width: number;
  height: number;
  index: number;
};
export function SearchFrames({
  content,
  matches,
  current,
  revision,
  navigation,
}: {
  content: RefObject<HTMLDivElement | null>;
  matches: Match[];
  current: number;
  revision: unknown;
  navigation?: unknown;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const lastJump = useRef<{
    matches: Match[];
    current: number;
    navigation: unknown;
  } | null>(null);
  useLayoutEffect(() => {
    const host = content.current;
    if (!host) return;
    let task = 0;
    const update = () => {
      const view = host.getBoundingClientRect(),
        out: Frame[] = [];
      const visible = new Map<string, HTMLElement | null>();
      matches.forEach((hit, index) => {
        if (!visible.has(hit.blockId)) {
          const el = host.querySelector<HTMLElement>(
            `[data-block-id="${hit.blockId}"] .reading-block-html`,
          );
          const bounds = el?.getBoundingClientRect();
          visible.set(
            hit.blockId,
            bounds && bounds.bottom >= view.top && bounds.top <= view.bottom
              ? el!
              : null,
          );
        }
        const element = visible.get(hit.blockId);
        if (!element) return;
        const range = textRange(element, hit.start, hit.end);
        const lines: {
          left: number;
          top: number;
          right: number;
          bottom: number;
        }[] = [];
        for (const rect of Array.from(range?.getClientRects() || [])) {
          if (!rect.width || !rect.height) continue;
          const line = lines.find(
            (v) =>
              Math.abs(v.top - rect.top) < 2 &&
              Math.abs(v.bottom - rect.bottom) < 2 &&
              rect.left <= v.right + 2 &&
              rect.right >= v.left - 2,
          );
          if (line) {
            line.left = Math.min(line.left, rect.left);
            line.right = Math.max(line.right, rect.right);
          } else
            lines.push({
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            });
        }
        for (const rect of lines)
          out.push({
            left: rect.left - view.left + host.scrollLeft - host.clientLeft - 2,
            top: rect.top - view.top + host.scrollTop - host.clientTop - 2,
            width: rect.right - rect.left + 4,
            height: rect.bottom - rect.top + 4,
            index,
          });
      });
      setFrames(out);
    };
    const schedule = () => {
      cancelAnimationFrame(task);
      task = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    for (const id of new Set(matches.map((m) => m.blockId))) {
      const el = host.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
      if (el) observer.observe(el);
    }
    host.addEventListener("scroll", schedule, { passive: true });
    const hit = matches[current];
    if (
      hit &&
      (lastJump.current?.matches !== matches ||
        lastJump.current?.current !== current ||
        lastJump.current?.navigation !== navigation)
    ) {
      const el = host.querySelector<HTMLElement>(
        `[data-block-id="${hit.blockId}"] .reading-block-html`,
      );
      const range = el ? textRange(el, hit.start, hit.end) : null;
      if (range) {
        const rect = range.getBoundingClientRect(),
          view = host.getBoundingClientRect();
        host.scrollBy({
          top: rect.top - view.top - view.height / 2,
          behavior: "smooth",
        });
      }
      lastJump.current = { matches, current, navigation };
    }
    schedule();
    return () => {
      cancelAnimationFrame(task);
      observer.disconnect();
      host.removeEventListener("scroll", schedule);
    };
  }, [content, matches, current, revision, navigation]);
  return (
    <div className="reader-search-frames" aria-hidden="true">
      {frames.map((f, i) => (
        <span
          key={i}
          className="reader-search-frame"
          data-current={f.index === current}
          data-match-index={f.index}
          style={{ left: f.left, top: f.top, width: f.width, height: f.height }}
        />
      ))}
    </div>
  );
}
