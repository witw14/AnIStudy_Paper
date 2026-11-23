import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ReadingAnnotation } from "./types";
export function ReadingAnnotationCard({
  annotation,
  base,
  onSaved,
  register,
  visible = true,
  onSize,
  onFinish,
}: {
  annotation: ReadingAnnotation;
  base: string;
  onSaved: (a: ReadingAnnotation) => void;
  register: (id: string, flush?: () => Promise<boolean>) => void;
  visible?: boolean;
  onSize: (size: { width: number; height: number }) => void;
  onFinish: () => void;
}) {
  const key = `anistudy.annotation-draft.${base}.${annotation.id}`;
  const [value, setValue] = useState(
    () => localStorage.getItem(key) ?? annotation.note,
  );
  const draft = useRef(value),
    record = useRef(annotation),
    pending = useRef<Promise<boolean> | null>(null);
  const [error, setError] = useState("");
  const active = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!visible || !input.current) return;
    const style = getComputedStyle(input.current),
      canvas = document.createElement("canvas"),
      context = canvas.getContext("2d")!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const unit = context.measureText("汉").width || 12;
    const longest = Math.max(
      0,
      ...value.split("\n").map((line) => context.measureText(line).width),
    );
    const width = Math.min(
      window.innerWidth - 52,
      Math.max(unit * 20, Math.min(unit * 35, longest + unit)),
    );
    const mirror = document.createElement("div");
    Object.assign(mirror.style, {
      position: "fixed",
      visibility: "hidden",
      font: style.font,
      lineHeight: "20px",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      width: `${width}px`,
    });
    mirror.textContent = (value || " ") + "\u200b";
    document.body.append(mirror);
    const height = Math.max(
      40,
      Math.min(mirror.scrollHeight, window.innerHeight * 0.45),
    );
    mirror.remove();
    input.current.style.height = `${height}px`;
    onSize({
      width: width + 40,
      height: input.current.closest("article")!.offsetHeight + 18,
    });
  }, [value, visible, error]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      void flush();
    };
  }, []);
  async function flush(): Promise<boolean> {
    if (pending.current) {
      const ok = await pending.current;
      if (!ok) return false;
      return flush();
    }
    if (draft.current === record.current.note) return true;
    const note = draft.current;
    const task = (async () => {
      try {
        const a = await api<ReadingAnnotation>(
          `${base}/annotations/${annotation.id}`,
          { revision: record.current.revision, note },
          "PATCH",
        );
        record.current = a;
        onSaved(a);
        if (draft.current === note) localStorage.removeItem(key);
        if (active.current) {
          setError("");
        }
        return true;
      } catch (e) {
        if (active.current) {
          setError((e as Error).message);
        }
        return false;
      }
    })();
    pending.current = task;
    const ok = await task;
    pending.current = null;
    if (ok && draft.current !== record.current.note) return flush();
    return ok;
  }
  useEffect(() => {
    register(annotation.id, flush);
    return () => register(annotation.id);
  });
  useEffect(() => {
    draft.current = value;
    if (value === record.current.note) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      setError("无法保存本地草稿，请保持此窗口开启并重试。");
    }
    const timer = setTimeout(() => void flush(), 650);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <article className={`reader-annotation reader-color-${annotation.color}`}>
      <textarea
        ref={input}
        aria-label={`标注 ${annotation.id} 的备注`}
        value={value}
        placeholder="添加标注备注，自动保存…"
        maxLength={20000}
        onBlur={() => void flush()}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          if (e.shiftKey || e.ctrlKey) {
            if (e.ctrlKey) {
              e.preventDefault();
              const el = e.currentTarget,
                start = el.selectionStart,
                end = el.selectionEnd;
              const next = value.slice(0, start) + "\n" + value.slice(end);
              draft.current = next;
              setValue(next);
              requestAnimationFrame(() =>
                el.setSelectionRange(start + 1, start + 1),
              );
            }
            return;
          }
          e.preventDefault();
          e.currentTarget.blur();
          onFinish();
        }}
        onChange={(e) => {
          draft.current = e.target.value;
          setValue(e.target.value);
        }}
      />
      {error && (
        <div role="alert">
          <small>{error}</small>
          <button onClick={() => void flush()}>重试保存</button>
          <button
            onClick={async () => {
              const latest = await api<{ annotations: ReadingAnnotation[] }>(
                `${base}/document?documentId=${encodeURIComponent(annotation.documentId)}`,
              );
              const a = latest.annotations.find((v) => v.id === annotation.id);
              if (a) {
                record.current = a;
                draft.current = a.note;
                setValue(a.note);
                onSaved(a);
                localStorage.removeItem(key);
                setError("");
              }
            }}
          >
            载入最新标注
          </button>
        </div>
      )}
    </article>
  );
}
