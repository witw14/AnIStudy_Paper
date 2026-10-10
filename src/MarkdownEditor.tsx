import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { Markdown } from "./Markdown";

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  label = "笔记正文",
  allowImmersive = false,
  saveStatus,
  immersiveScope = "page",
}: {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  label?: string;
  allowImmersive?: boolean;
  saveStatus?: string;
  immersiveScope?: "page" | "local";
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState("split");
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
        <div className="md-view-modes">
          {[
            ["edit", "编辑"],
            ["split", "分栏"],
            ["preview", "预览"],
          ].map(([id, title]) => (
            <button
              type="button"
              key={id}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {title}
            </button>
          ))}
        </div>
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
      <div className="md-panes">
        {mode !== "preview" && (
          <textarea
            ref={input}
            aria-label={label}
            spellCheck={false}
            value={value}
            onChange={(e) => change(e.target.value)}
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
        )}
        {mode !== "edit" && (
          <div className="md-preview" aria-label="Markdown 预览">
            <Markdown>{value || "*预览会显示在这里。*"}</Markdown>
          </div>
        )}
      </div>
      <div className="md-footer">
        {immersive && saveStatus && (
          <span className="immersive-save-state" role="status">
            {saveStatus} ·{" "}
          </span>
        )}
        {value.length} 字符 · Ctrl+S 保存 · Ctrl+B 加粗 · Ctrl+I 斜体 ·
        支持公式、表格与任务列表
      </div>
    </div>
  );
  return immersive && immersiveScope === "page"
    ? createPortal(editor, document.body)
    : editor;
}
