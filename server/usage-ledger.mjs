import { uid } from "./seed.mjs";

export const usageCategories = {
  translation: "翻译",
  chat: "对话",
  organization: "整理",
  routes: "路线",
  maintenance: "资料维护",
  other: "其他",
};
const valid = (n) => Number.isSafeInteger(n) && n >= 0;
export function cleanUsage(value) {
  const result = {};
  for (const key of [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "reasoningTokens",
  ])
    if (valid(value?.[key])) result[key] = value[key];
  return Object.keys(result).length ? result : null;
}
export function createUsageLedger(store) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS model_usage (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, workspace_id TEXT,
    category TEXT NOT NULL, purpose TEXT, model TEXT, started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL, duration_ms INTEGER, call_status TEXT NOT NULL,
    task_status TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER,
    total_tokens INTEGER, reasoning_tokens INTEGER, source TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS usage_finished ON model_usage(finished_at);
  CREATE INDEX IF NOT EXISTS usage_task ON model_usage(task_id);
  CREATE TABLE IF NOT EXISTS usage_meta (id TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ai_tasks (
    id TEXT PRIMARY KEY, workspace_id TEXT, category TEXT NOT NULL, title TEXT NOT NULL,
    started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,
    progress TEXT, error TEXT NOT NULL DEFAULT '', paper_id TEXT, document_id TEXT
  ); CREATE INDEX IF NOT EXISTS ai_tasks_time ON ai_tasks(started_at);`);
  const taskColumns = new Set(
    db
      .prepare("PRAGMA table_info(ai_tasks)")
      .all()
      .map((r) => r.name),
  );
  for (const column of ["paper_id", "document_id"])
    if (!taskColumns.has(column))
      db.exec(`ALTER TABLE ai_tasks ADD COLUMN ${column} TEXT`);
  // A restarted service cannot still own an in-memory job. Cached translation
  // pieces remain in the paper and can be resumed; never claim it is running.
  db.prepare(
    "UPDATE ai_tasks SET status='interrupted', finished_at=?, error=? WHERE status='running'",
  ).run(new Date().toISOString(), "服务已重启；已保存的翻译片段可继续翻译。");
  db.prepare(
    "UPDATE model_usage SET task_status='failed' WHERE task_status='running'",
  ).run();
  function begin(scope, title = "", startedAt = new Date().toISOString()) {
    db.prepare(
      "INSERT OR IGNORE INTO ai_tasks (id,workspace_id,category,title,started_at,status,paper_id,document_id) VALUES (?,?,?,?,?,'running',?,?)",
    ).run(
      scope.taskId,
      scope.workspaceId || null,
      scope.category || "other",
      title.slice(0, 300) || usageCategories[scope.category] || "模型任务",
      startedAt,
      scope.paperId || null,
      scope.documentId || null,
    );
  }
  function finish(taskId, ok, error = "") {
    if (!taskId) return;
    db.prepare("UPDATE model_usage SET task_status=? WHERE task_id=?").run(
      ok ? "succeeded" : "failed",
      taskId,
    );
    db.prepare(
      "UPDATE ai_tasks SET status=?,finished_at=?,error=? WHERE id=? AND status='running'",
    ).run(
      ok ? "succeeded" : "failed",
      new Date().toISOString(),
      error.slice(0, 500),
      taskId,
    );
  }
  const insert = db.prepare(
    "INSERT OR IGNORE INTO model_usage VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  function record(row) {
    const usage = cleanUsage(row.usage);
    insert.run(
      row.id || uid(),
      row.taskId,
      row.workspaceId || null,
      row.category || "other",
      row.purpose || "",
      row.model || "",
      row.startedAt,
      row.finishedAt,
      row.durationMs ?? null,
      row.callStatus || "succeeded",
      row.taskStatus || "running",
      usage?.inputTokens ?? null,
      usage?.outputTokens ?? null,
      usage?.totalTokens ?? null,
      usage?.reasoningTokens ?? null,
      row.source || "live",
    );
    if (row.source && row.source !== "live") {
      begin(row, row.purpose, row.startedAt);
      db.prepare("UPDATE ai_tasks SET status=?,finished_at=? WHERE id=?").run(
        row.taskStatus || "succeeded",
        row.finishedAt,
        row.taskId,
      );
    }
  }
  if (!db.prepare("SELECT value FROM usage_meta WHERE id='history-v1'").get()) {
    db.exec("BEGIN");
    try {
      for (const w of store.list()) {
        for (const m of w.messages || []) {
          if (
            m.role !== "assistant" ||
            !cleanUsage(m.tokenUsage) ||
            !Number.isFinite(Date.parse(m.time))
          )
            continue;
          record({
            id: `legacy-chat:${w.id}:${m.id}`,
            taskId: `legacy-chat:${w.id}:${m.turnId || m.id}`,
            workspaceId: w.id,
            category: "chat",
            purpose: "历史对话",
            model: "",
            startedAt: new Date(
              Date.parse(m.time) - (valid(m.durationMs) ? m.durationMs : 0),
            ).toISOString(),
            finishedAt: new Date(m.time).toISOString(),
            durationMs: m.durationMs,
            usage: m.tokenUsage,
            taskStatus: "succeeded",
            source: "legacy-chat",
          });
        }
        for (const p of w.papers)
          for (const t of p.fullTranslations || []) {
            if (
              !cleanUsage(t.tokenUsage) ||
              !Number.isFinite(Date.parse(t.updatedAt))
            )
              continue;
            record({
              id: `legacy-translation:${w.id}:${t.id}`,
              taskId: `legacy-translation:${w.id}:${t.id}`,
              workspaceId: w.id,
              category: "translation",
              purpose: `${p.title}（历史翻译汇总 · 保存日）`,
              paperId: p.id,
              documentId: t.sourceDocumentId,
              model: t.model,
              startedAt: new Date(t.updatedAt).toISOString(),
              finishedAt: new Date(t.updatedAt).toISOString(),
              usage: t.tokenUsage,
              taskStatus: t.state === "complete" ? "succeeded" : "failed",
              source: "legacy-translation",
            });
          }
        for (const p of w.papers) {
          if (!Number.isFinite(Date.parse(p.organizedAt))) continue;
          const id = `legacy-organization:${w.id}:${p.id}`;
          begin(
            { taskId: id, workspaceId: w.id, category: "organization" },
            p.title,
            p.organizedAt,
          );
          db.prepare(
            "UPDATE ai_tasks SET status='succeeded',finished_at=? WHERE id=?",
          ).run(p.organizedAt, id);
        }
      }
      db.prepare("INSERT INTO usage_meta VALUES ('history-v1',?)").run(
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  if (
    !db
      .prepare("SELECT value FROM usage_meta WHERE id='activity-history-v1'")
      .get()
  ) {
    db.exec("BEGIN");
    try {
      const legacy = (scope, title, time, ok = true) => {
        const stamp = Number.isFinite(Date.parse(time))
          ? new Date(time).toISOString()
          : "";
        begin(scope, title, stamp);
        db.prepare("UPDATE ai_tasks SET status=?,finished_at=? WHERE id=?").run(
          ok ? "succeeded" : "failed",
          stamp || null,
          scope.taskId,
        );
      };
      for (const w of store.list()) {
        for (const route of w.routes || [])
          legacy(
            {
              taskId: `legacy-route:${w.id}:${route.id}`,
              workspaceId: w.id,
              category: "routes",
            },
            route.title,
            route.createdAt,
          );
        for (const p of w.papers) {
          if (p.organizationReport)
            legacy(
              {
                taskId: `legacy-organization:${w.id}:${p.id}`,
                workspaceId: w.id,
                category: "organization",
                paperId: p.id,
              },
              p.title,
              p.organizedAt,
            );
          for (const tr of p.fullTranslations || [])
            legacy(
              {
                taskId: `legacy-translation:${w.id}:${tr.id}`,
                workspaceId: w.id,
                category: "translation",
                paperId: p.id,
                documentId: tr.sourceDocumentId,
              },
              `${p.title}（历史翻译）`,
              tr.updatedAt,
              tr.state === "complete",
            );
        }
      }
      db.prepare("INSERT INTO usage_meta VALUES ('activity-history-v1',?)").run(
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return {
    record,
    begin,
    finish,
    progress(taskId, stage, label, detail = "", counts = {}) {
      db.prepare(
        "UPDATE ai_tasks SET progress=? WHERE id=? AND status='running'",
      ).run(
        JSON.stringify({
          stage,
          label,
          detail,
          time: new Date().toISOString(),
          ...counts,
        }),
        taskId,
      );
    },
    tasks(workspaceId) {
      const rows = workspaceId
        ? db
            .prepare(
              "SELECT * FROM ai_tasks WHERE workspace_id=? ORDER BY started_at DESC LIMIT 200",
            )
            .all(workspaceId)
        : db
            .prepare(
              "SELECT * FROM ai_tasks WHERE status='running' OR category IN ('translation','organization','routes') ORDER BY (status='running') DESC,started_at DESC LIMIT 200",
            )
            .all();
      const sum =
        db.prepare(`SELECT count(*) AS calls, sum(input_tokens) AS inputTokens, sum(output_tokens) AS outputTokens,
        sum(total_tokens) AS totalTokens, sum(CASE WHEN total_tokens IS NULL THEN 1 ELSE 0 END) AS missingTotalRecords
        FROM model_usage WHERE task_id=?`);
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        paperId: row.paper_id,
        documentId: row.document_id,
        category: row.category,
        title: row.title,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        status: row.status,
        progress: row.progress ? JSON.parse(row.progress) : null,
        error: row.error,
        ...sum.get(row.id),
      }));
    },
    rows(since) {
      return db
        .prepare(
          "SELECT * FROM model_usage WHERE finished_at >= ? ORDER BY finished_at DESC,id DESC",
        )
        .all(since);
    },
    initializedAt: db
      .prepare("SELECT value FROM usage_meta WHERE id='history-v1'")
      .get().value,
  };
}
function categoryFor(req) {
  const path = req.route?.path || req.originalUrl || "";
  if (path.includes("/translate")) return "translation";
  if (path.includes("/chat")) return "chat";
  if (path.includes("/routes/generate")) return "routes";
  if (path.includes("/organize") || path.includes("/upload"))
    return "organization";
  if (path.includes("/repair") || path.includes("/reassess-importance"))
    return "maintenance";
  return "other";
}
export function usageScope(req, ledger) {
  if (req.usageScope) return req.usageScope;
  const scope = {
    taskId: uid(),
    workspaceId: req.params?.wid,
    category: categoryFor(req),
    paperId: req.params?.pid,
  };
  req.usageScope = scope;
  ledger.begin(
    scope,
    req.taskTitle || (scope.category === "routes" ? req.body?.goal : ""),
  );
  req.res?.once("finish", () =>
    ledger.finish(scope.taskId, req.res.statusCode < 400, req.taskError || ""),
  );
  return scope;
}
const dayKey = (time, timezone) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
export function aggregateUsage(
  rows,
  { days = 7, timezone = "Asia/Shanghai", now = Date.now() } = {},
) {
  const today = dayKey(now, timezone),
    end = Date.parse(`${today}T00:00:00Z`);
  const daily = Array.from({ length: days }, (_, i) => ({
    date: new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
    inputTokens: 0,
    outputTokens: 0,
    missingInputRecords: 0,
    missingOutputRecords: 0,
    records: 0,
    categories: Object.fromEntries(
      Object.keys(usageCategories).map((key) => [
        key,
        {
          inputTokens: 0,
          outputTokens: 0,
          missingInputRecords: 0,
          missingOutputRecords: 0,
        },
      ]),
    ),
  }));
  const byDay = new Map(daily.map((d) => [d.date, d])),
    tasks = new Map();
  let legacyRecords = 0;
  for (const row of rows) {
    const date = dayKey(new Date(row.finished_at), timezone),
      day = byDay.get(date);
    if (!day) continue;
    const category = usageCategories[row.category] ? row.category : "other",
      part = day.categories[category];
    day.records++;
    if (row.source !== "live") legacyRecords++;
    for (const [field, column, missing] of [
      ["inputTokens", "input_tokens", "missingInputRecords"],
      ["outputTokens", "output_tokens", "missingOutputRecords"],
    ]) {
      if (valid(row[column])) {
        day[field] += row[column];
        part[field] += row[column];
      } else {
        day[missing]++;
        part[missing]++;
      }
    }
    const task = tasks.get(row.task_id) || {
      id: row.task_id,
      workspaceId: row.workspace_id,
      category,
      model: row.model,
      time: row.finished_at,
      status: row.task_status,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      missingTotalRecords: 0,
      missingInputRecords: 0,
      missingOutputRecords: 0,
      calls: 0,
      legacyAggregate: row.source === "legacy-translation",
    };
    task.calls++;
    if (valid(row.total_tokens)) task.totalTokens += row.total_tokens;
    else task.missingTotalRecords++;
    if (row.task_status === "failed") task.status = "failed";
    for (const [field, column, missing] of [
      ["inputTokens", "input_tokens", "missingInputRecords"],
      ["outputTokens", "output_tokens", "missingOutputRecords"],
    ]) {
      if (valid(row[column])) task[field] += row[column];
      else task[missing]++;
    }
    tasks.set(row.task_id, task);
  }
  return {
    days,
    timezone,
    daily,
    legacyRecords,
    categories: usageCategories,
    totals: {
      inputTokens: daily.reduce((n, d) => n + d.inputTokens, 0),
      outputTokens: daily.reduce((n, d) => n + d.outputTokens, 0),
      missingInputRecords: daily.reduce((n, d) => n + d.missingInputRecords, 0),
      missingOutputRecords: daily.reduce(
        (n, d) => n + d.missingOutputRecords,
        0,
      ),
    },
    tasks: [...tasks.values()].slice(0, 50),
  };
}
