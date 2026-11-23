import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { demoWorkspace, emptyWorkspace } from "./seed.mjs";
import { migrateWorkspace } from "./research.mjs";
export function createStore(dir, seed = true) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "paper.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, body TEXT NOT NULL);",
  );
  const put = (w) => {
    // Model extraction/metadata repairs must not erase a user's edited text.
    for (const value of [...w.papers, ...w.nodes]) {
      if (value.userEdits) Object.assign(value, value.userEdits);
    }
    for (const [collection, manualKey, edgeKey] of [
      ["nodes", "manualConnections", "edges"],
      ["papers", "manualPaperConnections", "paperEdges"],
    ]) {
      const ids = new Set(w[collection].map((n) => n.id));
      if (w[manualKey] === undefined && manualKey === "manualPaperConnections")
        continue;
      w[manualKey] = (w[manualKey] || []).filter(
        (e) => ids.has(e.source) && ids.has(e.target),
      );
      for (const manual of w[manualKey]) {
        w[edgeKey] = w[edgeKey].filter(
          (e) =>
            !(
              (e.source === manual.source && e.target === manual.target) ||
              (e.source === manual.target && e.target === manual.source)
            ),
        );
        if (manual.relation)
          w[edgeKey].push({ ...manual, provenance: "manual" });
      }
    }
    db.prepare("INSERT OR REPLACE INTO workspaces VALUES (?, ?)").run(
      w.id,
      JSON.stringify(w),
    );
    return w;
  };
  if (seed && !db.prepare("SELECT id FROM workspaces LIMIT 1").get())
    put(demoWorkspace());
  for (const row of db.prepare("SELECT body FROM workspaces").all()) {
    const w = JSON.parse(row.body);
    if (w.schemaVersion >= 2) continue;
    const backup = join(dir, "backups");
    mkdirSync(backup, { recursive: true });
    writeFileSync(
      join(backup, `${w.id}-before-v2-${Date.now()}.json`),
      row.body,
    );
    if (migrateWorkspace(w)) put(w);
  }
  return {
    db,
    put,
    list: () =>
      db
        .prepare("SELECT body FROM workspaces")
        .all()
        .map((r) => JSON.parse(r.body)),
    get: (id) => {
      const r = db.prepare("SELECT body FROM workspaces WHERE id=?").get(id);
      return r ? JSON.parse(r.body) : null;
    },
    create: (name, description) =>
      put({ ...emptyWorkspace(name, description), schemaVersion: 2 }),
    settings: () =>
      JSON.parse(
        db.prepare("SELECT body FROM settings WHERE id='global'").get()?.body ||
          "{}",
      ),
    saveSettings: (s) =>
      db
        .prepare("INSERT OR REPLACE INTO settings VALUES ('global',?)")
        .run(JSON.stringify(s)),
  };
}
