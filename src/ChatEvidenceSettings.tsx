import { useEffect, useState } from "react";
import type { Settings } from "./types";

type Policy = NonNullable<Settings["chatEvidencePolicy"]>;

export function ChatEvidenceControl({
  value,
  onChange,
  disabled,
  formId,
}: {
  value: Policy;
  onChange: (value: Policy) => void;
  disabled?: boolean;
  formId?: string;
}) {
  return (
    <label>
      对话资料策略
      <select
        aria-label="对话资料策略"
        name={formId ? "chatEvidencePolicy" : undefined}
        form={formId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Policy)}
      >
        <option value="supplement">资料优先，允许补充</option>
        <option value="strict">严格依据资料</option>
      </select>
    </label>
  );
}

export function ChatEvidenceSettings({
  settings,
  formId,
  disabled,
}: {
  settings: Settings;
  formId: string;
  disabled?: boolean;
}) {
  const [policy, setPolicy] = useState<Policy>(
    settings.chatEvidencePolicy || "supplement",
  );
  useEffect(
    () => setPolicy(settings.chatEvidencePolicy || "supplement"),
    [settings.chatEvidencePolicy],
  );
  const [showTime, setShowTime] = useState(settings.showChatTime !== false);
  const [showTokens, setShowTokens] = useState(
    settings.showChatTokens !== false,
  );
  useEffect(
    () => setShowTime(settings.showChatTime !== false),
    [settings.showChatTime],
  );
  useEffect(
    () => setShowTokens(settings.showChatTokens !== false),
    [settings.showChatTokens],
  );
  return (
    <section className="chat-evidence-settings">
      <h3>对话资料与知识补充</h3>
      <ChatEvidenceControl
        value={policy}
        onChange={setPolicy}
        disabled={disabled}
        formId={formId}
      />
      <p className="muted">
        两种对话模式共用此设置，随下方“保存偏好选项”生效。默认允许补充领域知识、外部论文背景与学习建议，并在缺少当前资料支持的内容旁标注“无资料支撑”。严格模式只使用给定资料及明确标注的推断。是否已收录、已加入计划或已掌握，始终根据当前空间记录判断。
      </p>
      <h3>对话记录显示</h3>
      <label className="motion-option">
        <input
          type="checkbox"
          name="showChatTime"
          value="true"
          form={formId}
          checked={showTime}
          disabled={disabled}
          onChange={(e) => setShowTime(e.target.checked)}
        />
        显示对话时间
      </label>
      <label className="motion-option">
        <input
          type="checkbox"
          name="showChatTokens"
          value="true"
          form={formId}
          checked={showTokens}
          disabled={disabled}
          onChange={(e) => setShowTokens(e.target.checked)}
        />
        显示输出 token 数
      </label>
      <p className="muted">
        时间精确到秒，按本地时区显示。用量以接口返回值为准；开关只控制显示，随“保存偏好选项”生效。
      </p>
    </section>
  );
}
