import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, MoreHorizontal, Pencil, Trash2, Wrench } from "lucide-react";
import type { Note } from "./types";

export function NoteCard({
  note,
  title,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  note: Note;
  title: string;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const cancelling = useRef(false);
  const committing = useRef(false);
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => {
      if (
        !popup.current?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        setMenu(null);
    };
    const close = () => setMenu(null);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);
  useLayoutEffect(() => {
    if (menu)
      popup.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu]);
  function commit() {
    if (committing.current) return;
    committing.current = true;
    setEditing(false);
    if (!cancelling.current) onRename(value);
    cancelling.current = false;
  }
  return (
    <div
      className="quick-note-card"
      data-note-id={note.id}
      data-selected={selected}
    >
      <button
        className="quick-note-open"
        type="button"
        aria-pressed={selected}
        aria-label={title}
        title={title}
        onClick={onSelect}
      />
      {editing ? (
        <input
          autoFocus
          aria-label="笔记标题"
          maxLength={300}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelling.current = true;
              e.currentTarget.blur();
            }
          }}
          onBlur={commit}
        />
      ) : (
        <strong>{title}</strong>
      )}
      <div className="quick-note-counts">
        {!!note.paperIds.length && (
          <span
            aria-label={`关联论文 ${note.paperIds.length}`}
            title={`关联论文 ${note.paperIds.length}`}
          >
            <BookOpen size={13} />
            {note.paperIds.length}
          </span>
        )}
        {!!note.nodeIds.length && (
          <span
            aria-label={`关联技术 ${note.nodeIds.length}`}
            title={`关联技术 ${note.nodeIds.length}`}
          >
            <Wrench size={13} />
            {note.nodeIds.length}
          </span>
        )}
      </div>
      <button
        ref={trigger}
        className="note-card-more"
        type="button"
        aria-label={`笔记操作：${title}`}
        title="笔记操作"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={() => {
          const rect = trigger.current!.getBoundingClientRect();
          setMenu((current) =>
            current
              ? null
              : {
                  left: Math.max(8, Math.min(rect.right + 6, innerWidth - 130)),
                  top: Math.max(8, Math.min(rect.top, innerHeight - 90)),
                },
          );
        }}
      >
        <MoreHorizontal size={17} />
      </button>
      {menu &&
        createPortal(
          <div
            ref={popup}
            className="note-card-menu"
            role="menu"
            aria-label="笔记操作"
            style={menu}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setMenu(null);
                trigger.current?.focus();
              }
              if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const items = [
                  ...popup.current!.querySelectorAll<HTMLButtonElement>(
                    "button",
                  ),
                ];
                const index = items.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                items[
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? items.length - 1
                      : (index +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          items.length) %
                        items.length
                ]?.focus();
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onSelect();
                setValue(title);
                committing.current = false;
                cancelling.current = false;
                setEditing(true);
              }}
            >
              <Pencil size={14} />
              重命名
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger-text"
              onClick={() => {
                setMenu(null);
                onDelete();
              }}
            >
              <Trash2 size={14} />
              删除笔记
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
