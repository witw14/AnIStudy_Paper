import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { MarkdownEditor } from "./MarkdownEditor";

export function EditableText({
  label,
  fields,
  markdown = false,
  onSave,
  children,
}: {
  label: string;
  fields: { name: string; label: string; value: string }[];
  markdown?: boolean;
  onSave: (data: Record<string, string>) => Promise<unknown>;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editable-text">
      {editing ? (
        <div className="inline-text-editor">
          {fields.map((field) => (
            <label key={field.name}>
              {field.label}
              {markdown ? (
                <MarkdownEditor
                  value={draft[field.name] || ""}
                  label={field.label}
                  onChange={(value) =>
                    setDraft((d) => ({ ...d, [field.name]: value }))
                  }
                  onSave={() => void save()}
                />
              ) : (
                <input
                  aria-label={field.label}
                  maxLength={2000}
                  value={draft[field.name] || ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [field.name]: e.target.value }))
                  }
                />
              )}
            </label>
          ))}
          {error && (
            <p role="alert" className="note-error">
              {error}
            </p>
          )}
          <div className="inline-edit-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              保存修改
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          {children}
          <button
            className="edit-pencil"
            aria-label={`编辑${label}`}
            title={`编辑${label}`}
            onClick={() => {
              setDraft(
                Object.fromEntries(fields.map((f) => [f.name, f.value])),
              );
              setError("");
              setEditing(true);
            }}
          >
            <Pencil size={15} />
          </button>
        </>
      )}
    </section>
  );
}
