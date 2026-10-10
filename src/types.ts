export type Status = "unlearned" | "learning" | "learned";
export type Paper = {
  acquisition?: {
    state: string;
    label: string;
    detail?: string;
    updatedAt?: string;
  };
  autoOrganization?: { state: string; label: string };
  hasDocument?: boolean;
  documentId?: string;
  htmlSource?: "arxiv" | "converted";
  hiddenInGraph?: boolean;
  id: string;
  title: string;
  short: string;
  authors: string;
  year: number | null;
  yearSource?: string;
  addedAt?: string;
  libraryAddedAt?: string;
  arxivId: string | null;
  summary: string;
  status: Status;
  verification: string;
  verifiedAt?: string;
  source: string;
  inLibrary: boolean;
  file: string | null;
  hasText: boolean;
  organizedAt?: string;
  reason?: string;
  organizationReport?: {
    quality?: "complete" | "partial" | "fallback";
    warnings?: string[];
    recovered?: boolean;
    applied: number;
    skipped: { name: string; reason: string }[];
    skippedEdges: number;
  };
};
export type Tech = {
  hiddenInGraph?: boolean;
  id: string;
  name: string;
  englishName?: string;
  chineseName?: string;
  year: number | null;
  category: string;
  importance: string;
  importanceReason?: string;
  importanceSource?: "manual" | "ai";
  evidence: string;
  status: Status;
  description: string;
  significance: string;
  paperIds: string[];
  direction: string;
  directions?: string[];
  provenance: string;
  contribution?: string;
  paperRelations?: {
    paperId: string;
    relation: string;
    summary?: { role: string; implementation: string };
  }[];
};
export type Edge = {
  id: string;
  source: string;
  target: string;
  relation: string;
};
export type Route = {
  id: string;
  title: string;
  goal: string;
  selected: boolean;
  mergedCount?: number;
  alternativeGoals?: string[];
  stages: {
    title: string;
    capability: string;
    paperIds: string[];
    nodeIds: string[];
    sideQuest: boolean;
    alternativeCapabilities?: string[];
  }[];
};
export type Suggestion = {
  id: string;
  kind: "node" | "edge" | "paperEdge";
  state: string;
  reason: string;
  node?: Tech;
  edge?: Edge;
};
export type Message = {
  citations?: SourceCitation[];
  retrievedSources?: SourceCitation[];
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: string;
  paperId?: string;
  time: string;
  turnId?: string;
  tokenUsage?: TokenUsage | null;
  durationMs?: number;
};
export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
};
export type OperationStep = {
  phase: string;
  label: string;
  detail: string;
  time: string;
  current?: number;
  total?: number;
};
export type OperationProgress = {
  id: string;
  workspaceId: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  current: OperationStep;
  steps: OperationStep[];
};
export type Workspace = {
  notes?: Note[];
  importanceReport?: {
    updated: number;
    skipped: number;
    manual?: number;
    assessedAt: string;
  };
  taxonomy?: { directions: TaxonomyEntry[]; categories: TaxonomyEntry[] };
  id: string;
  name: string;
  description: string;
  demo: boolean;
  papers: Paper[];
  nodes: Tech[];
  edges: Edge[];
  paperEdges: Edge[];
  routes: Route[];
  memories: { id: string; text: string; kind: string }[];
  messages: Message[];
  tasks: { id: string; title: string; due: string; done: boolean }[];
  suggestions: Suggestion[];
};
export type TaxonomyEntry = { id: string; name: string; aliases?: string[] };
export function workspaceTaxonomy(
  w: Workspace,
  kind: "directions" | "categories",
): TaxonomyEntry[] {
  const used = [
    ...new Set(
      w.nodes.flatMap((n) =>
        kind === "directions"
          ? n.directions?.length
            ? n.directions
            : [n.direction || "General"]
          : [n.category || "General"],
      ),
    ),
  ];
  return used.map(
    (id) =>
      w.taxonomy?.[kind]?.find((entry) => entry.id === id) || {
        id,
        name: (kind === "directions" ? directions : categories)[id] || id,
      },
  );
}
export function categoryColor(id: string) {
  if (colors[id]) return colors[id];
  const palette = Object.values(colors);
  const hash = [...id].reduce(
    (value, char) => (value * 31 + char.codePointAt(0)!) >>> 0,
    0,
  );
  return palette[hash % palette.length];
}
export type WorkspaceMeta = Pick<
  Workspace,
  "id" | "name" | "description" | "demo"
>;
export type Settings = {
  taskReasoning?: Record<
    "routes" | "organization" | "translation",
    {
      deepThinking: "auto" | "enabled" | "disabled";
      reasoningEffort: "auto" | "low" | "high" | "max";
    }
  >;
  autoDownloadPapers?: boolean;
  autoOrganizePapers?: boolean;
  showChatTime?: boolean;
  showChatTokens?: boolean;
  chatEvidencePolicy?: "supplement" | "strict";
  timelineAutoWrap?: boolean;
  timelineColumnLimit?: number;
  noteShortcut?: string;
  noteAlwaysOnTop?: boolean;
  nodeSizes?: Record<"landmark" | "major" | "normal" | "minor", number>;
  theme?: "forest" | "ocean" | "violet" | "amber";
  reduceMotion?: boolean;
  deepThinking?: "auto" | "enabled" | "disabled";
  reasoningEffort?: "auto" | "low" | "high" | "max";
  reasoningCapabilities?: { supported: boolean; efforts: string[] };
  baseUrl?: string;
  model?: string;
  hasKey?: boolean;
  preferences?: string;
  preferEnglishTerms?: boolean;
};
export type AITask = {
  id: string;
  workspaceId: string;
  paperId?: string;
  documentId?: string;
  category: string;
  title: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "succeeded" | "failed" | "interrupted";
  progress: OperationStep | null;
  error: string;
  calls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  missingTotalRecords: number;
};
export type Note = {
  id: string;
  title: string;
  content: string;
  paperIds: string[];
  nodeIds: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type ReadingBlock = {
  id: string;
  kind: string;
  text: string;
  html: string;
  section: string;
  page: number | null;
  order: number;
  source: string;
  originalId?: string;
};
export type ReadingDocument = {
  id: string;
  source: "arxiv" | "converted" | "translation";
  version: string;
  file: string | null;
  sourceUrl?: string;
  createdAt: string;
  warning: string;
  blocks: ReadingBlock[];
  pdfBlocks: ReadingBlock[];
  outline: {
    blockId: string;
    title: string;
    level: number;
    page: number | null;
  }[];
  anchors: Record<string, string>;
};
export type ReadingAnnotation = {
  groupId?: string;
  id: string;
  documentId: string;
  blockId: string;
  start: number;
  end: number;
  quote: string;
  note: string;
  color: "yellow" | "green" | "blue" | "pink";
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type ParagraphLink = {
  nodeId: string;
  nodeName: string;
  blockId: string;
  documentId: string;
  source: string;
  section: string;
  page: number | null;
  paperId?: string;
  paperTitle?: string;
  snippet?: string;
};
export type ReadingData = {
  translation?: {
    id: string;
    sourceDocumentId: string;
    state: "running" | "partial" | "complete";
    error?: string;
    completedSegments: number;
    totalSegments: number;
    tokenUsage?: TokenUsage | null;
    document?: ReadingDocument;
  };
  translationAnnotations?: ReadingAnnotation[];
  paperId: string;
  paperTitle: string;
  inLibrary: boolean;
  document: ReadingDocument;
  annotations: ReadingAnnotation[];
  otherAnnotationCount: number;
  links: ParagraphLink[];
  nodes: { id: string; name: string }[];
  versions: {
    id: string;
    source: string;
    version: string;
    createdAt: string;
  }[];
};
export type SourceCitation = {
  id: string;
  paperId: string;
  paperTitle: string;
  documentId: string;
  blockId: string;
  section: string;
  page: number | null;
  version: string;
  source: string;
  snippet: string;
};
// Translation of legacy IDs only; UI options are derived from the current space.
const directions: Record<string, string> = {
  Classification: "图像分类",
  Detection: "目标检测",
  Segmentation: "图像分割",
  Video: "视频",
  Multimodal: "多模态",
  NLP: "自然语言",
  General: "未分类",
};
export const statusNames: Record<Status, string> = {
  unlearned: "未学习",
  learning: "学习中",
  learned: "已学习",
};
const categories: Record<string, string> = {
  General: "未分类",
  Architecture: "架构",
  Component: "组件",
  "Training Method": "训练方法",
  "Data / Preprocessing": "数据处理",
  "Objective / Loss": "目标函数",
  Representation: "表征",
  Optimization: "优化",
  "Task / Paradigm": "任务范式",
};
const colors: Record<string, string> = {
  Architecture: "#367b69",
  Component: "#7b75b6",
  "Training Method": "#bd8c43",
  "Data / Preprocessing": "#779a53",
  "Objective / Loss": "#b96f7e",
  Representation: "#518aa8",
  Optimization: "#ba7956",
  "Task / Paradigm": "#62788a",
};
