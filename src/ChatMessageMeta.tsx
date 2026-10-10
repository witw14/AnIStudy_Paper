import type { Message, Settings } from "./types";

const validTokens = (n: number | undefined): n is number =>
  Number.isSafeInteger(n) && n! >= 0;
const count = (n: number) => n.toLocaleString("zh-CN");
function localTime(time: string) {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export function ChatMessageMeta({
  message,
  settings,
}: {
  message: Message;
  settings: Settings;
}) {
  const time = settings.showChatTime !== false ? localTime(message.time) : null;
  const showTokens =
    message.role === "assistant" && settings.showChatTokens !== false;
  if (!time && !showTokens) return null;
  const usage = message.tokenUsage;
  const hasOutput = validTokens(usage?.outputTokens);
  const details = usage
    ? [
        "接口返回的实际用量",
        validTokens(usage.inputTokens)
          ? `输入 ${count(usage.inputTokens)} token`
          : "",
        validTokens(usage.totalTokens)
          ? `总计 ${count(usage.totalTokens)} token`
          : "",
        validTokens(usage.reasoningTokens)
          ? `其中推理 ${count(usage.reasoningTokens)} token（计入输出）`
          : "",
      ]
        .filter(Boolean)
        .join("；")
    : "";
  return (
    <footer className="chat-message-meta" aria-label="对话记录信息">
      {time && (
        <time
          dateTime={message.time}
          title={
            message.role === "user"
              ? "发送时间（本地时间）"
              : "回复时间（本地时间）"
          }
        >
          {time}
        </time>
      )}
      {showTokens && (
        <span
          className="chat-token-usage"
          title={
            hasOutput
              ? details
              : message.tokenUsage === undefined
                ? "旧对话未记录 API 用量，无法补算"
                : "接口未返回有效的输出 token 用量，不进行估算"
          }
        >
          {hasOutput
            ? `输出 ${count(usage!.outputTokens!)} token`
            : message.tokenUsage === undefined
              ? "输出 token：未记录"
              : "输出 token：接口未返回"}
        </span>
      )}
    </footer>
  );
}
