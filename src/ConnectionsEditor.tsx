import { useState } from "react";
import { Pencil, ArrowRight, Check } from "lucide-react";
import type { Edge } from "./types";
const relations = [
  ["Uses", "使用", "被使用"],
  ["Extends", "扩展", "被扩展"],
  ["Requires", "依赖", "被依赖"],
  ["Improves upon", "改进", "被改进"],
  ["Inspired by", "受其启发", "启发"],
  ["Replaces", "替代", "被替代"],
  ["Introduced by", "由其提出", "提出"],
  ["Popularized by", "由其推广", "推广"],
];
export const technologyRelationOptions = relations.flatMap(
  ([relation, active, passive]) => [
    { value: `incoming:${relation}`, label: active },
    { value: `outgoing:${relation}`, label: passive },
  ],
);
export function ConnectionsEditor({
  kind,
  itemId,
  items,
  edges,
  onSelect,
  onSave,
}: {
  kind: "技术" | "论文";
  itemId: string;
  items: { id: string; name: string; search?: string }[];
  edges: Edge[];
  onSelect: (id: string) => void;
  onSave: (
    id: string,
    data: { relation: string | null; direction: string },
  ) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const edgesFor = (id: string) =>
    edges.filter(
      (e) =>
        (e.source === itemId && e.target === id) ||
        (e.source === id && e.target === itemId),
    );
  const peers = items.filter((n) => n.id !== itemId),
    connected = peers.filter((n) => edgesFor(n.id).length);
  const unconnected = peers.filter(
    (n) =>
      !edgesFor(n.id).length &&
      (n.search || n.name)
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const total = Math.max(1, Math.ceil(unconnected.length / 20)),
    currentPage = Math.min(page, total - 1);
  function row(n: (typeof items)[number]) {
    const values = [
      ...new Set(
        edgesFor(n.id).map(
          (e) =>
            `${e.target === itemId ? "incoming" : "outgoing"}:${e.relation}`,
        ),
      ),
    ];
    return (
      <div className="connection-row" key={n.id}>
        <button className="connection-target" onClick={() => onSelect(n.id)}>
          <span>{n.name}</span>
          <ArrowRight size={14} />
        </button>
        {editing ? (
          <select
            aria-label={`${n.name} 的关系`}
            value={values.length > 1 ? "multiple" : values[0] || "none"}
            disabled={busy}
            onChange={async (e) => {
              const value = e.target.value,
                [direction, relation] = value.split(":");
              setBusy(true);
              setError("");
              try {
                await onSave(n.id, {
                  direction: value === "none" ? "incoming" : direction,
                  relation: value === "none" ? null : relation,
                });
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <option value="none">无关系</option>
            {values.length > 1 && (
              <option value="multiple" disabled>
                多种关系（选择后替换）
              </option>
            )}
            {technologyRelationOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <small>
            {values
              .map(
                (v) =>
                  technologyRelationOptions.find((o) => o.value === v)?.label ||
                  v.split(":")[1],
              )
              .join("、")}
          </small>
        )}
      </div>
    );
  }
  return (
    <section
      className={`connections-editor connected-${kind === "论文" ? "papers" : "technologies"}`}
    >
      <div className="connections-heading">
        <h4>相连{kind}</h4>
        <button
          aria-label={editing ? `完成${kind}关系编辑` : `编辑相连${kind}`}
          title={editing ? "完成" : `编辑相连${kind}`}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          {editing ? <Check size={15} /> : <Pencil size={15} />}
        </button>
      </div>
      {error && (
        <p className="note-error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <h5>
          当前相连{kind}（{connected.length}）
        </h5>
      )}
      <div className="connected-list">{connected.map(row)}</div>
      {editing && (
        <>
          <h5>
            未相连{kind}（{unconnected.length}）
          </h5>
          <input
            aria-label={`搜索未相连${kind}`}
            placeholder={`搜索${kind}…`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <div className="unconnected-list">
            {unconnected
              .slice(currentPage * 20, (currentPage + 1) * 20)
              .map(row)}
          </div>
          {!unconnected.length && (
            <p className="muted">没有匹配的未相连{kind}。</p>
          )}
          <div className="connection-pagination">
            <button
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              上一页
            </button>
            <span>
              {currentPage + 1} / {total} · 每页最多 20 个
            </span>
            <button
              disabled={currentPage + 1 >= total}
              onClick={() => setPage(currentPage + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </section>
  );
}
