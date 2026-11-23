# 架构、空间隔离与数据保存

基于《AI 论文与研究学习应用第一阶段产品愿景》实现的本地个人研究工作空间。

React + TypeScript 前端，Node.js + Express API，SQLite 持久化。数据和 PDF 保存在本机，默认地址为 **http://127.0.0.1:4317**。

## 运行环境与入口

需要 Node.js 24 或更新版本。

```powershell
npm.cmd install
npm.cmd run dev
```

生产运行：

```powershell
npm.cmd run build
npm.cmd run test:firefox
npm.cmd run test:desktop
npm.cmd start
```

服务仅监听本机。可通过环境变量 `PORT` 更换端口、`DATA_DIR` 更换数据目录。首次启动默认创建明确标注的计算机视觉示例空间；设置 `SEED_DEMO=false` 可关闭示例数据。

开发入口 `server/index.mjs` 把 Vite 作为中间件挂到 Express。生产入口由同一服务提供 `dist/` 静态资源与 API，Windows 下按生产配置启动桌面助手。

## 前后端职责

- `src/` 使用 React 19、TypeScript 与 Vite，负责工作空间界面、图谱、阅读器、对话和笔记。`src/api.ts` 封装前端请求，业务数据经 API 读写。

- `server/` 使用 Node.js、Express 5 和内置 SQLite，负责校验请求、管理数据、调用网络或模型服务，并向前端返回结果。

- `desktop/` 包含 Electron 快捷笔记助手的入口、窗口与预加载桥接。`public/` 提供本地静态资源和许可证。

- `tests/` 与 `scripts/` 分别存放自动化测试和独立核验脚本。运行方式见[测试与实测](testing.md)。

## Workspace 隔离与 API 边界

- 创建独立研究空间，输入研究方向。

| 愿景能力       | 当前实现                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Workspace 隔离 | 每个空间独立保存论文、文件引用、图谱、路线、记忆、对话、日程；服务端按空间校验所有对象          |
| 学习档案       | 实时状态同步、可编辑/删除的空间记忆、最近提问                                                   |
| 首页           | 学习概览、日程与截止日期、继续阅读、知识缺口                                                    |
| 数据持久化     | SQLite WAL，PDF 独立文件，空间 JSON 导出                                                        |

- 服务端先用路由中的 Workspace ID 取得研究空间，再从该空间内查找目标论文、技术节点、文档、笔记或其他关联对象。创建和更新关系时也要在同一空间校验关联端点。

- 浏览器通过 API 访问结构化数据与文件。`server/store.mjs` 使用 SQLite WAL 模式，工作空间在 `workspaces` 表按 ID 保存 JSON。`settings` 表按 `global` 保存本机共享设置。共享设置和独立用量账本与空间业务数据分别管理。

- 这是可运行的第一阶段基础版本，面向本机单用户；不包含账户、云同步、多用户权限或跨 Workspace 引用。

- 不包含愿景明确暂缓的测验、评分、间隔复习、社交及复杂多 Agent 自治。

## 保存与备份

`data/paper.sqlite` 保存全部结构化数据与模型设置；`data/files/` 保存 PDF。API Key 保存在本机 SQLite 中，未加密，接口不会回传 Key；不要共享数据库或提交到版本库。

设置中的 JSON 导出仅包含当前空间的结构化资料与提取文本，不含 PDF 二进制和全局 API Key。完整备份请先停止服务，再复制整个 `data/` 目录；恢复时替换对应目录。

- 升级时对旧空间自动进行本地去重、年份修正、方向归类和路线合并。变更前的完整空间快照保存到 `data/backups/`，不修改或删除原始 PDF。

空间资料 JSON 与个人配置 JSON 的范围不同。个人配置的可导出字段、导入校验和密钥处理见[个人配置](notes-and-desktop.md#个人配置与导航)。

## 代码导航

- `src/App.tsx`：主工作空间与交互界面。
- `src/Graph.tsx`：技术/论文时间图谱。
- `src/graphLayout.ts`：节点排布、标签换行、双向关系箭头。
- `src/Markdown.tsx`：安全 Markdown、GFM 表格与 KaTeX 数学公式渲染。
- `src/style.css`：界面样式与响应式布局。
- `server/app.mjs`：空间作用域 API、文件处理、图谱审阅与路线门禁。
- `server/services.mjs`：arXiv 验证、模型接口、隔离上下文构造。
- `server/translation.mjs`：按原文片段分批翻译、格式保留、缓存续传与译文隔离。
- `server/store.mjs`：SQLite 持久化。
- `server/research.mjs`：论文身份与去重、方向归类、路线合并、自动入图和旧数据迁移。
- `server/repair.mjs`：模型辅助的旧资料修复，核验身份后保留原有文件和学习状态。
- `server/seed.mjs`：人工示例空间；示例学习状态不代表真实用户进度。

技术依据：[Node.js SQLite](https://nodejs.org/api/sqlite.html)、[Vite](https://vite.dev/guide/)、[pdf-parse](https://www.npmjs.com/package/pdf-parse)。示例元信息来自 [VGG](https://arxiv.org/abs/1409.1556)、[ResNet](https://arxiv.org/abs/1512.03385)、[Transformer](https://arxiv.org/abs/1706.03762)、[ViT](https://arxiv.org/abs/2010.11929)、[Batch Normalization](https://arxiv.org/abs/1502.03167)、[Swin Transformer](https://arxiv.org/abs/2103.14030)。图谱导览关系与论文存在性验证分开处理。
