import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ReadingAnnotation } from "./types";
export function ReadingAnnotationCard({
  annotation,
  base,
  onSaved,
  register,
  visible = true,
}: {
  annotation: ReadingAnnotation;
  base: string;
  onSaved: (a: ReadingAnnotation) => void;
  register: (id: string, flush?: () => Promise<boolean>) => void;
  visible?: boolean;
}) {
  const key = `anistudy.annotation-draft.${base}.${annotation.id}`;
  const [value, setValue] = useState(
    () => localStorage.getItem(key) ?? annotation.note,
  );
  const draft = useRef(value),
    record = useRef(annotation),
    pending = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState(
    value === annotation.note ? "已自动保存" : "待保存草稿",
  );
  const [error, setError] = useState("");
  const active = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!visible || !input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(input.current.scrollHeight + 2, window.innerHeight * 0.45)}px`;
  }, [value, visible]);
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
    setStatus("保存中…");
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
          setStatus("已自动保存");
          setError("");
        }
        return true;
      } catch (e) {
        if (active.current) {
          setStatus("保存失败，草稿已保留");
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
        onChange={(e) => {
          draft.current = e.target.value;
          setValue(e.target.value);
          setStatus("待保存…");
        }}
      />
      <div className="annotation-actions">
        <small role="status">{status}</small>
      </div>
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
                setStatus("已载入最新标注");
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
