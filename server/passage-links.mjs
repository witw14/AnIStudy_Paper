const clean = (value) => (typeof value === "string" ? value.trim() : "");
const normalized = (value) =>
  clean(value).normalize("NFKC").replace(/\s+/g, " ");
const conceptKey = (value) =>
  normalized(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const meaningfulLabel = (value) =>
  typeof value === "string" &&
  value.trim() &&
  [...value].length <= 10 &&
  !["整理关联", "术语匹配", "相关技术", "相关段落"].includes(value);
export const passageLabels = [
  "引入原因",
  "正式讲解",
  "计算公式",
  "实现细节",
  "理由及证据",
  "问题和缺陷",
  "实验结果",
  "应用方式",
  "改进方式",
];
export const passagePrompt =
  "有 passages 时，每个技术返回 sourcePassages:[{blockId,label,quote}]，最多4项，按理解价值排序，允许0项，不凑数量。label为不超过10个中文字符的具体信息用途，可选引入原因、正式讲解、计算公式、实现细节、理由及证据、问题和缺陷、实验结果、应用方式、改进方式。quote逐字摘录本次片段中支持这个用途的关键原句，不能编写或改写。只选能实质解释该技术的段落；仅出现术语、背景提及、摘要或总结贡献的段落不关联。例如Transformer总结句说用多头自注意力替换循环层，不足以作为Self-Attention讲解。相同章节同一用途只保留最有效的一处，不因HTML拆成多个段落而重复定位；同一技术最多一个相同用途标签。只使用给定blockId，不把标题、参考文献当证据；原文没给出有用信息则返回空数组。";
export function normalizeSourcePassages(node) {
  return (Array.isArray(node.sourcePassages) ? node.sourcePassages : [])
    .flatMap((p) => {
      const blockId = clean(p?.blockId).slice(0, 100),
        label = clean(p?.label),
        quote = clean(p?.quote);
      return blockId && meaningfulLabel(label) && quote
        ? [{ blockId, label, quote: quote.slice(0, 2000) }]
        : [];
    })
    .slice(0, 12);
}
function usable(block) {
  return (
    block &&
    !["heading", "authors"].includes(block.kind) &&
    !/references|bibliography|acknowledg|参考文献|致谢/i.test(
      block.section || "",
    ) &&
    !/^(in (this|our) (work|paper),? we (present|propos|introduc)|we (have )?(presented|proposed))/i.test(
      block.text.trim(),
    )
  );
}
function legacyLabel(block) {
  if (!usable(block)) return "";
  const text = block.text;
  if (
    /<math|class=["'][^"']*equation/i.test(block.html || "") ||
    /(?:sin\(|cos\(|=\s*(?:softmax|sin|cos)|计算公式)/i.test(text)
  )
    return "计算公式";
  if (/limitation|drawback|shortcoming|fails? to|缺陷|局限/i.test(text))
    return "问题和缺陷";
  if (/ablation|results? (show|demonstrate)|outperform|实验|消融/i.test(text))
    return "理由及证据";
  if (
    /in order to|because|motivat|to (avoid|address|overcome)|为了|由于/i.test(
      text,
    )
  )
    return "引入原因";
  if (
    /defined? as|comput(e|ed|ation)|weighted|weights?|project|encoder|decoder|mechanism|combine|gating|计算|权重|机制/i.test(
      text,
    ) &&
    text.length >= 60
  )
    return "正式讲解";
  return "";
}
export function curatedParagraphLinks(w, paper, doc) {
  if (!doc) return [];
  const output = [],
    seen = new Set(),
    counts = new Map();
  for (const link of paper.paragraphLinks || []) {
    if (link.documentId !== doc.id || !["ai", "manual"].includes(link.source))
      continue;
    const node = w.nodes.find((n) => n.id === link.nodeId),
      block = doc.blocks.find((b) => b.id === link.blockId);
    if (
      !node ||
      !block ||
      (paper.blockedParagraphLinks || []).some(
        (l) =>
          l.documentId === doc.id &&
          l.nodeId === node.id &&
          l.blockId === block.id,
      )
    )
      continue;
    const label =
      link.label ||
      (link.source === "manual" ? "手动关联" : legacyLabel(block));
    if (!label || (link.source === "ai" && !usable(block))) continue;
    const key = `${node.id}:${label}:${link.source === "manual" ? block.id : normalSection(block.section)}`;
    if (
      seen.has(key) ||
      (link.source === "ai" && (counts.get(node.id) || 0) >= 4)
    )
      continue;
    seen.add(key);
    if (link.source === "ai")
      counts.set(node.id, (counts.get(node.id) || 0) + 1);
    output.push({
      ...link,
      label,
      nodeName: node.name,
      section: block.section,
      page: block.page,
    });
  }
  return output;
}
const normalSection = (value) => normalized(value).toLowerCase();
export function applyPassageLinks(w, paper, doc, nodes) {
  if (!doc) return;
  paper.paragraphLinks = (paper.paragraphLinks || []).filter(
    (l) => !(l.source === "ai" && l.documentId === doc.id),
  );
  for (const raw of nodes) {
    if (raw.necessary === false || raw.relevance === "incidental") continue;
    const aliases = [raw.name, raw.englishName, raw.chineseName]
      .map(conceptKey)
      .filter(Boolean);
    const node = w.nodes.find(
      (n) =>
        n.paperIds.includes(paper.id) &&
        (n.id === raw.existingNodeId ||
          [n.name, n.englishName, n.chineseName, ...(n.aliases || [])].some(
            (name) => aliases.includes(conceptKey(name)),
          )),
    );
    if (!node) continue;
    const candidates = raw.sourcePassages?.length
      ? raw.sourcePassages
      : (raw.sourceParagraphIds || []).map((blockId) => ({
          blockId,
          legacy: true,
        }));
    const used = new Set();
    let count = 0;
    for (const candidate of candidates) {
      const block = doc.blocks.find((b) => b.id === candidate.blockId);
      if (!usable(block)) continue;
      const label = candidate.legacy ? legacyLabel(block) : candidate.label;
      if (!meaningfulLabel(label) || used.has(label)) continue;
      if (
        !candidate.legacy &&
        (!candidate.quote ||
          !normalized(block.text).includes(normalized(candidate.quote)))
      )
        continue;
      if (
        paper.paragraphLinks.some(
          (l) =>
            l.nodeId === node.id &&
            l.documentId === doc.id &&
            l.blockId === block.id,
        )
      )
        continue;
      paper.paragraphLinks.push({
        nodeId: node.id,
        documentId: doc.id,
        blockId: block.id,
        label,
        quote: candidate.quote,
        source: "ai",
      });
      used.add(label);
      if (++count >= 4) break;
    }
  }
}
