const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  shell,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const { createInterface } = require("node:readline");
const { join } = require("node:path");
const { mkdirSync } = require("node:fs");
function start(input = process.stdin, output = process.stdout) {
  const origin = process.env.ANISTUDY_URL;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ""))
    throw new Error("Local application URL required");
  mkdirSync(process.env.ANISTUDY_DESKTOP_PROFILE, { recursive: true });
  app.setPath("userData", process.env.ANISTUDY_DESKTOP_PROFILE);
  app.setName("AnIStudy 笔记助手");
  let window,
    tray,
    shortcut = "",
    alwaysOnTop = false,
    quitting = false;
  function status() {
    return {
      available: true,
      shortcut,
      registered: !!shortcut && globalShortcut.isRegistered(shortcut),
      alwaysOnTop,
    };
  }
  function emit(data) {
    if (output.writable) output.write(JSON.stringify(data) + "\n");
  }
  function open() {
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({
        title: "AnIStudy · 快速笔记",
        width: 880,
        height: 760,
        minWidth: 420,
        minHeight: 420,
        backgroundColor: "#f6f8f9",
        show: false,
        alwaysOnTop,
        autoHideMenuBar: true,
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) void shell.openExternal(url);
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== origin + "/?quick-notes=1") event.preventDefault();
      });
      window.webContents.on("will-prevent-unload", (event) => {
        // Pending edits already have a local recovery draft. A stopped parent
        // server must not leave an orphan helper holding the global shortcut.
        if (quitting) event.preventDefault();
      });
      window.webContents.session.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      window.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          window.hide();
        }
      });
      window.once("ready-to-show", () => {
        window.show();
        window.focus();
      });
      void window.loadURL(origin + "/?quick-notes=1");
    } else {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  }
  const ready = app.whenReady().then(() => {
    const icon = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIElEQVR42mNUyCz5z0ABYBw1gGE0DBhGw4BhNAwYRgMDAKgfAxcKIQwJAAAAAElFTkSuQmCC",
    );
    tray = new Tray(icon);
    tray.setToolTip("AnIStudy · 快速笔记");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开笔记", click: open },
        { label: "退出笔记助手", click: () => app.quit() },
      ]),
    );
    tray.on("double-click", open);
  });
  let queue = Promise.resolve();
  createInterface({ input })
    .on("line", (line) => {
      queue = queue.then(async () => {
        let request;
        try {
          request = JSON.parse(line);
          await ready;
          if (request.method === "configure") {
            const next = request.shortcut;
            if (next !== shortcut) {
              // Register first: a conflict must leave the previous binding usable.
              if (!globalShortcut.register(next, open))
                throw new Error(
                  `快捷键 ${next} 已被其他程序占用，请选择其他组合。`,
                );
              if (shortcut) globalShortcut.unregister(shortcut);
              shortcut = next;
            }
            alwaysOnTop = request.alwaysOnTop === true;
            if (window && !window.isDestroyed())
              window.setAlwaysOnTop(alwaysOnTop);
          } else if (request.method === "open") open();
          else throw new Error("Unsupported command");
          emit({ id: request.id, result: { ok: true }, status: status() });
        } catch (e) {
          emit({ id: request?.id, error: e.message, status: status() });
        }
      });
    })
    .on("close", () => app.quit());
  ipcMain.handle("notes:hide", (event) => {
    if (event.sender === window?.webContents) window.hide();
  });
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    quitting = true;
    if (app.isReady()) globalShortcut.unregisterAll();
  });
}
module.exports = start;
