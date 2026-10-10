import { z } from "zod";
import { defaultChatEvidencePolicy } from "./chat-policy.mjs";
import { taskReasoningDefaults } from "./reasoning.mjs";
const thinkingSettings = z
  .object({
    deepThinking: z.enum(["auto", "enabled", "disabled"]),
    reasoningEffort: z.enum(["auto", "low", "high", "max"]),
  })
  .strict();
export const taskReasoningSchema = z
  .object({
    routes: thinkingSettings,
    organization: thinkingSettings,
    translation: thinkingSettings,
  })
  .strict();
export const appearanceDefaults = {
  theme: "forest",
  reduceMotion: false,
  nodeSizes: { landmark: 78, major: 62, normal: 52, minor: 14 },
  timelineAutoWrap: false,
  timelineColumnLimit: 10,
};
const diameter = z.number().int().min(8).max(128);
export const preferenceSchema = z.object({
  preferences: z.string().max(2000).optional(),
  autoDownloadPapers: z.boolean().optional(),
  autoOrganizePapers: z.boolean().optional(),
  showChatTime: z.boolean().optional(),
  showChatTokens: z.boolean().optional(),
  chatEvidencePolicy: z.enum(["supplement", "strict"]).optional(),
  timelineAutoWrap: z.boolean().optional(),
  timelineColumnLimit: z.number().int().min(1).max(100).optional(),
  noteShortcut: z
    .string()
    .regex(
      /^(?:(?:Ctrl|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/,
      "快捷键格式示例：Alt+I 或 Ctrl+Shift+N",
    )
    .refine((value) => {
      const parts = value.split("+");
      return (
        new Set(parts).size === parts.length &&
        parts.slice(0, -1).some((p) => p !== "Shift")
      );
    }, "快捷键至少包含 Ctrl、Alt 或 Super，修饰键不可重复")
    .optional(),
  noteAlwaysOnTop: z.boolean().optional(),
  preferEnglishTerms: z.boolean().optional(),
  deepThinking: z.enum(["auto", "enabled", "disabled"]).optional(),
  reasoningEffort: z.enum(["auto", "low", "high", "max"]).optional(),
  theme: z.enum(["forest", "ocean", "violet", "amber"]).optional(),
  reduceMotion: z.boolean().optional(),
  nodeSizes: z
    .object({
      landmark: diameter,
      major: diameter,
      normal: diameter,
      minor: diameter,
    })
    .strict()
    .optional(),
});
const portableSchema = preferenceSchema
  .extend({
    taskReasoning: taskReasoningSchema.optional(),
    baseUrl: z
      .string()
      .url()
      .refine((v) => /^https?:\/\//.test(v))
      .optional(),
    model: z.string().trim().min(1).max(2000).optional(),
    preferences: z.string().max(2000).optional(),
  })
  .strict();
export function exportPreferences(settings) {
  // Explicit allowlist: future settings fields and credentials never leak into files.
  const values = {
    ...appearanceDefaults,
    preferEnglishTerms: true,
    deepThinking: "auto",
    reasoningEffort: "auto",
    chatEvidencePolicy: defaultChatEvidencePolicy,
    showChatTime: true,
    showChatTokens: true,
    autoDownloadPapers: true,
    autoOrganizePapers: false,
    taskReasoning: taskReasoningDefaults,
  };
  for (const key of Object.keys(portableSchema.shape))
    if (settings[key] !== undefined) values[key] = settings[key];
  return {
    format: "anistudy-personal-config",
    version: 1,
    settings: portableSchema.parse(values),
  };
}
export function importPreferences(raw, current) {
  const file = z
    .object({
      format: z.literal("anistudy-personal-config"),
      version: z.literal(1),
      settings: portableSchema,
    })
    .strict()
    .parse(raw);
  const next = { ...current, ...file.settings };
  // A configuration file cannot silently send an existing credential to a new endpoint.
  if (
    file.settings.baseUrl &&
    file.settings.baseUrl.replace(/\/$/, "") !==
      (current.baseUrl || "").replace(/\/$/, "")
  )
    next.apiKey = "";
  return next;
}
