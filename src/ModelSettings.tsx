import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "./api";
import { TokenUsage } from "./TokenUsage";
import type { Settings } from "./types";
import "./model-settings.css";

const scenarios = {
  routes: "路线规划",
  organization: "论文整理",
  translation: "全文翻译",
} as const;
const defaults = { deepThinking: "auto", reasoningEffort: "auto" } as const;
export function ModelSettings({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (settings: Settings) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || ""),
    [model, setModel] = useState(settings.model || "");
  const [reasoning, setReasoning] = useState<
    NonNullable<Settings["taskReasoning"]>
  >(
    () =>
      Object.fromEntries(
        Object.keys(scenarios).map((k) => [
          k,
          settings.taskReasoning?.[k as keyof typeof scenarios] || {
            ...defaults,
          },
        ]),
      ) as NonNullable<Settings["taskReasoning"]>,
  );
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  let supported = false;
  try {
    supported =
      new URL(baseUrl).hostname === "api.deepseek.com" &&
      /^deepseek-(flash|v4-pro|pro|chat|reasoner)$/.test(model);
  } catch {}
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          setSaving(true);
          setError("");
          try {
            if (!baseUrl.trim() || !model.trim())
              throw new Error("请填写接口地址和模型名称。");
            await api(
              "/settings",
              {
                baseUrl: baseUrl.trim(),
                model: model.trim(),
                apiKey: d.get("apiKey") || undefined,
                taskReasoning: reasoning,
              },
              "PUT",
            );
            onSaved(await api<Settings>("/settings"));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="model-api-fields">
          <label>
            接口地址（包含 /v1，不含 /chat/completions）
            <input
              type="url"
              name="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-provider.example/v1"
              required
            />
          </label>
          <label>
            模型名称
            <input
              name="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="服务商提供的模型 ID"
              required
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              name="apiKey"
              autoComplete="off"
              placeholder={
                settings.hasKey ? "已保存；留空保留现有 Key" : "输入 API Key"
              }
            />
          </label>
        </div>
        <small className="muted">
          支持 Chat Completions 兼容接口。Key 仅保存在本机数据库，不返回浏览器。
        </small>
        <h3>任务默认思考设置</h3>
        <div className="scenario-reasoning">
          <div className="scenario-header">
            <span>调用场景</span>
            <span>深度思考</span>
            <span>思考强度</span>
          </div>
          {Object.entries(scenarios).map(([k, label]) => {
            const key = k as keyof typeof scenarios,
              value = reasoning[key];
            return (
              <div className="scenario-row" key={key}>
                <strong>{label}</strong>
                <select
                  aria-label={`${label}深度思考`}
                  value={value.deepThinking}
                  disabled={!supported || saving}
                  onChange={(e) =>
                    setReasoning((r) => ({
                      ...r,
                      [key]: {
                        ...r[key],
                        deepThinking: e.target
                          .value as typeof value.deepThinking,
                      },
                    }))
                  }
                >
                  <option value="auto">模型默认</option>
                  <option value="enabled">开启</option>
                  <option value="disabled">关闭</option>
                </select>
                <select
                  aria-label={`${label}思考强度`}
                  value={value.reasoningEffort}
                  disabled={
                    !supported || value.deepThinking === "disabled" || saving
                  }
                  onChange={(e) =>
                    setReasoning((r) => ({
                      ...r,
                      [key]: {
                        ...r[key],
                        reasoningEffort: e.target
                          .value as typeof value.reasoningEffort,
                      },
                    }))
                  }
                >
                  <option value="auto">模型默认</option>
                  <option value="low">低</option>
                  <option value="high">高</option>
                  <option value="max">最高</option>
                </select>
              </div>
            );
          })}
        </div>
        <small className="muted">
          {supported
            ? "分别应用于路线、整理（含补全重试）和全文翻译；对话沿用对话面板设置。模型默认由服务商决定。"
            : "当前接口或模型尚未确认支持思考参数，控件暂不可用，已有配置会保留。"}
        </small>
        {error && (
          <p className="config-error" role="alert">
            {error}
          </p>
        )}
        <div className="model-save-row">
          <button className="primary" disabled={saving}>
            保存模型设置
            <Check size={15} />
          </button>
          {settings.hasKey && (
            <button
              type="button"
              className="danger-text"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await api("/settings/key", undefined, "DELETE");
                  onSaved(await api<Settings>("/settings"));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              移除 API Key
            </button>
          )}
        </div>
      </form>
      <TokenUsage />
    </>
  );
}
