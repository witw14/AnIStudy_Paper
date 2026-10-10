import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  GitBranch,
  Home,
  Inbox,
  Library,
  LoaderCircle,
  MessageSquare,
  Network,
  Focus,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Route as RouteIcon,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  ExternalLink,
  Clock3,
  Pencil,
  Menu,
  Cpu,
} from "lucide-react";
import { api } from "./api";
import { Graph } from "./Graph";
import { NodeCatalog } from "./NodeCatalog";
import { Markdown } from "./Markdown";
import { NotesLibrary, NoteLinks } from "./Notes";
import { EditableText } from "./EditableText";
import { NoteSettings } from "./NoteSettings";
import { ChatEvidenceSettings } from "./ChatEvidenceSettings";
import { ChatMessageMeta } from "./ChatMessageMeta";
import {
  AcquisitionSettings,
  PaperAcquisition,
  paperIsAcquiring,
} from "./AcquisitionSettings";
import { PaperReader, type ReaderLocation } from "./PaperReader";
import {
  conversationMessages,
  type ChatRequest,
  type LocalChatMessage,
} from "./conversation";
import { PaperPassages } from "./PaperPassages";
import { isProgressOperation, observeOperation } from "./operationProgress";
import { earliestLinkedPaper } from "./technologyChat";
import { ConnectedTechnologies } from "./ConnectedTechnologies";
import {
  sortLibraryPapers,
  librarySortOptions,
  type LibrarySort,
} from "./librarySorting";
import { Customization, importanceNames } from "./Customization";
import { ModelSettings } from "./ModelSettings";
import {
  BackgroundTaskDock,
  TaskHistory,
  useBackgroundTasks,
} from "./TaskActivity";
import {
  workspaceTaxonomy,
  categoryColor,
  statusNames,
  type Paper,
  type Note,
  type Settings,
  type Status,
  type Tech,
  type Workspace,
  type WorkspaceMeta,
  type OperationProgress,
  type SourceCitation,
} from "./types";

type Page =
  "home" | "library" | "notes" | "technology" | "papers" | "routes" | "journal";
const pages: { id: Page; label: string; en: string; icon: typeof Home }[] = [
  { id: "home", label: "空间总览", en: "Overview", icon: Home },
  { id: "library", label: "论文库", en: "Paper library", icon: Library },
  { id: "notes", label: "笔记库", en: "Notes library", icon: Pencil },
  {
    id: "technology",
    label: "技术图谱",
    en: "Technology graph",
    icon: Network,
  },
  { id: "papers", label: "论文图谱", en: "Paper graph", icon: GitBranch },
  { id: "routes", label: "学习路线", en: "Learning routes", icon: RouteIcon },
  { id: "journal", label: "学习档案", en: "Learning journal", icon: BookOpen },
];
type Selection = { kind: "paper" | "node"; id: string } | null;
function StatusSelect({
  value,
  onChange,
}: {
  value: Status;
  onChange: (s: Status) => void;
}) {
  return (
    <select
      aria-label="学习状态"
      className={`status-select ${value}`}
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
    >
      {Object.entries(statusNames).map(([v, n]) => (
        <option value={v} key={v}>
          {n}
        </option>
      ))}
    </select>
  );
}
function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        e.stopImmediatePropagation();
        const elements = ref.current?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${className}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button aria-label="关闭弹窗" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const [spaces, setSpaces] = useState<WorkspaceMeta[]>([]);
  const [spacesLoaded, setSpacesLoaded] = useState(false);
  const [w, setW] = useState<Workspace | null>(null);
  const categories = Object.fromEntries(
    w ? workspaceTaxonomy(w, "categories").map((e) => [e.id, e.name]) : [],
  );
  const [settings, setSettings] = useState<Settings>({});
  const [editingImportance, setEditingImportance] = useState<string | null>(
    null,
  );
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme || "forest";
    document.documentElement.dataset.reduceMotion = String(
      settings.reduceMotion || false,
    );
  }, [settings.theme, settings.reduceMotion]);
  const [page, setPage] = useState<Page>("home");
  const [selectedNote, setSelectedNote] = useState("");
  const [graphFocus, setGraphFocus] = useState<{
    workspaceId: string;
    nodeId: string;
  } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [reader, setReader] = useState<
    (ReaderLocation & { returnTo: Selection }) | null
  >(null);
  function openReader(location: ReaderLocation) {
    setReader({ ...location, returnTo: selection });
    setSelection(null);
  }
  function openSource(source: SourceCitation) {
    if (!w?.papers.some((p) => p.id === source.paperId)) {
      setNotice("引用对应的论文已移除，无法打开原文。");
      return;
    }
    openReader({
      paperId: source.paperId,
      documentId: source.documentId,
      blockId: source.blockId,
      format: "html",
    });
  }
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState("");
  const [operationProgress, setOperationProgress] =
    useState<OperationProgress | null>(null);
  const workRef = useRef<{ stop?: () => void } | null>(null);
  const chatStops = useRef(new Map<string, () => void>());
  useEffect(
    () => () => {
      workRef.current?.stop?.();
      workRef.current = null;
      for (const stop of chatStops.current.values()) stop();
      chatStops.current.clear();
    },
    [],
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth > 1020);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 700);
  const [mode, setMode] = useState<"paper" | "research">("research");
  const [paperId, setPaperId] = useState("");
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalChatMessage[]>([]);
  const chatRequests = useRef(new Set<string>());
  const chatSending =
    !!w &&
    localMessages.some(
      (m) => m.workspaceId === w.id && m.delivery === "sending",
    );
  const [savingChatPreferences, setSavingChatPreferences] = useState(false);
  const [search, setSearch] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [librarySort, setLibrarySort] = useState<LibrarySort>(() => {
    const saved = localStorage.getItem("anistudy.library-sort");
    return saved && Object.hasOwn(librarySortOptions, saved)
      ? (saved as LibrarySort)
      : "upload-desc";
  });
  const [chatWidth, setChatWidth] = useState(330);
  const activeId = useRef("");
  const background = useBackgroundTasks((task) => {
    const id = activeId.current;
    if (task.workspaceId === id)
      void api<Workspace>(`/workspaces/${id}`)
        .then((next) => {
          if (activeId.current === id) setW(next);
        })
        .catch(() => {});
  });
  const chatEnd = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  async function loadSpace(id: string) {
    const version = ++requestVersion.current;
    setError("");
    try {
      const data = await api<Workspace>(`/workspaces/${id}`);
      if (version !== requestVersion.current) return;
      activeId.current = id;
      setW(data);
      setSelection(null);
      setReader(null);
      setSelectedNote("");
      setPaperId(
        data.papers.find((p) => p.inLibrary && p.status === "learning")?.id ||
          data.papers.find((p) => p.inLibrary)?.id ||
          "",
      );
      setDraft("");
      setSearch("");
      localStorage.setItem("anistudy.workspace", id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void Promise.all([
      api<WorkspaceMeta[]>("/workspaces"),
      api<Settings>("/settings"),
    ])
      .then(([list, s]) => {
        setSpaces(list);
        setSpacesLoaded(true);
        setSettings(s);
        const saved = localStorage.getItem("anistudy.workspace");
        if (list.length)
          void loadSpace(list.find((x) => x.id === saved)?.id || list[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(id);
    }
  }, [notice]);
  useEffect(() => {
    const refresh = () => {
      const id = activeId.current;
      if (!id) return;
      void api<Workspace>(`/workspaces/${id}`)
        .then((next) => {
          if (activeId.current === id) setW(next);
        })
        .catch(() => {});
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [w?.messages.length, localMessages.length, mode, paperId]);
  const acquiring = !!w?.papers.some(paperIsAcquiring);
  useEffect(() => {
    if (!w || !acquiring) return;
    const id = w.id;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<Workspace>(`/workspaces/${id}`);
        if (!stopped && activeId.current === id) setW(next);
      } catch {}
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 600);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [w?.id, acquiring]);
  async function work(label: string, fn: () => Promise<unknown>) {
    if (workRef.current) return;
    const currentWork: { stop?: () => void } = {};
    workRef.current = currentWork;
    setOperationProgress(null);
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      currentWork.stop?.();
      if (workRef.current === currentWork) {
        workRef.current = null;
        setOperationProgress(null);
        setBusy("");
      }
    }
  }
  async function mutate(path: string, body?: unknown, method?: string) {
    if (!w) return;
    const id = w.id;
    const currentWork = workRef.current;
    const tracked =
      currentWork &&
      (method || (body ? "POST" : "GET")) === "POST" &&
      isProgressOperation(path);
    const operationId = tracked ? crypto.randomUUID() : undefined;
    if (operationId && currentWork) {
      currentWork.stop?.();
      setOperationProgress(null);
      currentWork.stop = observeOperation(id, operationId, (progress) => {
        if (workRef.current === currentWork && activeId.current === id)
          setOperationProgress(progress);
      });
    }
    let next: Workspace;
    try {
      next = await api<Workspace>(`/workspaces/${id}${path}`, body, method, {
        operationId,
      });
    } finally {
      if (operationId) currentWork?.stop?.();
    }
    if (activeId.current === id) setW(next);
    return next;
  }
  async function saveChatPreferences(data: Partial<Settings>) {
    setSavingChatPreferences(true);
    try {
      await api("/preferences", data, "PATCH");
      setSettings((s) => ({ ...s, ...data }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingChatPreferences(false);
    }
  }
  function patch(collection: string, id: string, data: unknown) {
    void work("保存中", () => mutate(`/${collection}/${id}`, data, "PATCH"));
  }
  function setNodeHidden(
    collection: "nodes" | "papers",
    id: string,
    hidden: boolean,
  ) {
    if (!w) return;
    const wid = w.id;
    const previous = w[collection].find(
      (item) => item.id === id,
    )?.hiddenInGraph;
    const update = (value: boolean | undefined) =>
      setW((current) =>
        current?.id === wid
          ? {
              ...current,
              [collection]: current[collection].map((item) =>
                item.id === id ? { ...item, hiddenInGraph: value } : item,
              ),
            }
          : current,
      );
    void work("保存节点显示", async () => {
      update(hidden);
      try {
        await mutate(
          `/${collection}/${id}`,
          { hiddenInGraph: hidden },
          "PATCH",
        );
      } catch (error) {
        update(previous);
        throw error;
      }
    });
  }
  function remove(collection: string, id: string) {
    void work("删除中", async () => {
      await mutate(`/${collection}/${id}`, undefined, "DELETE");
      setSelection(null);
    });
  }
  function select(kind: "paper" | "node", id: string) {
    setSelection({ kind, id });
    if (kind === "paper") setPaperId(id);
  }
  function openNote(id: string) {
    setSelectedNote(id);
    setPage("notes");
    setSelection(null);
  }
  function createNodeNote(node: Tech) {
    if (!w) return;
    const wid = w.id;
    void work("新建关联笔记", async () => {
      const result = await api<{ note: Note; workspace: Workspace }>(
        `/workspaces/${wid}/notes`,
        { title: node.name.slice(0, 300), nodeIds: [node.id] },
      );
      if (activeId.current !== wid) return;
      setW(result.workspace);
      openNote(result.note.id);
    });
  }
  function quote(node: Tech) {
    setChatOpen(true);
    setMode("paper");
    setPaperId(earliestLinkedPaper(node, w?.papers || [])?.id || "");
    setDraft(
      `请解释 ${node.name} 技术在这篇论文中的作用，以及其是怎么实现的。`,
    );
    setSelection(null);
  }
  function resizeChat(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = e.clientX;
    const initial = chatWidth;
    const target = e.currentTarget;
    const move = (ev: Event) =>
      setChatWidth(
        Math.min(
          530,
          Math.max(280, initial + start - (ev as PointerEvent).clientX),
        ),
      );
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
  }
  const pending = w?.suggestions.filter((s) => s.state === "pending") || [];
  const library = w?.papers.filter((p) => p.inLibrary) || [];
  const learned = w?.nodes.filter((n) => n.status === "learned").length || 0;
  const currentPaper = library.find((p) => p.id === paperId);
  const selectedNode =
    selection?.kind === "node"
      ? w?.nodes.find((n) => n.id === selection.id)
      : null;
  const selectedPaper =
    selection?.kind === "paper"
      ? w?.papers.find((p) => p.id === selection.id)
      : null;
  const currentPage = pages.find((p) => p.id === page)!;
  const messages = conversationMessages(
    w?.messages.filter(
      (m) => m.mode === mode && (mode === "research" || m.paperId === paperId),
    ) || [],
    localMessages.filter(
      (m) =>
        m.workspaceId === w?.id &&
        m.mode === mode &&
        (mode === "research" || m.paperId === paperId),
    ),
  );
  async function sendConversation(
    request: ChatRequest,
    onProgress?: (p: OperationProgress) => void,
  ) {
    if (!w) throw new Error("请先选择研究空间。");
    const id = w.id;
    if (chatRequests.current.has(id))
      throw new Error("当前对话仍在生成，请稍候。");
    chatRequests.current.add(id);
    const localId = crypto.randomUUID();
    setLocalMessages((rows) => [
      ...rows,
      {
        id: localId,
        workspaceId: id,
        role: "user",
        content: request.message,
        mode: request.mode,
        paperId: request.paperId,
        time: new Date().toISOString(),
        delivery: "sending",
        request,
      },
    ]);
    let stop: (() => void) | undefined;
    try {
      if (
        request.mode === "paper" &&
        w.papers.some((p) => p.id === request.paperId && !p.inLibrary)
      ) {
        const admitted = await api<Workspace>(
          `/workspaces/${id}/papers/${request.paperId}`,
          { inLibrary: true },
          "PATCH",
        );
        if (activeId.current === id) setW(admitted);
      }
      const operationId = crypto.randomUUID();
      stop = observeOperation(id, operationId, (p) => {
        if (activeId.current === id) onProgress?.(p);
      });
      chatStops.current.set(id, stop);
      const next = await api<Workspace>(
        `/workspaces/${id}/chat`,
        request,
        undefined,
        { operationId },
      );
      if (activeId.current === id) setW(next);
      setLocalMessages((rows) => rows.filter((m) => m.id !== localId));
      return next;
    } catch (e) {
      setLocalMessages((rows) =>
        rows.map((m) =>
          m.id === localId
            ? { ...m, delivery: "failed", deliveryError: (e as Error).message }
            : m,
        ),
      );
      throw e;
    } finally {
      stop?.();
      chatStops.current.delete(id);
      chatRequests.current.delete(id);
    }
  }
  async function submitChat(e: FormEvent) {
    e.preventDefault();
    if (
      savingChatPreferences ||
      workRef.current ||
      chatSending ||
      !settings.hasKey ||
      !w ||
      (mode === "paper" && !currentPaper)
    )
      return;
    if (!draft.trim()) return;
    const message = draft;
    setDraft("");
    await work("正在思考", async () => {
      await sendConversation(
        {
          message,
          mode,
          paperId: mode === "paper" ? paperId : undefined,
        },
        setOperationProgress,
      );
    });
  }
  const paperLink = (p: Paper) =>
    p.arxivId ? (
      <a
        className="text-link"
        href={`https://arxiv.org/abs/${p.arxivId}`}
        target="_blank"
        rel="noreferrer"
      >
        arXiv:{p.arxivId}
        <ExternalLink size={12} />
      </a>
    ) : (
      <span className="muted">本地上传 · 未验证元信息</span>
    );

  return (
    <div className={`app ${!sidebarOpen ? "sidebar-collapsed" : ""}`}>
      {sidebarOpen && (
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage("home");
            }}
          >
            <span className="brand-mark">
              A<span />
            </span>
            <div>
              AnIStudy<span className="brand-paper">PAPER / 研究学习空间</span>
            </div>
          </a>
          <div className="workspace-box">
            <span className="eyebrow">当前研究空间</span>
            <div className="workspace-picker">
              <span className="workspace-icon">
                {w?.name.slice(0, 2) || "研"}
              </span>
              <select
                aria-label="切换研究空间"
                value={w?.id || ""}
                disabled={!!busy}
                onChange={(e) => void loadSpace(e.target.value)}
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.demo ? " · 示例" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <button
              className="new-workspace"
              onClick={() => setModal("workspace")}
            >
              <Plus size={13} />
              新建研究空间
            </button>
          </div>
          <div className="nav-label">你的知识空间</div>
          <nav>
            {pages.map((p) => (
              <button
                key={p.id}
                className={page === p.id ? "active" : ""}
                onClick={() => {
                  setPage(p.id);
                  setSelection(null);
                }}
              >
                <p.icon size={18} />
                {p.label}
                {p.id === "library" && (
                  <span className="nav-count">{library.length}</span>
                )}
                {p.id === "technology" && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <div className="small-orbit">
              <span />
              <span />
              <span />
            </div>
            <strong>让知识，逐渐连成地图。</strong>
            <p>
              每一篇读过的论文，
              <br />
              都是下一次发现的起点。
            </p>
          </div>
          <div className="sidebar-footer">
            <button
              aria-label="打开偏好选项"
              onClick={() => setModal("preferences")}
            >
              <SettingsIcon size={17} />
              偏好选项
            </button>
            <button aria-label="打开模型设置" onClick={() => setModal("model")}>
              <Cpu size={17} />
              模型设置
            </button>
            <div className="profile">
              <span>研</span>
              <div>
                我的研究工作台
                <small>
                  <i />
                  本地个人空间
                </small>
              </div>
              <ShieldCheck size={17} />
            </div>
          </div>
        </aside>
      )}
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb" role="navigation" aria-label="顶部导航">
            <button
              aria-label={sidebarOpen ? "折叠侧栏" : "展开侧栏"}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={18} />}
            </button>
            <div className="breadcrumb-path">
              <span className="breadcrumb-brand">AnIStudy</span>
              <ChevronRight size={13} aria-hidden="true" />
              <select
                className="breadcrumb-space"
                aria-label="顶部切换研究空间"
                title={w?.name || "选择研究空间"}
                value={w?.id || ""}
                disabled={!w || !!busy}
                onChange={(e) => void loadSpace(e.target.value)}
              >
                {!w && <option value="">选择研究空间</option>}
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronRight size={13} aria-hidden="true" />
              <select
                className="breadcrumb-page"
                aria-label="顶部切换页面"
                title={currentPage.label}
                value={page}
                onChange={(e) => {
                  setPage(e.target.value as Page);
                  setSelection(null);
                }}
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="top-actions">
            <span className="isolation">
              <ShieldCheck size={13} />
              记忆独立保存
            </span>
            <button
              aria-label="查看动态"
              title="动态"
              className="inbox-button"
              onClick={() => setModal("inbox")}
            >
              <Inbox size={19} />
              {pending.length > 0 && <i />}
            </button>
            <button
              aria-label="切换对话面板"
              onClick={() => setChatOpen((v) => !v)}
            >
              <MessageSquare size={18} />
            </button>
            <button
              aria-label="偏好选项"
              title="偏好选项"
              onClick={() => setModal("preferences")}
            >
              <SettingsIcon size={19} />
            </button>
            <button
              aria-label="模型设置"
              title="模型设置"
              onClick={() => setModal("model")}
            >
              <Cpu size={19} />
            </button>
            <span className="avatar">研</span>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <CircleHelp size={17} />
            <span>{error}</span>
            <button aria-label="关闭错误提示" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <Check size={16} />
            {notice}
          </div>
        )}
        <div className="workspace-layout">
          <main className="main-content">
            {!w ? (
              <div className="empty">
                <LoaderCircle className="spin" />
                <p>
                  {spacesLoaded && !spaces.length
                    ? "创建你的第一个研究空间，让知识从这里生长。"
                    : "正在打开你的研究空间…"}
                </p>
                {spacesLoaded && !spaces.length && (
                  <button
                    className="primary"
                    onClick={() => setModal("workspace")}
                  >
                    <Plus size={16} />
                    创建研究空间
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">
                      {currentPage.en.toUpperCase()}
                    </span>
                    <h1>
                      {page === "home"
                        ? "每一步探索，都有迹可循。"
                        : currentPage.label}
                      <span className="heading-dot">.</span>
                    </h1>
                    <p>
                      {page === "home"
                        ? w.description ||
                          "从第一篇论文出发，建立持续生长的知识地图。"
                        : page === "technology"
                          ? "看见技术如何演化，也看见下一步值得探索什么。"
                          : page === "papers"
                            ? "把独立的论文，连接成有来路、有方向的研究脉络。"
                            : page === "library"
                              ? "收藏、阅读、理解。让每一篇论文成为知识的一部分。"
                              : page === "routes"
                                ? "围绕能力目标学习，为每一步找到清晰的方向。"
                                : "你的理解、疑问与进展，都在这里由你掌握。"}
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => setModal("import")}
                  >
                    <Plus size={16} />
                    导入论文
                  </button>
                </div>
                {page === "home" && (
                  <>
                    <div className="overview-stats">
                      {[
                        {
                          label: "我的论文",
                          value: library.length,
                          unit: "篇",
                          icon: FileText,
                          note: `${library.filter((p) => p.status === "learned").length} 篇已读`,
                        },
                        {
                          label: "技术节点",
                          value: w.nodes.length,
                          unit: "个",
                          icon: Network,
                          note: `${w.nodes.filter((n) => n.evidence === "missing").length} 个待补足`,
                        },
                        {
                          label: "进行中的路线",
                          value: w.routes.filter((r) => r.selected).length,
                          unit: "条",
                          icon: RouteIcon,
                          note: "沿着目标，持续探索",
                        },
                        {
                          label: "已学习技术",
                          value: learned,
                          unit: "个",
                          icon: CheckCheck,
                          note: w.nodes.length
                            ? `${Math.round((learned / w.nodes.length) * 100)}% 的知识地图已点亮`
                            : "从第一个知识点开始",
                        },
                      ].map((s) => (
                        <div className="stat-card" key={s.label}>
                          <div>
                            <span>{s.label}</span>
                            <s.icon size={17} />
                          </div>
                          <strong>
                            {String(s.value).padStart(2, "0")}
                            <small>{s.unit}</small>
                          </strong>
                          <p>{s.note}</p>
                        </div>
                      ))}
                    </div>
                    <div className="section-title">
                      <div>
                        <Network size={18} />
                        <h2>正在生长的知识地图</h2>
                        <span className="pill">Technology evolution</span>
                      </div>
                      <button onClick={() => setPage("technology")}>
                        探索完整图谱
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <Graph
                      nodeSizes={settings.nodeSizes}
                      timelineAutoWrap={settings.timelineAutoWrap}
                      timelineColumnLimit={settings.timelineColumnLimit}
                      key={w.id + "-home"}
                      w={w}
                      paperMode={false}
                      onSelect={select}
                    />
                    <div className="home-bottom">
                      <section className="panel">
                        <div className="section-title">
                          <h2>继续你的探索</h2>
                          <button onClick={() => setPage("library")}>
                            查看全部
                            <ArrowRight size={13} />
                          </button>
                        </div>
                        {library
                          .filter((p) => p.status === "learning")
                          .slice(0, 2)
                          .map((p) => (
                            <button
                              className="continue-paper"
                              key={p.id}
                              onClick={() => select("paper", p.id)}
                            >
                              <span className="paper-mini">
                                <FileText size={20} />
                              </span>
                              <span>
                                <strong>{p.short || p.title}</strong>
                                <small>
                                  {p.year ?? "年份待识别"} ·{" "}
                                  {p.hasText ? "全文已就绪" : "摘要资料"} ·
                                  学习中
                                </small>
                              </span>
                              <ArrowRight size={16} />
                            </button>
                          ))}
                        {!library.some((p) => p.status === "learning") && (
                          <p className="muted">
                            将论文标为「学习中」，从这里接着读。
                          </p>
                        )}
                      </section>
                      <section className="panel next-step">
                        <span className="eyebrow">
                          <Sparkles size={13} /> NEXT STEP
                        </span>
                        <h2>
                          {w.nodes.find((n) => n.evidence === "missing")
                            ?.name || "开始一条新的研究路线"}
                        </h2>
                        <p>
                          {w.nodes.find((n) => n.evidence === "missing")
                            ?.significance ||
                            "导入相关论文，按你的研究目标生成阶段计划。"}
                        </p>
                        <button
                          className="text-link"
                          onClick={() => {
                            const n = w.nodes.find(
                              (n) => n.evidence === "missing",
                            );
                            if (n) select("node", n.id);
                            else setPage("routes");
                          }}
                        >
                          了解这个知识环节
                          <ArrowRight size={14} />
                        </button>
                      </section>
                    </div>
                    <section className="panel tasks-panel">
                      <div className="section-title">
                        <h2>
                          <Clock3 size={17} /> 学习日程
                        </h2>
                        <span className="muted">
                          {new Date().toLocaleDateString("zh-CN", {
                            month: "long",
                            day: "numeric",
                            weekday: "long",
                          })}
                        </span>
                      </div>
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = e.currentTarget;
                          const d = new FormData(f);
                          void work("添加日程", async () => {
                            await mutate("/tasks", {
                              title: d.get("title"),
                              due: d.get("due"),
                            });
                            f.reset();
                          });
                        }}
                      >
                        <input
                          name="title"
                          required
                          placeholder="下一件想完成的事…"
                          aria-label="日程标题"
                        />
                        <input
                          name="due"
                          required
                          type="date"
                          aria-label="截止日期"
                        />
                        <button className="secondary" disabled={!!busy}>
                          <Plus size={15} />
                          添加
                        </button>
                      </form>
                      {w.tasks.map((t) => (
                        <div className="task" key={t.id}>
                          <input
                            type="checkbox"
                            checked={t.done}
                            aria-label={`完成 ${t.title}`}
                            onChange={(e) =>
                              patch("tasks", t.id, { done: e.target.checked })
                            }
                          />
                          <span className={t.done ? "done" : ""}>
                            {t.title}
                          </span>
                          <time>{t.due}</time>
                          <button
                            aria-label={`删除日程 ${t.title}`}
                            onClick={() => remove("tasks", t.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </section>
                  </>
                )}
                {page === "notes" && (
                  <NotesLibrary
                    key={w.id}
                    w={w}
                    onUpdate={setW}
                    selected={selectedNote}
                    onSelect={setSelectedNote}
                  />
                )}
                {(page === "technology" || page === "papers") && (
                  <>
                    <div className="graph-summary">
                      <span>
                        <strong>
                          {page === "technology"
                            ? w.nodes.length
                            : w.papers.length}
                        </strong>{" "}
                        个{page === "technology" ? "技术节点" : "论文节点"}
                      </span>
                      <span>
                        <strong>
                          {page === "technology"
                            ? w.edges.length
                            : w.paperEdges.length}
                        </strong>{" "}
                        条明确关系
                      </span>
                      <button onClick={() => setModal("inbox")}>
                        <Inbox size={15} />
                        {pending.length} 条待确认建议
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <Graph
                      nodeSizes={settings.nodeSizes}
                      timelineAutoWrap={settings.timelineAutoWrap}
                      timelineColumnLimit={settings.timelineColumnLimit}
                      key={w.id + "-" + page}
                      focusId={
                        graphFocus?.workspaceId === w.id
                          ? graphFocus.nodeId
                          : null
                      }
                      onExitFocus={() => setGraphFocus(null)}
                      w={w}
                      paperMode={page === "papers"}
                      onSelect={select}
                    />
                    <div className="info-note">
                      <CircleHelp size={15} />
                      <span>
                        {page === "technology"
                          ? "线型区分技术关系，箭头表示关系方向；只有 Requires 表示必要前置。节点实线轮廓代表已有资料支持，不代表已掌握。"
                          : "论文关系与技术关系独立维护。点击论文可查看它涉及的技术，节点虚线轮廓代表尚未加入论文库。"}
                      </span>
                    </div>
                    {page === "technology" && (
                      <NodeCatalog
                        key={w.id}
                        w={w}
                        onSelect={(id) => select("node", id)}
                      />
                    )}
                  </>
                )}
                {page === "library" && (
                  <>
                    <div className="library-toolbar">
                      <div className="tabs">
                        {[
                          ["all", "全部论文"],
                          ["learning", "学习中"],
                          ["learned", "已学习"],
                          ["unlearned", "未学习"],
                        ].map(([id, label]) => (
                          <button
                            className={libraryFilter === id ? "active" : ""}
                            key={id}
                            onClick={() => setLibraryFilter(id)}
                          >
                            {label}
                            {id === "all" && <small>{library.length}</small>}
                          </button>
                        ))}
                      </div>
                      <label className="search-box">
                        <Search size={15} />
                        <input
                          placeholder="搜索标题、作者…"
                          aria-label="搜索论文"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="论文排序"
                        value={librarySort}
                        onChange={(e) => {
                          const value = e.target.value as LibrarySort;
                          setLibrarySort(value);
                          localStorage.setItem("anistudy.library-sort", value);
                        }}
                      >
                        {Object.entries(librarySortOptions).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                    <div className="paper-list">
                      {sortLibraryPapers(library, librarySort)
                        .filter(
                          (p) =>
                            (libraryFilter === "all" ||
                              p.status === libraryFilter) &&
                            `${p.title} ${p.authors}`
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                        )
                        .map((p, i) => (
                          <article className="paper-card" key={p.id}>
                            <button
                              className={`paper-cover cover-${i % 3}`}
                              aria-label={`打开 ${p.title}`}
                              onClick={() => select("paper", p.id)}
                            >
                              <FileText size={26} />
                              <span>
                                {p.short?.length < 18 ? p.short : "RESEARCH"}
                              </span>
                              <small>{p.year ?? "年份待识别"}</small>
                            </button>
                            <div className="paper-card-content">
                              <div className="paper-meta">
                                <span>{p.year ?? "年份待识别"}</span>
                                <span>
                                  {p.verification === "verified" ? (
                                    <>
                                      <ShieldCheck size={12} />
                                      元信息已验证
                                    </>
                                  ) : (
                                    "待验证"
                                  )}
                                </span>
                                <span>
                                  {p.hasText
                                    ? "PDF 全文"
                                    : p.file
                                      ? "无可提取文本"
                                      : "摘要资料"}
                                </span>
                              </div>
                              <button
                                className="paper-title"
                                onClick={() => select("paper", p.id)}
                              >
                                {p.title}
                              </button>
                              <p className="authors">{p.authors}</p>
                              <p className="paper-summary">{p.summary}</p>
                              <PaperAcquisition paper={p} />
                              <div className="paper-card-footer">
                                <button
                                  className="paper-read-original"
                                  onClick={() =>
                                    openReader({
                                      paperId: p.id,
                                      format: "html",
                                    })
                                  }
                                >
                                  <BookOpen size={14} />
                                  阅读原文
                                </button>
                                {paperLink(p)}
                                <StatusSelect
                                  value={p.status}
                                  onChange={(s) =>
                                    patch("papers", p.id, { status: s })
                                  }
                                />
                              </div>
                            </div>
                          </article>
                        ))}
                    </div>
                    {!library.length && (
                      <div className="empty">
                        <Library size={42} />
                        <h3>你的第一篇论文，会从哪里开始？</h3>
                        <p>上传 PDF，或通过 arXiv 链接导入经过验证的论文。</p>
                        <button
                          className="primary"
                          onClick={() => setModal("import")}
                        >
                          <Plus size={15} />
                          导入第一篇论文
                        </button>
                      </div>
                    )}
                  </>
                )}
                {page === "routes" && (
                  <>
                    <form
                      className="route-generator"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const d = new FormData(e.currentTarget);
                        void work("正在规划路线", async () => {
                          await mutate("/routes/generate", {
                            goal: d.get("goal"),
                          });
                          setNotice("路线已生成，请选择感兴趣的计划。");
                        });
                      }}
                    >
                      <span className="spark-box">
                        <Sparkles size={22} />
                      </span>
                      <div>
                        <strong>你想走向哪个研究方向？</strong>
                        <p>生成 2–3 条精简路线，推荐的新论文将逐篇核验。</p>
                        <div className="inline-form">
                          <input
                            name="goal"
                            required
                            placeholder="例如：理解视觉 Transformer，进阶目标检测"
                            aria-label="研究方向"
                          />
                          <button className="primary" disabled={!!busy}>
                            生成路线
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    </form>
                    {w.routes.map((r) => {
                      const ids = [
                        ...new Set(r.stages.flatMap((s) => s.nodeIds)),
                      ];
                      const done = ids.filter(
                        (id) =>
                          w.nodes.find((n) => n.id === id)?.status ===
                          "learned",
                      ).length;
                      return (
                        <section className="route-card" key={r.id}>
                          <header>
                            <span className="route-symbol">
                              <RouteIcon size={23} />
                            </span>
                            <div>
                              <h2>{r.title}</h2>
                              <p>{r.goal}</p>
                              {r.mergedCount && r.mergedCount > 1 && (
                                <span className="pill">
                                  已合并 {r.mergedCount} 条相近路线
                                </span>
                              )}
                              {!!r.alternativeGoals?.length && (
                                <details className="route-alternatives">
                                  <summary>其他学习侧重点</summary>
                                  {r.alternativeGoals.map((g) => (
                                    <p key={g}>{g}</p>
                                  ))}
                                </details>
                              )}
                            </div>
                            <label className="route-select">
                              <input
                                type="checkbox"
                                checked={r.selected}
                                onChange={(e) =>
                                  patch("routes", r.id, {
                                    selected: e.target.checked,
                                  })
                                }
                              />
                              {r.selected ? "已加入计划" : "加入计划"}
                            </label>
                            <button
                              title="后台获取此路线的 PDF 与 HTML"
                              onClick={() =>
                                void work("获取路线原文", () =>
                                  mutate(`/routes/${r.id}/acquire`, {}),
                                )
                              }
                            >
                              <ArrowDownToLine size={14} />
                              获取路线全文
                            </button>
                            <button
                              aria-label={`删除路线 ${r.title}`}
                              onClick={() => remove("routes", r.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </header>
                          <div className="route-progress">
                            <span
                              style={{
                                width: `${ids.length ? (done / ids.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <div className="route-progress-label">
                            已学习 {done} / {ids.length} 项技术
                          </div>
                          <div className="stages">
                            {r.stages.map((s, i) => (
                              <div
                                className={`stage ${s.sideQuest ? "side-quest" : ""}`}
                                key={i}
                              >
                                <span className="stage-index">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <div>
                                  <h3>
                                    {s.title}
                                    {s.sideQuest && (
                                      <span className="pill amber">
                                        必要旁支
                                      </span>
                                    )}
                                  </h3>
                                  <p>{s.capability}</p>
                                  {!!s.alternativeCapabilities?.length && (
                                    <small className="muted">
                                      同时关注：
                                      {s.alternativeCapabilities.join("；")}
                                    </small>
                                  )}
                                  <div className="stage-papers">
                                    {s.paperIds.map((id) => {
                                      const p = w.papers.find(
                                        (p) => p.id === id,
                                      );
                                      return (
                                        p && (
                                          <button
                                            key={id}
                                            onClick={() => select("paper", id)}
                                          >
                                            <FileText size={14} />
                                            {p.short || p.title}
                                            <span
                                              className={`status-dot ${p.status}`}
                                            />
                                            {!p.inLibrary && (
                                              <small>待加入</small>
                                            )}
                                          </button>
                                        )
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                    <div className="section-title">
                      <h2>补足知识链条</h2>
                      <span className="muted">已验证的相关论文</span>
                    </div>
                    <div className="recommendations">
                      {w.papers
                        .filter(
                          (p) => !p.inLibrary && p.verification === "verified",
                        )
                        .map((p) => (
                          <article className="panel" key={p.id}>
                            <span className="eyebrow">
                              <ShieldCheck size={12} /> VERIFIED ·{" "}
                              {p.year ?? "年份待识别"}
                            </span>
                            <h3>{p.title}</h3>
                            <small>{p.authors}</small>
                            <p>
                              {p.reason ||
                                w.nodes.find((n) => n.paperIds.includes(p.id))
                                  ?.significance ||
                                "补足当前研究路线中的相关知识。"}
                            </p>
                            {paperLink(p)}
                            <button
                              className="secondary"
                              onClick={() =>
                                patch("papers", p.id, { inLibrary: true })
                              }
                            >
                              <Plus size={14} />
                              加入论文库
                            </button>
                          </article>
                        ))}
                    </div>
                    {!w.routes.length && (
                      <div className="empty">
                        <RouteIcon size={38} />
                        <h3>先确定目标，再迈出下一步</h3>
                        <p>
                          导入经过 arXiv
                          验证的相关论文，配置模型后即可生成路线。
                        </p>
                      </div>
                    )}
                  </>
                )}
                {page === "journal" && (
                  <>
                    <div className="journal-hero">
                      <div>
                        <span className="eyebrow">
                          YOUR LEARNING, YOUR WORDS
                        </span>
                        <h2>记录理解，也给疑问留个位置。</h2>
                        <p>
                          这些信息会帮助 AI
                          理解你在当前空间的学习进度，你可以随时更正。
                        </p>
                      </div>
                      <div
                        className="progress-ring"
                        style={{
                          background: `conic-gradient(#397d69 ${w.nodes.length ? (learned / w.nodes.length) * 360 : 0}deg,#e2ebe4 0deg)`,
                        }}
                      >
                        <div>
                          <strong>
                            {learned}
                            <small>/{w.nodes.length}</small>
                          </strong>
                          <span>已学习技术</span>
                        </div>
                      </div>
                    </div>
                    <div className="journal-columns">
                      {(["learning", "learned", "unlearned"] as Status[]).map(
                        (s) => (
                          <section className="panel" key={s}>
                            <h3>
                              <span className={`status-dot ${s}`} />
                              {statusNames[s]}
                              <small>
                                {w.nodes.filter((n) => n.status === s).length}
                              </small>
                            </h3>
                            {w.nodes
                              .filter((n) => n.status === s)
                              .map((n) => (
                                <div className="journal-node" key={n.id}>
                                  <button onClick={() => select("node", n.id)}>
                                    {n.name}
                                  </button>
                                  <StatusSelect
                                    value={n.status}
                                    onChange={(status) =>
                                      patch("nodes", n.id, { status })
                                    }
                                  />
                                </div>
                              ))}
                            {!w.nodes.some((n) => n.status === s) && (
                              <p className="muted">还没有记录</p>
                            )}
                          </section>
                        ),
                      )}
                    </div>
                    <section className="panel">
                      <div className="section-title">
                        <h2>空间长期记忆</h2>
                        <span className="pill">
                          <ShieldCheck size={12} />
                          仅当前空间
                        </span>
                      </div>
                      <form
                        className="inline-form memory-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = e.currentTarget;
                          const d = new FormData(f);
                          void work("保存记忆", async () => {
                            await mutate("/memories", {
                              text: d.get("text"),
                              kind: d.get("kind"),
                            });
                            f.reset();
                          });
                        }}
                      >
                        <select name="kind" aria-label="记忆类型">
                          <option value="note">学习笔记</option>
                          <option value="understood">我已理解</option>
                          <option value="confused">仍有疑问</option>
                        </select>
                        <input
                          name="text"
                          required
                          placeholder="例如：还不理解 Class Token 如何汇总图像信息"
                          aria-label="记忆内容"
                        />
                        <button className="primary" disabled={!!busy}>
                          <Plus size={14} />
                          记下来
                        </button>
                      </form>
                      {w.memories.map((m) => (
                        <MemoryRow
                          key={m.id}
                          memory={m}
                          onSave={(text) => patch("memories", m.id, { text })}
                          onDelete={() => remove("memories", m.id)}
                        />
                      ))}
                    </section>
                    <section className="panel recent-questions">
                      <h2>最近的问题</h2>
                      {w.messages
                        .filter((m) => m.role === "user")
                        .slice(-5)
                        .reverse()
                        .map((m) => (
                          <div key={m.id}>
                            <MessageSquare size={14} />
                            <span>{m.content}</span>
                            <small>
                              {new Date(m.time).toLocaleDateString("zh-CN")}
                            </small>
                          </div>
                        ))}
                      {!w.messages.length && (
                        <p className="muted">对话中的问题会记录在这里。</p>
                      )}
                    </section>
                  </>
                )}
                <footer className="page-footer">
                  <span>AnIStudy · Paper</span>
                  <span>
                    {w.demo
                      ? "示例资料与学习状态仅用于体验，可新建空白空间。"
                      : "每一个连接，都让理解更进一步。"}
                  </span>
                  <span>学习 · 组织 · 连接 · 规划</span>
                </footer>
              </>
            )}
          </main>
          {chatOpen && (
            <>
              <div
                className="chat-resizer"
                role="separator"
                aria-label="调整对话面板宽度"
                aria-valuenow={chatWidth}
                aria-valuemin={280}
                aria-valuemax={530}
                aria-orientation="vertical"
                tabIndex={0}
                onPointerDown={resizeChat}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft")
                    setChatWidth((v) => Math.min(530, v + 20));
                  if (e.key === "ArrowRight")
                    setChatWidth((v) => Math.max(280, v - 20));
                }}
              />
              <aside className="chat-panel" style={{ width: chatWidth }}>
                <div className="chat-heading">
                  <strong>一起理解，连接更多</strong>
                  <div className="chat-mode" role="group" aria-label="对话模式">
                    <button
                      aria-label="Paper Mode"
                      title="Paper Mode · 论文对话"
                      aria-pressed={mode === "paper"}
                      className={mode === "paper" ? "active" : ""}
                      onClick={() => setMode("paper")}
                    >
                      <FileText size={12} />
                      论文
                    </button>
                    <button
                      aria-label="Research Context"
                      title="Research Context · 研究对话"
                      aria-pressed={mode === "research"}
                      className={mode === "research" ? "active" : ""}
                      onClick={() => setMode("research")}
                    >
                      <Network size={12} />
                      研究
                    </button>
                  </div>
                  <button
                    aria-label="收起对话"
                    onClick={() => setChatOpen(false)}
                  >
                    <PanelRightClose size={17} />
                  </button>
                </div>
                <div className="chat-reasoning">
                  <label>
                    深度思考
                    <select
                      aria-label="深度思考"
                      value={settings.deepThinking || "auto"}
                      disabled={
                        !!busy ||
                        savingChatPreferences ||
                        !settings.reasoningCapabilities?.supported
                      }
                      onChange={(e) =>
                        void saveChatPreferences({
                          deepThinking: e.target
                            .value as Settings["deepThinking"],
                        })
                      }
                    >
                      <option value="auto">模型默认</option>
                      <option value="enabled">开启</option>
                      <option value="disabled">关闭</option>
                    </select>
                  </label>
                  <label>
                    思考强度
                    <select
                      aria-label="思考强度"
                      value={settings.reasoningEffort || "auto"}
                      disabled={
                        !!busy ||
                        savingChatPreferences ||
                        !settings.reasoningCapabilities?.supported ||
                        settings.deepThinking === "disabled"
                      }
                      onChange={(e) =>
                        void saveChatPreferences({
                          reasoningEffort: e.target
                            .value as Settings["reasoningEffort"],
                        })
                      }
                    >
                      <option value="auto">模型默认</option>
                      {settings.reasoningCapabilities?.efforts.map((value) => (
                        <option value={value} key={value}>
                          {(
                            { low: "低", high: "高", max: "最高" } as Record<
                              string,
                              string
                            >
                          )[value] || value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {mode === "paper" && (
                  <select
                    className="chat-paper"
                    aria-label="对话论文"
                    value={paperId}
                    onChange={(e) => setPaperId(e.target.value)}
                  >
                    <option value="">请选择论文</option>
                    {library.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.short || p.title}
                      </option>
                    ))}
                  </select>
                )}
                <div className="chat-messages">
                  {!messages.length && (
                    <div className="chat-welcome">
                      <h3>从一个好问题开始。</h3>
                      <div className="context-card">
                        <strong>
                          {mode === "paper"
                            ? currentPaper?.short ||
                              currentPaper?.title ||
                              "尚未选择论文"
                            : w?.routes.find((r) => r.selected)?.title ||
                              w?.name}
                        </strong>
                      </div>
                      {(mode === "paper"
                        ? [
                            "这篇论文试图解决什么问题？",
                            "应该重点阅读论文的哪些部分？",
                            "核心方法与实验结论是什么？",
                          ]
                        : [
                            "当前知识图谱中还缺少哪些前置知识？",
                            "这些论文之间有哪些技术联系？",
                            "下一步应该重点学习什么？",
                          ]
                      ).map((q) => (
                        <button
                          className="prompt-chip"
                          key={q}
                          onClick={() => setDraft(q)}
                        >
                          {q}
                          <ArrowRight size={13} />
                        </button>
                      ))}
                    </div>
                  )}
                  {messages.map((m) => (
                    <div className={`message ${m.role}`} key={m.id}>
                      <span className="message-role">
                        {m.role === "user" ? (
                          "你"
                        ) : (
                          <>
                            <Sparkles size={12} />
                            AnIStudy
                          </>
                        )}
                      </span>
                      {m.role === "assistant" ? (
                        <Markdown
                          citations={m.citations}
                          onCitation={openSource}
                        >
                          {m.content}
                        </Markdown>
                      ) : (
                        <div>{m.content}</div>
                      )}
                      <ChatMessageMeta message={m} settings={settings} />
                      {"delivery" in m && m.delivery === "failed" && (
                        <small className="chat-delivery-error">
                          发送失败{" "}
                          <button
                            onClick={() => {
                              setDraft(m.content);
                              setError("");
                              setLocalMessages((rows) =>
                                rows.filter((v) => v.id !== m.id),
                              );
                            }}
                          >
                            重新编辑
                          </button>
                        </small>
                      )}
                      {m.role === "assistant" &&
                        !m.citations?.length &&
                        !!m.retrievedSources?.length && (
                          <details className="chat-sources">
                            <summary>本轮检索片段</summary>
                            {m.retrievedSources.map((s) => (
                              <button
                                key={s.id}
                                className="source-citation"
                                onClick={() => openSource(s)}
                              >
                                {s.paperTitle} · {s.section}
                                {s.page ? ` · PDF 第 ${s.page} 页` : ""}
                              </button>
                            ))}
                          </details>
                        )}
                    </div>
                  ))}
                  {busy === "正在思考" && (
                    <div className="thinking">
                      <LoaderCircle size={14} className="spin" />
                      <span className="operation-text">
                        <span>
                          {operationProgress?.current.label || "正在准备对话…"}
                        </span>
                        {operationProgress?.current.detail && (
                          <small>{operationProgress.current.detail}</small>
                        )}
                      </span>
                    </div>
                  )}
                  <div ref={chatEnd} />
                </div>
                <div className="chat-composer-wrap">
                  {!settings.hasKey && (
                    <button
                      className="model-hint"
                      onClick={() => setModal("model")}
                    >
                      <SettingsIcon size={13} />
                      配置模型后，开始与论文对话
                      <ChevronRight size={13} />
                    </button>
                  )}
                  <form className="chat-composer" onSubmit={submitChat}>
                    <textarea
                      aria-label="向研究助手提问"
                      rows={1}
                      placeholder={
                        mode === "paper" ? "问问这篇论文…" : "聊聊你的研究问题…"
                      }
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing &&
                          e.nativeEvent.keyCode !== 229
                        ) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                    <div className="chat-composer-actions">
                      <button
                        className="send-button"
                        aria-label="发送问题"
                        disabled={
                          !!busy ||
                          chatSending ||
                          savingChatPreferences ||
                          !draft.trim() ||
                          !settings.hasKey ||
                          (mode === "paper" && !currentPaper)
                        }
                      >
                        <Send size={15} />
                      </button>
                    </div>
                  </form>
                  <div className="chat-footnote">
                    {!!w?.messages.length && (
                      <button
                        onClick={() => {
                          if (confirm("清除当前空间的全部对话？"))
                            void work("清除对话", () =>
                              mutate("/chat", undefined, "DELETE"),
                            );
                        }}
                      >
                        清除对话
                      </button>
                    )}
                  </div>
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
      <BackgroundTaskDock
        {...background}
        compact={!!reader}
        onActivity={() => setModal("inbox")}
        foreground={
          !!busy && (
            <div className="busy-indicator" role="status" aria-label="操作进度">
              <LoaderCircle className="spin" size={16} />
              <span className="operation-text">
                <span>
                  {operationProgress?.current.label || `${busy}…`}
                  {operationProgress?.current.total &&
                    `（${operationProgress.current.current}/${operationProgress.current.total}）`}
                </span>
                {operationProgress?.current.detail && (
                  <small>{operationProgress.current.detail}</small>
                )}
              </span>
            </div>
          )
        }
      />
      {selection && (selectedNode || selectedPaper) && (
        <div className="detail-backdrop" onClick={() => setSelection(null)}>
          <aside
            key={`${selection.kind}:${selection.id}`}
            className="detail-panel"
            role="dialog"
            aria-modal="true"
            aria-label="节点详情"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="detail-top">
              <span className="eyebrow">
                {selectedNode ? "TECHNOLOGY INSIGHT" : "PAPER INSIGHT"}
              </span>
              <button aria-label="关闭详情" onClick={() => setSelection(null)}>
                <X size={19} />
              </button>
            </div>
            {selectedNode && (
              <>
                <span
                  className="detail-icon"
                  style={{
                    color: categoryColor(selectedNode.category),
                    background: categoryColor(selectedNode.category) + "18",
                  }}
                >
                  <Network size={30} />
                </span>
                <EditableText
                  key={`node-title-${selectedNode.id}`}
                  label="技术标题"
                  fields={[
                    {
                      name: "englishName",
                      label: "英文标题",
                      value: selectedNode.englishName || selectedNode.name,
                    },
                    {
                      name: "chineseName",
                      label: "中文标题",
                      value: selectedNode.chineseName || selectedNode.name,
                    },
                  ]}
                  onSave={(data) =>
                    mutate(`/nodes/${selectedNode.id}`, data, "PATCH")
                  }
                >
                  <h2>{selectedNode.name}</h2>
                </EditableText>
                {(selectedNode.englishName || selectedNode.chineseName) && (
                  <p className="node-alternate-title">
                    {settings.preferEnglishTerms !== false
                      ? selectedNode.chineseName
                      : selectedNode.englishName}
                  </p>
                )}
                <div className="detail-tags">
                  <span className="pill">
                    {categories[selectedNode.category]}
                  </span>
                  <span className="pill">
                    {{
                      landmark: "里程碑",
                      major: "重要",
                      normal: "普通",
                      minor: "次要",
                    }[selectedNode.importance] || selectedNode.importance}
                  </span>
                  <span>{selectedNode.year ?? "年份待识别"}</span>
                </div>
                <label className="node-hide-option">
                  <input
                    aria-label="隐藏节点"
                    type="checkbox"
                    checked={!!selectedNode.hiddenInGraph}
                    disabled={!!busy}
                    onChange={(e) =>
                      setNodeHidden("nodes", selectedNode.id, e.target.checked)
                    }
                  />
                  <span>
                    隐藏节点
                    <small>
                      在主要／极简模式中隐藏，全部节点模式仍可查看。
                    </small>
                  </span>
                </label>
                <div className="importance-editor">
                  <button
                    className="secondary"
                    aria-expanded={editingImportance === selectedNode.id}
                    disabled={!!busy}
                    onClick={() =>
                      setEditingImportance(
                        editingImportance === selectedNode.id
                          ? null
                          : selectedNode.id,
                      )
                    }
                  >
                    <Pencil size={14} />
                    更改信息
                  </button>
                  {selectedNode.importanceSource === "manual" && (
                    <small>用户设定</small>
                  )}
                  {editingImportance === selectedNode.id && (
                    <div
                      className="importance-options"
                      role="group"
                      aria-label="选择节点级别"
                    >
                      <form
                        className="node-year-editor"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const value = String(
                            new FormData(e.currentTarget).get("year") || "",
                          ).trim();
                          void work("保存节点年份", async () => {
                            await mutate(
                              `/nodes/${selectedNode.id}`,
                              { year: value ? Number(value) : null },
                              "PATCH",
                            );
                            setNotice(
                              value
                                ? `节点年份已设为 ${value}。`
                                : "节点年份已设为待识别。",
                            );
                          });
                        }}
                      >
                        <label>
                          节点年份
                          <input
                            aria-label="节点年份"
                            name="year"
                            type="number"
                            min={1}
                            max={new Date().getFullYear() + 1}
                            step={1}
                            defaultValue={selectedNode.year ?? ""}
                            placeholder="未知可留空"
                          />
                        </label>
                        <button className="secondary" disabled={!!busy}>
                          保存年份
                        </button>
                      </form>
                      {Object.entries(importanceNames).map(([value, label]) => (
                        <button
                          key={value}
                          className="secondary"
                          aria-pressed={selectedNode.importance === value}
                          disabled={!!busy}
                          onClick={() =>
                            void work("保存节点级别", async () => {
                              await mutate(
                                `/nodes/${selectedNode.id}`,
                                { importance: value },
                                "PATCH",
                              );
                              setEditingImportance(null);
                              setNotice(`节点级别已设为${label}。`);
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                      {selectedNode.importanceSource === "manual" && (
                        <button
                          className="text-link"
                          disabled={!!busy}
                          onClick={() =>
                            void work("更新定级偏好", async () => {
                              await mutate(
                                `/nodes/${selectedNode.id}`,
                                { importanceSource: "ai" },
                                "PATCH",
                              );
                              setEditingImportance(null);
                            })
                          }
                        >
                          允许 AI 重新定级
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="primary full-width"
                  onClick={() => {
                    if (!w) return;
                    setGraphFocus({
                      workspaceId: w.id,
                      nodeId: selectedNode.id,
                    });
                    setPage("technology");
                    setSelection(null);
                  }}
                >
                  <Focus size={15} />
                  以此技术为中心
                </button>
                <EditableText
                  key={`node-body-${selectedNode.id}`}
                  label="技术正文"
                  markdown
                  fields={[
                    {
                      name: "description",
                      label: "是什么",
                      value: selectedNode.description,
                    },
                    {
                      name: "significance",
                      label: "为什么值得理解",
                      value: selectedNode.significance,
                    },
                  ]}
                  onSave={(data) =>
                    mutate(`/nodes/${selectedNode.id}`, data, "PATCH")
                  }
                >
                  <h4>是什么</h4>
                  <Markdown>{selectedNode.description}</Markdown>
                  <h4>为什么值得理解</h4>
                  <Markdown>{selectedNode.significance}</Markdown>
                </EditableText>
                {selectedNode.importanceReason && (
                  <>
                    <h4>重要性判断</h4>
                    <p>{selectedNode.importanceReason}</p>
                  </>
                )}
                {w && (
                  <NoteLinks
                    w={w}
                    kind="node"
                    id={selectedNode.id}
                    onOpen={openNote}
                    onCreate={() => createNodeNote(selectedNode)}
                    disabled={!!busy}
                  />
                )}
                <div className="evidence-note">
                  {selectedNode.evidence === "missing"
                    ? "○ 当前论文库尚缺少直接支持资料"
                    : "● 当前论文库中有资料支持"}
                  <small>{selectedNode.provenance}</small>
                </div>
                {w && (
                  <PaperPassages
                    key={selectedNode.id}
                    workspaceId={w.id}
                    nodeId={selectedNode.id}
                    onOpen={(link) =>
                      openReader({
                        paperId: link.paperId!,
                        documentId: link.documentId,
                        blockId: link.blockId,
                        format: "html",
                      })
                    }
                  />
                )}
                <h4>关键论文</h4>
                {selectedNode.paperIds.map((id) => {
                  const p = w?.papers.find((p) => p.id === id);
                  return (
                    p && (
                      <button
                        className="related-paper"
                        key={id}
                        onClick={() => select("paper", id)}
                      >
                        <FileText size={17} />
                        <span>
                          {p.title}
                          <small>
                            {p.year ?? "年份待识别"} ·{" "}
                            {p.inLibrary ? "已在论文库" : "待加入论文库"}
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    )
                  );
                })}
                {w && (
                  <ConnectedTechnologies
                    key={selectedNode.id}
                    w={w}
                    node={selectedNode}
                    onSelect={(id) => select("node", id)}
                    onSave={(id, data) =>
                      mutate(
                        `/nodes/${selectedNode.id}/connections/${id}`,
                        data,
                        "PUT",
                      )
                    }
                  />
                )}
                <div className="detail-status">
                  <span>你的学习状态</span>
                  <StatusSelect
                    value={selectedNode.status}
                    onChange={(s) =>
                      patch("nodes", selectedNode.id, { status: s })
                    }
                  />
                </div>
                <button
                  className="primary full-width"
                  onClick={() => quote(selectedNode)}
                >
                  <MessageSquare size={16} />
                  引用并打开对话
                </button>
                <button
                  className="secondary full-width"
                  onClick={() =>
                    void work("加入路线", async () => {
                      await mutate(`/nodes/${selectedNode.id}/route`, {});
                      setNotice("已加入学习路线");
                    })
                  }
                >
                  <RouteIcon size={15} />
                  加入学习路线
                </button>
                <button
                  className="danger-text"
                  onClick={() => {
                    if (confirm("删除此技术节点及相关图谱连接？"))
                      remove("nodes", selectedNode.id);
                  }}
                >
                  <Trash2 size={13} />
                  删除节点
                </button>
              </>
            )}
            {selectedPaper && (
              <>
                <span className="detail-icon">
                  <FileText size={29} />
                </span>
                <EditableText
                  key={`paper-title-${selectedPaper.id}`}
                  label="论文标题"
                  fields={[
                    {
                      name: "title",
                      label: "论文标题",
                      value: selectedPaper.title,
                    },
                  ]}
                  onSave={(data) =>
                    mutate(`/papers/${selectedPaper.id}`, data, "PATCH")
                  }
                >
                  <h2 className="paper-detail-title">{selectedPaper.title}</h2>
                </EditableText>
                <p className="authors">
                  {selectedPaper.authors} · {selectedPaper.year ?? "年份待识别"}
                </p>
                <label className="node-hide-option">
                  <input
                    aria-label="隐藏节点"
                    type="checkbox"
                    checked={!!selectedPaper.hiddenInGraph}
                    disabled={!!busy}
                    onChange={(e) =>
                      setNodeHidden(
                        "papers",
                        selectedPaper.id,
                        e.target.checked,
                      )
                    }
                  />
                  <span>
                    隐藏节点
                    <small>
                      在主要／极简模式中隐藏，全部节点模式仍可查看。
                    </small>
                  </span>
                </label>
                {paperLink(selectedPaper)}
                <EditableText
                  key={`paper-body-${selectedPaper.id}`}
                  label="论文正文"
                  markdown
                  fields={[
                    {
                      name: "summary",
                      label: "阅读导览正文",
                      value: selectedPaper.summary,
                    },
                  ]}
                  onSave={(data) =>
                    mutate(`/papers/${selectedPaper.id}`, data, "PATCH")
                  }
                >
                  <h4>阅读导览</h4>
                  <Markdown>{selectedPaper.summary}</Markdown>
                </EditableText>
                {w && (
                  <NoteLinks
                    w={w}
                    kind="paper"
                    id={selectedPaper.id}
                    onOpen={openNote}
                  />
                )}
                <div className="evidence-note">
                  {selectedPaper.hasText
                    ? "已提取 PDF 文本，可用于论文对话"
                    : selectedPaper.file
                      ? "未提取到文本；不支持扫描件 OCR"
                      : "当前只有摘要资料；上传 PDF 后可讨论全文。"}
                </div>
                <div className="detail-status">
                  <span>你的学习状态</span>
                  <StatusSelect
                    value={selectedPaper.status}
                    onChange={(s) =>
                      patch("papers", selectedPaper.id, { status: s })
                    }
                  />
                </div>
                {selectedPaper.verification !== "verified" && (
                  <form
                    className="verify-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void work("验证论文信息", () =>
                        mutate("/papers/" + selectedPaper.id + "/verify", {
                          input: d.get("arxiv"),
                        }),
                      );
                    }}
                  >
                    <label>
                      关联并核验 arXiv 元信息
                      <input
                        name="arxiv"
                        required
                        placeholder="对应这篇 PDF 的 arXiv ID"
                      />
                    </label>
                    <button className="secondary" disabled={!!busy}>
                      验证论文
                    </button>
                  </form>
                )}
                <h4>关键技术</h4>
                <div className="related-nodes paper-technologies">
                  {w?.nodes
                    .filter((n) => n.paperIds.includes(selectedPaper.id))
                    .map((n) => {
                      const link =
                        n.paperRelations?.find(
                          (r) => r.paperId === selectedPaper.id && r.summary,
                        ) ||
                        n.paperRelations?.find(
                          (r) => r.paperId === selectedPaper.id,
                        );
                      const relation = link?.relation || n.contribution;
                      return (
                        <button
                          className="paper-tech-card"
                          key={n.id}
                          data-tech-id={n.id}
                          onClick={() => select("node", n.id)}
                        >
                          <span className="paper-tech-heading">
                            <span
                              aria-hidden="true"
                              style={{ color: categoryColor(n.category) }}
                            >
                              ●
                            </span>
                            <strong>{n.name}</strong>
                            {relation && <small>{relation}</small>}
                            <ArrowRight size={13} aria-hidden="true" />
                          </span>
                          {link?.summary && (
                            <span className="paper-tech-summary">
                              {link.summary.role} {link.summary.implementation}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
                <PaperAcquisition paper={selectedPaper} />
                <div className="paper-reading-actions">
                  <button
                    disabled={!selectedPaper.file}
                    onClick={() =>
                      openReader({ paperId: selectedPaper.id, format: "pdf" })
                    }
                  >
                    <BookOpen size={15} />
                    阅读 PDF
                  </button>
                  <button
                    onClick={() =>
                      openReader({ paperId: selectedPaper.id, format: "html" })
                    }
                  >
                    <FileText size={15} />
                    阅读 HTML
                  </button>
                  {(selectedPaper.arxivId || selectedPaper.file) && (
                    <button
                      disabled={paperIsAcquiring(selectedPaper)}
                      onClick={() =>
                        void work("获取论文原文", () =>
                          mutate(`/papers/${selectedPaper.id}/acquire`, {}),
                        )
                      }
                    >
                      <ArrowDownToLine size={14} />
                      {selectedPaper.acquisition?.state === "failed"
                        ? "重试获取原文"
                        : selectedPaper.hasDocument
                          ? "更新原文索引"
                          : "获取原文"}
                    </button>
                  )}
                </div>
                {!selectedPaper.inLibrary ? (
                  <button
                    className="primary full-width"
                    onClick={() =>
                      patch("papers", selectedPaper.id, { inLibrary: true })
                    }
                  >
                    <Plus size={15} />
                    加入论文库
                  </button>
                ) : (
                  <>
                    <button
                      className="primary full-width"
                      onClick={() => {
                        setMode("paper");
                        setPaperId(selectedPaper.id);
                        setChatOpen(true);
                        setSelection(null);
                      }}
                    >
                      <MessageSquare size={15} />
                      与论文对话
                    </button>
                    <button
                      className="secondary full-width"
                      disabled={!!busy || paperIsAcquiring(selectedPaper)}
                      onClick={() =>
                        void work("正在整理论文", async () => {
                          const updated = await mutate(
                            `/papers/${selectedPaper.id}/organize`,
                            {},
                          );
                          const report = updated?.papers.find(
                            (p) => p.id === selectedPaper.id,
                          )?.organizationReport;
                          setNotice(
                            report?.quality === "fallback"
                              ? "已保留原文摘录与基础信息，AI 整理未完成，可稍后重试。"
                              : report?.quality === "partial"
                                ? "已保留有效整理结果，部分字段已跳过；详见动态。"
                                : "整理完成，关键技术与关系已自动更新到图谱。",
                          );
                          setSelection(null);
                          setPage("technology");
                        })
                      }
                    >
                      <Sparkles size={15} />
                      整理论文 · 提取技术
                    </button>
                  </>
                )}
                <button
                  className="danger-text"
                  onClick={() => {
                    if (
                      confirm(
                        "删除这篇论文及本地 PDF？相关节点和路线会同步移除引用。",
                      )
                    )
                      remove("papers", selectedPaper.id);
                  }}
                >
                  <Trash2 size={13} />
                  删除论文
                </button>
              </>
            )}
          </aside>
        </div>
      )}
      {reader && w && w.papers.find((p) => p.id === reader.paperId) && (
        <PaperReader
          key={`${w.id}:${reader.paperId}:${reader.documentId || "current"}`}
          workspaceId={w.id}
          workspace={w}
          localMessages={localMessages.filter((m) => m.workspaceId === w.id)}
          onChat={sendConversation}
          onRestoreChat={(id) =>
            setLocalMessages((rows) => rows.filter((m) => m.id !== id))
          }
          paper={w.papers.find((p) => p.id === reader.paperId)!}
          location={reader}
          settings={settings}
          backgroundTasks={background.tasks}
          onClose={() => {
            setSelection(reader.returnTo);
            setReader(null);
          }}
          onWorkspace={(next) => {
            if (activeId.current === next.id) setW(next);
          }}
          onNode={(id) => {
            setReader(null);
            select("node", id);
          }}
          onSource={openSource}
        />
      )}
      {modal === "workspace" && (
        <Modal title="创建研究空间" onClose={() => setModal("")}>
          <p className="modal-description">
            新的方向，独立的知识地图。文件、对话与学习记忆将独立保存。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void work("创建研究空间", async () => {
                const created = await api<Workspace>("/workspaces", {
                  name: data.get("name"),
                  description: data.get("description"),
                });
                setSpaces((s) => [...s, created]);
                await loadSpace(created.id);
                setPage("home");
                setModal("");
              });
            }}
          >
            <label>
              空间名称
              <input
                name="name"
                required
                maxLength={60}
                placeholder="例如：多模态学习"
              />
            </label>
            <label>
              研究目标
              <textarea
                name="description"
                maxLength={1000}
                placeholder="你想在这个空间探索什么？"
              />
            </label>
            <button className="primary full-width" disabled={!!busy}>
              <Plus size={15} />
              创建空间
            </button>
          </form>
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="让一篇论文加入你的知识地图" onClose={() => setModal("")}>
          <p className="modal-description">
            导入到「{w?.name}」。arXiv 会核验元信息；上传 PDF 可用于全文学习。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void work("正在验证 arXiv", async () => {
                await mutate("/arxiv", { input: data.get("input") });
                setModal("");
                setPage("library");
                setNotice("论文已验证并加入论文库。");
              });
            }}
          >
            <label>
              arXiv 地址或编号
              <div className="inline-form">
                <input
                  name="input"
                  required
                  placeholder="1706.03762 或 https://arxiv.org/abs/…"
                />
                <button className="primary" disabled={!!busy}>
                  验证并导入
                  <ArrowRight size={15} />
                </button>
              </div>
            </label>
          </form>
          <div className="or-divider">
            <span>或上传本地文件</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void work("正在解析 PDF", async () => {
                await mutate("/upload", data);
                setModal("");
                setPage("library");
                setNotice("PDF 已保存，可打开论文并提取技术。");
              });
            }}
          >
            <label className="upload-zone">
              <Upload size={28} />
              <strong>选择 PDF 文件</strong>
              <span>最大 30 MB · 支持可复制文本的 PDF</span>
              <input
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                required
                aria-label="选择 PDF 文件"
              />
            </label>
            <label>
              附加到已有论文（可选）
              <select
                name="paperId"
                aria-label="附加到已有论文"
                defaultValue=""
              >
                <option value="">作为新论文导入</option>
                {w?.papers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.short || p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              论文标题（可选）
              <input name="title" placeholder="默认使用文件名" />
            </label>
            <button className="secondary full-width" disabled={!!busy}>
              <Upload size={15} />
              上传并保存
            </button>
          </form>
        </Modal>
      )}
      {modal === "model" && (
        <Modal
          title="模型设置"
          className="model-settings-modal"
          onClose={() => setModal("")}
        >
          <ModelSettings
            settings={settings}
            onSaved={(next) => {
              setSettings(next);
              setModal("");
              setNotice("模型设置已保存。");
            }}
          />
        </Modal>
      )}
      {modal === "preferences" && (
        <Modal title="偏好选项" onClose={() => setModal("")}>
          <NoteSettings settings={settings} formId="personal-settings" />
          <AcquisitionSettings
            settings={settings}
            formId="personal-settings"
            disabled={!!busy}
          />
          <ChatEvidenceSettings
            settings={settings}
            formId="personal-settings"
            disabled={!!busy}
          />
          <Customization
            formId="personal-settings"
            settings={settings}
            disabled={!!busy}
            onSaved={async () => {
              setSettings(await api<Settings>("/settings"));
              if (activeId.current) {
                const id = activeId.current;
                const updated = await api<Workspace>("/workspaces/" + id);
                if (activeId.current === id) setW(updated);
              }
            }}
          />
          <h3>技术节点标题语言</h3>
          <label className="preference-toggle">
            <input
              type="checkbox"
              aria-label="保留英文专有名词"
              checked={settings.preferEnglishTerms !== false}
              disabled={!!busy}
              onChange={(e) => {
                const enabled = e.target.checked;
                setSettings((s) => ({ ...s, preferEnglishTerms: enabled }));
                void work("更新术语偏好", async () => {
                  try {
                    await api(
                      "/preferences",
                      { preferEnglishTerms: enabled },
                      "PATCH",
                    );
                  } catch (error) {
                    setSettings((s) => ({
                      ...s,
                      preferEnglishTerms: !enabled,
                    }));
                    throw error;
                  }
                  if (w) setW(await api<Workspace>("/workspaces/" + w.id));
                });
              }}
            />
            <span>
              <strong>保留英文专有名词</strong>
              <small>
                技术标题使用原文英文术语，解释保持中文；关闭后显示中文名称。
              </small>
            </span>
          </label>
          <form
            id="personal-settings"
            key={settings.preferences}
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void work("保存设置", async () => {
                await api(
                  "/preferences",
                  {
                    preferences: d.get("preferences"),
                    chatEvidencePolicy: d.get("chatEvidencePolicy"),
                    showChatTime: d.get("showChatTime") === "true",
                    showChatTokens: d.get("showChatTokens") === "true",
                    autoDownloadPapers: d.get("autoDownloadPapers") === "true",
                    autoOrganizePapers: d.get("autoOrganizePapers") === "true",
                    preferEnglishTerms: settings.preferEnglishTerms !== false,
                    nodeSizes: Object.fromEntries(
                      Object.keys(importanceNames).map((key) => [
                        key,
                        Number(d.get(`nodeSize.${key}`)),
                      ]),
                    ),
                    theme: d.get("theme"),
                    reduceMotion: d.get("reduceMotion") === "true",
                    noteShortcut: d.get("noteShortcut"),
                    timelineAutoWrap: d.get("timelineAutoWrap") === "true",
                    timelineColumnLimit: Number(d.get("timelineColumnLimit")),
                  },
                  "PATCH",
                );
                setSettings(await api<Settings>("/settings"));
                setModal("");
                setNotice("偏好选项已保存。");
              });
            }}
          >
            <label>
              全局学习偏好
              <textarea
                name="preferences"
                defaultValue={
                  settings.preferences ||
                  "默认使用中文；先讲概念，再补公式。重点关注背景、动机、核心思想与技术演化位置。"
                }
              />
            </label>
            <button className="primary full-width" disabled={!!busy}>
              保存偏好选项
              <Check size={15} />
            </button>
            {error && (
              <p className="config-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <div className="settings-actions">
            {w && (
              <button
                className="secondary"
                disabled={!!busy || !settings.hasKey || !w.nodes.length}
                onClick={() =>
                  void work("重新评估技术重要性", async () => {
                    const result = await mutate("/reassess-importance", {});
                    if (result)
                      setNotice(
                        `已重新评估 ${result.importanceReport?.updated ?? 0} 个技术节点${result.importanceReport?.manual ? `，保留 ${result.importanceReport.manual} 个手动级别` : ""}${result.importanceReport?.skipped ? `，${result.importanceReport.skipped} 个节点在评估期间已修改，保留原样` : ""}。`,
                      );
                    setModal("");
                  })
                }
              >
                重新评估技术重要性
              </button>
            )}
            {w && (
              <button
                className="secondary"
                disabled={!!busy || !settings.hasKey}
                onClick={() =>
                  void work("修复资料与术语", async () => {
                    await mutate("/repair", {});
                    setNotice("已有论文元信息、英文术语与方向已修复。");
                    setModal("");
                  })
                }
              >
                修复已有资料
              </button>
            )}
            <a
              className="text-link"
              href={`/api/workspaces/${w?.id}/export`}
              download
            >
              <ArrowDownToLine size={14} />
              导出当前空间 JSON
            </a>
          </div>
        </Modal>
      )}
      {modal === "inbox" && (
        <Modal title="动态" onClose={() => setModal("")}>
          <TaskHistory workspaceId={w?.id} />
          <details className="activity-legacy">
            <summary>整理详情与旧建议（{pending.length}）</summary>
            <p className="modal-description">
              新的论文整理会自动筛选并加入关键技术，无需逐项确认。下面保留旧版未处理建议，便于继续维护。
            </p>
            <div className="organization-reports">
              {w?.papers
                .filter((p) => p.organizationReport)
                .map((p) => (
                  <div className="suggestion" key={p.id}>
                    <h3>{p.short || p.title}</h3>
                    {p.organizationReport!.warnings?.map((warning, i) => (
                      <p key={i}>{warning}</p>
                    ))}
                    <p>
                      已自动整理 {p.organizationReport!.applied}{" "}
                      个关键技术，省略 {p.organizationReport!.skipped.length}{" "}
                      项非关键细节。
                    </p>
                    {p.organizationReport!.skipped.map((n) => (
                      <p key={n.name}>
                        {n.name}：{n.reason}
                      </p>
                    ))}
                    {p.organizationReport!.skippedEdges > 0 && (
                      <small>
                        已过滤 {p.organizationReport!.skippedEdges}{" "}
                        条无有效端点的关系。
                      </small>
                    )}
                  </div>
                ))}
            </div>
            <div className="suggestions">
              {pending.map((s) => (
                <div className="suggestion" key={s.id}>
                  <span className="eyebrow">
                    {s.kind === "node"
                      ? "CANDIDATE NODE"
                      : s.kind === "edge"
                        ? "TECHNOLOGY RELATION"
                        : "PAPER RELATION"}
                  </span>
                  <h3>
                    {s.node?.name ||
                      `${w?.papers.find((p) => p.id === s.edge?.source)?.short || s.edge?.source} → ${w?.papers.find((p) => p.id === s.edge?.target)?.short || s.edge?.target}`}
                  </h3>
                  <p>{s.reason}</p>
                  {s.node && <p>{s.node.description}</p>}
                  {s.edge && <span className="pill">{s.edge.relation}</span>}
                  <div className="suggestion-actions">
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() =>
                        void work("确认建议", () =>
                          mutate(`/suggestions/${s.id}`, { action: "accept" }),
                        )
                      }
                    >
                      <Check size={14} />
                      保留
                    </button>
                    {s.kind === "node" && (
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() =>
                          void work("确认建议", () =>
                            mutate(`/suggestions/${s.id}`, {
                              action: "important",
                            }),
                          )
                        }
                      >
                        设为重要
                      </button>
                    )}
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        void work("忽略建议", () =>
                          mutate(`/suggestions/${s.id}`, { action: "ignore" }),
                        )
                      }
                    >
                      忽略
                    </button>
                  </div>
                  {s.kind === "node" && !!w?.nodes.length && (
                    <select
                      aria-label={`将 ${s.node?.name} 合并到已有节点`}
                      defaultValue=""
                      disabled={!!busy}
                      onChange={(e) => {
                        if (e.target.value)
                          void work("合并节点", () =>
                            mutate(`/suggestions/${s.id}`, {
                              action: "merge",
                              targetId: e.target.value,
                            }),
                          );
                      }}
                    >
                      <option value="">或合并进已有技术…</option>
                      {w.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
            {!pending.length && (
              <div className="empty">
                <CheckCheck size={35} />
                <h3>知识地图已整理就绪</h3>
                <p>新的论文整理建议，会出现在这里。</p>
              </div>
            )}
          </details>
        </Modal>
      )}
    </div>
  );
}
function MemoryRow({
  memory,
  onSave,
  onDelete,
}: {
  memory: { id: string; text: string; kind: string };
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memory.text);
  return (
    <div className="memory-row">
      <span className={`memory-kind ${memory.kind}`}>
        {memory.kind === "understood"
          ? "已理解"
          : memory.kind === "confused"
            ? "有疑问"
            : "笔记"}
      </span>
      {editing ? (
        <input
          aria-label="编辑记忆"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <p>{memory.text}</p>
      )}
      <button
        aria-label={editing ? "保存记忆" : "编辑记忆"}
        onClick={() => {
          if (editing && text.trim()) onSave(text);
          setEditing(!editing);
        }}
      >
        {editing ? <Check size={15} /> : <Pencil size={14} />}
      </button>
      <button aria-label="删除记忆" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
