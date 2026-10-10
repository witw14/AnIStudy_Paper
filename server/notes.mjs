import { z } from "zod";
import { uid } from "./seed.mjs";

const fields = {
  title: z.string().trim().min(1).max(300),
  content: z.string().max(500000),
  paperIds: z.array(z.string()).max(2000),
  nodeIds: z.array(z.string()).max(2000),
};
const createSchema = z
  .object({
    title: fields.title.default("未命名笔记"),
    content: fields.content.default(""),
    paperIds: fields.paperIds.default([]),
    nodeIds: fields.nodeIds.default([]),
  })
  .strict();
const updateSchema = z
  .object({ ...fields, revision: z.number().int().positive() })
  .strict();
const failure = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export function registerNotes(app, store, get, publicW) {
  function attachments(w, value) {
    value.paperIds = [
      ...new Set(value.paperIds.map((id) => w.paperAliases?.[id] || id)),
    ];
    value.nodeIds = [...new Set(value.nodeIds)];
    if (
      value.paperIds.some((id) => !w.papers.some((p) => p.id === id)) ||
      value.nodeIds.some((id) => !w.nodes.some((n) => n.id === id))
    )
      throw failure("关联对象不存在或不属于当前研究空间，请重新选择。");
    return value;
  }
  app.post("/api/workspaces/:wid/notes", (req, res) => {
    const w = get(req.params.wid);
    const value = attachments(w, createSchema.parse(req.body));
    const now = new Date().toISOString();
    const note = {
      ...value,
      id: uid(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    (w.notes ||= []).push(note);
    store.put(w);
    res.status(201).json({ note, workspace: publicW(w) });
  });
  app.put("/api/workspaces/:wid/notes/:id", (req, res) => {
    const w = get(req.params.wid);
    const note = (w.notes || []).find((n) => n.id === req.params.id);
    if (!note) throw failure("笔记已删除或不存在；编辑草稿仍保留在本机。", 404);
    const value = attachments(w, updateSchema.parse(req.body));
    if (value.revision !== note.revision)
      throw failure(
        "另一个窗口已修改这篇笔记。草稿已保留，请复制或导出后重新载入最新版本。",
        409,
      );
    Object.assign(note, value, {
      revision: note.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    store.put(w);
    res.json({ note, workspace: publicW(w) });
  });
  app.delete("/api/workspaces/:wid/notes/:id", (req, res) => {
    const w = get(req.params.wid);
    if (!(w.notes || []).some((n) => n.id === req.params.id))
      throw failure("笔记不存在。", 404);
    w.notes = w.notes.filter((n) => n.id !== req.params.id);
    store.put(w);
    res.json(publicW(w));
  });
}
