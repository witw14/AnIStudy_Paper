import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, LoaderCircle, RefreshCw, X, CircleAlert } from "lucide-react";
import { api } from "./api";
import type { AITask } from "./types";

export const taskNames: Record<string, string> = {
  translation: "全文翻译",
  organization: "论文整理",
  routes: "路线规划",
  chat: "对话",
  maintenance: "资料维护",
  other: "其他",
};
export function taskTokens(task: AITask) {
  if (!task.calls || task.totalTokens === null) return "tokens 未提供";
  return `${task.totalTokens.toLocaleString()} tokens${task.missingTotalRecords ? "（部分用量未提供）" : ""}`;
}
export function useBackgroundTasks(onFinished: (task: AITask) => void) {
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [completed, setCompleted] = useState<AITask[]>([]);
  const callback = useRef(onFinished);
  callback.current = onFinished;
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const started = Date.now(),
      known = new Map<string, string>();
    let polling = false,
      again = false;
    async function poll() {
      if (polling) {
        again = true;
        return;
      }
      polling = true;
      clearTimeout(timer);
      try {
        const next = await api<AITask[]>("/tasks");
        if (stopped) return;
        setTasks(next);
        for (const task of next) {
          if (
            task.status !== "running" &&
            known.get(task.id) !== task.status &&
            (known.get(task.id) === "running" ||
              Date.parse(task.startedAt) >= started)
          ) {
            callback.current(task);
            if (task.category === "translation")
              setCompleted((rows) =>
                [task, ...rows.filter((t) => t.id !== task.id)].slice(0, 3),
              );
          }
          known.set(task.id, task.status);
        }
      } catch {
        /* Polling can recover without interrupting the server job. */
      } finally {
        polling = false;
        if (!stopped) {
          timer = setTimeout(poll, again ? 100 : 1500);
          again = false;
        }
      }
    }
    const refresh = () => void poll();
    void poll();
    window.addEventListener("anistudy:tasks", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("anistudy:tasks", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return {
    tasks,
    completed,
    dismiss: (id: string) =>
      setCompleted((rows) => rows.filter((t) => t.id !== id)),
  };
}
export function BackgroundTaskDock({
  tasks,
  completed,
  dismiss,
  onActivity,
  foreground,
  compact = false,
}: {
  tasks: AITask[];
  completed: AITask[];
  dismiss: (id: string) => void;
  onActivity: () => void;
  foreground?: ReactNode;
  compact?: boolean;
}) {
  const running = tasks.filter(
    (t) => t.category === "translation" && t.status === "running",
  );
  if (!running.length && !completed.length) return <>{foreground}</>;
  return (
    <div
      className={`background-task-dock ${compact ? "compact" : ""}`}
      aria-label="后台任务"
    >
      {foreground}
      {(compact
        ? [...running, ...completed].slice(0, 1)
        : [...running, ...completed]
      ).map((task) => (
        <div
          className="background-task"
          key={task.id}
          role="status"
          aria-label={
            task.status === "running" ? "全文翻译进度" : "全文翻译结果"
          }
        >
          {task.status === "running" ? (
            <LoaderCircle size={17} className="spin" />
          ) : task.status === "succeeded" ? (
            <Check size={17} />
          ) : (
            <CircleAlert size={17} />
          )}
          <button
            className="background-task-content"
            title={`${task.title} · ${task.progress?.detail || taskTokens(task)}`}
            onClick={onActivity}
          >
            <strong>
              {task.status === "running"
                ? task.progress?.label || "正在准备全文翻译…"
                : task.status === "succeeded"
                  ? "全文翻译完成"
                  : "翻译未完成，可继续翻译"}
              {compact &&
                (task.status === "running"
                  ? ` · ${task.progress?.detail || "后台执行"}`
                  : ` · ${taskTokens(task)}`)}
            </strong>
            <span title={task.title}>{task.title}</span>
            <small>
              {task.status === "running"
                ? task.progress?.detail || "可离开阅读器，任务在后台继续。"
                : taskTokens(task)}
            </small>
          </button>
          {task.status !== "running" && (
            <button aria-label="关闭翻译结果" onClick={() => dismiss(task.id)}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export function TaskHistory({ workspaceId }: { workspaceId?: string }) {
  const [tasks, setTasks] = useState<AITask[]>([]),
    [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  async function refresh() {
    try {
      setTasks(
        await api<AITask[]>(
          `/tasks${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""}`,
        ),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [workspaceId]);
  const rows = tasks.filter(
    (t) =>
      ["translation", "organization", "routes"].includes(t.category) &&
      (filter === "all" || filter === t.category),
  );
  return (
    <section className="task-history">
      <div className="task-history-toolbar">
        <select
          aria-label="筛选动态类型"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部任务</option>
          {["routes", "organization", "translation"].map((k) => (
            <option key={k} value={k}>
              {taskNames[k]}
            </option>
          ))}
        </select>
        <button aria-label="刷新动态" onClick={() => void refresh()}>
          <RefreshCw size={15} />
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!rows.length && (
        <p className="muted">暂无路线规划、论文整理或翻译任务记录。</p>
      )}
      {rows.map((task) => (
        <article className="activity-task" key={task.id}>
          <div>
            <span className="pill">{taskNames[task.category]}</span>
            <strong>{task.title}</strong>
            <span className={`activity-status ${task.status}`}>
              {
                {
                  running: "进行中",
                  succeeded: "已完成",
                  failed: "失败",
                  interrupted: "已中断",
                }[task.status]
              }
            </span>
          </div>
          <p>
            {task.finishedAt || task.startedAt ? (
              <time dateTime={task.finishedAt || task.startedAt}>
                {new Date(task.finishedAt || task.startedAt).toLocaleString(
                  "zh-CN",
                  { hour12: false },
                )}
              </time>
            ) : (
              <span>完成时间未记录</span>
            )}
            <span>{taskTokens(task)}</span>
          </p>
          {task.status === "running" && (
            <small>
              {task.progress?.label} {task.progress?.detail}
            </small>
          )}
          {task.error && <small className="config-error">{task.error}</small>}
        </article>
      ))}
    </section>
  );
}
