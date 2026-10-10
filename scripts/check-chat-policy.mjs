// Optional live smoke check: only synthetic context is sent, and the saved
// settings database is opened read-only. No real research or chat is modified.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { callModel, scopedContext } from "../server/services.mjs";
import { chatSystemPrompt } from "../server/chat-policy.mjs";

const db = new DatabaseSync(
  resolve(process.env.DATA_DIR || "data", "paper.sqlite"),
  { readOnly: true },
);
const saved = JSON.parse(
  db.prepare("SELECT body FROM settings WHERE id='global'").get()?.body || "{}",
);
db.close();
if (!saved.baseUrl || !saved.model || !saved.apiKey)
  throw new Error("Configure a model before running the optional live check.");
const w = {
  name: "Synthetic policy check",
  papers: [
    {
      id: "vision",
      title: "校验用视觉论文",
      inLibrary: true,
      summary:
        "本文采用 Transformer 编码器处理图像块，并提及 BERT，但未介绍 BERT 的机制或文献编号。",
    },
    {
      id: "masked-vision",
      title: "校验用掩码视觉预训练候选论文",
      inLibrary: false,
      summary: "用掩码视觉 token 预测进行自监督视觉预训练。",
    },
  ],
  nodes: [
    {
      id: "transformer",
      name: "Transformer",
      importance: "landmark",
      status: "unlearned",
      paperIds: ["vision"],
    },
  ],
  edges: [],
  paperEdges: [],
  memories: [],
  routes: [
    {
      id: "selected-plan",
      title: "掩码视觉预训练",
      selected: true,
      stages: [
        {
          title: "视觉预训练",
          paperIds: ["masked-vision"],
          nodeIds: [],
          sideQuest: false,
        },
      ],
    },
  ],
};
const cases = [
  {
    name: "paper-supplement",
    mode: "paper",
    policy: "supplement",
    message:
      "摘要提及的 BERT 是什么？请解释其核心机制，给出你有把握的论文题名和 arXiv 编号。回答简短即可。",
  },
  {
    name: "research-supplement",
    mode: "research",
    policy: "supplement",
    message:
      "BERT 是否已经收录、是否在我的已选学习计划里？它对这条路线有什么帮助，建议加入吗、重要程度如何？请简短回答，区分记录和建议。",
  },
  {
    name: "paper-strict",
    mode: "paper",
    policy: "strict",
    message:
      "摘要提及的 BERT 是什么？请解释其核心机制，给出论文题名和 arXiv 编号。回答简短即可。",
  },
  {
    name: "research-strict",
    mode: "research",
    policy: "strict",
    message:
      "BERT 是否已经收录、是否在我的已选学习计划里？它对这条路线有什么帮助，建议加入吗、重要程度如何？请简短回答，区分记录和建议。",
  },
];
const output = resolve("test-results", "chat-policy-live");
mkdirSync(output, { recursive: true });
const selected = process.argv
  .find((arg) => arg.startsWith("--case="))
  ?.slice(7);
if (selected && !cases.some((entry) => entry.name === selected))
  throw new Error("Unknown live check case.");
for (const entry of cases.filter(
  (entry) => !selected || entry.name === selected,
)) {
  const settings = {
    ...saved,
    chatEvidencePolicy: entry.policy,
    deepThinking: "disabled",
  };
  const reply = await callModel(settings, [
    {
      role: "system",
      content: chatSystemPrompt(
        settings,
        entry.mode,
        scopedContext(w, entry.mode, "vision"),
      ),
    },
    ...(entry.policy === "supplement"
      ? [
          { role: "user", content: "能补充摘要之外的 BERT 背景吗？" },
          {
            role: "assistant",
            content:
              "此前只允许依据当前资料，所以不能展开 BERT 的原文细节或补充编号。",
          },
        ]
      : []),
    { role: "user", content: entry.message },
  ]);
  writeFileSync(join(output, `${entry.name}.md`), reply, "utf8");
  if (entry.policy === "supplement") assert.match(reply, /无资料支撑/);
  else {
    assert.match(reply, /不足|不支持|未提供|没有提供|缺少|未介绍|无法|不能/);
    assert.doesNotMatch(reply, /1810\.04805|Deep Bidirectional/);
    assert.doesNotMatch(reply, /这是基于领域常识的建议/);
  }
  console.log(`${entry.name}: response saved (${reply.length} characters)`);
}
