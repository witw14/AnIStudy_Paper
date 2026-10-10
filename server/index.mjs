import { createApp } from "./app.mjs";
import { resolve } from "node:path";
import express from "express";
import { createDesktopBridge } from "./desktop.mjs";
const dataDir = process.env.DATA_DIR || resolve("data");
const desktop =
  process.platform === "win32" &&
  process.argv.includes("--production") &&
  process.env.DISABLE_DESKTOP !== "1"
    ? createDesktopBridge(dataDir)
    : null;
const { app, store, acquirer } = createApp({
  dataDir,
  desktop,
  seed: process.env.SEED_DEMO !== "false",
});
if (process.argv.includes("--production")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4317);
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`AnIStudy · Paper running at http://127.0.0.1:${port}`);
  void desktop?.start(`http://127.0.0.1:${port}`, store.settings());
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    acquirer.close();
    desktop?.close();
    server.close(() => {
      store.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
