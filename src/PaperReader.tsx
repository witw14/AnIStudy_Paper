import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  LoaderCircle,
  MessageSquare,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Minus,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { api } from "./api";
import { Markdown } from "./Markdown";
import { ChatMessageMeta } from "./ChatMessageMeta";
import { ReadingAnnotationCard } from "./ReadingAnnotation";
import { ReaderNotes } from "./ReaderNotes";
import { SearchFrames } from "./SearchFrames";
import {
  conversationMessages,
  type ChatRequest,
  type LocalChatMessage,
} from "./conversation";
import { annotatedHtml, searchOccurrences, textRange } from "./readingText";
import { PaperAcquisition, paperIsAcquiring } from "./AcquisitionSettings";
import type {
  Paper,
  ReadingAnnotation,
  ReadingData,
  ReadingBlock,
  Settings,
  OperationProgress,
  SourceCitation,
  Workspace,
  AITask,
} from "./types";

export type ReaderLocation = {
  paperId: string;
  format?: "html" | "pdf";
  documentId?: string;
  blockId?: string;
};
type SelectedText = {
  documentId: string;
  blockId: string;
  start: number;
  end: number;
  quote: string;
};
export function PaperReader({
  workspaceId,
  paper,
  workspace,
  localMessages,
  onChat,
  onRestoreChat,
  location,
  settings,
  backgroundTasks,
  onClose,
  onWorkspace,
  onNode,
  onSource,
}: {
  workspaceId: string;
  paper: Paper;
  workspace: Workspace;
  localMessages: LocalChatMessage[];
  onChat: (
    request: ChatRequest,
    progress: (p: OperationProgress) => void,
  ) => Promise<Workspace>;
  onRestoreChat: (id: string) => void;
  location: ReaderLocation;
  settings: Settings;
  backgroundTasks: AITask[];
  onClose: () => void;
  onWorkspace: (w: Workspace) => void;
  onNode: (id: string) => void;
  onSource: (s: SourceCitation) => void;
}) {
  const base = `/workspaces/${workspaceId}/papers/${paper.id}`;
  const [data, setData] = useState<ReadingData | null>(null);
  const [format, setFormat] = useState(location.format || "html");
  const [docId, setDocId] = useState(location.documentId || "");
  const [focused, setFocused] = useState(location.blockId || "");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(""),
    [font, setFont] = useState(15);
  const [outlineOpen, setOutlineOpen] = useState(
      () => window.innerWidth > 1000,
    ),
    [asideOpen, setAsideOpen] = useState(() => window.innerWidth > 1000);
  const [tab, setTab] = useState<"technology" | "notes" | "explanation">(
    "technology",
  );
  const [selected, setSelected] = useState<SelectedText[]>([]),
    [color, setColor] = useState<ReadingAnnotation["color"]>("yellow");
  const [search, setSearch] = useState(""),
    [searchIndex, setSearchIndex] = useState(-1);
  const [question, setQuestion] = useState("");
  const [quoted, setQuoted] = useState<{
    documentId: string;
    parts: SelectedText[];
  } | null>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const messages = conversationMessages(
    workspace.messages.filter(
      (m) => m.mode === "paper" && m.paperId === paper.id,
    ),
    localMessages.filter((m) => m.mode === "paper" && m.paperId === paper.id),
  );
  const chatSending = localMessages.some((m) => m.delivery === "sending");
  const [chatProgress, setChatProgress] = useState<OperationProgress | null>(
    null,
  );
  const [chatBusy, setChatBusy] = useState(false);
  const [translationTaskId, setTranslationTaskId] = useState("");
  const translating = backgroundTasks.some(
    (t) =>
      t.workspaceId === workspaceId &&
      t.category === "translation" &&
      t.status === "running" &&
      (t.id === translationTaskId ||
        (t.paperId === paper.id &&
          (!data || t.documentId === data.document.id))),
  );
  const [readingMode, setReadingMode] = useState<
    "original" | "translation" | "both" | "interleaved"
  >("original");
  const [split, setSplit] = useState(50);
  const translationRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const translationDoc =
    data?.translation?.state === "complete"
      ? data.translation.document
      : undefined;
  const selectedOriginal =
    selected.length && selected[0].documentId === data?.document.id;
  const [asideWidth, setAsideWidth] = useState(() => {
    const stored = Number(localStorage.getItem("anistudy.reader-aside-width"));
    return Number.isFinite(stored) && stored >= 260
      ? Math.min(stored, 900)
      : 360;
  });
  const layoutRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    id: string;
    left: number;
    top: number;
  } | null>(null);
  const [visitedAnnotations, setVisitedAnnotations] = useState<string[]>([]);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const popupRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null),
    dialogRef = useRef<HTMLDivElement>(null);
  const flushers = useRef(new Map<string, () => Promise<boolean>>());
  const alive = useRef(true);
  const actionRef = useRef(false);
  const loadVersion = useRef(0);
  async function loadDocument() {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const next = await api<ReadingData>(
        `${base}/document${docId ? `?documentId=${encodeURIComponent(docId)}` : ""}`,
      );
      if (alive.current && version === loadVersion.current) {
        setData(next);
      }
    } catch (e) {
      if (alive.current && version === loadVersion.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && version === loadVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    void loadDocument();
    setVisitedAnnotations([]);
    setHover(null);
    setSearchIndex(-1);
  }, [base, docId]);
  useEffect(() => {
    if (!data && paper.hasDocument && !loading) void loadDocument();
  }, [paper.hasDocument, paper.documentId]);
  async function flushAll() {
    for (const flush of flushers.current.values())
      if (!(await flush())) return false;
    return true;
  }
  async function close() {
    if (await flushAll()) onClose();
    else setError("标注尚未保存，草稿已保留。请重试保存后关闭。");
  }
  useEffect(() => {
    alive.current = true;
    const old = document.activeElement as HTMLElement;
    dialogRef.current?.focus();
    return () => {
      alive.current = false;
      clearTimeout(hoverTimer.current);
      old?.focus();
    };
  }, []);
  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
  }, [messages.length, tab]);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 1000px)");
    const resize = () => {
      if (narrow.matches) {
        setOutlineOpen(false);
        setAsideOpen(false);
      }
    };
    narrow.addEventListener("change", resize);
    return () => narrow.removeEventListener("change", resize);
  }, []);
  function openAside() {
    setAsideOpen(true);
    if (window.innerWidth <= 1000) setOutlineOpen(false);
  }
  function clampAside(width: number) {
    const total = layoutRef.current?.clientWidth || window.innerWidth;
    const outline =
      layoutRef.current?.querySelector(".reader-outline")?.clientWidth || 0;
    return Math.max(
      260,
      Math.min(
        width,
        900,
        total - (window.innerWidth > 1000 ? outline : 0) - 320,
      ),
    );
  }
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      setAsideWidth((width) => clampAside(width)),
    );
    if (layoutRef.current) observer.observe(layoutRef.current);
    return () => observer.disconnect();
  }, [outlineOpen]);
  useEffect(() => {
    const popup = popupRef.current;
    if (!hover || !popup) return;
    const position = () => {
      const bounds = dialogRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = popup.offsetWidth,
        height = popup.offsetHeight;
      popup.style.left = `${Math.max(bounds.left + 8, Math.min(hover.left, bounds.right - width - 8))}px`;
      popup.style.top = `${Math.max(bounds.top + 8, hover.top - height - 8)}px`;
    };
    const observer = new ResizeObserver(position);
    observer.observe(popup);
    position();
    return () => observer.disconnect();
  }, [hover]);
  function showAnnotation(mark: HTMLElement) {
    if (window.getSelection()?.toString()) return;
    clearTimeout(hoverTimer.current);
    const id = mark.dataset.annotationIds?.split(" ").at(-1);
    if (!id) return;
    const rect = mark.getBoundingClientRect();
    setVisitedAnnotations((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setHover((current) =>
      current?.id === id
        ? current
        : {
            id,
            left: rect.left,
            top: rect.top,
          },
    );
  }
  function hideAnnotationLater() {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (!popupRef.current?.contains(document.activeElement)) setHover(null);
    }, 250);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector(".modal-backdrop")) return;
      if (e.key === "Escape") {
        const immersive = dialogRef.current?.querySelector<HTMLElement>(
          ".md-local-immersive",
        );
        if (immersive && immersive.getClientRects().length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          immersive
            .querySelector<HTMLButtonElement>(
              'button[aria-label="退出沉浸编辑"]',
            )
            ?.click();
          return;
        }
        if (hover) {
          e.preventDefault();
          e.stopImmediatePropagation();
          void flushAll().then((ok) => {
            if (ok) setHover(null);
          });
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        void close();
      }
      if (e.key === "Tab") {
        const els = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),select,input,textarea,a[href],iframe",
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = els[0],
          last = els.at(-1);
        if (!first) return;
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialogRef.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  });
  function jump(blockId: string) {
    if (readingMode === "translation") setReadingMode("original");
    setFocused(blockId);
    setSelected([]);
  }
  useEffect(() => {
    if (data && format === "html" && focused)
      document
        .getElementById(`reading-${focused}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [data?.document.id, focused, format, readingMode]);
  useEffect(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> })
      .highlights;
    const HighlightClass = (
      globalThis as unknown as {
        Highlight?: new (...ranges: Range[]) => unknown;
      }
    ).Highlight;
    const names = ["yellow", "green", "blue", "pink"];
    if (!registry || !HighlightClass) return;
    for (const name of names) {
      const ranges = [
        ...(data?.annotations || []),
        ...(data?.translationAnnotations || []),
      ]
        .filter((a) => a.color === name)
        .flatMap((a) => {
          const element = document.getElementById(`reading-${a.blockId}`);
          const range = element ? textRange(element, a.start, a.end) : null;
          return range ? [range] : [];
        });
      registry.set(`anistudy-${name}`, new HighlightClass(...ranges));
    }
    return () => {
      for (const name of names) registry.delete(`anistudy-${name}`);
    };
  }, [data, format]);
  function captureSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) {
      setSelected([]);
      return;
    }
    const range = selection.getRangeAt(0),
      out: SelectedText[] = [];
    setHover(null);
    for (const article of dialogRef.current?.querySelectorAll<HTMLElement>(
      ".reader-content .reading-block",
    ) || []) {
      const element = article.querySelector<HTMLElement>(
        ".reading-block-html",
      )!;
      if (!range.intersectsNode(element)) continue;
      const doc =
        article.dataset.documentId === translationDoc?.id
          ? translationDoc
          : data?.document;
      const block = doc?.blocks.find((b) => b.id === article.dataset.blockId);
      if (!block) continue;
      const before = document.createRange();
      before.selectNodeContents(element);
      let start = 0,
        end = element.textContent?.length || 0;
      if (element.contains(range.startContainer)) {
        before.setEnd(range.startContainer, range.startOffset);
        start = before.toString().length;
      }
      if (element.contains(range.endContainer)) {
        before.selectNodeContents(element);
        before.setEnd(range.endContainer, range.endOffset);
        end = before.toString().length;
      }
      const quote = block.text.slice(start, end);
      if (quote.trim())
        out.push({ documentId: doc!.id, blockId: block.id, start, end, quote });
    }
    if (new Set(out.map((s) => s.documentId)).size > 1) {
      setSelected([]);
      setError("请只选择原文或译文中的一个版本，二者标注独立保存。");
      return;
    }
    if (out.length > 14 || out.map((s) => s.quote).join("").length > 10000) {
      setError("请分次选择，每次不超过 14 个段落或 10000 个字符。");
      setSelected([]);
      return;
    }
    setSelected(out);
    setError("");
  }
  async function action(label: string, fn: () => Promise<void>) {
    if (actionRef.current) return;
    actionRef.current = true;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      actionRef.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function highlight() {
    if (!data || !selected.length) return;
    await action("保存标注…", async () => {
      if (!(await flushAll()))
        throw new Error("标注备注尚未保存，请先重试保存。");
      // Re-read revisions before removing: another window may have added a note.
      const current = await api<ReadingData>(
        `${base}/document?documentId=${encodeURIComponent(data.document.id)}`,
      );
      const rows = selectedOriginal
        ? current.annotations
        : current.translationAnnotations || [];
      const intersected = rows.filter((a) =>
        selected.some(
          (s) => s.blockId === a.blockId && s.start < a.end && s.end > a.start,
        ),
      );
      const groups = new Set(intersected.map((a) => a.groupId).filter(Boolean));
      const removals = rows.filter(
        (a) =>
          intersected.some((v) => v.id === a.id) ||
          (a.groupId && groups.has(a.groupId)),
      );
      if (removals.length) {
        if (
          removals.some((a) => a.note.trim()) &&
          !confirm("选中的高亮包含笔记。移除高亮会同时删除这些笔记，确定删除？")
        )
          return;
        for (const a of removals) {
          await api(
            `${base}/annotations/${a.id}`,
            { revision: a.revision },
            "DELETE",
          );
          localStorage.removeItem(`anistudy.annotation-draft.${base}.${a.id}`);
          setData((d) =>
            d
              ? {
                  ...d,
                  annotations: d.annotations.filter((v) => v.id !== a.id),
                  translationAnnotations: d.translationAnnotations?.filter(
                    (v) => v.id !== a.id,
                  ),
                }
              : d,
          );
        }
        setHover(null);
        setSelected([]);
        window.getSelection()?.removeAllRanges();
        return;
      }
      const groupId = crypto.randomUUID();
      for (const s of selected) {
        const annotation = await api<ReadingAnnotation>(`${base}/annotations`, {
          ...s,
          documentId: s.documentId,
          color,
          groupId,
        });
        setData((current) =>
          current
            ? selectedOriginal
              ? {
                  ...current,
                  annotations: [...current.annotations, annotation],
                }
              : {
                  ...current,
                  translationAnnotations: [
                    ...(current.translationAnnotations || []),
                    annotation,
                  ],
                }
            : current,
        );
      }
      setSelected([]);
      window.getSelection()?.removeAllRanges();
    });
  }
  function quoteSelection() {
    if (!data || !selectedOriginal) return;
    setQuoted({ documentId: data.document.id, parts: [...selected] });
    setQuestion(`请解释：‘${selected.map((s) => s.quote).join("\n")}’`);
    setTab("explanation");
    openAside();
    setSelected([]);
    window.getSelection()?.removeAllRanges();
    requestAnimationFrame(() => questionRef.current?.focus());
  }
  async function explain() {
    if (
      !question.trim() ||
      chatSending ||
      actionRef.current ||
      !settings.hasKey
    )
      return;
    const message = question.trim(),
      referenced = quoted;
    setQuestion("");
    setQuoted(null);
    setChatBusy(true);
    setChatProgress(null);
    await action("正在准备对话…", async () => {
      setTab("explanation");
      openAside();
      try {
        await onChat(
          {
            message,
            mode: "paper",
            paperId: paper.id,
            ...(referenced
              ? {
                  selections: referenced.parts.map((s) => ({
                    documentId: referenced.documentId,
                    blockId: s.blockId,
                    start: s.start,
                    end: s.end,
                  })),
                }
              : {}),
          },
          (p) => {
            if (alive.current) setChatProgress(p);
          },
        );
      } finally {
        if (alive.current) setChatBusy(false);
      }
    });
  }
  const matches = useMemo(
    () => searchOccurrences(data?.document.blocks || [], search),
    [data?.document, search],
  );
  const blockHtml = useMemo(
    () =>
      new Map(
        (data?.document.blocks || []).map((b) => [
          b.id,
          annotatedHtml(
            b.html,
            data?.annotations.filter((a) => a.blockId === b.id) || [],
          ),
        ]),
      ),
    [data?.document, data?.annotations],
  );
  const translatedHtml = useMemo(
    () =>
      new Map(
        (translationDoc?.blocks || []).map((b) => [
          b.id,
          annotatedHtml(
            b.html,
            (data?.translationAnnotations || []).filter(
              (a) => a.blockId === b.id,
            ),
          ),
        ]),
      ),
    [translationDoc, data?.translationAnnotations],
  );
  const searchRevision = useMemo(
    () => ({ html: blockHtml, mode: readingMode }),
    [blockHtml, readingMode],
  );
  async function translateFull() {
    if (!data || !settings.hasKey || actionRef.current || translating) return;
    if (translationDoc) {
      setReadingMode("both");
      return;
    }
    await action("正在提交翻译…", async () => {
      const result = await api<{ taskId?: string; cached?: boolean }>(
        `${base}/translate`,
        { documentId: data.document.id, background: true },
      );
      if (alive.current) {
        setTranslationTaskId(result.taskId || "");
        if (result.cached) {
          await loadDocument();
          setReadingMode("both");
        }
      }
      window.dispatchEvent(new Event("anistudy:tasks"));
    });
  }
  const translationTask = backgroundTasks.find(
    (t) => t.id === translationTaskId,
  );
  useEffect(() => {
    if (!translationTaskId) {
      const task = backgroundTasks.find(
        (t) =>
          t.workspaceId === workspaceId &&
          t.paperId === paper.id &&
          t.documentId === data?.document.id &&
          t.status === "running",
      );
      if (task) setTranslationTaskId(task.id);
    }
  }, [backgroundTasks, data?.document.id, translationTaskId]);
  useEffect(() => {
    if (translationTask && translationTask.status !== "running") {
      void loadDocument();
      if (translationTask.status === "succeeded") setReadingMode("both");
      else
        setError(
          translationTask.error || "翻译未完成，已保留完成片段，可继续翻译。",
        );
      setTranslationTaskId("");
    }
  }, [translationTask?.status]);
  function changeReadingMode(mode: typeof readingMode) {
    setReadingMode(mode);
    setSelected([]);
    setHover(null);
    window.getSelection()?.removeAllRanges();
  }
  function renderBlock(b: ReadingBlock, translated = false) {
    return (
      <article
        key={b.id}
        id={`reading-${b.id}`}
        data-block-id={b.id}
        data-document-id={translated ? translationDoc?.id : data?.document.id}
        className={`reading-block ${translated ? "reading-translated-block" : ""} ${focused === b.id ? "is-focused" : ""}`}
        title={translated ? translationDoc?.warning : undefined}
      >
        <div
          className="reading-block-html"
          dangerouslySetInnerHTML={{
            __html:
              (translated ? translatedHtml : blockHtml).get(b.id) || b.html,
          }}
        />
        {b.page && !translated && (
          <small className="reading-page-label">PDF 第 {b.page} 页</small>
        )}
      </article>
    );
  }
  function findNext(offset: number) {
    if (!matches.length) return;
    if (readingMode === "translation") setReadingMode("both");
    const index =
      searchIndex < 0
        ? offset < 0
          ? matches.length - 1
          : 0
        : (searchIndex + offset + matches.length) % matches.length;
    setSearchIndex(index);
    setFocused("");
    setSelected([]);
  }
  const page =
    data?.document.blocks.find((b) => b.id === focused)?.page ||
    data?.document.outline.find((o) => o.blockId === focused)?.page ||
    1;
  function sourceOpen(s: SourceCitation) {
    if (s.paperId === paper.id && s.documentId === data?.document.id) {
      setFormat("html");
      jump(s.blockId);
    } else onSource(s);
  }
  return (
    <div
      className="paper-reader-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) void close();
      }}
    >
      <div
        ref={dialogRef}
        className="paper-reader"
        role="dialog"
        aria-modal="true"
        aria-label="论文原文阅读"
        tabIndex={-1}
      >
        <header className="reader-header">
          <BookOpen size={19} />
          <strong title={paper.title}>{paper.title}</strong>
          {data && (
            <span
              className={`reader-source-label ${data.document.source === "converted" ? "converted" : ""}`}
              title={data.document.warning}
            >
              {format === "pdf"
                ? "PDF 原文"
                : data.document.source === "arxiv"
                  ? "arXiv 原始 HTML"
                  : "pdf 自动转换 HTML"}
            </span>
          )}
          <div className="reader-formats" role="group" aria-label="原文格式">
            <button
              aria-pressed={format === "pdf"}
              onClick={() => {
                setFormat("pdf");
                setSelected([]);
                setHover(null);
              }}
              disabled={!paper.file}
            >
              PDF
            </button>
            <button
              aria-pressed={format === "html"}
              onClick={() => setFormat("html")}
            >
              HTML
            </button>
          </div>
          <button aria-label="关闭原文阅读" onClick={() => void close()}>
            <X size={20} />
          </button>
        </header>
        <div className="reader-toolbar">
          {format === "html" && (
            <div className="reader-selection-tools">
              <div
                className="reader-color-swatches"
                role="group"
                aria-label="高亮颜色"
              >
                {(
                  [
                    ["yellow", "黄色"],
                    ["green", "绿色"],
                    ["blue", "蓝色"],
                    ["pink", "粉色"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`reader-swatch swatch-${value}`}
                    title={label}
                    aria-label={`${label}高亮`}
                    aria-pressed={color === value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setColor(value)}
                  />
                ))}
              </div>
              <button
                title="切换高亮：再次选中高亮的一部分即可移除"
                aria-label="切换高亮"
                disabled={!!busy || !selected.length}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void highlight()}
              >
                <Highlighter size={15} />
              </button>
              <button
                title="引用选文到论文对话"
                aria-label="引用选文到论文对话"
                disabled={!!busy || !selectedOriginal}
                onMouseDown={(e) => e.preventDefault()}
                onClick={quoteSelection}
              >
                <MessageSquare size={15} />
              </button>
            </div>
          )}
          {format === "html" && (
            <>
              <label className="reader-search">
                <Search size={14} />
                <input
                  aria-label="查找正文"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (readingMode === "translation" && e.target.value.trim())
                      setReadingMode("both");
                    setSearchIndex(e.target.value.trim() ? 0 : -1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") findNext(1);
                  }}
                  placeholder="搜索原文…"
                />
              </label>
              <small className="reader-search-count" aria-live="polite">
                {search
                  ? `第 ${searchIndex < 0 ? 0 : searchIndex + 1} 处 / 共 ${matches.length} 处`
                  : ""}
              </small>
              <button
                aria-label="上一个匹配词"
                disabled={!matches.length}
                onClick={() => findNext(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label="下一个匹配词"
                disabled={!matches.length}
                onClick={() => findNext(1)}
              >
                <ChevronRight size={16} />
              </button>
              <button
                aria-label="减小阅读字号"
                disabled={font <= 12}
                onClick={() => setFont((f) => Math.max(12, f - 1))}
              >
                <Minus size={15} />
              </button>
              <output>{font}px</output>
              <button
                aria-label="增大阅读字号"
                disabled={font >= 24}
                onClick={() => setFont((f) => Math.min(24, f + 1))}
              >
                <Plus size={15} />
              </button>
              {data && data.versions.length > 1 && (
                <select
                  aria-label="阅读正文版本"
                  value={data.document.id}
                  onChange={async (e) => {
                    if (await flushAll()) {
                      setDocId(e.target.value);
                      setSelected([]);
                      setFocused("");
                    }
                  }}
                >
                  {data.versions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.source === "arxiv" ? "arXiv HTML" : "PDF 转换"} ·{" "}
                      {d.version || "本地正文"}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          <button
            aria-label="刷新原文"
            disabled={!!busy}
            onClick={async () => {
              if (await flushAll()) await loadDocument();
            }}
          >
            <RefreshCw size={15} />
          </button>
          {format === "html" && (
            <div className="reader-translation-controls">
              <button
                aria-label="翻译全文"
                title={
                  translationDoc
                    ? "已缓存译文，点击打开；AI译文可能有误，以原文为准。"
                    : `调用当前模型翻译原文；分批缓存，失败可继续。原文约 ${data?.document.blocks.reduce((n, b) => n + b.text.length, 0) || 0} 字符。`
                }
                disabled={!!busy || translating || !data || !settings.hasKey}
                onClick={() => void translateFull()}
              >
                {translating ? (
                  <LoaderCircle size={14} className="spin" />
                ) : null}
                {data?.translation?.state === "partial"
                  ? "继续翻译"
                  : "翻译全文"}
              </button>
              {translationDoc && (
                <>
                  <button
                    aria-pressed={readingMode !== "translation"}
                    onClick={() =>
                      changeReadingMode(
                        readingMode === "translation"
                          ? "both"
                          : readingMode === "both" ||
                              readingMode === "interleaved"
                            ? "translation"
                            : "original",
                      )
                    }
                  >
                    原文
                  </button>
                  <button
                    aria-pressed={readingMode !== "original"}
                    title={translationDoc.warning}
                    onClick={() =>
                      changeReadingMode(
                        readingMode === "original"
                          ? "both"
                          : readingMode === "both" ||
                              readingMode === "interleaved"
                            ? "original"
                            : "translation",
                      )
                    }
                  >
                    译文
                  </button>
                  <button
                    aria-pressed={readingMode === "interleaved"}
                    onClick={() =>
                      changeReadingMode(
                        readingMode === "interleaved" ? "both" : "interleaved",
                      )
                    }
                  >
                    穿插
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="reader-error" role="alert">
            {error}
          </div>
        )}
        <div
          className="reader-layout"
          data-format={format}
          ref={layoutRef}
          style={
            { "--reader-aside-width": `${asideWidth}px` } as React.CSSProperties
          }
        >
          {outlineOpen && (
            <aside className="reader-outline" aria-label="论文大纲">
              <div className="reader-outline-heading">
                <h3>论文大纲</h3>
                <button
                  aria-label="收起论文大纲"
                  title="收起论文大纲"
                  onClick={() => setOutlineOpen(false)}
                >
                  <PanelLeftClose size={17} />
                </button>
              </div>
              {data?.document.outline.map((o, i) => (
                <button
                  key={`${o.blockId}:${i}`}
                  className={focused === o.blockId ? "active" : ""}
                  style={{ paddingLeft: Math.min(o.level, 4) * 10 }}
                  onClick={() => jump(o.blockId)}
                >
                  {o.title}
                </button>
              ))}
              {!data?.document.outline.length && (
                <p className="muted">未识别出章节大纲。</p>
              )}
            </aside>
          )}
          {!outlineOpen && (
            <div className="reader-rail reader-rail-left">
              <button
                aria-label="展开论文大纲"
                title="展开论文大纲"
                onClick={() => {
                  setOutlineOpen(true);
                  if (window.innerWidth <= 1000) setAsideOpen(false);
                }}
              >
                <PanelLeftOpen size={17} />
              </button>
            </div>
          )}
          <div
            className="reader-pages"
            ref={pagesRef}
            data-mode={
              format === "pdf"
                ? "original"
                : translationDoc
                  ? readingMode
                  : "original"
            }
            style={{ "--original-width": `${split}%` } as React.CSSProperties}
          >
            <main
              ref={contentRef}
              className="reader-content"
              hidden={
                format === "html" &&
                !!translationDoc &&
                readingMode === "translation"
              }
              style={{ fontSize: font }}
              onMouseUp={captureSelection}
              onMouseOver={(e) => {
                const mark = (e.target as HTMLElement).closest<HTMLElement>(
                  ".reading-highlight",
                );
                if (mark) showAnnotation(mark);
                else hideAnnotationLater();
              }}
              onMouseLeave={hideAnnotationLater}
              onScroll={() => {
                if (!popupRef.current?.contains(document.activeElement))
                  setHover(null);
              }}
              onKeyUp={(e) => {
                if (e.shiftKey) captureSelection();
              }}
              onClick={(e) => {
                const mark = (e.target as HTMLElement).closest<HTMLElement>(
                  ".reading-highlight",
                );
                if (mark && !window.getSelection()?.toString()) {
                  showAnnotation(mark);
                  e.preventDefault();
                  return;
                }
                const a = (e.target as HTMLElement).closest("a");
                const href = a?.getAttribute("href");
                if (href?.startsWith("#")) {
                  e.preventDefault();
                  const id = data?.document.anchors[href.slice(1)];
                  if (id) jump(id);
                }
              }}
            >
              {!loading && format === "html" && (
                <SearchFrames
                  content={contentRef}
                  matches={matches}
                  current={searchIndex}
                  revision={searchRevision}
                  navigation={readingMode}
                />
              )}
              {loading && (
                <div className="reader-empty">
                  <LoaderCircle className="spin" />
                  正在加载正文…
                </div>
              )}
              {!loading && format === "pdf" && paper.file && (
                <iframe
                  title="论文 PDF 原文"
                  src={`/api${base}/file${data ? `?documentId=${encodeURIComponent(data.document.id)}` : ""}#page=${page}`}
                />
              )}
              {!loading && format === "pdf" && !paper.file && (
                <div className="reader-empty">尚未获取 PDF。</div>
              )}
              {!loading &&
                format === "html" &&
                data &&
                data.document.blocks.map((b) => (
                  <Fragment key={b.id}>
                    {renderBlock(b)}
                    {readingMode === "interleaved" &&
                      translationDoc?.blocks.find(
                        (v) => v.id === `zh-${b.id}`,
                      ) &&
                      renderBlock(
                        translationDoc.blocks.find(
                          (v) => v.id === `zh-${b.id}`,
                        )!,
                        true,
                      )}
                  </Fragment>
                ))}
              {!loading &&
                format === "html" &&
                data &&
                !data.document.blocks.length && (
                  <div className="reader-empty">
                    没有可提取的正文文字，请阅读 PDF 原文；扫描页暂未进行 OCR。
                  </div>
                )}
              {!loading && !data && (
                <div className="reader-empty">
                  <p>获取原文后，可在这里阅读并保存标注。</p>
                  <PaperAcquisition paper={paper} />
                  <button
                    className="primary"
                    disabled={paperIsAcquiring(paper)}
                    onClick={() =>
                      void action("请求获取原文…", async () => {
                        onWorkspace(
                          await api<Workspace>(`${base}/acquire`, {}),
                        );
                      })
                    }
                  >
                    获取原文
                  </button>
                </div>
              )}
            </main>
            {format === "html" && translationDoc && readingMode === "both" && (
              <div
                role="separator"
                aria-label="调整原文与译文宽度"
                aria-orientation="vertical"
                tabIndex={0}
                className="reader-translation-resize"
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    setSplit((v) =>
                      Math.max(
                        20,
                        Math.min(80, v + (e.key === "ArrowLeft" ? -3 : 3)),
                      ),
                    );
                  }
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  const el = e.currentTarget,
                    start = e.clientX,
                    value = split,
                    width = pagesRef.current?.clientWidth || 1;
                  el.setPointerCapture(e.pointerId);
                  const move = (v: PointerEvent) =>
                    setSplit(
                      Math.max(
                        20,
                        Math.min(
                          80,
                          value + ((v.clientX - start) / width) * 100,
                        ),
                      ),
                    );
                  const end = () => {
                    el.removeEventListener("pointermove", move);
                    el.removeEventListener("pointerup", end);
                    el.removeEventListener("pointercancel", end);
                  };
                  el.addEventListener("pointermove", move);
                  el.addEventListener("pointerup", end);
                  el.addEventListener("pointercancel", end);
                }}
              />
            )}
            {format === "html" &&
              translationDoc &&
              (readingMode === "both" || readingMode === "translation") && (
                <main
                  ref={translationRef}
                  className="reader-content reader-translation"
                  style={{ fontSize: font }}
                  onMouseUp={captureSelection}
                  onKeyUp={(e) => {
                    if (e.shiftKey) captureSelection();
                  }}
                  onMouseOver={(e) => {
                    const mark = (e.target as HTMLElement).closest<HTMLElement>(
                      ".reading-highlight",
                    );
                    if (mark) showAnnotation(mark);
                    else hideAnnotationLater();
                  }}
                  onMouseLeave={hideAnnotationLater}
                  onScroll={() => {
                    if (!popupRef.current?.contains(document.activeElement))
                      setHover(null);
                  }}
                >
                  {translationDoc.blocks.map((b) => renderBlock(b, true))}
                </main>
              )}
          </div>
          {asideOpen && (
            <div
              className="reader-resize"
              role="separator"
              tabIndex={0}
              aria-label="调整阅读侧栏宽度"
              aria-orientation="vertical"
              aria-valuemin={260}
              aria-valuemax={900}
              aria-valuenow={Math.round(asideWidth)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const width = clampAside(
                  asideWidth + (e.key === "ArrowLeft" ? 20 : -20),
                );
                setAsideWidth(width);
                localStorage.setItem(
                  "anistudy.reader-aside-width",
                  String(width),
                );
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                const start = e.clientX,
                  width = asideWidth,
                  element = e.currentTarget;
                element.setPointerCapture(e.pointerId);
                const move = (event: PointerEvent) =>
                  setAsideWidth(clampAside(width + start - event.clientX));
                const end = (event: PointerEvent) => {
                  localStorage.setItem(
                    "anistudy.reader-aside-width",
                    String(clampAside(width + start - event.clientX)),
                  );
                  element.removeEventListener("pointermove", move);
                  element.removeEventListener("pointerup", end);
                  element.removeEventListener("pointercancel", end);
                };
                element.addEventListener("pointermove", move);
                element.addEventListener("pointerup", end);
                element.addEventListener("pointercancel", end);
              }}
            />
          )}
          {asideOpen && (
            <aside
              className="reader-aside"
              style={{ width: asideWidth, flexBasis: asideWidth }}
            >
              <div className="reader-tabs" role="group" aria-label="阅读侧栏">
                <button
                  aria-pressed={tab === "technology"}
                  onClick={() => setTab("technology")}
                >
                  技术
                </button>
                <button
                  aria-pressed={tab === "notes"}
                  onClick={() => setTab("notes")}
                >
                  <NotebookPen size={13} /> 笔记
                </button>
                <button
                  aria-pressed={tab === "explanation"}
                  onClick={() => setTab("explanation")}
                >
                  对话
                </button>
                <button
                  className="reader-collapse"
                  title="收起阅读侧栏"
                  aria-label="收起阅读侧栏"
                  onClick={() => setAsideOpen(false)}
                >
                  <PanelRightClose size={17} />
                </button>
              </div>
              {tab === "technology" && (
                <div className="reader-technology-list">
                  <p className="muted">
                    标签定位原文，右箭头打开技术详情。自动匹配表示术语出现，可手动关联或移除。
                  </p>
                  {data?.links.map((l) => (
                    <div
                      className="reader-tech-tag"
                      key={`${l.nodeId}:${l.blockId}`}
                    >
                      <button title={l.section} onClick={() => jump(l.blockId)}>
                        {l.nodeName}
                        <small>
                          {l.source === "manual"
                            ? "手动关联"
                            : l.source === "ai"
                              ? "整理关联"
                              : "术语匹配"}{" "}
                          · {l.section}
                        </small>
                      </button>
                      <button
                        aria-label={`查看技术 ${l.nodeName}`}
                        onClick={async () => {
                          if (await flushAll()) onNode(l.nodeId);
                        }}
                      >
                        <ArrowRight size={15} />
                      </button>
                      <button
                        aria-label={`移除 ${l.nodeName} 的段落关联`}
                        onClick={() =>
                          void action("更新关联…", async () => {
                            await api(
                              `${base}/paragraph-links`,
                              {
                                documentId: l.documentId,
                                blockId: l.blockId,
                                nodeId: l.nodeId,
                              },
                              "DELETE",
                            );
                            await loadDocument();
                          })
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {!data?.links.length && (
                    <p className="muted">暂无关联技术。</p>
                  )}
                </div>
              )}
              {tab === "notes" && (
                <ReaderNotes
                  w={workspace}
                  paper={paper}
                  onUpdate={onWorkspace}
                />
              )}
              {tab === "explanation" && (
                <div className="reader-explanation">
                  <div
                    className="reader-chat-history"
                    ref={historyRef}
                    aria-label="论文对话历史"
                    aria-live="polite"
                  >
                    {!messages.length && (
                      <p className="muted">
                        围绕这篇论文提问，或从原文引用选文。这里与论文问答共享历史。
                      </p>
                    )}
                    {messages.map((answer) => (
                      <article
                        key={answer.id}
                        className={`reader-chat-message ${answer.role}`}
                      >
                        <strong>
                          {answer.role === "user" ? "你" : "AnIStudy"}
                        </strong>
                        <Markdown
                          citations={answer.citations}
                          onCitation={sourceOpen}
                        >
                          {answer.content}
                        </Markdown>
                        <ChatMessageMeta message={answer} settings={settings} />
                        {"delivery" in answer &&
                          answer.delivery === "failed" && (
                            <small className="chat-delivery-error">
                              发送失败{" "}
                              <button
                                onClick={() => {
                                  setQuestion(answer.content);
                                  setError("");
                                  const request = (answer as LocalChatMessage)
                                    .request;
                                  setQuoted(
                                    request.selections?.length
                                      ? {
                                          documentId:
                                            request.selections[0].documentId,
                                          parts: request.selections.map(
                                            (s) => ({
                                              ...s,
                                              quote:
                                                data?.document.blocks
                                                  .find(
                                                    (b) => b.id === s.blockId,
                                                  )
                                                  ?.text.slice(
                                                    s.start,
                                                    s.end,
                                                  ) || "",
                                            }),
                                          ),
                                        }
                                      : null,
                                  );
                                  onRestoreChat(answer.id);
                                  questionRef.current?.focus();
                                }}
                              >
                                重新编辑
                              </button>
                            </small>
                          )}
                        {!answer.citations?.length &&
                        answer.retrievedSources?.length ? (
                          <details>
                            <summary>本轮检索片段</summary>
                            {answer.retrievedSources.map((s) => (
                              <button
                                key={s.id}
                                className="source-citation"
                                onClick={() => sourceOpen(s)}
                              >
                                {s.section}
                                {s.page ? ` · PDF 第 ${s.page} 页` : ""}
                              </button>
                            ))}
                          </details>
                        ) : null}
                      </article>
                    ))}
                  </div>
                  <textarea
                    ref={questionRef}
                    aria-label="原文阅读问题"
                    value={question}
                    onChange={(e) => {
                      setQuestion(e.target.value);
                      if (
                        quoted &&
                        !quoted.parts.some((s) =>
                          e.target.value.includes(s.quote),
                        )
                      )
                        setQuoted(null);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing &&
                        e.nativeEvent.keyCode !== 229
                      ) {
                        e.preventDefault();
                        void explain();
                      }
                    }}
                    placeholder="围绕这篇论文继续提问…"
                  />
                  <button
                    className="primary"
                    disabled={
                      !!busy ||
                      chatSending ||
                      !settings.hasKey ||
                      !question.trim()
                    }
                    onClick={() => void explain()}
                  >
                    {paper.inLibrary ? "发送" : "加入论文库并发送"}
                  </button>
                  {!settings.hasKey && (
                    <p className="muted">请先在模型设置中设置模型接口。</p>
                  )}
                </div>
              )}
            </aside>
          )}
          {!asideOpen && (
            <div className="reader-rail reader-rail-right">
              <button
                aria-label="展开阅读侧栏"
                title="展开阅读侧栏"
                onClick={openAside}
              >
                <PanelRightOpen size={17} />
              </button>
            </div>
          )}
        </div>
        {chatBusy && (
          <div
            className="busy-indicator reader-busy-indicator"
            role="status"
            aria-label="操作进度"
          >
            <LoaderCircle className="spin" size={16} />
            <span className="operation-text">
              <span>{chatProgress?.current.label || "正在准备对话…"}</span>
              {chatProgress?.current.detail && (
                <small>{chatProgress.current.detail}</small>
              )}
            </span>
          </div>
        )}
        {[...(data?.annotations || []), ...(data?.translationAnnotations || [])]
          .filter((a) => visitedAnnotations.includes(a.id))
          .map((a) => (
            <div
              key={a.id}
              hidden={hover?.id !== a.id}
              ref={hover?.id === a.id ? popupRef : undefined}
              className="reader-annotation-popup"
              role="dialog"
              aria-label="高亮笔记"
              style={{
                left: hover?.left || 0,
                top: Math.max(8, (hover?.top || 150) - 140),
                width: Math.min(
                  460,
                  Math.max(280, Math.sqrt(a.note.length) * 20 + 240),
                ),
              }}
              onMouseEnter={() => clearTimeout(hoverTimer.current)}
              onMouseLeave={hideAnnotationLater}
            >
              <button
                className="annotation-popup-close"
                title="关闭高亮笔记"
                aria-label="关闭高亮笔记"
                onClick={async () => {
                  if (await flushAll()) setHover(null);
                }}
              >
                <X size={13} />
              </button>
              <ReadingAnnotationCard
                annotation={a}
                base={base}
                visible={hover?.id === a.id}
                register={(id, flush) => {
                  if (flush) flushers.current.set(id, flush);
                  else flushers.current.delete(id);
                }}
                onSaved={(saved) =>
                  setData((d) =>
                    d
                      ? {
                          ...d,
                          annotations: d.annotations.map((v) =>
                            v.id === saved.id ? saved : v,
                          ),
                          translationAnnotations: d.translationAnnotations?.map(
                            (v) => (v.id === saved.id ? saved : v),
                          ),
                        }
                      : d,
                  )
                }
              />
            </div>
          ))}
      </div>
    </div>
  );
}
