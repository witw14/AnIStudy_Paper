import { useState } from "react";
import { Pencil, ArrowRight } from "lucide-react";
import type { Workspace, Tech, Edge } from "./types";

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
const options = relations.flatMap(([relation, active, passive]) => [
  { value: `incoming:${relation}`, label: active },
  { value: `outgoing:${relation}`, label: passive },
]);
function valueOf(edge: Edge, id: string) {
  return `${edge.target === id ? "incoming" : "outgoing"}:${edge.relation}`;
}
export function ConnectedTechnologies({
  w,
  node,
  onSelect,
  onSave,
}: {
  w: Workspace;
  node: Tech;
  onSelect: (id: string) => void;
  onSave: (
    otherId: string,
    data: { relation: string | null; direction: string },
  ) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edgesFor = (id: string) =>
    w.edges.filter(
      (e) =>
        (e.source === node.id && e.target === id) ||
        (e.source === id && e.target === node.id),
    );
  const peers = w.nodes.filter((n) => n.id !== node.id);
  const connected = peers.filter((n) => edgesFor(n.id).length);
  const unconnected = peers.filter(
    (n) =>
      !edgesFor(n.id).length &&
      `${n.name} ${n.englishName || ""} ${n.chineseName || ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const total = Math.max(1, Math.ceil(unconnected.length / 20));
  const currentPage = Math.min(page, total - 1);
  function row(n: Tech) {
    const edges = edgesFor(n.id);
    const values = [...new Set(edges.map((e) => valueOf(e, node.id)))];
    return (
      <div className="connection-row" key={n.id}>
        <button className="connection-target" onClick={() => onSelect(n.id)}>
          <span>{n.name}</span>
          <ArrowRight size={14} />
        </button>
        {editing ? (
          <select
            aria-label={`${n.name} 的关系`}
            disabled={busy}
            value={values.length > 1 ? "multiple" : values[0] || "none"}
            onChange={async (e) => {
              const value = e.target.value;
              const [direction, relation] = value.split(":");
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
            {options.map((o) => (
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
                  options.find((o) => o.value === v)?.label || v.split(":")[1],
              )
              .join("、")}
          </small>
        )}
      </div>
    );
  }
  return (
    <section className="connections-editor">
      <div className="connections-heading">
        <h4>相连的技术</h4>
        <button
          aria-label={editing ? "完成关系编辑" : "编辑相连技术"}
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "完成" : <Pencil size={15} />}
        </button>
      </div>
      {error && (
        <p className="note-error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <>
          <p className="muted">
            关系以当前技术为主语：例如“使用”表示当前技术使用右侧技术。选择后立即保存。
          </p>
          <h5>当前相连技术（{connected.length}）</h5>
        </>
      )}
      <div className="connected-list">
        {connected.map(row)}
        {!connected.length && <p className="muted">暂无相连技术。</p>}
      </div>
      {editing && (
        <>
          <h5>未相连技术（{unconnected.length}）</h5>
          <input
            aria-label="搜索未相连技术"
            placeholder="搜索技术名称、中英文标题…"
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
            <p className="muted">没有匹配的未相连技术。</p>
          )}
          <div className="connection-pagination">
            <button
              disabled={currentPage === 0}
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
