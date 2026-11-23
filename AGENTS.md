# AGENTS.md — AnIStudy · Paper 开发与协作规范

## 1. 环境与基本约定

- 运行环境：Windows + Node.js >= 24，统一使用 `npm.cmd` 执行脚本。
- 技术栈：React 19 + TypeScript (Vite) 前端，Node.js + Express 5 + 内置 SQLite (WAL) 后端，Electron 桌面快捷笔记助手。
- 开发隔离：大改动优先新建分支或独立 `git worktree`；严禁修改或污染真实 `data/` 目录（测试数据一律输出到 `test-results/`）。

## 2. 不可破坏的全局不变量（改动任何模块前必须遵守）

1. **Workspace 强隔离**：所有服务端读写必须校验所属研究空间，禁止跨空间泄漏或串写。
2. **学术严谨与防幻觉**：
   - 未配置模型时不返回模拟 AI 答案；模型核验失败阻止路线保存。
   - 严禁估算或伪造 token 用量、历史时间、论文年份或 PDF 页码。
3. **译文彻底隔离**：全文译文仅作阅读辅助，禁止进入正文检索索引、论文问答、技术整理或路线规划语料。
4. **保护用户手动编辑**：重新整理论文、去重、资料修复或重评重要性时，不得覆盖用户手动修改的标题、正文、年份、定级、关系、隐藏状态及笔记关联。
5. **凭据安全**：API Key 绝不回传前端接口、不写入配置导出 JSON、不复制到任何测试数据库或日志。
6. **兼容与降级**：变更数据结构前保留备份机制（`data/backups/`）；模型或网络失败不得撤销已入库论文，不得破坏未配置模型时的离线可用性。

## 3. 按任务查阅对应规格文档（不要盲改）

| 改动内容 | 查阅文档 |
| --- | --- |
| 入口、数据库表结构、空间接口或备份导出 | [docs/architecture.md](docs/architecture.md) |
| 论文导入/去重、技术/论文图谱、布局、定级、路线 | [docs/graph-and-data.md](docs/graph-and-data.md) |
| 原文获取队列、PDF/HTML 阅读器、高亮标注、全文翻译 | [docs/reader-and-translation.md](docs/reader-and-translation.md) |
| 对话模式、资料策略、出处绑定、模型/思考配置、用量账本、动态任务 | [docs/chat-and-models.md](docs/chat-and-models.md) |
| 笔记库、快捷键、Electron 桌面窗口、自定义光标、字体与外观配置 | [docs/notes-and-desktop.md](docs/notes-and-desktop.md) |
| 验收命令、测试夹具、独立测试库和合成语料实测 | [docs/testing.md](docs/testing.md) |
| 跨会话背景或未完事项 | [HANDOVER.md](HANDOVER.md) |

## 4. 改动后最低验收矩阵

| 改动范围 | 必跑命令 |
| :--- | :--- |
| 任意 `server/` 或业务逻辑 | `npm.cmd test` |
| 任意 `src/` 或 `tsconfig.json` | `npm.cmd run build` |
| 图谱、对话、设置、笔记、导航 UI | `npm.cmd run test:e2e` |
| 阅读器、标注、翻译、原文侧栏 | `npm.cmd run test:reading` |
| `desktop/`、快捷键、光标、快捷笔记 | `npm.cmd run test:desktop` |
| 字体、排版、全局 CSS | `npm.cmd run test:firefox` |

- 验收方式、测试夹具与合成语料实测脚本（`scripts/check-*.mjs`）详见 [docs/testing.md](docs/testing.md)。
- 完成一阶段工作后，若存在未合入改动、新增规则或待办事项，必须同步更新对应 `docs/*.md` 与 [HANDOVER.md](HANDOVER.md)。
