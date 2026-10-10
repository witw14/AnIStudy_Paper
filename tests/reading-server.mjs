// A local, deterministic provider for browser tests. No real research/API keys.
import express from "express";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";
import { createApp } from "../server/app.mjs";
import { textPdf } from "./pdf-fixture.mjs";
import { htmlPaper, methodText } from "./reading-fixture.mjs";

const { app, store, acquirer } = createApp({
  dataDir: resolve(process.env.DATA_DIR),
  seed: false,
  verify: async (id) => ({
    title: `Controlled Reader Paper ${id}`,
    authors: "Test Author",
    year: 2024,
    arxivId: id,
    arxivVersion: id.replace(/v\d+$/, "") + "v2",
    summary: "Attention Routing combines relevant evidence.",
    source: "arxiv",
    verification: "verified",
  }),
  downloadPdf: async (id, signal) => {
    await delay(900, undefined, { signal });
    if (id.startsWith("2401.00000"))
      throw new Error("Controlled download failure");
    return textPdf(methodText);
  },
  downloadHtml: async (id) => {
    if (id.startsWith("2401.00001")) throw new Error("HTML not provided");
    if (id.startsWith("2401.00002"))
      return htmlPaper.replace(
        "</article>",
        `<section><h2>4 Background task experiment</h2>${Array.from({ length: 10 }, (_, i) => `<p id="long-${i}">${"Synthetic background paragraph describes original scientific evidence. ".repeat(100)}</p>`).join("")}</section></article>`,
      );
    return htmlPaper;
  },
  model: async (_, messages, json, options) => {
    options?.onUsage?.({
      inputTokens: 120,
      outputTokens: 32,
      totalTokens: 152,
    });
    if (json && messages[0].content.includes("AnIStudy_TRANSLATION")) {
      const { segments } = JSON.parse(messages.at(-1).content);
      await delay(650);
      return {
        translations: segments.map((s) => ({
          id: s.id,
          text: `中文译文：${s.text}`,
        })),
      };
    }
    if (json)
      return {
        summary: "本文使用注意力路由组合相关信息。",
        nodes: [
          {
            name: "Attention Routing",
            englishName: "Attention Routing",
            chineseName: "注意力路由",
            year: 2024,
            category: "Component",
            importance: "normal",
            description: "组合相关特征。",
            significance: "理解信息组合。",
            directions: ["Controlled reading"],
            contribution: "Introduced by",
            necessary: true,
            relevance: "core",
            necessityReason: "本文方法的核心组成。",
            paperSummary: {
              role: "该技术在本文组合相关特征。",
              implementation: "本文使用学习得到的注意力权重进行组合。",
            },
          },
        ],
        edges: [],
        paperEdges: [],
      };
    return "注意力路由通过学习得到的权重组合相关特征，保留残差信息。[[cite:S1]]";
  },
});
store.saveSettings({
  baseUrl: "http://127.0.0.1:4320/v1",
  model: "reading-fixture",
  apiKey: "fixture",
  autoDownloadPapers: true,
  autoOrganizePapers: false,
});
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "spa",
});
app.use(vite.middlewares);
const server = app.listen(4320, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    acquirer.close();
    server.close(() => {
      store.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  });
