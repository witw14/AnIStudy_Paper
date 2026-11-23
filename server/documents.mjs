import { curatedParagraphLinks } from "./passage-links.mjs";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import sanitizeHtml from "sanitize-html";

const hash = (text) =>
  createHash("sha256").update(text).digest("hex").slice(0, 24);
export const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const compact = (text) => text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
export function pdfVersionFromText(text, id) {
  const version = String(text || "")
    .slice(0, 6000)
    .match(
      /arxiv:\s*(\d{4}\.\d{4,5}v\d+|[a-z-]+(?:\.[a-z]{2})?\/\d{7}v\d+)/i,
    )?.[1];
  return version &&
    id &&
    version.replace(/v\d+$/, "") === String(id).replace(/v\d+$/, "")
    ? version
    : "";
}
const mathTags =
  "math mrow mi mn mo mfrac msqrt mroot msub msup msubsup munder mover munderover mtable mtr mtd mtext mspace mfenced menclose mpadded mstyle semantics".split(
    " ",
  );
export function cleanReadingHtml(html, url) {
  const $ = load(html, null, false);
  $(
    "script,style,iframe,object,embed,form,input,button,annotation,annotation-xml,link,meta",
  ).remove();
  $("*").removeAttr("style").removeAttr("id");
  $("a").each((_, e) => {
    const a = $(e),
      href = a.attr("href") || "";
    if (href.startsWith("#")) return;
    try {
      const u = new URL(href, url);
      a.attr("href", /^https?:$/.test(u.protocol) ? u.href : "");
    } catch {
      a.removeAttr("href");
    }
  });
  $("img").each((_, e) => {
    try {
      const u = new URL($(e).attr("src") || "", url);
      if (
        u.protocol !== "https:" ||
        u.hostname !== "arxiv.org" ||
        !u.pathname.startsWith("/html/")
      )
        throw new Error();
      $(e)
        .attr("src", u.href)
        .attr("loading", "lazy")
        .attr("referrerpolicy", "no-referrer");
    } catch {
      $(e).replaceWith(
        `<span>${escapeHtml($(e).attr("alt") || "图像未载入")}</span>`,
      );
    }
  });
  return sanitizeHtml($.html(), {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "figure",
      "figcaption",
      ...mathTags,
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "loading", "referrerpolicy"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      math: ["display", "xmlns"],
      mo: ["stretchy", "fence", "separator"],
      mtable: ["columnalign"],
      mspace: ["width"],
      "*": ["class"],
    },
    allowedClasses: { "*": ["ltx_*"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noreferrer noopener",
      }),
    },
  });
}
export function pdfDocument(
  pages,
  { file = null, version = "", text = "" } = {},
) {
  const blocks = [],
    outline = [];
  if (!pages?.length && text) pages = [{ num: null, text }];
  let heading = "";
  for (const page of pages || []) {
    const paragraphs = String(page.text || "")
      .trim()
      .split(/\n\s*\n/)
      .flatMap((part) => {
        const result = [];
        for (let start = 0; start < part.length; start += 1800)
          result.push(part.slice(start, start + 1800));
        return result;
      });
    let first;
    for (const part of paragraphs) {
      const value = part.trim();
      if (!value) continue;
      const isHeading =
        value.length < 130 &&
        /^(?:\d+(?:\.\d+)*[.\s]+\S|Abstract\b|References\b|Appendix\b|摘要|参考文献)/i.test(
          value,
        ) &&
        !/[.!?。]$/.test(value);
      if (isHeading) heading = value;
      const id = `pdf-${hash(`${page.num}:${blocks.length}:${value}`)}`;
      const block = {
        id,
        kind: isHeading ? "heading" : "paragraph",
        text: value,
        html: `<${isHeading ? "h3" : "p"}>${escapeHtml(value)}</${isHeading ? "h3" : "p"}>`,
        section: heading || (page.num ? `PDF 第 ${page.num} 页` : "正文"),
        page: page.num || null,
        order: blocks.length,
        source: "pdf",
      };
      blocks.push(block);
      first ||= id;
      if (isHeading)
        outline.push({
          blockId: id,
          title: value,
          level: 2,
          page: page.num || null,
        });
    }
    if (first && page.num)
      outline.push({
        blockId: first,
        title: `PDF 第 ${page.num} 页`,
        level: 1,
        page: page.num,
      });
  }
  return {
    id: `doc-${hash(`${file}:${version}:${blocks.map((b) => b.text).join("\n")}`)}`,
    source: "converted",
    version,
    file,
    createdAt: new Date().toISOString(),
    blocks,
    outline: outline.sort(
      (a, b) =>
        blocks.findIndex((v) => v.id === a.blockId) -
        blocks.findIndex((v) => v.id === b.blockId),
    ),
    pdfBlocks: blocks,
    anchors: {},
    warning: file
      ? "当前 HTML 由 PDF 提取文字转换，可能缺失原排版、图表及公式；请切换原始 PDF 核对。"
      : "当前 HTML 由已有正文文字转换，未提供原始 HTML；没有可靠页码的段落只按章节定位。",
  };
}
export function htmlVersion(url) {
  const value =
    new URL(url).pathname.split("/html/")[1]?.replace(/\/$/, "") || "";
  return /v\d+$/.test(value) ? value : "";
}
export function htmlDocument(html, url, pdf, { mapPages = false } = {}) {
  const $ = load(html);
  const root = $(".ltx_document").first();
  if (!root.length) throw new Error("未获得可读取的 arXiv HTML 正文。");
  root
    .find(
      "script,style,nav,.ltx_page_header,.ltx_page_footer,annotation,annotation-xml",
    )
    .remove();
  const selector =
    "h1,h2,h3,h4,h5,h6,p,li,figure,table,pre,blockquote,.ltx_authors,.ltx_date,.ltx_equation,.ltx_equationgroup";
  const candidates = root
    .find(selector)
    .toArray()
    .filter(
      (e) =>
        !$(e)
          .parentsUntil(root)
          .toArray()
          .some((p) =>
            $(p).is(
              "li,figure,table,pre,blockquote,.ltx_authors,.ltx_date,.ltx_equation,.ltx_equationgroup",
            ),
          ),
    );
  const blocks = [],
    outline = [],
    anchors = {};
  let section = "正文";
  for (const [i, element] of candidates.entries()) {
    const e = $(element),
      heading = /^h[1-6]$/.test(element.tagName);
    const originalId =
      e.attr("id") ||
      e
        .closest(".ltx_para,.ltx_section,.ltx_subsection,.ltx_bibitem")
        .attr("id") ||
      "";
    const content = cleanReadingHtml($.html(element), url);
    const text = load(content, null, false).text();
    if (!text.trim() && !content.includes("<img")) continue;
    if (heading) section = text.trim();
    const id = `html-${hash(`${originalId}:${i}:${text}`)}`;
    let page = null;
    if (mapPages && compact(text).length >= 60) {
      const needle = compact(text);
      const match = (pdf?.pdfBlocks || []).find(
        (p) =>
          p.page &&
          compact(p.text).includes(needle.slice(0, 60)) &&
          compact(p.text).includes(needle.slice(-40)),
      );
      if (match) page = match.page;
    }
    blocks.push({
      id,
      kind: heading
        ? "heading"
        : element.tagName === "figure"
          ? "figure"
          : element.tagName === "table"
            ? "table"
            : e.is(".ltx_equation,.ltx_equationgroup")
              ? "equation"
              : "paragraph",
      html: content,
      text,
      section,
      page,
      order: blocks.length,
      source: "html",
      originalId,
    });
    if (originalId) anchors[originalId] ||= id;
    if (heading)
      outline.push({
        blockId: id,
        title: text.trim(),
        level: Number(element.tagName.slice(1)),
        page,
      });
  }
  if (
    blocks
      .filter((b) => b.kind !== "heading")
      .map((b) => b.text)
      .join("").length < 100
  )
    throw new Error("HTML 正文不完整，已保留 PDF 转换视图。");
  return {
    id: `doc-${hash(`${url}:${blocks.map((b) => b.text).join("\n")}`)}`,
    source: "arxiv",
    version: htmlVersion(url),
    file: pdf?.file || null,
    sourceUrl: url,
    createdAt: new Date().toISOString(),
    blocks,
    outline,
    anchors,
    pdfBlocks: pdf?.pdfBlocks || [],
    warning:
      (pdf?.version && htmlVersion(url) && pdf.version !== htmlVersion(url)
        ? "HTML 与本地 PDF 版本不同，PDF 入口打开现有文件；仅按 HTML 段落定位。"
        : "") +
      "arXiv 提供的 HTML 可能存在转换差异；未可靠对齐的段落不显示 PDF 页码。",
  };
}
export function allDocuments(paper) {
  return [paper.document, ...(paper.documentHistory || [])]
    .filter(Boolean)
    .filter((d, i, a) => a.findIndex((v) => v.id === d.id) === i);
}
export function installDocument(paper, document) {
  if (paper.document && paper.document.id !== document.id) {
    paper.documentHistory = [
      paper.document,
      ...(paper.documentHistory || []),
    ].filter(
      (d, i, a) =>
        d.id !== document.id && a.findIndex((v) => v.id === d.id) === i,
    );
  }
  paper.document = document;
}
export function paragraphLinks(w, paper, doc = paper.document) {
  return curatedParagraphLinks(w, paper, doc);
}
