import { XMLParser } from "fast-xml-parser";
import { reasoningBody } from "./reasoning.mjs";
import { tokenUsage } from "./token-usage.mjs";
import { arxivRequest } from "./arxiv-network.mjs";
export function arxivId(input) {
  const match = String(input)
    .trim()
    .match(
      /^(?:https:\/\/arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)(?:\.pdf)?$/,
    );
  if (!match)
    throw Object.assign(
      new Error("请输入有效的 arXiv ID 或 arxiv.org 链接。"),
      { status: 400 },
    );
  return match[1];
}
export async function verifyArxiv(input) {
  const id = arxivId(input);
  const xml = await arxivRequest(async () => {
    const response = await fetch(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(25000) },
    );
    if (!response.ok) throw new Error("arXiv 暂时不可用，请稍后重试。");
    return response.text();
  });
  const data = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const entry = Array.isArray(data.feed?.entry)
    ? data.feed.entry[0]
    : data.feed?.entry;
  if (
    !entry?.id ||
    !String(entry.id).includes("/abs/") ||
    !entry.title ||
    !entry.published
  )
    throw Object.assign(new Error("未找到可验证的论文，未加入正式推荐。"), {
      status: 422,
    });
  const returned = String(entry.id).split("/abs/")[1];
  if (returned.replace(/v\d+$/, "") !== id.replace(/v\d+$/, ""))
    throw new Error("arXiv 返回的论文编号不匹配。");
  const authors = (Array.isArray(entry.author) ? entry.author : [entry.author])
    .map((a) => a?.name)
    .filter(Boolean)
    .join(", ");
  return {
    title: String(entry.title).replace(/\s+/g, " ").trim(),
    authors,
    year: Number(String(entry.published).slice(0, 4)),
    arxivId: id,
    arxivVersion: returned,
    summary: String(entry.summary || "")
      .replace(/\s+/g, " ")
      .trim(),
    verification: "verified",
    verifiedAt: new Date().toISOString(),
    source: "arxiv",
  };
}
export function scopedContext(w, mode, paperId) {
  const paper = w.papers.find((p) => p.id === paperId && p.inLibrary);
  if (mode === "paper" && !paper)
    throw Object.assign(new Error("请先选择当前工作空间中的一篇论文。"), {
      status: 400,
    });
  const concise = (p) => ({
    id: p.id,
    title: p.title,
    authors: p.authors,
    year: p.year,
    summary: p.summary,
    arxivId: p.arxivId,
    verification: p.verification,
    status: p.status,
    inLibrary: Boolean(p.inLibrary),
    text: p.text?.slice(0, 65000),
    sourceScope: p.text
      ? p.text.length > 65000
        ? "提取文本前 65000 字符，已截断；不能断言完整论文结论。"
        : "PDF 提取文本，不包含未提取的公式、图表或扫描页。"
      : "仅摘要资料，没有论文全文。",
  });
  return mode === "paper"
    ? { paper: concise(paper) }
    : {
        workspace: w.name,
        papers: w.papers
          .filter((p) => p.inLibrary)
          .map((p) => ({
            ...concise(p),
            text: p.id === paperId ? p.text?.slice(0, 35000) : undefined,
            sourceScope:
              p.id === paperId && p.text
                ? "最多前 35000 字符的提取文本，可能不完整。"
                : "仅摘要资料，没有论文全文。",
          })),
        nodes: w.nodes,
        candidatePapers: w.papers
          .filter((p) => !p.inLibrary)
          .map((p) => ({
            ...concise(p),
            text: undefined,
            sourceScope:
              "候选论文，尚未收录；仅提供元信息及现有摘要，没有论文全文。",
          })),
        edges: w.edges,
        paperEdges: w.paperEdges,
        routes: w.routes,
        unresolvedRoutePaperIds: [
          ...new Set(
            w.routes.flatMap((r) => r.stages.flatMap((s) => s.paperIds)),
          ),
        ].filter((id) => !w.papers.some((p) => p.id === id)),
        memories: w.memories,
      };
}
export async function callModel(
  settings,
  messages,
  json = false,
  options = {},
) {
  if (!settings.baseUrl || !settings.model || !settings.apiKey)
    throw Object.assign(
      new Error("请先在设置中配置模型接口、模型名称和 API Key。"),
      { status: 409 },
    );
  const url = new URL(settings.baseUrl);
  if (!["https:", "http:"].includes(url.protocol))
    throw Object.assign(new Error("模型接口必须使用 HTTP 或 HTTPS。"), {
      status: 400,
    });
  const r = await fetch(
    `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        ...(!json || options.reasoningScenario ? reasoningBody(settings) : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.any([
        AbortSignal.timeout(
          (!json || options.reasoningScenario) &&
            settings.deepThinking !== "disabled"
            ? 300000
            : 90000,
        ),
        ...(options.signal ? [options.signal] : []),
      ]),
    },
  );
  if (!r.ok)
    throw Object.assign(
      new Error(`模型请求失败（${r.status}），请检查配置或服务额度。`),
      { status: 502, upstreamStatus: r.status },
    );
  const data = await r.json();
  options.onUsage?.(tokenUsage(data.usage));
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw new Error("模型返回了空内容。");
  if (!json) return content;
  try {
    return JSON.parse(
      content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
    );
  } catch {
    throw Object.assign(new Error("模型返回的结构无效，请重试。"), {
      rawContent: content,
    });
  }
}
