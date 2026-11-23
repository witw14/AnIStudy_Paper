import { useEffect, useRef, useState } from "react";
import { ArrowRight, Pin } from "lucide-react";
import { api } from "./api";
import { NotesLibrary } from "./NotesLibrary";
import type { Workspace, WorkspaceMeta, Settings } from "./types";
import "./notes.css";
export { NoteEditor } from "./NoteEditor";
export { NotesLibrary } from "./NotesLibrary";

export function NoteLinks({
  w,
  kind,
  id,
  onOpen,
  onCreate,
  disabled = false,
}: {
  w: Workspace;
  kind: "paper" | "node";
  id: string;
  onOpen: (id: string) => void;
  onCreate?: () => void;
  disabled?: boolean;
}) {
  const notes = (w.notes || []).filter((n) =>
    (kind === "paper" ? n.paperIds : n.nodeIds).includes(id),
  );
  if (!notes.length && kind !== "node") return null;
  return (
    <div className="attached-notes">
      <h4>关联笔记</h4>
      {kind === "node" && (
        <button
          className="note-link"
          disabled={disabled || !onCreate}
          onClick={onCreate}
        >
          <span>新增笔记</span>
          <ArrowRight size={16} />
        </button>
      )}
      {notes.map((n) => (
        <button className="note-link" key={n.id} onClick={() => onOpen(n.id)}>
          <span>{n.title}</span>
          <ArrowRight size={16} />
        </button>
      ))}
    </div>
  );
}

declare global {
  interface Window {
    anistudyDesktop?: { hide: () => Promise<void> };
  }
}
export function QuickNotes() {
  const [spaces, setSpaces] = useState<WorkspaceMeta[]>([]);
  const [w, setW] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState("");
  const [settings, setSettings] = useState<Settings>({});
  const [error, setError] = useState("");
  const requestId = useRef(0);
  async function load(id: string) {
    const request = ++requestId.current;
    try {
      const next = await api<Workspace>(`/workspaces/${id}`);
      if (request !== requestId.current) return;
      setW(next);
      setSelected(
        [...(next.notes || [])].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        )[0]?.id || "",
      );
      localStorage.setItem("anistudy.quick-space", id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void Promise.all([
      api<WorkspaceMeta[]>("/workspaces"),
      api<Settings>("/settings"),
    ])
      .then(([list, s]) => {
        setSpaces(list);
        setSettings(s);
        const saved =
          localStorage.getItem("anistudy.quick-space") ||
          localStorage.getItem("anistudy.workspace");
        if (list.length)
          void load(list.find((x) => x.id === saved)?.id || list[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme || "forest";
  }, [settings.theme]);
  useEffect(() => {
    const refresh = () =>
      void Promise.all([
        api<WorkspaceMeta[]>("/workspaces"),
        api<Settings>("/settings"),
      ])
        .then(([list, s]) => {
          setSpaces(list);
          setSettings(s);
        })
        .catch((e) => setError(e.message));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return (
    <main className="quick-notes">
      {error && (
        <p className="note-error" role="alert">
          {error}
        </p>
      )}
      {w ? (
        <NotesLibrary
          key={w.id}
          w={w}
          onUpdate={setW}
          selected={selected}
          onSelect={setSelected}
          compact
          quickSpaceControl={
            <select
              aria-label="笔记研究空间"
              value={w.id}
              onChange={(e) => void load(e.target.value)}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          }
          quickPin={
            <button
              type="button"
              className="pin-toggle"
              aria-label="置顶"
              aria-pressed={!!settings.noteAlwaysOnTop}
              disabled={!window.anistudyDesktop}
              title={
                window.anistudyDesktop
                  ? "窗口置顶"
                  : "系统置顶需使用 Windows 笔记助手"
              }
              onClick={async () => {
                try {
                  await api(
                    "/preferences",
                    { noteAlwaysOnTop: !settings.noteAlwaysOnTop },
                    "PATCH",
                  );
                  setSettings((s) => ({
                    ...s,
                    noteAlwaysOnTop: !s.noteAlwaysOnTop,
                  }));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Pin size={16} />
            </button>
          }
        />
      ) : (
        <p>请先在主页面创建研究空间。</p>
      )}
    </main>
  );
}
