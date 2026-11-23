# 分层测试与实测脚本

## 验证

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:reading
npm.cmd run build
```

本节数量保留原 README 的测试清单口径。当前数量以各命令运行时的报告为准。

- 107 项 API / 数据逻辑测试：数据隔离、导入整理、动态分类、布局、重要性校准、手动级别保护、双语标题补全、配置保存，以及笔记多对多关联、并发冲突、去重引用迁移、手动文本保护、论文排序、年份换列、节点隐藏、论文重要性筛选、对话资料策略切换、候选/计划上下文、配置导入导出、关联论文选择、按论文保存技术概括、实际执行阶段与逐篇核验计数、失败保底进度、对话时间及 API token 用量记录。新增原文获取队列、损坏 PDF 重试、下载期间并发编辑保护、HTML 清理与位置索引、长文后部检索、标注版本冲突、技术原文关联与有效引用绑定。
- 43 项浏览器测试：研究流程、图谱布局、对话、折叠清单筛选、滚动隔离、配置与中文排版，以及笔记编辑、关联入口、快捷页并发编辑、详情铅笔修改、节点新建关联笔记、四种论文排序、年份换列保存、节点显示模式的跨布局/刷新/空间隔离、资料策略保存、紧凑对话排版、多行草稿收起/展开、技术引用到 Paper Mode、关键技术概括卡片、时间/用量独立开关与配置导入、加载阶段更新和进度查询结束清理、顶部空间/页面下拉切换及窄屏长名称显示。
- Windows 桌面集成测试检查系统快捷键注册/更换、窗口置顶、隐藏/重新唤出和 Markdown 保存；通过 Electron 的 `cursor-changed` 检查文本指针实际图像含不透明深色主体和白色描边，覆盖悬停、输入、沉浸编辑与重新唤出。使用独立数据库与浏览器配置及专用测试快捷键，不改动真实资料。
- 另有 12 项原文阅读浏览器测试（`npm run test:reading`）：PDF/HTML 入口、两行紧凑顶部、逐词与跨行绿色框选、字号/窄屏、公式与表格、悬浮备注自动保存及跨窗口冲突、高亮完整范围删除与笔记删除确认、技术与段落双向跳转、共享论文对话与出处回跳、即时显示用户消息、回车/中文输入法、加载浮窗、失败后重新编辑及保留新草稿、侧栏宽度拖动、空笔记创建及侧栏内聚焦编辑、转换说明/失败重试入口和独立配置保存。使用独立数据库与可控下载/模型服务，不发送真实论文。
- 浏览器测试默认使用本机 Google Chrome；没有 Chrome 时可安装 Playwright Chromium，并移除 `playwright.config.ts` 中的 `channel: 'chrome'`。

## 字体与桌面测试

```powershell
npm.cmd run build
npm.cmd run test:firefox
npm.cmd run test:desktop
```

- 中文排版测试检查字体实际加载、中文字宽、桌面/窄屏及缩放。Chrome 还检查标题实际使用的字体来源；`npm run test:firefox` 在构建后使用本机 Firefox 独立配置与数据库，生成 `test-results/firefox-fonts/` 截图，不修改用户的浏览器配置。可通过 `FIREFOX_PATH` 指定 Firefox 路径；90% 场景为页面 CSS 缩放。

## 独立测试数据库

- 测试数据位于 `test-results/`，与真实 `data/` 分开。浏览器测试每次使用新的 `e2e-data-时间戳` 数据库，避免旧的示例修改影响回归；可设置 `ANISTUDY_E2E_DATA_DIR` 指定测试目录。回归测试使用可控模拟服务；当前配置的模型已用于真实资料的元信息、英文术语和方向修复，arXiv 联网核验已通过。

## 可选实测脚本

- 可选真实检查：`node scripts/check-paper-acquisition.mjs [arXiv ID]` 在独立数据库验证实际 PDF/HTML 下载与索引；`node scripts/check-reader-view.mjs` 检查前一次下载的官方 HTML 阅读画面；`node scripts/check-source-grounding.mjs` 用合成正文验证当前模型的出处与技术关联，仅只读真实配置，密钥不复制到测试数据库。结果均保存在 `test-results/`。
- `node scripts/check-full-translation.mjs` 仅用合成技术段落验证当前模型的中文全文翻译、人名/术语保留与实际 token 用量；只读真实配置，在独立数据库保存结果，不发送真实研究资料。

- 可选真实模型策略检查：配置接口后运行 `node scripts/check-chat-policy.mjs`，使用合成摘要与路线检查两种模式、默认补充和严格策略；只读本机设置，不发送真实论文、写入研究空间或改动已保存的思考偏好，结果保存在 `test-results/chat-policy-live/`。标签与回答约束由提示词引导，仍需用户核对模型给出的外部知识。

- 可选真实整理检查：`node scripts/check-paper-summaries.mjs` 用合成论文与临时研究空间验证两句概括，只读真实设置，密钥仅用于模型请求且不复制到临时数据库，不修改真实论文；结果保存在 `test-results/paper-summaries-live/`。
