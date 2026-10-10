import { useState } from "react";
import {
  categoryColor,
  statusNames,
  workspaceTaxonomy,
  type Workspace,
} from "./types";

export function NodeCatalog({
  w,
  onSelect,
}: {
  w: Workspace;
  onSelect: (id: string) => void;
}) {
  const [types, setTypes] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  const nodes = w.nodes.filter(
    (n) =>
      (!types.length || types.includes(n.evidence)) &&
      (!kinds.length || kinds.includes(n.category)) &&
      (!levels.length || levels.includes(n.importance)) &&
      (!directions.length ||
        (n.directions || [n.direction]).some((id) =>
          directions.includes(id),
        )) &&
      (!statuses.length || statuses.includes(n.status)),
  );
  const categories = workspaceTaxonomy(w, "categories");
  const names = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  return (
    <details className="node-catalog">
      <summary>
        全部技术条目 <span>{w.nodes.length} 项</span>
      </summary>
      <div className="catalog-filters">
        <fieldset>
          <legend>节点类型</legend>
          {[
            ["supported", "已有资料支持"],
            ["missing", "待补足知识"],
          ].map(([id, name]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={types.includes(id)}
                onChange={() => setTypes(toggle(types, id))}
              />
              {name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>技术种类</legend>
          {categories.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={kinds.includes(c.id)}
                onChange={() => setKinds(toggle(kinds, c.id))}
              />
              {c.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>研究方向</legend>
          {workspaceTaxonomy(w, "directions").map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={directions.includes(c.id)}
                onChange={() => setDirections(toggle(directions, c.id))}
              />
              {c.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>重要程度</legend>
          {[
            ["landmark", "里程碑"],
            ["major", "重要"],
            ["normal", "普通"],
            ["minor", "次要"],
          ].map(([id, name]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={levels.includes(id)}
                onChange={() => setLevels(toggle(levels, id))}
              />
              {name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>学习状态</legend>
          {Object.entries(statusNames).map(([id, name]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={statuses.includes(id)}
                onChange={() => setStatuses(toggle(statuses, id))}
              />
              {name}
            </label>
          ))}
        </fieldset>
        <div className="catalog-result">
          <span>
            显示 {nodes.length} / {w.nodes.length} 项 · 每组未勾选时显示全部
          </span>
          <button
            onClick={() => {
              setTypes([]);
              setKinds([]);
              setStatuses([]);
              setDirections([]);
              setLevels([]);
            }}
          >
            清空筛选
          </button>
        </div>
      </div>
      <div className="node-grid">
        {nodes.map((n) => (
          <button
            className="node-list-card"
            key={n.id}
            onClick={() => onSelect(n.id)}
          >
            <i style={{ background: categoryColor(n.category) }} />
            <div>
              <strong>{n.name}</strong>
              <span>
                {names[n.category]} · {n.year ?? "年份待识别"}
              </span>
            </div>
            <span className={`status-dot ${n.status}`} />
          </button>
        ))}
      </div>
      {!nodes.length && (
        <p className="catalog-empty">没有符合筛选条件的技术。</p>
      )}
    </details>
  );
}
