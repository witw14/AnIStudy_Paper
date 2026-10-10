// Only advertise controls for model/provider combinations with a known protocol.
export function reasoningCapabilities(settings) {
  let host = "";
  try {
    host = new URL(settings.baseUrl).hostname;
  } catch {}
  const supported =
    host === "api.deepseek.com" &&
    /^deepseek-(flash|v4-pro|pro|chat|reasoner)$/.test(settings.model || "");
  return { supported, efforts: supported ? ["low", "high", "max"] : [] };
}
export const taskReasoningDefaults = {
  routes: { deepThinking: "auto", reasoningEffort: "auto" },
  organization: { deepThinking: "auto", reasoningEffort: "auto" },
  translation: { deepThinking: "auto", reasoningEffort: "auto" },
};
export function settingsForTask(settings, category) {
  if (!taskReasoningDefaults[category]) return settings;
  return {
    ...settings,
    ...taskReasoningDefaults[category],
    ...settings.taskReasoning?.[category],
  };
}
export function reasoningBody(settings) {
  const capabilities = reasoningCapabilities(settings);
  const thinking = settings.deepThinking || "auto";
  const effort = settings.reasoningEffort || "auto";
  if (!capabilities.supported) return {};
  return {
    ...(thinking !== "auto" ? { thinking: { type: thinking } } : {}),
    ...(thinking !== "disabled" && capabilities.efforts.includes(effort)
      ? { reasoning_effort: effort }
      : {}),
  };
}
