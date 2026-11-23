import { z } from "zod";
import { uid } from "./seed.mjs";
import { classifyNode } from "./taxonomy.mjs";
import { identity, refreshDirections } from "./research.mjs";

const relations = z.enum([
  "Introduced by",
  "Uses",
  "Extends",
  "Popularized by",
  "Inspired by",
  "Replaces",
  "Requires",
  "Improves upon",
]);
const title = z.string().trim().max(2000);
const schema = z
  .object({
    name: title.min(1),
    englishName: title.default(""),
    chineseName: title.default(""),
    year: z
      .number()
      .int()
      .min(1)
      .max(new Date().getFullYear() + 1)
      .nullable()
      .default(null),
    category: z.string().trim().min(1).max(60),
    directions: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
    importance: z
      .enum(["landmark", "major", "normal", "minor"])
      .default("normal"),
    importanceReason: z.string().trim().max(10000).default(""),
    status: z.enum(["unlearned", "learning", "learned"]).default("unlearned"),
    description: z.string().max(100000).default(""),
    significance: z.string().max(100000).default(""),
    contribution: title.default(""),
    hiddenInGraph: z.boolean().default(false),
    connections: z
      .array(
        z
          .object({
            otherId: z.string().min(1).max(100),
            relation: relations,
            direction: z.enum(["incoming", "outgoing"]),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    paperRelations: z
      .array(
        z
          .object({
            paperId: z.string().min(1).max(100),
            relation: relations,
            summary: z
              .object({
                role: z.string().max(10000),
                implementation: z.string().max(10000),
              })
              .optional(),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
  })
  .strict();
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function registerManualNodes(app, { store, get, publicW }) {
  app.post("/api/workspaces/:wid/nodes", (req, res) => {
    const w = get(req.params.wid),
      b = schema.parse(req.body);
    const aliases = [b.name, b.englishName, b.chineseName]
      .filter(Boolean)
      .map(identity);
    if (
      w.nodes.some((n) =>
        [n.name, n.englishName, n.chineseName]
          .filter(Boolean)
          .some((name) => aliases.includes(identity(name))),
      )
    )
      throw fail("该名称的技术已存在，请编辑已有节点。", 409);
    for (const [entries, idKey, collection] of [
      [b.connections, "otherId", "nodes"],
      [b.paperRelations, "paperId", "papers"],
    ]) {
      const ids = entries.map((e) => e[idKey]);
      if (new Set(ids).size !== ids.length)
        throw fail("同一对象只能选择一次关系。");
      if (ids.some((id) => !w[collection].some((item) => item.id === id)))
        throw fail("关联对象不在当前研究空间中。", 404);
    }
    const { connections, ...data } = b;
    const node = {
      ...data,
      id: uid(),
      ...classifyNode(w, b),
      name:
        (store.settings().preferEnglishTerms !== false
          ? b.englishName
          : b.chineseName) || b.name,
      paperIds: b.paperRelations.map((p) => p.paperId),
      paperRelations: b.paperRelations.map((r) => ({ ...r, source: "manual" })),
      importanceSource: "manual",
      importanceReason: b.importanceReason || "用户手动创建并选择的级别。",
      provenance: "manual",
      evidence: b.paperRelations.some(
        (r) => w.papers.find((p) => p.id === r.paperId)?.inLibrary,
      )
        ? "supported"
        : "missing",
    };
    node.userEdits = Object.fromEntries(
      [
        "name",
        "englishName",
        "chineseName",
        "year",
        "description",
        "significance",
        "hiddenInGraph",
      ].map((key) => [key, node[key]]),
    );
    w.nodes.push(node);
    w.manualConnections ||= [];
    for (const c of connections)
      w.manualConnections.push({
        id: uid(),
        source: c.direction === "incoming" ? c.otherId : node.id,
        target: c.direction === "incoming" ? node.id : c.otherId,
        relation: c.relation,
      });
    refreshDirections(w);
    store.put(w);
    res.status(201).json({ workspace: publicW(get(w.id)), nodeId: node.id });
  });
}
