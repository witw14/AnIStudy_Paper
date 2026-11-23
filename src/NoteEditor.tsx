import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Download, ExternalLink, Save } from "lucide-react";
import { api } from "./api";
import { MarkdownEditor } from "./MarkdownEditor";
import type { Note, Workspace } from "./types";
import "./notes.css";

type Draft = Pick<Note, "title" | "content" | "paperIds" | "nodeIds">;
export type NoteEditorHandle = { rename: (title: string) => void };
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
  compact = false,
  library = false,
  editorRef,
  toolbarStart,
  toolbarBeforeModes,
}: {
  note: Note;
  w: Workspace;
  onUpdate: (w: Workspace) => void;
  immersiveScope?: "page" | "local";
  extraActions?: ReactNode;
  compact?: boolean;
  library?: boolean;
  editorRef?: Ref<NoteEditorHandle>;
  toolbarStart?: ReactNode;
  toolbarBeforeModes?: ReactNode;
}) {
  const streamlined = compact || library;
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
  useImperativeHandle(editorRef, () => ({
    rename(title: string) {
      const next = { ...latest.current, title: title.trim() };
      latest.current = next;
      setDraft(next);
    },
  }));
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
    <section
      className={`note-editor${streamlined ? " note-editor-compact" : ""}${library ? " note-editor-library" : ""}`}
      aria-label="笔记编辑器"
    >
      {!streamlined && (
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
      )}
      <div
        className={`note-save-state${streamlined ? " sr-only" : ""}`}
        role="status"
      >
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
        compact={streamlined}
        viewKey={`${w.id}:${note.id}`}
        toolbarStart={toolbarStart}
        toolbarBeforeModes={toolbarBeforeModes}
        toolbarAfterModes={
          streamlined ? (
            <>
              {compact && (
                <a
                  href="/"
                  target="_blank"
                  rel="noreferrer"
                  title="打开主页面"
                  aria-label="打开主页面"
                >
                  <ExternalLink size={16} />
                </a>
              )}
              <button
                type="button"
                title="导出 Markdown"
                aria-label="导出 Markdown"
                onClick={() => exportNote(draft.title, draft.content)}
              >
                <Download size={16} />
              </button>
            </>
          ) : undefined
        }
        immersiveScope={immersiveScope}
        saveStatus={error || (dirty ? "待保存 · 本机草稿" : state)}
        value={draft.content}
        onChange={(content) => setDraft((d) => ({ ...d, content }))}
        onSave={() => void save()}
      />
      {!compact && (
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
                .filter((n) =>
                  n.name.toLowerCase().includes(query.toLowerCase()),
                )
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
      )}
    </section>
  );
}
