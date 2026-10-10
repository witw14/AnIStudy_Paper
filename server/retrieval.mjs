import { allDocuments } from "./documents.mjs";
const intents = [
  [
    /局限|不足|缺点|限制|limitation|weakness/i,
    "limitations discussion failure drawbacks",
  ],
  [
    /实验|消融|结果|比较|experiment|ablation/i,
    "experiments ablation results evaluation comparison",
  ],
  [
    /实现|方法|怎么|如何|mechanism|implementation/i,
    "method architecture implementation algorithm",
  ],
  [/训练|损失|优化|train|loss/i, "training objective loss optimization"],
  [/结论|贡献|conclusion|contribution/i, "conclusion contributions"],
];
const stop = new Set(
  "this that paper what how why which does please explain about with from their these using have into your the and for are was you has its not can should 技术 论文 这个 如何 什么 请解释".split(
    " ",
  ),
);
export function searchTerms(query, nodes = []) {
  let text = query;
  for (const [test, words] of intents)
    if (test.test(query)) text += " " + words;
  for (const n of nodes) {
    const names = [n.name, n.englishName, n.chineseName].filter(Boolean);
    if (
      names.some(
        (name) =>
          name.length > 1 && query.toLowerCase().includes(name.toLowerCase()),
      )
    )
      text += " " + names.join(" ");
  }
  const parts =
    text.toLowerCase().match(/[a-z][a-z0-9_-]+|[\u3400-\u9fff]+/g) || [];
  const terms = parts.flatMap((p) =>
    /[\u3400-\u9fff]/.test(p) && p.length > 4
      ? [...Array(p.length - 1)].map((_, i) => p.slice(i, i + 2))
      : [p],
  );
  return [...new Set(terms.filter((t) => !stop.has(t)))].slice(0, 100);
}
export function retrievePassages(
  w,
  { mode, paperId, query, selection, selections },
) {
  const anchors = selections?.length
    ? selections
    : selection
      ? [selection]
      : [];
  const papers = w.papers.filter(
    (p) => p.inLibrary && (mode !== "paper" || p.id === paperId),
  );
  const terms = searchTerms(query, w.nodes);
  const overview = /概括|总结|整篇|全文概览|主要贡献|overview|summarize/i.test(
    query,
  );
  const candidates = [];
  for (const p of papers) {
    const doc =
      anchors.length && p.id === paperId
        ? allDocuments(p).find((d) => d.id === anchors[0].documentId)
        : p.document;
    if (!doc) continue;
    for (const [i, block] of doc.blocks.entries()) {
      if (block.kind === "heading" || !block.text.trim()) continue;
      const text = block.text.toLowerCase(),
        section = block.section.toLowerCase();
      let score = terms.reduce(
        (sum, t) =>
          sum +
          (text.includes(t)
            ? 1 + Math.min(3, text.split(t).length - 1) * 0.3
            : 0) +
          (section.includes(t) ? 1.5 : 0),
        0,
      );
      if (
        /references|bibliography|参考文献/.test(section) &&
        !/参考|引用|文献|reference|citation/i.test(query)
      )
        score *= 0.15;
      if (
        overview &&
        !/references|bibliography|参考文献/.test(section) &&
        (i === 0 || doc.blocks[i - 1]?.section !== block.section)
      )
        score += 6;
      if (
        anchors.some((a) => doc.id === a.documentId && block.id === a.blockId)
      )
        score += 1000;
      candidates.push({ p, doc, block, index: i, score });
    }
  }
  if (
    mode === "paper" &&
    !candidates.some((c) => c.score > 0) &&
    candidates.reduce((sum, c) => sum + c.block.text.length, 0) <= 12000
  )
    for (const c of candidates) c.score = 0.5;
  candidates.sort((a, b) => b.score - a.score || a.block.order - b.block.order);
  const chosen = [],
    keys = new Set();
  let used = 0;
  function add(c, selected = false) {
    const key = `${c.p.id}:${c.doc.id}:${c.block.id}`;
    if (keys.has(key) || chosen.length >= 14 || used >= 24000) return;
    const term = terms
      .filter((t) => c.block.text.toLowerCase().includes(t))
      .sort((a, b) => b.length - a.length)[0];
    const anchor = anchors.find(
      (a) => a.documentId === c.doc.id && a.blockId === c.block.id,
    );
    const start = selected
      ? Math.max(0, (anchor?.start || 0) - 500)
      : term
        ? Math.max(0, c.block.text.toLowerCase().indexOf(term) - 500)
        : 0;
    const length = selected
      ? Math.min(12000, (anchor?.end || start + 2000) - start + 500)
      : 2500;
    const text = c.block.text.slice(
      start,
      start + Math.min(length, 24000 - used),
    );
    chosen.push({
      ...c,
      text,
      selectedText:
        selected && anchor
          ? c.block.text.slice(anchor.start, anchor.end).slice(0, 10000)
          : undefined,
    });
    keys.add(key);
    used += text.length;
  }
  for (const c of candidates.filter((c) => c.score >= 1000)) add(c, true);
  for (const c of candidates.filter((c) => c.score > 0).slice(0, 8)) {
    add(c, c.score >= 1000);
    for (const index of [c.index - 1, c.index + 1]) {
      const b = c.doc.blocks[index];
      if (b && b.kind !== "heading" && b.section === c.block.section)
        add({ ...c, block: b, index });
    }
  }
  return chosen.map((c, i) => ({
    id: `S${i + 1}`,
    paperId: c.p.id,
    paperTitle: c.p.title,
    documentId: c.doc.id,
    blockId: c.block.id,
    section: c.block.section,
    page: c.block.page,
    version: c.doc.version,
    source: c.doc.source,
    snippet: c.text.slice(0, 500),
    text: c.text,
    selectedText: c.selectedText,
  }));
}
export function bindCitations(reply, sources) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const used = new Set();
  const content = reply.replace(/\[\[cite:(S\d+)\]\]/g, (_, id) => {
    if (!byId.has(id)) return "（出处未定位）";
    used.add(id);
    const s = byId.get(id);
    const label = s.section.replace(/[\[\]\\]/g, "\\$&").replace(/\s+/g, " ");
    return `[${label}${s.page ? ` · PDF 第 ${s.page} 页` : ""}](#source-${id})`;
  });
  const clean = (s) => {
    const { text, selectedText, ...rest } = s;
    return rest;
  };
  return {
    content,
    citations: sources.filter((s) => used.has(s.id)).map(clean),
    retrievedSources: sources.map(clean),
  };
}
