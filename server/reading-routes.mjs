import { z } from "zod";
import { uid } from "./seed.mjs";
import { allDocuments, paragraphLinks } from "./documents.mjs";
import { readingView } from "./translation.mjs";

export function registerReading(app, { store, get, item, publicW, acquirer }) {
  const fail = (m, status = 400) => Object.assign(new Error(m), { status });
  const anchorSchema = z.object({
    documentId: z.string().max(100),
    blockId: z.string().max(100),
  });
  const color = z.enum(["yellow", "green", "blue", "pink"]);
  function locate(w, pid, anchor) {
    const p = item(w, "papers", pid);
    const doc = readingView(p, anchor.documentId);
    const block = doc?.blocks.find((b) => b.id === anchor.blockId);
    if (!block)
      throw fail("原文位置不属于当前论文或版本，请重新打开原文。", 409);
    return { p, doc, block };
  }
  app.get("/api/workspaces/:wid/papers/:pid/document", async (req, res) => {
    const initial = get(req.params.wid);
    const p = item(initial, "papers", req.params.pid);
    await acquirer.ensureDocument(initial.id, p.id);
    const w = get(initial.id),
      current = item(w, "papers", p.id);
    const doc = req.query.documentId
      ? readingView(current, req.query.documentId)
      : current.document;
    if (!doc) throw fail("尚无正文，请获取原文或上传 PDF。", 404);
    const links =
      doc.source === "translation" ? [] : paragraphLinks(w, current, doc);
    for (const link of links) {
      const n = w.nodes.find((n) => n.id === link.nodeId);
      if (n)
        link.nodeName =
          store.settings().preferEnglishTerms !== false
            ? n.englishName || n.name
            : n.chineseName || n.name;
    }
    res.json({
      paperId: current.id,
      paperTitle: current.title,
      inLibrary: current.inLibrary,
      document: doc,
      translation: (current.fullTranslations || []).find(
        (t) => t.sourceDocumentId === doc.id,
      ),
      translationAnnotations: (current.annotations || []).filter(
        (a) => a.documentId === `zh-${doc.id}`,
      ),
      annotations: (current.annotations || []).filter(
        (a) => a.documentId === doc.id,
      ),
      otherAnnotationCount: (current.annotations || []).filter(
        (a) => a.documentId !== doc.id,
      ).length,
      links,
      nodes: w.nodes.map((n) => ({
        id: n.id,
        name:
          store.settings().preferEnglishTerms !== false
            ? n.englishName || n.name
            : n.chineseName || n.name,
      })),
      versions: allDocuments(current).map((d) => ({
        id: d.id,
        source: d.source,
        version: d.version,
        createdAt: d.createdAt,
      })),
    });
  });
  app.post("/api/workspaces/:wid/papers/:pid/acquire", (req, res) => {
    const w = get(req.params.wid),
      p = item(w, "papers", req.params.pid);
    const b = z
      .object({ organize: z.boolean().optional() })
      .parse(req.body || {});
    if (!p.file && !p.arxivId) throw fail("没有 arXiv 编号，请上传 PDF。");
    acquirer.enqueue(w.id, p.id, {
      download: true,
      organize: b.organize ?? store.settings().autoOrganizePapers === true,
    });
    res.json(publicW(get(w.id)));
  });
  app.post("/api/workspaces/:wid/routes/:rid/acquire", (req, res) => {
    const w = get(req.params.wid),
      route = item(w, "routes", req.params.rid);
    for (const id of new Set(route.stages.flatMap((s) => s.paperIds))) {
      const p = item(w, "papers", id);
      if (p.arxivId || p.file)
        acquirer.enqueue(w.id, p.id, {
          download: true,
          organize: store.settings().autoOrganizePapers === true,
        });
    }
    res.json(publicW(get(w.id)));
  });
  app.post("/api/workspaces/:wid/papers/:pid/annotations", (req, res) => {
    const w = get(req.params.wid);
    const b = anchorSchema
      .extend({
        start: z.number().int().min(0),
        end: z.number().int().min(1),
        quote: z.string().min(1).max(10000),
        color: color.default("yellow"),
        note: z.string().max(20000).default(""),
        groupId: z.string().max(100).optional(),
      })
      .parse(req.body);
    const { p, block } = locate(w, req.params.pid, b);
    if (
      b.end <= b.start ||
      b.end > block.text.length ||
      block.text.slice(b.start, b.end) !== b.quote
    )
      throw fail("选段位置已变化，请重新选择原文。", 409);
    p.annotations ||= [];
    if (p.annotations.length >= 3000)
      throw fail("这篇论文的标注过多，请先整理现有标注。");
    const a = {
      ...b,
      id: uid(),
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    p.annotations.push(a);
    store.put(w);
    res.status(201).json(a);
  });
  app.patch("/api/workspaces/:wid/papers/:pid/annotations/:aid", (req, res) => {
    const w = get(req.params.wid),
      p = item(w, "papers", req.params.pid);
    const b = z
      .object({
        revision: z.number().int().min(1),
        note: z.string().max(20000).optional(),
        color: color.optional(),
      })
      .parse(req.body);
    const a = (p.annotations || []).find((a) => a.id === req.params.aid);
    if (!a) throw fail("标注不存在。", 404);
    if (a.revision !== b.revision)
      throw fail(
        "标注已在其他窗口更新，请重新载入后编辑；当前草稿仍保留。",
        409,
      );
    Object.assign(a, b, {
      revision: a.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    store.put(w);
    res.json(a);
  });
  app.delete(
    "/api/workspaces/:wid/papers/:pid/annotations/:aid",
    (req, res) => {
      const w = get(req.params.wid),
        p = item(w, "papers", req.params.pid);
      const revision = z
        .object({ revision: z.number().int().min(1).optional() })
        .parse(req.body || {}).revision;
      const a = (p.annotations || []).find((a) => a.id === req.params.aid);
      if (a && revision !== undefined && a.revision !== revision)
        throw fail("标注已在其他窗口更新，请重新选择后确认删除。", 409);
      p.annotations = (p.annotations || []).filter(
        (a) => a.id !== req.params.aid,
      );
      store.put(w);
      res.json({ ok: true });
    },
  );
  app.post("/api/workspaces/:wid/papers/:pid/paragraph-links", (req, res) => {
    const w = get(req.params.wid),
      b = anchorSchema.extend({ nodeId: z.string().max(100) }).parse(req.body);
    const { p } = locate(w, req.params.pid, b);
    if (!allDocuments(p).some((d) => d.id === b.documentId))
      throw fail("技术只能关联原文段落。", 409);
    item(w, "nodes", b.nodeId);
    p.paragraphLinks ||= [];
    p.blockedParagraphLinks = (p.blockedParagraphLinks || []).filter(
      (l) =>
        !(
          l.nodeId === b.nodeId &&
          l.blockId === b.blockId &&
          l.documentId === b.documentId
        ),
    );
    if (
      !p.paragraphLinks.some(
        (l) =>
          l.nodeId === b.nodeId &&
          l.blockId === b.blockId &&
          l.documentId === b.documentId,
      )
    )
      p.paragraphLinks.push({ ...b, source: "manual" });
    store.put(w);
    res.json({ ok: true });
  });
  app.delete("/api/workspaces/:wid/papers/:pid/paragraph-links", (req, res) => {
    const w = get(req.params.wid),
      b = anchorSchema.extend({ nodeId: z.string().max(100) }).parse(req.body);
    const { p } = locate(w, req.params.pid, b);
    p.paragraphLinks = (p.paragraphLinks || []).filter(
      (l) =>
        !(
          l.nodeId === b.nodeId &&
          l.blockId === b.blockId &&
          l.documentId === b.documentId
        ),
    );
    p.blockedParagraphLinks ||= [];
    if (
      !p.blockedParagraphLinks.some(
        (l) =>
          l.nodeId === b.nodeId &&
          l.blockId === b.blockId &&
          l.documentId === b.documentId,
      )
    )
      p.blockedParagraphLinks.push(b);
    store.put(w);
    res.json({ ok: true });
  });
  app.get("/api/workspaces/:wid/nodes/:nid/passages", (req, res) => {
    const w = get(req.params.wid),
      node = item(w, "nodes", req.params.nid);
    res.json(
      w.papers.flatMap((p) =>
        allDocuments(p).flatMap((doc) =>
          paragraphLinks(w, p, doc)
            .filter((l) => l.nodeId === node.id)
            .map((l) => ({
              ...l,
              paperId: p.id,
              paperTitle: p.title,
              snippet: doc.blocks
                .find((b) => b.id === l.blockId)
                ?.text.slice(0, 180),
            })),
        ),
      ),
    );
  });
}
