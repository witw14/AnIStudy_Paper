import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "./api";
import { NoteEditor } from "./Notes";
import type { Note, Paper, Workspace } from "./types";

export function ReaderNotes({
  w,
  paper,
  onUpdate,
}: {
  w: Workspace;
  paper: Paper;
  onUpdate: (w: Workspace) => void;
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = useRef(onUpdate);
  update.current = onUpdate;
  const notes = (w.notes || [])
    .filter((n) => n.paperIds.includes(paper.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const note = notes.find((n) => n.id === selected) || notes[0];
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void api<Workspace>(`/workspaces/${w.id}`)
        .then((next) => {
          if (alive) update.current(next);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
    };
  }, [w.id]);
  const createButton = (
    <button
      title="新建笔记"
      aria-label="新建阅读笔记"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setError("");
        try {
          const result = await api<{ note: Note; workspace: Workspace }>(
            `/workspaces/${w.id}/notes`,
            { title: paper.title.slice(0, 300), paperIds: [paper.id] },
          );
          onUpdate(result.workspace);
          setSelected(result.note.id);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Plus size={16} />
      {!notes.length && "创建笔记"}
    </button>
  );
  return (
    <div className="reader-note-panel">
      {(!note || notes.length > 1) && (
        <div className="reader-note-controls">
          {createButton}
          {notes.length > 1 && (
            <select
              className="reader-note-choice"
              aria-label="选择阅读笔记"
              value={note?.id || ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {notes.map((n) => (
                <option value={n.id} key={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="note-error">
          {error}
        </p>
      )}
      {note ? (
        <>
          <NoteEditor
            key={note.id}
            note={note}
            w={w}
            onUpdate={onUpdate}
            immersiveScope="local"
            extraActions={notes.length === 1 ? createButton : undefined}
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
                setSelected("");
                onUpdate(next);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Trash2 size={14} />
            删除笔记
          </button>
        </>
      ) : null}
    </div>
  );
}
