import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";

export function createDesktopBridge(dataDir) {
  let child,
    channel,
    listener,
    startup,
    counter = 0;
  let state = { available: false, error: "笔记助手正在启动。" };
  const pending = new Map();
  function send(method, data = {}) {
    return new Promise((resolve, reject) => {
      if (!channel?.writable)
        return reject(new Error(state.error || "笔记助手未运行。"));
      const id = ++counter;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("笔记助手响应超时。"));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      channel.write(JSON.stringify({ id, method, ...data }) + "\n");
    });
  }
  return {
    status: () => state,
    start(url, settings) {
      startup = (async () => {
        try {
          const executable = createRequire(import.meta.url)("electron");
          const token = randomBytes(32).toString("hex");
          let accept;
          const connected = new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("笔记助手连接超时。")),
              10000,
            );
            accept = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          listener = createServer((socket) => {
            let authenticated = false;
            socket.on("error", () => {});
            createInterface({ input: socket }).on("line", (line) => {
              let message;
              try {
                message = JSON.parse(line);
              } catch {
                socket.destroy();
                return;
              }
              if (!authenticated) {
                if (message.hello !== token || channel) {
                  socket.destroy();
                  return;
                }
                authenticated = true;
                channel = socket;
                listener.close();
                accept();
                return;
              }
              if (message.status) state = message.status;
              const p = pending.get(message.id);
              if (!p) return;
              pending.delete(message.id);
              clearTimeout(p.timer);
              if (message.error) p.reject(new Error(message.error));
              else p.resolve(message.result);
            });
          });
          await new Promise((resolve, reject) => {
            listener.once("error", reject);
            listener.listen(0, "127.0.0.1", resolve);
          });
          const env = {
            ...process.env,
            ANISTUDY_URL: url,
            ANISTUDY_DESKTOP_PROFILE: resolve(dataDir, "desktop-profile"),
            ANISTUDY_CONTROL_PORT: String(listener.address().port),
            ANISTUDY_CONTROL_TOKEN: token,
          };
          delete env.ELECTRON_RUN_AS_NODE;
          child = spawn(executable, [resolve("desktop/main.cjs")], {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"],
            env,
          });
          child.stderr.on("data", () => {});
          child.on("error", (e) => {
            state = { available: false, error: e.message };
          });
          child.on("exit", () => {
            state = {
              available: false,
              error: "笔记助手已退出，请重新启动应用服务。",
            };
            for (const p of pending.values()) {
              clearTimeout(p.timer);
              p.reject(new Error(state.error));
            }
            pending.clear();
          });
          await connected;
          await send("configure", {
            shortcut: settings.noteShortcut || "Alt+I",
            alwaysOnTop: !!settings.noteAlwaysOnTop,
          });
        } catch (e) {
          listener?.close();
          channel?.destroy();
          child?.kill();
          state = { available: false, error: `笔记助手启动失败：${e.message}` };
        }
      })();
      return startup;
    },
    async configure(settings) {
      await startup;
      await send("configure", {
        shortcut: settings.noteShortcut || "Alt+I",
        alwaysOnTop: !!settings.noteAlwaysOnTop,
      });
    },
    async open() {
      await startup;
      await send("open");
    },
    close() {
      listener?.close();
      channel?.end();
      const active = child;
      setTimeout(() => {
        if (active && active.exitCode === null) active.kill();
      }, 2000).unref();
    },
  };
}
