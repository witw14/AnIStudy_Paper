import { uid } from "./seed.mjs";
import { classifyNode, taxonomyLabel } from "./taxonomy.mjs";
import { linkedPaperSummary } from "./paper-summary.mjs";

export const unique = (values) => [...new Set(values.filter(Boolean))];
export const identity = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export const baseArxiv = (value) =>
  String(value || "")
    .replace(/^.*arxiv\.org\/(?:abs|pdf)\//i, "")
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/i, "");
export function cleanTitle(value = "") {
  return value
    .replace(/\.pdf$/i, "")
    .replace(/^(?:NIPS|NeurIPS|ICML|ICLR|CVPR|ICCV|ECCV)[-_ ]\d{4}[-_ ]/i, "")
    .replace(/[-_]Paper$/i, "")
    .replace(/[_\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function paperKey(p) {
  return identity(cleanTitle(p.title).replace(/-/g, " "));
}
export function samePaper(a, b) {
  if (a.arxivId && b.arxivId)
    return baseArxiv(a.arxivId) === baseArxiv(b.arxivId);
  if (a.contentHash && a.contentHash === b.contentHash) return true;
  return paperKey(a).length >= 18 && paperKey(a) === paperKey(b);
}
export function extractMetadata(text = "", filename = "", info = {}) {
  const front = text
    .slice(0, 12000)
    .split(/\n(?:References|REFERENCES|Bibliography)\b/)[0];
  const id =
    front.match(
      /(?:^|\n)\s*arXiv\s*:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i,
    )?.[1] ||
    filename.match(/(?:^|[^\d])(\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf|$)/)?.[1];
  let year = null,
    yearSource = "unknown";
  if (id) {
    const yy = Number(baseArxiv(id).match(/(?:^|\/)(\d{2})/)?.[1]);
    year = yy >= 91 ? 1900 + yy : 2000 + yy;
    yearSource = "arxiv-id";
  }
  if (!year) {
    const found =
      front.match(
        /(?:^|\n)\s*Published (?:online |on )?[^\n]{0,70}?\b((?:19|20)\d{2})\b/i,
      ) ||
      front
        .slice(0, 800)
        .match(/Cite this:[^\n]{0,100}?\b((?:19|20)\d{2})\b/i) ||
      front
        .slice(0, 800)
        .match(
          /(?:conference paper at|Proceedings of|Copyright|©)[^\n]{0,100}?\b((?:19|20)\d{2})\b/i,
        ) ||
      filename.match(
        /(?:NIPS|NeurIPS|ICML|ICLR|CVPR|ICCV|ECCV)[-_ ]((?:19|20)\d{2})/i,
      );
    if (found) {
      year = Number(found[1]);
      yearSource = "document";
    }
  }
  const pdfTitle =
    typeof info.Title === "string" &&
    info.Title.length > 15 &&
    !/microsoft|untitled|latex|\.docx?$/i.test(info.Title)
      ? cleanTitle(info.Title)
      : "";
  return {
    title: pdfTitle || cleanTitle(filename),
    authors: typeof info.Author === "string" ? info.Author : "待整理",
    year,
    yearSource,
    arxivId: id ? baseArxiv(id) : null,
  };
}
const directionRules = [
  [
    "Classification",
    /classification|image recognition|imagenet|图像分类|图像识别|视觉识别/i,
  ],
  [
    "Detection",
    /object detection|locali[sz]ation|目标检测|物体检测|定位|检测任务/i,
  ],
  ["Segmentation", /segmentation|分割/i],
  ["Video", /video|视频|动作识别/i],
  [
    "Multimodal",
    /multi[- ]?modal|vision[- ]language|image[- ]text|多模态|跨模态|图文/i,
  ],
  [
    "NLP",
    /language model|machine translation|natural language|语言模型|机器翻译|自然语言/i,
  ],
];
export const directionIds = [...directionRules.map(([id]) => id), "General"];
export function directionsFor(node, papers = []) {
  if (Array.isArray(node.directions) && node.directions.length) {
    const declared = unique(node.directions.map(taxonomyLabel).filter(Boolean));
    if (declared.length) return declared;
  }
  const explicit = unique(
    [...(node.directions || []), node.direction].filter(
      (v) => directionIds.includes(v) && v !== "General",
    ),
  );
  if (explicit.length) return explicit;
  const own = [
    node.direction,
    node.name,
    node.englishName,
    node.description,
    node.significance,
  ]
    .filter(Boolean)
    .join(" ");
  const matched = directionRules
    .filter(([, re]) => re.test(own))
    .map(([id]) => id);
  const inherited = directionRules
    .filter(([, re]) =>
      papers.some((p) => re.test(`${p.title} ${p.short || ""}`)),
    )
    .map(([id]) => id);
  return unique([...matched, ...inherited]).length
    ? unique([...matched, ...inherited])
    : ["General"];
}
export function refreshDirections(w) {
  for (const n of [
    ...w.nodes,
    ...w.suggestions.filter((s) => s.node).map((s) => s.node),
  ]) {
    n.directions = directionsFor(
      n,
      w.papers.filter((p) => n.paperIds.includes(p.id)),
    );
    n.direction = n.directions[0];
  }
}
function rewritePaper(w, from, to) {
  const map = (id) => (id === from ? to : id);
  for (const note of w.notes || [])
    if (note.paperIds.includes(from)) {
      note.paperIds = unique(note.paperIds.map(map));
      note.revision++;
      note.updatedAt = new Date().toISOString();
    }
  for (const n of w.nodes) {
    n.paperIds = unique(n.paperIds.map(map));
    n.paperRelations = (n.paperRelations || []).map((r) => ({
      ...r,
      paperId: map(r.paperId),
    }));
  }
  w.paperEdges = w.paperEdges
    .map((e) => ({ ...e, source: map(e.source), target: map(e.target) }))
    .filter((e) => e.source !== e.target);
  w.routes.forEach((r) =>
    r.stages.forEach((s) => (s.paperIds = unique(s.paperIds.map(map)))),
  );
  w.messages.forEach((m) => {
    if (m.paperId) m.paperId = map(m.paperId);
    for (const citation of [
      ...(m.citations || []),
      ...(m.retrievedSources || []),
    ])
      citation.paperId = map(citation.paperId);
  });
  w.suggestions.forEach((s) => {
    if (s.paperId) s.paperId = map(s.paperId);
    if (s.node) {
      s.node.paperIds = unique(s.node.paperIds.map(map));
      s.node.paperRelations = (s.node.paperRelations || []).map((r) => ({
        ...r,
        paperId: map(r.paperId),
      }));
    }
    if (s.kind === "paperEdge") {
      s.edge.source = map(s.edge.source);
      s.edge.target = map(s.edge.target);
    }
  });
  w.paperAliases ||= {};
  Object.keys(w.paperAliases).forEach(
    (k) => (w.paperAliases[k] = map(w.paperAliases[k])),
  );
  w.paperAliases[from] = to;
}
export function mergePaper(w, keep, other) {
  if (keep.id === other.id) return keep;
  const statusRank = { unlearned: 0, learning: 1, learned: 2 };
  const verified =
    keep.verification === "verified"
      ? keep
      : other.verification === "verified"
        ? other
        : null;
  const metadata = verified
    ? Object.fromEntries(
        [
          "title",
          "authors",
          "year",
          "yearSource",
          "arxivId",
          "arxivVersion",
          "verification",
          "verifiedAt",
        ].map((k) => [k, verified[k]]),
      )
    : {};
  const allFiles = unique([
    keep.file,
    ...(keep.files || []),
    other.file,
    ...(other.files || []),
  ]);
  const betterText =
    (other.text?.length || 0) > (keep.text?.length || 0) ? other : keep;
  const summary = keep.organizedAt
    ? keep.summary
    : other.organizedAt
      ? other.summary
      : verified?.summary || keep.summary || other.summary;
  const libraryAddedAt = [keep, other]
    .filter((p) => p.inLibrary)
    .map((p) => p.libraryAddedAt || p.addedAt)
    .filter((date) => Number.isFinite(Date.parse(date || "")))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const documents = [
    keep.document,
    other.document,
    ...(keep.documentHistory || []),
    ...(other.documentHistory || []),
  ]
    .filter(Boolean)
    .filter((d, i, a) => a.findIndex((v) => v.id === d.id) === i);
  const active = keep.document || other.document;
  Object.assign(keep, metadata, {
    document: active,
    documentHistory: documents.filter((d) => d.id !== active?.id),
    fullTranslations: [
      ...(keep.fullTranslations || []),
      ...(other.fullTranslations || []),
    ]
      .sort((a, b) => (b.completedSegments || 0) - (a.completedSegments || 0))
      .filter(
        (t, i, all) =>
          all.findIndex((v) => v.sourceDocumentId === t.sourceDocumentId) === i,
      ),
    annotations: [
      ...(keep.annotations || []),
      ...(other.annotations || []),
    ].filter((a, i, list) => list.findIndex((v) => v.id === a.id) === i),
    paragraphLinks: [
      ...(keep.paragraphLinks || []),
      ...(other.paragraphLinks || []),
    ].filter(
      (a, i, list) =>
        list.findIndex(
          (v) =>
            v.documentId === a.documentId &&
            v.blockId === a.blockId &&
            v.nodeId === a.nodeId,
        ) === i,
    ),
    blockedParagraphLinks: [
      ...(keep.blockedParagraphLinks || []),
      ...(other.blockedParagraphLinks || []),
    ],
    pdfVersion: keep.pdfVersion || other.pdfVersion,
    userEdits: { ...other.userEdits, ...keep.userEdits },
    summary,
    files: allFiles,
    file: keep.file || other.file || null,
    text: betterText.text || "",
    contentHash:
      betterText.contentHash || keep.contentHash || other.contentHash,
    inLibrary: keep.inLibrary || other.inLibrary,
    libraryAddedAt,
    status:
      statusRank[other.status] > statusRank[keep.status]
        ? other.status
        : keep.status,
    organizedAt: keep.organizedAt || other.organizedAt,
    short: keep.short || other.short || "",
  });
  if (verified) keep.yearSource = "arxiv";
  rewritePaper(w, other.id, keep.id);
  w.papers = w.papers.filter((p) => p.id !== other.id);
  return keep;
}
export function dedupePapers(w) {
  for (let i = 0; i < w.papers.length; i++)
    for (let j = i + 1; j < w.papers.length; j++)
      if (samePaper(w.papers[i], w.papers[j])) {
        mergePaper(w, w.papers[i], w.papers[j]);
        j--;
      }
}
export function upsertPaper(w, incoming) {
  const found = w.papers.find((p) => samePaper(p, incoming));
  if (found) {
    w.papers.push(incoming);
    return mergePaper(w, found, incoming);
  }
  w.papers.push(incoming);
  return incoming;
}
const paperSet = (r) => new Set(r.stages.flatMap((s) => s.paperIds));
export function similarRoutes(a, b) {
  const aa = paperSet(a),
    bb = paperSet(b);
  if (!aa.size || !bb.size) return false;
  const shared = [...aa].filter((id) => bb.has(id)).length;
  // Require substantial bidirectional overlap. Sharing a small prerequisite is insufficient.
  return (
    shared / Math.min(aa.size, bb.size) >= 0.8 &&
    shared / Math.max(aa.size, bb.size) >= 0.65
  );
}
export function mergeRoutes(routes) {
  const out = [];
  for (const input of routes) {
    const r = structuredClone(input);
    const target = out.find((t) => similarRoutes(t, r));
    if (!target) {
      out.push(r);
      continue;
    }
    target.selected ||= r.selected;
    target.alternativeGoals = unique([
      ...(target.alternativeGoals || []),
      r.goal,
      ...(r.alternativeGoals || []),
    ]).filter((g) => g !== target.goal);
    for (const stage of r.stages) {
      const ids = new Set(stage.paperIds);
      const match = target.stages.find(
        (s) =>
          s.sideQuest === stage.sideQuest &&
          s.paperIds.some((id) => ids.has(id)),
      );
      if (match) {
        match.paperIds = unique([...match.paperIds, ...stage.paperIds]);
        match.nodeIds = unique([...match.nodeIds, ...stage.nodeIds]);
        match.alternativeCapabilities = unique([
          ...(match.alternativeCapabilities || []),
          stage.capability,
          ...(stage.alternativeCapabilities || []),
        ]).filter((c) => c !== match.capability);
      } else target.stages.push(stage);
    }
    target.mergedCount = (target.mergedCount || 1) + (r.mergedCount || 1);
  }
  return out;
}
export function addEdge(list, source, target, relation) {
  if (!source || !target || source === target) return false;
  if (
    !list.some(
      (e) =>
        e.source === source && e.target === target && e.relation === relation,
    )
  )
    list.push({ id: uid(), source, target, relation });
  return true;
}
export function applyOrganization(w, paper, output, settings = {}) {
  const aliases = new Map();
  w.nodes.forEach((n) =>
    [n.id, n.name, n.englishName, n.chineseName, ...(n.aliases || [])]
      .filter(Boolean)
      .forEach((v) => aliases.set(identity(v), n.id)),
  );
  const applied = [];
  const skipped = [];
  for (const proposed of output.nodes) {
    if (proposed.necessary === false || proposed.relevance === "incidental") {
      skipped.push({
        name: proposed.name,
        reason: proposed.necessityReason || "并非理解论文的关键技术",
      });
      continue;
    }
    const existing =
      w.nodes.find(
        (n) => n.id === aliases.get(identity(proposed.existingNodeId || "")),
      ) ||
      w.nodes.find((n) =>
        [proposed.name, proposed.englishName, proposed.chineseName].some(
          (name) =>
            name &&
            [n.name, n.englishName, n.chineseName, ...(n.aliases || [])].some(
              (v) => v && identity(name) === identity(v),
            ),
        ),
      );
    const englishName =
      proposed.englishName ||
      (/^[\x20-\x7e]+$/.test(proposed.name) ? proposed.name : "");
    const chineseName = proposed.chineseName || proposed.name;
    const name =
      settings.preferEnglishTerms !== false && englishName
        ? englishName
        : chineseName;
    const inferredDirections = directionsFor(
      proposed,
      w.papers.filter((p) => p.id === paper.id),
    );
    const classification = classifyNode(
      w,
      { ...proposed, directions: inferredDirections },
      output.taxonomy,
    );
    const directions = classification.directions;
    const { paperSummary, ...technique } = proposed;
    const summary = linkedPaperSummary(
      paperSummary,
      existing?.paperRelations?.find((r) => r.paperId === paper.id && r.summary)
        ?.summary,
    );
    const data = {
      ...technique,
      ...classification,
      name,
      englishName,
      chineseName,
      directions,
      direction: directions[0],
      provenance: `AI 自动整理 · ${paper.text ? "论文提取文本" : "仅摘要"} · 可在详情中更正`,
    };
    let n = existing;
    if (n) {
      if (n.importanceSource === "manual") {
        data.importance = n.importance;
        data.importanceReason = n.importanceReason;
        data.importanceAssessment = n.importanceAssessment;
      }
      const previousNames = [
        n.name,
        n.englishName,
        n.chineseName,
        ...(n.aliases || []),
      ];
      Object.assign(n, data, {
        year: proposed.year ?? n.year ?? null,
        status: n.status,
        paperIds: unique([...n.paperIds, paper.id]),
        paperRelations: [
          ...(n.paperRelations || []).filter((r) => r.paperId !== paper.id),
          { paperId: paper.id, relation: proposed.contribution, summary },
        ],
        aliases: unique([
          ...previousNames,
          proposed.name,
          englishName,
          chineseName,
        ]),
        directions: unique([
          ...(n.paperIds.some((id) => id !== paper.id)
            ? n.directions || []
            : []
          ).filter((d) => d !== "General"),
          ...directions,
        ]).filter((d, _, all) => d !== "General" || all.length === 1),
      });
    } else {
      n = {
        ...data,
        id: uid(),
        status: "unlearned",
        paperIds: [paper.id],
        paperRelations: [
          { paperId: paper.id, relation: proposed.contribution, summary },
        ],
        aliases: unique([proposed.name, englishName, chineseName]),
      };
      w.nodes.push(n);
    }
    n.evidence = n.paperIds.some((id) =>
      w.papers.some((p) => p.id === id && p.inLibrary),
    )
      ? "supported"
      : "missing";
    [proposed.name, englishName, chineseName, n.id]
      .filter(Boolean)
      .forEach((v) => aliases.set(identity(v), n.id));
    applied.push(n.id);
  }
  const skippedEdges = [];
  for (const e of output.edges) {
    if (
      !addEdge(
        w.edges,
        aliases.get(identity(e.source)),
        aliases.get(identity(e.target)),
        e.relation,
      )
    )
      skippedEdges.push(e);
  }
  for (const e of output.paperEdges) {
    const resolve = (id) => w.paperAliases?.[id] || id;
    const a = resolve(e.source),
      b = resolve(e.target);
    if (w.papers.some((p) => p.id === a) && w.papers.some((p) => p.id === b))
      addEdge(w.paperEdges, a, b, e.relation);
  }
  paper.organizationReport = {
    applied: unique(applied).length,
    skipped,
    skippedEdges: skippedEdges.length,
    time: new Date().toISOString(),
  };
  return paper.organizationReport;
}
export function migrateWorkspace(w) {
  if (w.schemaVersion >= 2) return false;
  for (const p of w.papers) {
    if (p.source === "upload" && p.text) {
      const extracted = extractMetadata(p.text, p.title);
      p.originalTitle ||= p.title;
      p.title = cleanTitle(p.title);
      p.arxivId ||= extracted.arxivId;
      p.year = p.arxivId
        ? extractMetadata("", `${p.arxivId}.pdf`).year
        : extracted.year;
      p.yearSource = p.arxivId
        ? p.verification === "verified"
          ? "arxiv"
          : "arxiv-id"
        : extracted.yearSource;
    } else if (p.arxivId) {
      const extracted = extractMetadata("", `${p.arxivId}.pdf`);
      p.year = extracted.year;
      p.yearSource = "arxiv";
    }
  }
  dedupePapers(w);
  refreshDirections(w);
  w.routes = mergeRoutes(w.routes);
  w.schemaVersion = 2;
  return true;
}
