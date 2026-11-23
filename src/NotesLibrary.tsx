import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { api } from "./api";
import { NoteEditor, type NoteEditorHandle } from "./NoteEditor";
import { NoteCard } from "./NoteCard";
import type { Note, Workspace } from "./types";

export function NotesLibrary({
  w,
  onUpdate,
  selected,
  onSelect,
  compact = false,
  quickSpaceControl,
  quickPin,
}: {
  w: Workspace;
  onUpdate: (w: Workspace) => void;
  selected: string;
  onSelect: (id: string) => void;
  compact?: boolean;
  quickSpaceControl?: ReactNode;
  quickPin?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [renamedTitles, setRenamedTitles] = useState<Record<string, string>>(
    {},
  );
  const editorRef = useRef<NoteEditorHandle>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    if (compact || !libraryRef.current) return;
    const update = () =>
      setHeight(
        Math.max(
          240,
          innerHeight - libraryRef.current!.getBoundingClientRect().top - 20,
        ),
      );
    const observer = new ResizeObserver(update);
    observer.observe(libraryRef.current.parentElement!);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [compact]);
  const note = w.notes?.find((n) => n.id === selected);
  const currentId = useRef(w.id);
  currentId.current = w.id;
  useEffect(() => {
    const refresh = () =>
      void api<Workspace>(`/workspaces/${w.id}`)
        .then((next) => {
          if (currentId.current === next.id) onUpdate(next);
        })
        .catch((e) => setError(e.message));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [w.id, onUpdate]);
  useEffect(() => {
    setRenamedTitles((current) => {
      const next = { ...current };
      for (const item of w.notes || [])
        if (next[item.id] === item.title) delete next[item.id];
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [w.notes]);
  async function removeNote(item: Note) {
    if (!confirm(`删除笔记「${item.title}」？关联论文和技术不会被删除。`))
      return;
    try {
      const next = await api<Workspace>(
        `/workspaces/${w.id}/notes/${item.id}`,
        undefined,
        "DELETE",
      );
      localStorage.removeItem(`anistudy.note-draft.${w.id}.${item.id}`);
      if (selected === item.id)
        onSelect(
          [...(next.notes || [])].sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          )[0]?.id || "",
        );
      onUpdate(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function renameNote(item: Note, value: string) {
    const title = value.trim();
    if (!title) {
      setError("笔记标题不能为空。");
      return;
    }
    if (title === item.title) return;
    setRenamedTitles((current) => ({ ...current, [item.id]: title }));
    editorRef.current?.rename(title);
  }
  const toggleSidebar = (
    <button
      type="button"
      aria-label={sidebarCollapsed ? "展开笔记侧栏" : "收起笔记侧栏"}
      title={sidebarCollapsed ? "展开笔记侧栏" : "收起笔记侧栏"}
      onClick={() => setSidebarCollapsed((value) => !value)}
    >
      {sidebarCollapsed ? (
        <PanelLeftOpen size={16} />
      ) : (
        <PanelLeftClose size={16} />
      )}
    </button>
  );
  return (
    <div
      ref={libraryRef}
      style={!compact && height ? { height } : undefined}
      className={`notes-library unified-notes ${compact ? "compact" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
    >
      {error && (
        <p role="alert" className="note-error">
          {error}
        </p>
      )}
      <div className="notes-layout">
        <aside
          className="notes-sidebar"
          aria-label="笔记侧栏"
          hidden={sidebarCollapsed}
        >
          <div className="quick-sidebar-controls">
            <input
              aria-label="搜索笔记"
              placeholder="搜索标题或正文…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {quickSpaceControl}
          </div>
          <div className="notes-list" aria-label="笔记列表">
            {(w.notes || [])
              .filter((n) =>
                ((renamedTitles[n.id] || n.title) + "\n" + n.content)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((item) => (
                <NoteCard
                  key={item.id}
                  note={item}
                  title={renamedTitles[item.id] || item.title}
                  selected={item.id === selected}
                  onSelect={() => onSelect(item.id)}
                  onRename={(title) => renameNote(item, title)}
                  onDelete={() => void removeNote(item)}
                />
              ))}
            {!w.notes?.length && (
              <p className="muted">把一次理解，记录成一篇笔记。</p>
            )}
          </div>
          <div className="quick-sidebar-new">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api<{
                    note: Note;
                    workspace: Workspace;
                  }>(`/workspaces/${w.id}/notes`, {});
                  onUpdate(result.workspace);
                  onSelect(result.note.id);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Plus size={16} />
              新建笔记
            </button>
          </div>
        </aside>
        {note ? (
          <div className="note-current">
            <NoteEditor
              key={`${w.id}:${note.id}`}
              note={note}
              w={w}
              onUpdate={onUpdate}
              library
              compact={compact}
              editorRef={editorRef}
              toolbarStart={toggleSidebar}
              toolbarBeforeModes={quickPin}
            />
          </div>
        ) : (
          <div className="note-empty">
            {toggleSidebar}选择一篇笔记，或创建新的 Markdown 笔记。
          </div>
        )}
      </div>
    </div>
  );
}
