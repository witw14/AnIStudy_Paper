import { useEffect, useState } from "react";
import type { Settings } from "./types";
import { api } from "./api";

export const defaultNodeSizes = {
  landmark: 78,
  major: 62,
  normal: 52,
  minor: 14,
};
export const importanceNames = {
  landmark: "里程碑",
  major: "重要",
  normal: "普通",
  minor: "次要",
};
const themes = {
  forest: ["松林绿", "#2d715f"],
  ocean: ["海洋蓝", "#286796"],
  violet: ["鸢尾紫", "#705397"],
  amber: ["暖砂金", "#886026"],
};

export function Customization({
  settings,
  disabled,
  onSaved,
  formId,
}: {
  settings: Settings;
  disabled: boolean;
  onSaved: () => Promise<void>;
  formId: string;
}) {
  const [sizes, setSizes] = useState(settings.nodeSizes || defaultNodeSizes);
  const [theme, setTheme] = useState(settings.theme || "forest");
  const [motion, setMotion] = useState(settings.reduceMotion || false);
  const [autoWrap, setAutoWrap] = useState(settings.timelineAutoWrap || false);
  const [columnLimit, setColumnLimit] = useState(
    String(settings.timelineColumnLimit ?? 10),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setSizes(settings.nodeSizes || defaultNodeSizes);
    setTheme(settings.theme || "forest");
    setMotion(settings.reduceMotion || false);
  }, [settings.nodeSizes, settings.theme, settings.reduceMotion]);
  useEffect(() => {
    setAutoWrap(settings.timelineAutoWrap || false);
    setColumnLimit(String(settings.timelineColumnLimit ?? 10));
  }, [settings.timelineAutoWrap, settings.timelineColumnLimit]);
  async function perform(fn: () => Promise<void>, notice: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await onSaved();
      setMessage(notice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const locked = disabled || saving;
  return (
    <section className="customization" aria-label="外观与个人配置">
      <input type="hidden" form={formId} name="theme" value={theme} />
      <input
        type="hidden"
        form={formId}
        name="reduceMotion"
        value={String(motion)}
      />
      <h3>图谱节点大小</h3>
      <p className="muted">
        调整圆形直径（8–128px），各布局同步生效。次要节点保持空心样式。
      </p>
      <div className="size-settings">
        {(Object.keys(importanceNames) as (keyof typeof importanceNames)[]).map(
          (key) => (
            <label key={key} className="size-setting">
              <span>{importanceNames[key]}</span>
              <input
                aria-label={`${importanceNames[key]}节点直径`}
                form={formId}
                name={`nodeSize.${key}`}
                type="range"
                min="8"
                max="128"
                step="1"
                value={sizes[key]}
                disabled={locked}
                onChange={(e) =>
                  setSizes((s) => ({ ...s, [key]: Number(e.target.value) }))
                }
              />
              <output>{sizes[key]}px</output>
            </label>
          ),
        )}
      </div>
      <div className="node-size-preview" aria-label="节点大小预览">
        {(Object.keys(importanceNames) as (keyof typeof importanceNames)[]).map(
          (key) => (
            <div key={key}>
              <span
                className={`size-preview-circle ${key === "minor" ? "hollow" : ""}`}
                style={{ width: sizes[key], height: sizes[key] }}
              />
              <small>{importanceNames[key]}</small>
            </div>
          ),
        )}
      </div>
      <h3>年份浏览布局</h3>
      <p className="muted">
        技术和论文的时间轴视图共用此设置。同一年份超出上限时在右侧续开一列；默认不换列。
      </p>
      <input
        type="hidden"
        form={formId}
        name="timelineAutoWrap"
        value={String(autoWrap)}
      />
      <label className="motion-option">
        <input
          type="checkbox"
          checked={autoWrap}
          disabled={locked}
          onChange={(e) => setAutoWrap(e.target.checked)}
        />
        年份浏览自动换列
      </label>
      {!autoWrap && (
        <input
          type="hidden"
          form={formId}
          name="timelineColumnLimit"
          value={columnLimit}
        />
      )}
      <label className="timeline-column-setting">
        单列最大节点数
        <input
          aria-label="单列最大节点数"
          type="number"
          min={1}
          max={100}
          step={1}
          required
          form={formId}
          name="timelineColumnLimit"
          value={columnLimit}
          disabled={locked || !autoWrap}
          onChange={(e) => setColumnLimit(e.target.value)}
        />
      </label>
      <h3>整体主题配色</h3>
      <div className="theme-options" role="group" aria-label="主题配色">
        {(Object.keys(themes) as (keyof typeof themes)[]).map((key) => (
          <button
            type="button"
            key={key}
            disabled={locked}
            aria-pressed={theme === key}
            onClick={() => setTheme(key)}
          >
            <i style={{ background: themes[key][1] }} />
            {themes[key][0]}
          </button>
        ))}
      </div>
      <label className="motion-option">
        <input
          type="checkbox"
          checked={motion}
          disabled={locked}
          onChange={(e) => setMotion(e.target.checked)}
        />
        减少界面动效
      </label>
      <div className="customization-actions">
        <button
          className="primary"
          disabled={locked}
          onClick={() =>
            void perform(async () => {
              await api(
                "/preferences",
                {
                  nodeSizes: sizes,
                  theme,
                  reduceMotion: motion,
                  timelineAutoWrap: autoWrap,
                  timelineColumnLimit: Number(columnLimit),
                },
                "PATCH",
              );
            }, "外观配置已保存。")
          }
        >
          保存外观配置
        </button>
        <button
          className="secondary"
          disabled={locked}
          onClick={() =>
            void perform(async () => {
              await api(
                "/preferences",
                {
                  nodeSizes: defaultNodeSizes,
                  theme: "forest",
                  reduceMotion: false,
                  timelineAutoWrap: false,
                  timelineColumnLimit: 10,
                },
                "PATCH",
              );
            }, "已恢复默认节点大小与主题。")
          }
        >
          恢复默认外观
        </button>
      </div>
      <h3>个人配置文件</h3>
      <p className="muted">
        包含已保存的外观、标题语言、模型接口及学习偏好，不包含 API
        Key、论文和图谱。导入后若接口地址改变，需要重新填写密钥。
      </p>
      <div className="customization-actions">
        <a
          className="secondary"
          href="/api/preferences/export"
          download="anistudy-personal-config.json"
        >
          导出个人配置
        </a>
        <label className="secondary config-import">
          导入个人配置
          <input
            aria-label="导入个人配置文件"
            type="file"
            accept=".json,application/json"
            disabled={locked}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void perform(async () => {
                if (file.size > 100000)
                  throw new Error(
                    "配置文件过大，请选择导出的个人配置 JSON 文件。",
                  );
                let data: unknown;
                try {
                  data = JSON.parse(await file.text());
                } catch {
                  throw new Error("无法解析配置文件，请选择有效的 JSON 文件。");
                }
                await api("/preferences/import", data);
              }, "个人配置已导入。请检查模型接口与密钥状态。");
            }}
          />
        </label>
      </div>
      {message && (
        <p role="status" aria-label="配置保存状态">
          {message}
        </p>
      )}
      {error && (
        <p className="config-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
