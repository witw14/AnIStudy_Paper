import type { Settings } from "./types";
export function ChatReasoning({
  settings,
  disabled,
  onChange,
}: {
  settings: Settings;
  disabled?: boolean;
  onChange: (data: Partial<Settings>) => void;
}) {
  return (
    <div className="chat-reasoning">
      <label>
        深度思考
        <select
          aria-label="深度思考"
          value={settings.deepThinking || "auto"}
          disabled={disabled || !settings.reasoningCapabilities?.supported}
          onChange={(e) =>
            onChange({
              deepThinking: e.target.value as Settings["deepThinking"],
            })
          }
        >
          <option value="auto">模型默认</option>
          <option value="enabled">开启</option>
          <option value="disabled">关闭</option>
        </select>
      </label>
      <label>
        思考强度
        <select
          aria-label="思考强度"
          value={settings.reasoningEffort || "auto"}
          disabled={
            disabled ||
            !settings.reasoningCapabilities?.supported ||
            settings.deepThinking === "disabled"
          }
          onChange={(e) =>
            onChange({
              reasoningEffort: e.target.value as Settings["reasoningEffort"],
            })
          }
        >
          <option value="auto">模型默认</option>
          {settings.reasoningCapabilities?.efforts.map((effort) => (
            <option key={effort} value={effort}>
              {(
                { low: "低", high: "高", max: "最高" } as Record<string, string>
              )[effort] || effort}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
