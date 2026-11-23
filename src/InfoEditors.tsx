import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { importanceNames } from "./Customization";
import { workspaceTaxonomy, type Tech, type Workspace } from "./types";

export function NodeTags({
  node,
  w,
  onSave,
}: {
  node: Tech;
  w: Workspace;
  onSave: (data: unknown) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const categories = workspaceTaxonomy(w, "categories"),
    directions = workspaceTaxonomy(w, "directions");
  async function save(data: unknown) {
    setBusy(true);
    setError("");
    try {
      await onSave(data);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="node-tag-editor">
      <div className="detail-tag-heading">
        <div className="detail-tags">
          <span className="pill">
            {categories.find((c) => c.id === node.category)?.name ||
              node.category}
          </span>
          <span className="pill">
            {importanceNames[node.importance as keyof typeof importanceNames] ||
              node.importance}
          </span>
          <span>{node.year ?? "年份待识别"}</span>
          {(node.directions || []).map((id) => (
            <span className="pill" key={id}>
              {directions.find((d) => d.id === id)?.name || id}
            </span>
          ))}
        </div>
        <button
          className="info-pencil"
          aria-label="编辑标签"
          title="编辑标签"
          aria-expanded={editing}
          onClick={() => {
            setEditing(!editing);
            setError("");
          }}
        >
          <Pencil size={15} />
        </button>
      </div>
      {editing && (
        <form
          className="tag-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              importance = String(f.get("importance"));
            void save({
              year: f.get("year") ? Number(f.get("year")) : null,
              category: String(f.get("category")),
              directions: String(f.get("directions"))
                .split(/[,，、;；]/)
                .map((s) => s.trim())
                .filter(Boolean),
              ...(importance !== node.importance ? { importance } : {}),
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              节点年份
              <input
                aria-label="节点年份"
                name="year"
                type="number"
                min={1}
                max={new Date().getFullYear() + 1}
                defaultValue={node.year ?? ""}
              />
            </label>
            <label>
              技术种类
              <input
                name="category"
                list="detail-categories"
                defaultValue={node.category}
                required
              />
            </label>
            <label>
              研究方向
              <input
                name="directions"
                list="detail-directions"
                defaultValue={(node.directions?.length
                  ? node.directions
                  : [node.direction || "General"]
                ).join(", ")}
                required
              />
            </label>
            <label>
              节点级别
              <select
                name="importance"
                aria-label="节点级别"
                defaultValue={node.importance}
              >
                {Object.entries(importanceNames).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <datalist id="detail-categories">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </datalist>
            <datalist id="detail-directions">
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </datalist>
            <div className="inline-edit-actions">
              <button className="primary" type="submit">
                保存标签
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
            </div>
            {node.importanceSource === "manual" && (
              <button
                type="button"
                className="text-link"
                onClick={() => void save({ importanceSource: "ai" })}
              >
                允许 AI 重新定级
              </button>
            )}
          </fieldset>
          {error && (
            <p className="note-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
export function PaperYear({
  year,
  onSave,
  children,
}: {
  year: number | null;
  onSave: (data: { year: number | null }) => Promise<unknown>;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="paper-year-editor">
      <div className="detail-author-heading">
        {children}
        <button
          className="info-pencil"
          aria-label="编辑论文年份"
          title="编辑年份"
          aria-expanded={editing}
          onClick={() => {
            setEditing(!editing);
            setError("");
          }}
        >
          <Pencil size={15} />
        </button>
      </div>
      {editing && (
        <form
          className="node-year-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            const value = new FormData(e.currentTarget).get("year");
            setBusy(true);
            setError("");
            try {
              await onSave({ year: value ? Number(value) : null });
              setEditing(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            论文年份
            <input
              aria-label="论文年份"
              name="year"
              type="number"
              min={1}
              max={new Date().getFullYear() + 1}
              defaultValue={year ?? ""}
              disabled={busy}
            />
          </label>
          <button className="primary" disabled={busy}>
            保存年份
          </button>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            取消
          </button>
        </form>
      )}
      {error && (
        <p className="note-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
