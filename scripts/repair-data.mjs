import { createStore } from "../server/store.mjs";
import { callModel, verifyArxiv } from "../server/services.mjs";
import { analyzeRepairs, applyRepairs } from "../server/repair.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const dir = resolve(process.env.DATA_DIR || "data");
const store = createStore(dir, false);
try {
  const settings = store.settings();
  for (const w of store.list().filter((w) => !w.demo)) {
    if (!w.papers.length && !w.nodes.length) continue;
    const before = {
      papers: w.papers.length,
      nodes: w.nodes.length,
      routes: w.routes.length,
    };
    if (!settings.apiKey) {
      console.log(
        JSON.stringify({
          workspace: w.name,
          status: "local migration complete; no configured model",
          ...before,
        }),
      );
      continue;
    }
    const target = process.argv.includes("--missing")
      ? { ...w, nodes: w.nodes.filter((n) => !n.englishName) }
      : w;
    if (process.argv.includes("--missing") && !target.nodes.length) continue;
    const output = await analyzeRepairs(
      target,
      settings,
      callModel,
      verifyArxiv,
    );
    const fresh = store.get(w.id);
    const backups = join(dir, "backups");
    mkdirSync(backups, { recursive: true });
    writeFileSync(
      join(backups, `${w.id}-before-model-repair-${Date.now()}.json`),
      JSON.stringify(fresh),
    );
    applyRepairs(fresh, output, settings);
    store.put(fresh);
    console.log(
      JSON.stringify({
        workspace: w.name,
        before,
        after: {
          papers: fresh.papers.length,
          nodes: fresh.nodes.length,
          routes: fresh.routes.length,
        },
        years: fresh.papers.map((p) => ({ title: p.title, year: p.year })),
        englishTerms: fresh.nodes.filter((n) => n.englishName).length,
        directions: [...new Set(fresh.nodes.flatMap((n) => n.directions))],
      }),
    );
  }
} finally {
  store.db.close();
}
