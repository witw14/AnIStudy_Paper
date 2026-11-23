import { useState, type FormEvent } from "react";
import { api } from "./api";
import { technologyRelationOptions } from "./ConnectedTechnologies";
import { importanceNames } from "./Customization";
import { workspaceTaxonomy, statusNames, type Workspace } from "./types";
import "./createTechnology.css";

const paperOptions = [
  ["Introduced by", "由论文提出"],
  ["Uses", "论文使用"],
  ["Extends", "论文扩展"],
  ["Popularized by", "由论文推广"],
  ["Inspired by", "受论文启发"],
  ["Replaces", "论文替代"],
  ["Requires", "论文需要的前置"],
  ["Improves upon", "论文改进"],
];
export function CreateTechnology({
  w,
  onCreated,
}: {
  w: Workspace;
  onCreated: (data: { workspace: Workspace; nodeId: string }) => void;
}) {
  const [connections, setConnections] = useState<Record<string, string>>({});
  const [papers, setPapers] = useState<
    Record<string, { relation: string; role: string; implementation: string }>
  >({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [paperQuery, setPaperQuery] = useState("");
  const [paperPage, setPaperPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = w.nodes.filter((n) =>
    `${n.name} ${n.englishName || ""} ${n.chineseName || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const matchingPapers = w.papers.filter((p) =>
    `${p.title} ${p.short} ${p.arxivId || ""}`
      .toLowerCase()
      .includes(paperQuery.trim().toLowerCase()),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const f = new FormData(event.currentTarget);
    const value = (key: string) => String(f.get(key) || "").trim();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ workspace: Workspace; nodeId: string }>(
        `/workspaces/${w.id}/nodes`,
        {
          name: value("name"),
          englishName: value("englishName"),
          chineseName: value("chineseName"),
          year: value("year") ? Number(value("year")) : null,
          category: value("category"),
          directions: value("directions")
            .split(/[,，、;；]/)
            .map((s) => s.trim())
            .filter(Boolean),
          importance: value("importance"),
          importanceReason: value("importanceReason"),
          status: value("status"),
          description: value("description"),
          significance: value("significance"),
          contribution: value("contribution"),
          hiddenInGraph: f.has("hiddenInGraph"),
          connections: Object.entries(connections)
            .filter(([, v]) => v !== "none")
            .map(([otherId, v]) => {
              const [direction, relation] = v.split(":");
              return { otherId, direction, relation };
            }),
          paperRelations: Object.entries(papers)
            .filter(([, p]) => p.relation !== "none")
            .map(([paperId, p]) => ({
              paperId,
              relation: p.relation,
              summary: { role: p.role, implementation: p.implementation },
            })),
        },
      );
      onCreated(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pagination = (
    current: number,
    count: number,
    change: (n: number) => void,
  ) => (
    <div className="connection-pagination">
      <button
        type="button"
        disabled={!current}
        onClick={() => change(current - 1)}
      >
        上一页
      </button>
      <span>
        {current + 1} / {Math.max(1, Math.ceil(count / 20))}
      </span>
      <button
        type="button"
        disabled={(current + 1) * 20 >= count}
        onClick={() => change(current + 1)}
      >
        下一页
      </button>
    </div>
  );
  return (
    <form className="create-technology" onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="technology-fields">
          <label>
            节点标题
            <input
              name="name"
              required
              maxLength={2000}
              placeholder="至少填写一个标题"
            />
          </label>
          <label>
            年份
            <input
              name="year"
              type="number"
              min={1}
              max={new Date().getFullYear() + 1}
              placeholder="未识别 / 未知"
            />
          </label>
          <label>
            英文标题
            <input name="englishName" maxLength={2000} />
          </label>
          <label>
            中文标题
            <input name="chineseName" maxLength={2000} />
          </label>
          <label>
            技术种类
            <input
              name="category"
              required
              list="new-node-categories"
              defaultValue="未分类"
              maxLength={60}
            />
          </label>
          <label>
            研究方向
            <input
              name="directions"
              required
              list="new-node-directions"
              defaultValue="未分类"
              placeholder="多个方向用逗号分隔"
            />
          </label>
          <label>
            重要性
            <select name="importance" aria-label="重要性" defaultValue="normal">
              {Object.entries(importanceNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            学习状态
            <select
              name="status"
              aria-label="学习状态"
              defaultValue="unlearned"
            >
              {Object.entries(statusNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <datalist id="new-node-categories">
          {workspaceTaxonomy(w, "categories").map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        <datalist id="new-node-directions">
          {workspaceTaxonomy(w, "directions").map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        <label>
          技术说明（Markdown）
          <textarea name="description" rows={4} maxLength={100000} />
        </label>
        <label>
          技术意义（Markdown）
          <textarea name="significance" rows={3} maxLength={100000} />
        </label>
        <label>
          重要性判断理由
          <textarea name="importanceReason" rows={2} maxLength={10000} />
        </label>
        <label>
          贡献说明
          <input name="contribution" maxLength={2000} />
        </label>
        <label className="motion-option">
          <input name="hiddenInGraph" type="checkbox" />
          隐藏节点（主要 / 极简模式）
        </label>
        <details open>
          <summary>
            技术关系 · 已选{" "}
            {Object.values(connections).filter((v) => v !== "none").length}
          </summary>
          <input
            aria-label="搜索关联技术"
            placeholder="搜索技术…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          {matches.slice(page * 20, (page + 1) * 20).map((n) => (
            <div className="connection-row" key={n.id}>
              <span title={n.name}>{n.name}</span>
              <select
                aria-label={`新节点与 ${n.name} 的关系`}
                value={connections[n.id] || "none"}
                onChange={(e) =>
                  setConnections({ ...connections, [n.id]: e.target.value })
                }
              >
                <option value="none">无关系</option>
                {technologyRelationOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {!matches.length && <p className="muted">没有匹配的技术。</p>}
          {pagination(page, matches.length, setPage)}
        </details>
        <details>
          <summary>
            论文关系 · 已选{" "}
            {Object.values(papers).filter((p) => p.relation !== "none").length}
          </summary>
          <input
            aria-label="搜索关联论文"
            placeholder="搜索论文…"
            value={paperQuery}
            onChange={(e) => {
              setPaperQuery(e.target.value);
              setPaperPage(0);
            }}
          />
          {matchingPapers
            .slice(paperPage * 20, (paperPage + 1) * 20)
            .map((p) => {
              const selected = papers[p.id] || {
                relation: "none",
                role: "",
                implementation: "",
              };
              const update = (data: Partial<typeof selected>) =>
                setPapers({ ...papers, [p.id]: { ...selected, ...data } });
              return (
                <div key={p.id} className="new-node-paper">
                  <div className="connection-row">
                    <span title={p.title}>{p.title}</span>
                    <select
                      aria-label={`与论文 ${p.title} 的关系`}
                      value={selected.relation}
                      onChange={(e) => update({ relation: e.target.value })}
                    >
                      <option value="none">无关系</option>
                      {paperOptions.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selected.relation !== "none" && (
                    <div className="technology-fields">
                      <label>
                        在论文中的作用
                        <textarea
                          rows={2}
                          value={selected.role}
                          onChange={(e) => update({ role: e.target.value })}
                        />
                      </label>
                      <label>
                        在论文中的实现
                        <textarea
                          rows={2}
                          value={selected.implementation}
                          onChange={(e) =>
                            update({ implementation: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          {!matchingPapers.length && <p className="muted">没有匹配的论文。</p>}
          {pagination(paperPage, matchingPapers.length, setPaperPage)}
        </details>
      </fieldset>
      {error && (
        <p className="note-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "正在保存…" : "创建技术节点"}
      </button>
    </form>
  );
}
