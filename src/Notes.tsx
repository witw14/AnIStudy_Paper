import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Download,
  Plus,
  Save,
  Trash2,
  Pin,
  ExternalLink,
  X,
} from "lucide-react";
import { api } from "./api";
import { MarkdownEditor } from "./MarkdownEditor";
import type { Note, Workspace, WorkspaceMeta, Settings } from "./types";
import "./notes.css";

type Draft = Pick<Note, "title" | "content" | "paperIds" | "nodeIds">;
const fields = (n: Draft): Draft => ({
  title: n.title,
  content: n.content,
  paperIds: n.paperIds,
  nodeIds: n.nodeIds,
});
function exportNote(title: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = (title.replace(/[<>:"/\\|?*]/g, "_") || "未命名笔记") + ".md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function NoteEditor({
  note,
  w,
  onUpdate,
  immersiveScope = "page",
  extraActions,
}: {
  note: Note;
  w: Workspace;
  onUpdate: (w: Workspace) => void;
  immersiveScope?: "page" | "local";
  extraActions?: ReactNode;
}) {
  const key = `anistudy.note-draft.${w.id}.${note.id}`;
  const recovered = useRef<{ draft: Draft; revision: number } | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (
        typeof value?.draft?.title === "string" &&
        typeof value?.draft?.content === "string" &&
        Array.isArray(value.draft.paperIds) &&
        Array.isArray(value.draft.nodeIds) &&
        Number.isInteger(value.revision)
      )
        recovered.current = value;
    } catch {}
    return recovered.current?.draft || fields(note);
  });
  const revision = useRef(recovered.current?.revision || note.revision);
  const saved = useRef(JSON.stringify(fields(note)));
  const latest = useRef(draft);
  latest.current = draft;
  const saving = useRef(false);
  const mounted = useRef(true);
  const [state, setState] = useState(
    recovered.current ? "已恢复本机草稿" : "已保存",
  );
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const dirty = JSON.stringify(draft) !== saved.current;
  const saveRef = useRef<() => Promise<void>>(async () => {});
  async function save() {
    if (saving.current || JSON.stringify(latest.current) === saved.current)
      return;
    if (!latest.current.title.trim()) {
      setError("请填写笔记标题。");
      return;
    }
    const snapshot = fields(latest.current);
    saving.current = true;
    let succeeded = false;
    setState("保存中…");
    setError("");
    try {
      const result = await api<{ note: Note; workspace: Workspace }>(
        `/workspaces/${w.id}/notes/${note.id}`,
        { ...snapshot, revision: revision.current },
        "PUT",
      );
      revision.current = result.note.revision;
      saved.current = JSON.stringify(snapshot);
      succeeded = true;
      if (JSON.stringify(latest.current) === saved.current)
        localStorage.removeItem(key);
      else
        localStorage.setItem(
          key,
          JSON.stringify({ draft: latest.current, revision: revision.current }),
        );
      if (mounted.current || immersiveScope === "local")
        onUpdate(result.workspace);
      if (mounted.current) {
        setState("已保存");
      }
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        setState("未保存");
      }
    } finally {
      saving.current = false;
      // Finish edits typed during an in-flight save even if the user has since
      // switched to another note. Failed/conflicting writes never auto-retry.
      if (
        succeeded &&
        !mounted.current &&
        JSON.stringify(latest.current) !== saved.current
      )
        void saveRef.current();
    }
  }
  saveRef.current = save;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void saveRef.current();
    };
  }, []);
  useEffect(() => {
    if (dirty) {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ draft, revision: revision.current }),
        );
      } catch {
        setError("浏览器草稿空间不足，请立即保存或导出笔记。");
      }
      if (!error) {
        const timer = setTimeout(() => void saveRef.current(), 800);
        return () => clearTimeout(timer);
      }
    }
  }, [draft, dirty, state, error, key]);
  useEffect(() => {
    if (note.revision !== revision.current && !saving.current && !dirty) {
      revision.current = note.revision;
      saved.current = JSON.stringify(fields(note));
      setDraft(fields(note));
    }
  }, [note, dirty]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);
  function toggle(field: "paperIds" | "nodeIds", id: string) {
    setDraft((d) => ({
      ...d,
      [field]: d[field].includes(id)
        ? d[field].filter((x) => x !== id)
        : [...d[field], id],
    }));
  }
  return (
    <section className="note-editor" aria-label="笔记编辑器">
      <div className="note-editor-heading">
        <input
          aria-label="笔记标题"
          value={draft.title}
          maxLength={300}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="笔记标题"
        />
        <button
          className="primary"
          disabled={saving.current}
          onClick={() => void save()}
        >
          <Save size={15} />
          保存
        </button>
        <button
          className="secondary"
          title="导出 Markdown"
          aria-label="导出 Markdown"
          onClick={() => exportNote(draft.title, draft.content)}
        >
          <Download size={16} />
        </button>
        {extraActions}
      </div>
      <div className="note-save-state" role="status">
        {error ? "保存未完成" : dirty ? "待保存 · 本机草稿" : state}
      </div>
      {error && (
        <div className="note-error" role="alert">
          {error}
          <button className="text-link" onClick={() => void save()}>
            重试保存
          </button>
          <button
            className="text-link"
            onClick={async () => {
              if (
                !confirm(
                  "重新载入会丢弃当前编辑草稿，请先复制或导出需要保留的内容。继续？",
                )
              )
                return;
              try {
                const next = await api<Workspace>(`/workspaces/${w.id}`);
                const current = next.notes?.find((n) => n.id === note.id);
                if (!current) throw new Error("笔记已被删除，请导出当前草稿。");
                revision.current = current.revision;
                saved.current = JSON.stringify(fields(current));
                localStorage.removeItem(key);
                setDraft(fields(current));
                setError("");
                setState("已保存");
                onUpdate(next);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            重新载入最新版本
          </button>
        </div>
      )}
      <MarkdownEditor
        allowImmersive
        immersiveScope={immersiveScope}
        saveStatus={error || (dirty ? "待保存 · 本机草稿" : state)}
        value={draft.content}
        onChange={(content) => setDraft((d) => ({ ...d, content }))}
        onSave={() => void save()}
      />
      <details className="note-attachments">
        <summary>
          关联论文与技术节点（{draft.paperIds.length + draft.nodeIds.length}）
        </summary>
        <input
          aria-label="搜索关联对象"
          placeholder="搜索论文或技术…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="attachment-columns">
          <fieldset>
            <legend>论文</legend>
            {w.papers
              .filter((p) =>
                p.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={draft.paperIds.includes(p.id)}
                    onChange={() => toggle("paperIds", p.id)}
                  />
                  {p.title}
                </label>
              ))}
          </fieldset>
          <fieldset>
            <legend>技术节点</legend>
            {w.nodes
              .filter((n) => n.name.toLowerCase().includes(query.toLowerCase()))
              .map((n) => (
                <label key={n.id}>
                  <input
                    type="checkbox"
                    checked={draft.nodeIds.includes(n.id)}
                    onChange={() => toggle("nodeIds", n.id)}
                  />
                  {n.name}
                </label>
              ))}
          </fieldset>
        </div>
      </details>
    </section>
  );
}
export function NotesLibrary({
  w,
  onUpdate,
  selected,
  onSelect,
  compact = false,
}: {
  w: Workspace;
  onUpdate: (w: Workspace) => void;
  selected: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  return (
    <div className={`notes-library ${compact ? "compact" : ""}`}>
      <div className="notes-controls">
        <input
          aria-label="搜索笔记"
          placeholder="搜索标题或正文…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await api<{ note: Note; workspace: Workspace }>(
                `/workspaces/${w.id}/notes`,
                {},
              );
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
      {error && (
        <p role="alert" className="note-error">
          {error}
        </p>
      )}
      <div className="notes-layout">
        <div className="notes-list" aria-label="笔记列表">
          {(w.notes || [])
            .filter((n) =>
              (n.title + "\n" + n.content)
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((n) => (
              <button
                key={n.id}
                aria-pressed={n.id === selected}
                onClick={() => onSelect(n.id)}
              >
                <strong>{n.title}</strong>
                <small>
                  {n.paperIds.length} 篇论文 · {n.nodeIds.length} 个技术
                </small>
              </button>
            ))}
          {!w.notes?.length && (
            <p className="muted">把一次理解，记录成一篇笔记。</p>
          )}
        </div>
        {note ? (
          <div className="note-current">
            <NoteEditor
              key={`${w.id}:${note.id}`}
              note={note}
              w={w}
              onUpdate={onUpdate}
            />
            <button
              className="danger-text"
              onClick={async () => {
                if (
                  !confirm(
                    `删除笔记「${note.title}」？关联论文和技术不会被删除。`,
                  )
                )
                  return;
                try {
                  const next = await api<Workspace>(
                    `/workspaces/${w.id}/notes/${note.id}`,
                    undefined,
                    "DELETE",
                  );
                  localStorage.removeItem(
                    `anistudy.note-draft.${w.id}.${note.id}`,
                  );
                  onSelect("");
                  onUpdate(next);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Trash2 size={14} />
              删除笔记
            </button>
          </div>
        ) : (
          <div className="note-empty">
            选择一篇笔记，或创建新的 Markdown 笔记。
          </div>
        )}
      </div>
    </div>
  );
}
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
      setSelected("");
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
      <header>
        <strong>AnIStudy · 快速笔记</strong>
        <select
          aria-label="笔记研究空间"
          value={w?.id || ""}
          onChange={(e) => void load(e.target.value)}
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          className="secondary pin-toggle"
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
          <Pin size={15} />
          置顶
        </button>
        <a
          className="secondary"
          href="/"
          target="_blank"
          rel="noreferrer"
          aria-label="打开主页面"
        >
          <ExternalLink size={16} />
        </a>
        {window.anistudyDesktop && (
          <button
            aria-label="隐藏笔记窗口"
            onClick={() => void window.anistudyDesktop?.hide()}
          >
            <X size={17} />
          </button>
        )}
      </header>
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
        />
      ) : (
        <p>请先在主页面创建研究空间。</p>
      )}
    </main>
  );
}
