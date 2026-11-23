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
  Eraser,
} from "lucide-react";
import { api } from "./api";
import { Markdown } from "./Markdown";
import { ChatMessageMeta } from "./ChatMessageMeta";
import { ChatReasoning } from "./ChatReasoning";
import { ReadingAnnotationCard } from "./ReadingAnnotation";
import { ReaderNotes } from "./ReaderNotes";
import { SearchFrames } from "./SearchFrames";
import {
  conversationMessages,
  type ChatRequest,
  type LocalChatMessage,
} from "./conversation";
import {
  annotatedHtml,
  annotationsWithGroupNotes,
  searchOccurrences,
  textRange,
} from "./readingText";
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
  onChatPreferences,
  savingChatPreferences,
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
  onChatPreferences: (data: Partial<Settings>) => void;
  savingChatPreferences?: boolean;
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
  const [annotationTools, setAnnotationTools] = useState<{
    id: string;
    documentId: string;
    left: number;
    top: number;
  } | null>(null);
  const [popupSizes, setPopupSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const annotationAnchor = useRef<HTMLElement | null>(null);
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
    setAnnotationTools(null);
    setSearchIndex(-1);
  }, [base, docId]);
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          ".reader-annotation-popup,.reader-annotation-tools,.reading-highlight",
        )
      )
        return;
      setAnnotationTools(null);
      setHover(null);
      void flushAll();
    };
    document.addEventListener("mousedown", outside, true);
    return () => document.removeEventListener("mousedown", outside, true);
  }, []);
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
      popup.style.top = `${Math.max(bounds.top + 8, hover.top - height + 1)}px`;
    };
    const observer = new ResizeObserver(position);
    observer.observe(popup);
    position();
    return () => observer.disconnect();
  }, [hover]);
  function showAnnotation(mark: HTMLElement) {
    if (window.getSelection()?.toString()) return;
    const a = annotationFor(mark);
    if (!a) return;
    const group = annotationGroup(a),
      id = (group.find((v) => v.note.trim()) || group[0]).id;
    annotationAnchor.current = mark;
    const rect = mark.getBoundingClientRect();
    setVisitedAnnotations((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setHover((current) =>
      current?.id === id &&
      current.left === rect.left &&
      current.top === rect.top
        ? current
        : {
            id,
            left: rect.left,
            top: rect.top,
          },
    );
  }
  function hideAnnotation(relatedTarget?: EventTarget | null) {
    if (popupRef.current?.contains(document.activeElement)) return;
    if (
      relatedTarget instanceof Node &&
      popupRef.current?.contains(relatedTarget)
    )
      return;
    if (
      relatedTarget instanceof HTMLElement &&
      relatedTarget.closest(".reading-highlight")
    )
      return;
    setHover(null);
  }
  function annotationFor(mark: HTMLElement) {
    const id = mark.dataset.annotationIds?.split(" ").at(-1);
    return [
      ...(data?.annotations || []),
      ...(data?.translationAnnotations || []),
    ].find((a) => a.id === id);
  }
  function annotationGroup(a: ReadingAnnotation) {
    return [
      ...(data?.annotations || []),
      ...(data?.translationAnnotations || []),
    ].filter(
      (v) =>
        v.documentId === a.documentId &&
        (v.id === a.id || (a.groupId && v.groupId === a.groupId)),
    );
  }
  function clickAnnotation(mark: HTMLElement) {
    const a = annotationFor(mark);
    if (!a) return;
    const rect = mark.getBoundingClientRect();
    setAnnotationTools({
      id: a.id,
      documentId: a.documentId,
      left: Math.min(rect.left, window.innerWidth - 85),
      top: Math.min(rect.bottom + 4, window.innerHeight - 45),
    });
    showAnnotation(mark);
  }
  function finishAnnotation() {
    const id =
      annotationAnchor.current?.dataset.annotationIds?.split(" ").at(-1) ||
      hover?.id;
    setHover(null);
    setAnnotationTools(null);
    void flushAll().then(() =>
      requestAnimationFrame(() => {
        const mark = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            ".reading-highlight",
          ) || []),
        ].find((m) => m.dataset.annotationIds?.split(" ").includes(id || ""));
        if (mark) {
          mark.tabIndex = -1;
          mark.focus({ preventScroll: true });
        }
      }),
    );
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector(".modal-backdrop")) return;
      if (
        e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.toLowerCase() === "b" &&
        format === "html" &&
        !(e.target as HTMLElement)?.closest(
          "input,textarea,select,[contenteditable=true]",
        )
      ) {
        const parts = captureSelection();
        if (parts.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          void highlight(parts);
        }
        return;
      }
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
        if (hover || annotationTools) {
          e.preventDefault();
          e.stopImmediatePropagation();
          void flushAll().then((ok) => {
            if (ok) {
              setHover(null);
              setAnnotationTools(null);
            }
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
      return [];
    }
    const range = selection.getRangeAt(0),
      out: SelectedText[] = [];
    setHover(null);
    setAnnotationTools(null);
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
      return [];
    }
    if (out.length > 14 || out.map((s) => s.quote).join("").length > 10000) {
      setError("请分次选择，每次不超过 14 个段落或 10000 个字符。");
      setSelected([]);
      return [];
    }
    setSelected(out);
    setError("");
    return out;
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
  function discardDrafts(ids: string[]) {
    for (const id of ids)
      localStorage.removeItem(`anistudy.annotation-draft.${base}.${id}`);
  }
  async function highlight(parts = selected) {
    if (!data || !parts.length) return;
    const documentId = parts[0].documentId;
    await action("保存标注…", async () => {
      if (!(await flushAll()))
        throw new Error("标注备注尚未保存，请先重试保存。");
      const current = await api<ReadingData>(
        `${base}/document?documentId=${encodeURIComponent(data.document.id)}`,
      );
      const rows =
        documentId === data.document.id
          ? current.annotations
          : current.translationAnnotations || [];
      const result = await api<{
        annotations: ReadingAnnotation[];
        removedIds: string[];
      }>(`${base}/annotations/highlight`, {
        documentId,
        color,
        selections: parts.map(({ blockId, start, end, quote }) => ({
          blockId,
          start,
          end,
          quote,
        })),
        expectedAnnotations: rows.map((a) => ({
          id: a.id,
          revision: a.revision,
        })),
      });
      discardDrafts(result.removedIds);
      setData((d) =>
        d
          ? {
              ...d,
              [documentId === d.document.id
                ? "annotations"
                : "translationAnnotations"]: result.annotations,
            }
          : d,
      );
      setHover(null);
      setAnnotationTools(null);
      setSelected([]);
      window.getSelection()?.removeAllRanges();
    });
  }
  async function removeAnnotation() {
    if (!data || !annotationTools) return;
    const target = annotationTools;
    await action("删除标注…", async () => {
      if (!(await flushAll()))
        throw new Error("标注备注尚未保存，请先重试保存。");
      const current = await api<ReadingData>(
        `${base}/document?documentId=${encodeURIComponent(data.document.id)}`,
      );
      const rows =
        target.documentId === data.document.id
          ? current.annotations
          : current.translationAnnotations || [];
      const a = rows.find((a) => a.id === target.id);
      if (!a) throw new Error("该标注已改变，请重新打开原文。");
      const group = rows.filter(
        (v) => v.id === a.id || (a.groupId && v.groupId === a.groupId),
      );
      const result = await api<{ removedIds: string[] }>(
        `${base}/annotations/groups/${a.id}`,
        {
          documentId: a.documentId,
          expectedAnnotations: group.map((v) => ({
            id: v.id,
            revision: v.revision,
          })),
        },
        "DELETE",
      );
      discardDrafts(result.removedIds);
      setData((d) =>
        d
          ? {
              ...d,
              annotations: d.annotations.filter(
                (v) => !result.removedIds.includes(v.id),
              ),
              translationAnnotations: d.translationAnnotations?.filter(
                (v) => !result.removedIds.includes(v.id),
              ),
            }
          : d,
      );
      setHover(null);
      setAnnotationTools(null);
      setSelected([]);
      window.getSelection()?.removeAllRanges();
    });
  }
  function referenceParts(parts: SelectedText[]) {
    if (!data || !parts.length || parts[0].documentId !== data.document.id)
      return;
    setQuoted({ documentId: data.document.id, parts });
    setQuestion(`请解释：‘${parts.map((s) => s.quote).join("\n")}’`);
    setTab("explanation");
    openAside();
    setSelected([]);
    setHover(null);
    setAnnotationTools(null);
    window.getSelection()?.removeAllRanges();
    requestAnimationFrame(() => questionRef.current?.focus());
  }
  function quoteSelection() {
    referenceParts([...selected]);
  }
  function quoteAnnotation() {
    const a = [
      ...(data?.annotations || []),
      ...(data?.translationAnnotations || []),
    ].find((a) => a.id === annotationTools?.id);
    if (!a) return;
    const parts = annotationGroup(a).sort(
      (a, b) =>
        (data?.document.blocks.findIndex((v) => v.id === a.blockId) ?? 0) -
          (data?.document.blocks.findIndex((v) => v.id === b.blockId) ?? 0) ||
        a.start - b.start,
    );
    referenceParts(
      parts.map(({ documentId, blockId, start, end, quote }) => ({
        documentId,
        blockId,
        start,
        end,
        quote,
      })),
    );
  }
  async function explain() {
    if (
      !question.trim() ||
      chatSending ||
      actionRef.current ||
      savingChatPreferences ||
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
  const originalAnnotations = useMemo(
    () => annotationsWithGroupNotes(data?.annotations || []),
    [data?.annotations],
  );
  const translatedAnnotations = useMemo(
    () => annotationsWithGroupNotes(data?.translationAnnotations || []),
    [data?.translationAnnotations],
  );
  const blockHtml = useMemo(
    () =>
      new Map(
        (data?.document.blocks || []).map((b) => [
          b.id,
          annotatedHtml(
            b.html,
            originalAnnotations.filter((a) => a.blockId === b.id),
          ),
        ]),
      ),
    [data?.document, originalAnnotations],
  );
  const translatedHtml = useMemo(
    () =>
      new Map(
        (translationDoc?.blocks || []).map((b) => [
          b.id,
          annotatedHtml(
            b.html,
            translatedAnnotations.filter((a) => a.blockId === b.id),
          ),
        ]),
      ),
    [translationDoc, translatedAnnotations],
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
                title="标注选段（Ctrl+B）"
                aria-label="标注选段"
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
                else hideAnnotation();
              }}
              onMouseLeave={(e) => hideAnnotation(e.relatedTarget)}
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
                  clickAnnotation(mark);
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
                    else hideAnnotation();
                  }}
                  onClick={(e) => {
                    const mark = (e.target as HTMLElement).closest<HTMLElement>(
                      ".reading-highlight",
                    );
                    if (mark && !window.getSelection()?.toString()) {
                      clickAnnotation(mark);
                      e.preventDefault();
                    }
                  }}
                  onMouseLeave={(e) => hideAnnotation(e.relatedTarget)}
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
                  {data?.links.map((l) => (
                    <div
                      className="reader-tech-tag"
                      key={`${l.nodeId}:${l.blockId}`}
                    >
                      <button title={l.section} onClick={() => jump(l.blockId)}>
                        {l.nodeName}
                        <small>
                          {l.label || "手动关联"} · {l.section}
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
                  <ChatReasoning
                    settings={settings}
                    disabled={!!busy || chatSending || savingChatPreferences}
                    onChange={onChatPreferences}
                  />
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
                      savingChatPreferences ||
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
        {annotationTools && (
          <div
            className="reader-annotation-tools"
            role="toolbar"
            aria-label="标注操作"
            style={{ left: annotationTools.left, top: annotationTools.top }}
          >
            <button
              aria-label="取消标注并删除笔记"
              title="取消标注并删除笔记"
              disabled={!!busy}
              onClick={() => void removeAnnotation()}
            >
              <Eraser size={15} />
            </button>
            <button
              aria-label="引用标注至对话"
              title={
                annotationTools.documentId === data?.document.id
                  ? "引用至对话"
                  : "引用只支持原文"
              }
              disabled={
                !!busy || annotationTools.documentId !== data?.document.id
              }
              onClick={quoteAnnotation}
            >
              <MessageSquare size={15} />
            </button>
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
                width: popupSizes[a.id]?.width || 278,
                height: popupSizes[a.id]?.height || 58,
              }}
              onMouseLeave={(e) => hideAnnotation(e.relatedTarget)}
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
                onFinish={finishAnnotation}
                onSize={(size) =>
                  setPopupSizes((current) =>
                    current[a.id]?.width === size.width &&
                    current[a.id]?.height === size.height
                      ? current
                      : { ...current, [a.id]: size },
                  )
                }
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
