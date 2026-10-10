import { useEffect, useState } from "react";
import { api } from "./api";
import type { Settings } from "./types";

export function NoteSettings({
  settings,
  formId,
}: {
  settings: Settings;
  formId: string;
}) {
  const [shortcut, setShortcut] = useState(settings.noteShortcut || "Alt+I");
  const [status, setStatus] = useState("");
  useEffect(
    () => setShortcut(settings.noteShortcut || "Alt+I"),
    [settings.noteShortcut],
  );
  useEffect(() => {
    void api<{ registered?: boolean; shortcut?: string; error?: string }>(
      "/desktop/status",
    )
      .then((s) =>
        setStatus(
          s.registered
            ? `已注册系统快捷键 ${s.shortcut}`
            : s.error || "快捷键尚未注册，保存配置后生效。",
        ),
      )
      .catch((e) => setStatus(e.message));
  }, []);
  return (
    <section className="note-settings">
      <h3>快速笔记 · Windows 全局快捷键</h3>
      <p className="muted">
        应用服务运行期间可从其他程序唤出笔记窗口，关闭笔记窗口会隐藏到后台。快捷键随下方「保存偏好选项」生效。
      </p>
      <label>
        唤出笔记的快捷键
        <input
          form={formId}
          name="noteShortcut"
          aria-label="笔记全局快捷键"
          value={shortcut}
          onChange={(e) => setShortcut(e.target.value)}
          onKeyDown={(e) => {
            if (
              !(e.ctrlKey || e.altKey || e.metaKey) ||
              ["Control", "Alt", "Shift", "Meta"].includes(e.key)
            )
              return;
            e.preventDefault();
            const key = e.key.toUpperCase();
            if (/^([A-Z0-9]|F([1-9]|1[0-2]))$/.test(key))
              setShortcut(
                [
                  e.ctrlKey && "Ctrl",
                  e.altKey && "Alt",
                  e.shiftKey && "Shift",
                  e.metaKey && "Super",
                  key,
                ]
                  .filter(Boolean)
                  .join("+"),
              );
          }}
          placeholder="Alt+I"
        />
      </label>
      <p className="muted" role="status">
        {status}
      </p>
      <button
        type="button"
        className="secondary"
        onClick={async () => {
          try {
            await api("/desktop/open", {});
          } catch (e) {
            setStatus((e as Error).message);
          }
        }}
      >
        打开快速笔记窗口
      </button>
    </section>
  );
}
