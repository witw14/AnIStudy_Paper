import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Code,
  Link,
  Table,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  Save,
  Pencil,
  Columns2,
  Rows2,
  Eye,
  Minus,
  Plus,
} from "lucide-react";
import { Markdown } from "./Markdown";
import {
  noteViewState,
  type NoteViewMode,
  type PanePosition,
} from "./noteViewState";

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  label = "笔记正文",
  allowImmersive = false,
  saveStatus,
  immersiveScope = "page",
  compact = false,
  toolbarStart,
  toolbarBeforeModes,
  toolbarAfterModes,
  viewKey,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  label?: string;
  allowImmersive?: boolean;
  saveStatus?: string;
  immersiveScope?: "page" | "local";
  compact?: boolean;
  toolbarStart?: ReactNode;
  toolbarBeforeModes?: ReactNode;
  toolbarAfterModes?: ReactNode;
  viewKey?: string;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const panes = useRef<HTMLDivElement>(null);
  const [view] = useState(() => noteViewState(viewKey));
  const [mode, setMode] = useState<NoteViewMode>(view.mode);
  const [fontSize, setFontSize] = useState(view.fontSize);
  const [split, setSplit] = useState({
    vertical: view.vertical,
    horizontal: view.horizontal,
  });
  const restoring = useRef(false);
  const dragging = useRef(false);
  const isSplit = mode === "split-vertical" || mode === "split-horizontal";
  const horizontal = mode === "split-horizontal";
  function rememberPane(kind: "editor" | "preview", el: HTMLElement | null) {
    if (!el || !el.getClientRects().length || restoring.current) return;
    const available = el.scrollHeight - el.clientHeight;
    view[kind] = {
      top: el.scrollTop,
      left: el.scrollLeft,
      ratio: available > 0 ? el.scrollTop / available : 0,
      width: el.clientWidth,
      height: el.clientHeight,
      fontSize,
    };
  }
  function remember() {
    rememberPane("editor", input.current);
    rememberPane("preview", preview.current);
  }
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  useLayoutEffect(() => {
    restoring.current = true;
    function restore(kind: "editor" | "preview", el: HTMLElement | null) {
      if (!el?.getClientRects().length) return;
      const own = view[kind],
        position: PanePosition | undefined = own || view[view.lastPane];
      if (!position) return;
      const resized =
        !own ||
        position.width !== el.clientWidth ||
        position.height !== el.clientHeight ||
        position.fontSize !== fontSize;
      el.scrollTop = resized
        ? position.ratio * (el.scrollHeight - el.clientHeight)
        : position.top;
      el.scrollLeft = position.left;
    }
    restore("editor", input.current);
    restore("preview", preview.current);
    const frame = requestAnimationFrame(() => {
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, fontSize, split]);
  useLayoutEffect(() => () => rememberRef.current(), []);
  function changeMode(next: NoteViewMode) {
    remember();
    view.mode = next;
    setMode(next);
  }
  function changeFont(delta: number) {
    remember();
    const next = Math.max(10, Math.min(48, fontSize + delta));
    view.fontSize = next;
    setFontSize(next);
  }
  function resizeSplit(ratio: number) {
    remember();
    const value = Math.max(0.1, Math.min(0.9, ratio));
    const axis = horizontal ? "horizontal" : "vertical";
    view[axis] = value;
    setSplit((current) => ({ ...current, [axis]: value }));
  }
  const [immersive, setImmersive] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!immersive || immersiveScope === "local") return;
    const root = document.getElementById("root")!;
    const wasInert = root.inert;
    const overflow = document.body.style.overflow;
    root.inert = true;
    document.body.style.overflow = "hidden";
    container.current?.focus();
    return () => {
      root.inert = wasInert;
      document.body.style.overflow = overflow;
    };
  }, [immersive, immersiveScope]);
  const history = useRef([value]);
  const cursor = useRef(0);
  function change(text: string) {
    if (text === value) return;
    history.current = history.current.slice(0, cursor.current + 1);
    history.current.push(text);
    if (history.current.length > 200) history.current.shift();
    cursor.current = history.current.length - 1;
    onChange(text);
  }
  function undo(direction: number) {
    cursor.current = Math.max(
      0,
      Math.min(history.current.length - 1, cursor.current + direction),
    );
    onChange(history.current[cursor.current]);
  }
  function insert(before: string, after = "", sample = "文字") {
    const el = input.current;
    if (!el) return;
    const start = el.selectionStart,
      end = el.selectionEnd;
    const selected = value.slice(start, end) || sample;
    change(
      value.slice(0, start) + before + selected + after + value.slice(end),
    );
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  }
  const actions = [
    { name: "加粗", icon: Bold, run: () => insert("**", "**") },
    { name: "斜体", icon: Italic, run: () => insert("*", "*") },
    {
      name: "二级标题",
      icon: Heading2,
      run: () => insert("\n## ", "\n", "标题"),
    },
    { name: "无序列表", icon: List, run: () => insert("\n- ", "\n", "列表项") },
    {
      name: "有序列表",
      icon: ListOrdered,
      run: () => insert("\n1. ", "\n", "列表项"),
    },
    {
      name: "任务列表",
      icon: ListTodo,
      run: () => insert("\n- [ ] ", "\n", "待办事项"),
    },
    { name: "引用", icon: Quote, run: () => insert("\n> ", "\n", "引用内容") },
    {
      name: "代码块",
      icon: Code,
      run: () => insert("\n```\n", "\n```\n", "code"),
    },
    {
      name: "链接",
      icon: Link,
      run: () => insert("[", "](https://example.com)", "链接文字"),
    },
    {
      name: "表格",
      icon: Table,
      run: () =>
        insert("\n", "\n", "| 标题 | 内容 |\n| --- | --- |\n| 项目 | 说明 |"),
    },
  ];
  const editor = (
    <div
      ref={container}
      tabIndex={-1}
      role={immersive ? "dialog" : undefined}
      aria-modal={(immersive && immersiveScope === "page") || undefined}
      aria-label={immersive ? "沉浸编辑" : undefined}
      className={`md-editor mode-${mode}${immersive ? (immersiveScope === "local" ? " md-local-immersive" : " md-immersive") : ""}`}
      style={{ "--md-font-size": `${fontSize}px` } as CSSProperties}
      onKeyDown={(e) => {
        if (!immersive) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setImmersive(false);
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === "s" &&
          !e.defaultPrevented
        ) {
          e.preventDefault();
          onSave?.();
        }
        if (e.key === "Tab" && !e.defaultPrevented) {
          const focusable = container.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),textarea",
          );
          if (!focusable?.length) return;
          const first = focusable[0],
            last = focusable[focusable.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === container.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <div className="md-toolbar" role="toolbar" aria-label="Markdown 工具栏">
        {toolbarStart}
        {actions.map((a) => (
          <button
            key={a.name}
            type="button"
            title={a.name}
            aria-label={a.name}
            disabled={mode === "preview"}
            onClick={a.run}
          >
            <a.icon size={16} />
          </button>
        ))}
        <button type="button" aria-label="撤销" onClick={() => undo(-1)}>
          <Undo2 size={16} />
        </button>
        <button type="button" aria-label="重做" onClick={() => undo(1)}>
          <Redo2 size={16} />
        </button>
        <div className="md-font-controls" role="group" aria-label="笔记字号">
          <button
            type="button"
            aria-label="减小字号"
            title="减小字号"
            disabled={fontSize <= 10}
            onClick={() => changeFont(-2)}
          >
            <Minus size={14} />
          </button>
          <output aria-label="当前字号">{fontSize}px</output>
          <button
            type="button"
            aria-label="增大字号"
            title="增大字号"
            disabled={fontSize >= 48}
            onClick={() => changeFont(2)}
          >
            <Plus size={14} />
          </button>
        </div>
        {toolbarBeforeModes}
        <div className="md-view-modes">
          {[
            { id: "edit", title: "编辑", icon: Pencil },
            { id: "split-vertical", title: "竖分栏", icon: Columns2 },
            { id: "split-horizontal", title: "横分栏", icon: Rows2 },
            { id: "preview", title: "预览", icon: Eye },
          ].map(({ id, title, icon: Icon }) => (
            <button
              type="button"
              key={id}
              aria-label={title}
              title={title}
              aria-pressed={mode === id}
              onClick={() => changeMode(id as NoteViewMode)}
            >
              {compact ? <Icon size={16} /> : title}
            </button>
          ))}
        </div>
        {toolbarAfterModes}
        {immersive && onSave && (
          <button
            type="button"
            aria-label="保存笔记"
            title="保存笔记 (Ctrl+S)"
            onClick={onSave}
          >
            <Save size={16} />
          </button>
        )}
        {allowImmersive && (
          <button
            type="button"
            aria-label={immersive ? "退出沉浸编辑" : "沉浸编辑"}
            title={immersive ? "退出沉浸编辑 (Esc)" : "沉浸编辑"}
            aria-pressed={immersive}
            onClick={() => setImmersive((v) => !v)}
          >
            {immersive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
      </div>
      <div
        ref={panes}
        className="md-panes"
        style={
          isSplit
            ? horizontal
              ? {
                  gridTemplateColumns: "minmax(0, 1fr)",
                  gridTemplateRows: `minmax(0, ${split.horizontal}fr) 7px minmax(0, ${1 - split.horizontal}fr)`,
                }
              : {
                  gridTemplateColumns: `minmax(0, ${split.vertical}fr) 7px minmax(0, ${1 - split.vertical}fr)`,
                  gridTemplateRows: "minmax(0, 1fr)",
                }
            : undefined
        }
      >
        <textarea
          ref={input}
          hidden={mode === "preview"}
          aria-label={label}
          spellCheck={false}
          value={value}
          style={{ fontSize: "var(--md-font-size)" }}
          onChange={(e) => change(e.target.value)}
          onScroll={(e) => {
            if (restoring.current || !e.currentTarget.getClientRects().length)
              return;
            view.lastPane = "editor";
            rememberPane("editor", e.currentTarget);
          }}
          onKeyDown={(e) => {
            const key = e.key.toLowerCase();
            if (e.ctrlKey || e.metaKey) {
              if (key === "s") {
                e.preventDefault();
                onSave?.();
              }
              if (key === "b") {
                e.preventDefault();
                insert("**", "**");
              }
              if (key === "i") {
                e.preventDefault();
                insert("*", "*");
              }
              if (key === "k") {
                e.preventDefault();
                insert("[", "](https://example.com)");
              }
              if (key === "z") {
                e.preventDefault();
                undo(e.shiftKey ? 1 : -1);
              }
              if (key === "y") {
                e.preventDefault();
                undo(1);
              }
            }
            if (e.key === "Tab") {
              e.preventDefault();
              insert("  ", "", "");
            }
          }}
          placeholder="用 Markdown 记录你的理解、疑问和灵感…"
        />
        {isSplit && (
          <div
            className="md-divider"
            role="separator"
            aria-label="调整编辑与预览分栏"
            aria-orientation={horizontal ? "horizontal" : "vertical"}
            aria-valuemin={10}
            aria-valuemax={90}
            aria-valuenow={Math.round(
              (horizontal ? split.horizontal : split.vertical) * 100,
            )}
            tabIndex={0}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              remember();
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragging.current || !panes.current) return;
              const rect = panes.current.getBoundingClientRect();
              resizeSplit(
                horizontal
                  ? (e.clientY - rect.top) / rect.height
                  : (e.clientX - rect.left) / rect.width,
              );
            }}
            onPointerUp={(e) => {
              dragging.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onLostPointerCapture={() => {
              dragging.current = false;
            }}
            onKeyDown={(e) => {
              const current = horizontal ? split.horizontal : split.vertical;
              if (
                [
                  "ArrowLeft",
                  "ArrowUp",
                  "ArrowRight",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(e.key)
              ) {
                e.preventDefault();
                resizeSplit(
                  e.key === "Home"
                    ? 0.1
                    : e.key === "End"
                      ? 0.9
                      : current +
                        (["ArrowRight", "ArrowDown"].includes(e.key)
                          ? 0.05
                          : -0.05),
                );
              }
            }}
          />
        )}
        <div
          ref={preview}
          hidden={mode === "edit"}
          className="md-preview"
          aria-label="Markdown 预览"
          onScroll={(e) => {
            if (restoring.current || !e.currentTarget.getClientRects().length)
              return;
            view.lastPane = "preview";
            rememberPane("preview", e.currentTarget);
          }}
        >
          <Markdown preserveLineBreaks>
            {value || "*预览会显示在这里。*"}
          </Markdown>
        </div>
      </div>
      {!compact && (
        <div className="md-footer">
          {immersive && saveStatus && (
            <span className="immersive-save-state" role="status">
              {saveStatus} ·{" "}
            </span>
          )}
          {value.length} 字符 · Ctrl+S 保存 · Ctrl+B 加粗 · Ctrl+I 斜体 ·
          支持公式、表格与任务列表
        </div>
      )}
    </div>
  );
  return immersive && immersiveScope === "page"
    ? createPortal(editor, document.body)
    : editor;
}
