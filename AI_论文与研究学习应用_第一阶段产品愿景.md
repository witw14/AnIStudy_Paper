# AI 论文与研究学习应用第一阶段产品愿景

## 1. 文档目的

本文档定义独立的论文与研究学习应用在第一阶段希望实现的产品样貌、核心功能、用户体验、Agent 职责边界以及阶段范围。


本文档主要用于：

- 统一后续产品设计与开发方向；
- 作为与 Codex、其他 Coding Agent 或开发工具讨论技术实现时的产品背景；
- 防止开发过程中因为局部功能不断增加而偏离第一阶段目标；
- 明确哪些功能属于第一阶段核心能力，哪些功能暂时不开发。

本文档重点描述：

> **产品要做成什么样。**

暂不讨论具体代码、数据库、框架、接口或工程实现。

该文档不代表最后效果。

---

## 2. 产品核心定位

本项目希望形成一个：

> **由 AI 持续维护的个人论文与研究学习工作空间。**

AI 的价值不只是回答单次问题，而是持续理解：

- 用户当前正在学习什么；
- 用户已经阅读过哪些论文；
- 不同论文和技术之间有什么关系；
- 用户目前沿哪条研究路线学习；
- 当前知识体系中还缺失哪些重要技术；
- 下一步最值得学习什么；
- 不同研究空间之间哪些知识应该隔离，哪些知识应该建立联系。

整个产品第一阶段围绕四件事情展开：

> **学习、组织、连接、规划**

即：

1. 帮助用户理解资料；
2. 帮助用户长期组织资料和知识；
3. 帮助用户建立知识之间的联系；
4. 帮助用户形成可持续推进的学习路线。

---

## 3. 论文与研究学习的组织逻辑

论文学习围绕：

> **技术发展、论文关系和个人研究路线**

组织知识。

它重点回答：

- 这篇论文提出或使用了什么技术？
- 某项技术从哪里来？
- 后续又发展成什么？
- 哪些论文是技术发展的关键节点？
- 当前知识体系中还缺失哪些重要技术？
- 用户下一步应该读什么论文？
- 为了理解目标论文，需要补哪些旁支知识？

其核心不是课程范围，而是：

> **Technology Evolution + Research Route**

---

## 4. Workspace 基本概念

用户可以创建多个独立的论文与研究学习空间：

> **Paper / Research Workspace**

不同 Workspace 默认拥有独立：

- 文件；
- 对话；
- 任务；
- 长期记忆；
- 学习进度。

默认原则：

> **不同研究空间之间不得自动混用记忆。**

同一研究空间内可以建立论文与技术之间的联系。只有用户明确允许跨 Workspace 引用时，才可以建立跨空间联系。

各研究空间使用的基础能力包括：

- 文件管理；
- 对话能力；
- 长期记忆；
- 学习任务；
- 学习进度；
- 基础 AI 能力。

---

## 5. 记忆原则

第一阶段记忆建议从产品概念上划分为三个层次。

### 当前对话记忆

负责：

- 当前聊天上下文；
- 当前连续问题；
- 当前正在讨论的知识点。

例如，用户先问“为什么 ViT 需要大量数据？”，再问“那预训练有什么作用？”，第二个问题可以自然理解第一个问题的上下文。

### Workspace 长期记忆

属于某一个论文与研究学习空间，记录该空间中的近期学习、已经理解的内容和容易混淆的内容。

例如：

```text
近期学习：
- ViT
- Patch Embedding
- Position Embedding

学生已经基本理解：
- CNN
- Residual Connection

当前容易混淆：
- Class Token 的作用
```

另一个研究空间无法默认读取上述内容。

### 全局学习偏好

只保存真正跨学习空间通用的偏好，例如：

```text
默认使用中文讲解

用户是本科阶段学习者

解释时：
先讲概念，再补公式或细节

论文阅读希望重点关注：
背景
动机
核心思想
技术演化位置
论文各部分阅读价值
```

全局记忆不应保存某个研究空间中的具体知识掌握情况。

---

## 6. 论文学习区域总体定位

论文学习是本应用第一阶段最具差异化价值的部分。

其核心不是：

> 上传 PDF → AI 总结论文。

而是：

> **上传论文 → 将论文放入持续成长的技术与论文知识图谱中。**

---

## 7. 论文学习区域核心资产

论文学习长期维护至少四类资产：

```text
论文库

技术图谱

论文图谱

学习路线
```

此外维护：

```text
实时学习进度
```

---

## 8. 技术图谱：核心创新

技术图谱是论文学习板块的核心功能。

目标：

> **把用户已经学习和尚未学习的技术发展关系可视化。**

例如随着用户上传：

```text
AlexNet
VGG
ResNet
Attention Is All You Need
ViT
```

系统逐渐形成一张长期生长的技术演化图。

---

## 9. 技术节点来源

上传论文后，论文整理 Agent 应提取该论文中的重要技术并编辑其节点文本。

例如上传 AlexNet，可能识别：

```text
Deep CNN
ReLU
Data Augmentation
Dropout
LRN
```

但原则：

> **论文使用一个技术，不代表论文首次提出这个技术。**

因此不能简单把：

```text
AlexNet → Data Augmentation
```

理解成：

> AlexNet 发明了 Data Augmentation。

---

## 10. 技术关系类型

技术节点之间应该存在明确关系语义。

例如：

```text
Introduced by

Uses

Extends

Popularized by

Inspired by

Replaces

Requires

Improves upon
```

即：

> 图谱表达的不只是“两个技术有关”。

而是：

> **它们以什么方式有关。**

---

## 11. 实线节点

实线节点代表：

> **用户的知识库中已有直接资料支持。**

例如用户已经上传 ResNet。

那么：

```text
Residual Connection
```

可以成为实线节点。

其含义：

> 当前用户知识库中存在支持这个节点的论文资料。

---

## 12. 虚线节点

虚线节点代表：

> **系统判断这是技术发展链中的重要缺失节点，但用户尚未学习对应论文。**

例如：

```text
AlexNet
   ↓
VGG
   ↓
Batch Normalization   ← 虚线
   ↓
ResNet
```

点开可以显示：

```text
Batch Normalization

Ioffe & Szegedy, 2015

当前尚未加入你的论文库。

为什么出现在这里：
它是这一阶段深层网络训练稳定性的重要技术进展。

[查看论文]
[加入学习路线]
```

其价值是：

> **让“用户缺什么知识”变得可视化。**

---

## 13. Candidate / 待确认节点

除了实线和虚线之外，可以存在第三种状态：

> **Candidate Node**

表示：

> AI 从论文中发现了某个技术，但还不能确定它是否值得成为技术图谱中的主要节点。

例如：

```text
论文中使用了某个小型 trick。
```

此时不应自动放入主图。

可以进入：

```text
Candidate Nodes
```

用户可以：

- 保留；
- 忽略；
- 设为重要；
- 合并进已有节点。

目标：

> 防止论文数量增加后，技术图谱被大量无价值小节点淹没。

---

## 14. 节点重要性

节点大小表示技术重要程度。

建议使用离散等级，而不是连续数字。

例如：

```text
Landmark

Major

Normal

Minor
```

可能示例：

```text
Transformer
→ Landmark

Residual Connection
→ Landmark / Major

Batch Normalization
→ Major

LRN
→ Normal
```

---

## 15. 两种“重要性”需要辩证区分

长期可以区分：

```text
Historical Importance
历史重要性

Route Relevance
当前路线相关度
```

例如：

```text
LRN
```

对于理解 AlexNet 具有历史价值。

但如果用户当前路线是：

```text
ViT → DETR → SAM
```

那么 LRN 的路线相关度可能很低。

第一阶段可以先主要展示一个重要程度，但产品理念应保留这一区分。

---

## 16. 技术节点分类与颜色

节点颜色代表技术类别。

为了可读性，类别数量不应该过多。

建议控制在约 6～8 种。

例如：

```text
Architecture

Component

Training Method

Data / Preprocessing

Objective / Loss

Representation

Optimization

Task / Paradigm
```

示例：

```text
Transformer
→ Architecture

Self-Attention
→ Component

Data Augmentation
→ Data / Preprocessing

Dropout
→ Training Method

Contrastive Loss
→ Objective
```

颜色只用于快速识别。

不应该试图通过颜色承担全部分类信息。

---

## 17. 技术节点详情

每一个技术节点都可以点击展开，其中的内容应在对应论文被上传、该技术被提取出来时就已完成。

节点详情应保持：

> **不长但有价值。**

建议结构：

```markdown
# Residual Connection

残差连接是一种在神经网络层间添加捷径的设计，通过在层间添加捷径连接使网络能够学习输入与理想输出之间的残差。

是什么：
【基本思想】传统网络要求每一层直接学习完整的映射 H(x)，而残差网络将学习任务转化为学习输入与输出的差异 F(x)=H(x)−x
【梯度保护机制】残差连接的关键在于加法结构中的常数项 1，确保梯度稳定传播。

重要性：
帮助非常深的神经网络稳定训练，是 ResNet 的核心设计。

关键论文：
Deep Residual Learning for Image Recognition
[查看论文]

时间：
2015

与哪些技术有关：
Deep CNN [跳转到对应节点页面]（如果该节点已存在）
Batch Normalization 
ResNet

相关论文：（可选）

常见变体：（可选）
Post-Norm
Pre-Norm
DeepNorm

你的学习状态（可自由切换，并实时映射到实时学习进度中的对应字段）：
已学习 / 未学习 / 学习中

[引用并打开对话]
```

---

## 18. 节点不是百科页面

节点详情不应该自动生成太长的百科内容。

如果用户想深入：

> 可以从节点继续发起对话。

因此节点详情承担：

> 快速认知。

对话承担：

> 深入理解。

---

## 19. 技术图谱时间轴

技术图谱横轴：

> **年份**

例如：

```text
2012 → 2014 → 2015 → 2017 → 2020
```

这样用户可以直观看到：

> 技术演化时间关系。

另外可以增加节点筛选：Classification Detection Segmentation Video Multimodal等

---

## 20. 图谱纵轴

纵轴第一阶段不强制赋予严格数学意义。

主要用于：

- 布局；
- 分支；
- 不同研究方向分离。

例如：

```text
Classification
Detection
Segmentation
Video
Multimodal
```

这些可以作为图谱筛选或视觉分层。

---

## 21. 论文图谱

论文图谱与技术图谱必须分开。

### 技术图谱回答：

> **技术是怎么发展的？**

### 论文图谱回答：

> **论文之间是什么关系？**

---

## 22. 论文图谱示例

例如：

```text
AlexNet
   ↓
VGG
   ↓
ResNet
```

另一条：

```text
Attention Is All You Need
          ↓
         ViT
          ↓
Swin Transformer
```

---

## 23. 技术图谱与论文图谱联动

两个图谱应该能够互相联动。

例如点击：

```text
Residual Connection
```

在卡片中可以看到：

```text
关键论文：
Deep Residual Learning for Image Recognition
[查看论文]
...
```

点击：

```text
ResNet
```

在卡片中可以看到：

```text
关键技术：
Deep CNN [查看技术]
Residual Connection [查看技术]
Batch Normalization [查看技术]
```

目标：

> 帮助用户明确区分“论文”和“技术”两个不同层级。

理论上技术与论文的关系可以是N对N

---

## 24. 学习路线系统

用户可以先输入一个较大的研究方向，例如：

```text
CV
```

路线 Agent 根据该方向生成多个可能路线。

例如概念上：

```text
CV
├── Image Classification ── 后续……
├── Object Detection ──
├── Segmentation ──
├── Video Understanding ──
└── Multimodal Vision ──
```

此处每条路线宜精不宜多，两到三个最好，每条路线要具有足够的涵盖性。

用户可以：

> 勾选自己感兴趣的路线加入个人学习计划。

---

## 25. 学习路线层级

学习路线不应该只是：

```text
Paper 1
↓
Paper 2
↓
Paper 3
```

而应采用：

```text
大目标
↓
阶段目标
↓
能力目标
↓
单篇论文
```

例如：

```text
Computer Vision
│
├── Image Classification
│
│   ├── Understand CNN
│   │
│   ├── Understand Deep Residual Networks
│   │
│   └── Understand Vision Transformers
```

再展开到具体论文。

---

## 26. 路线示例

```text
Computer Vision

└── Image Classification

    ├── Understand CNN

    │   ├── AlexNet [查看论文]（已上传的话）
    │   ├── VGG [查看论文]
    │   └── ResNet [查看论文]

    ├── Understand Transformer

    │   └── Attention Is All You Need

    └── Understand Vision Transformer

        └── ViT
```

这样用户看到的是：

> 我正在完成一个知识目标。

而不是：

> 我还有 30 篇论文没读。

---

## 27. Necessary Side Quest / 必要旁支

论文学习通常不是完全线性的。

例如用户想学习：

```text
ViT
```

但没有学习：

```text
Self-Attention
Transformer
```

路线系统应该能够自动发现：

> 当前主线存在缺失前置知识。

并插入：

> **必要旁支**

例如：

```text
主线：

CNN
 ↓
ViT


旁支：

Attention
 ↓
Transformer
```

---

## 28. 旁支学习原则

旁支应尽可能：

> **只补足当前目标所需要的知识。**

例如为了理解 ViT：

不需要用户完整学习所有 NLP Transformer 发展历史。

只需补：

```text
Self-Attention

Multi-Head Attention

Positional Encoding

Transformer Encoder
```

即可。

---

## 29. 学习路线中的论文推荐

学习路线旁边可以持续推荐：

> **尚未加入当前论文库、但值得学习的论文。**

推荐理由可以是：

- 重要前置；
- 技术发展缺失环节；
- 当前路线关键节点；
- 理解下一篇论文的必要条件；
- 经典 landmark。

---

## 30. 论文推荐的真实性要求

论文推荐属于：

> **高可信功能。**

必须尽可能避免：

- 假论文；
- 假作者；
- 假年份；
- 假 arXiv ID；
- 标题和链接不匹配。

---

## 31. 推荐论文的正式状态

正式加入推荐路线的论文至少需要包含：

```text
论文标题

作者

年份

准确 arXiv 地址

推荐理由
```

例如：

```text
Attention Is All You Need

Vaswani et al.

2017

arXiv:1706.03762

推荐原因：
理解 Transformer 与 ViT 的必要前置论文。
```

---

## 32. 推荐论文可信等级

如果系统尚未确认论文真实存在，则不能直接进入正式路线。

可以存在：

```text
Candidate

Searching

Verified
```

只有：

> **Verified**

论文才可以进入正式推荐列表。

---

## 33. 当前第一阶段推荐原则

为了最大程度避免幻觉：

> 自动推荐正式路线时，应优先推荐可以准确验证到 arXiv 页面和论文信息的论文。

未来可扩展：

- DOI；
- conference page；
- journal page。

---

## 34. 学习进度

论文区域长期维护：

> **实时学习进度**

但不应该只是一个用户看不到的隐藏 Agent Memory。

更适合表现为：

> **Learning Journal / 学习档案**

---

## 35. 学习档案示例

```markdown
# Computer Vision Learning

## Current

ViT

## Completed

- AlexNet
- VGG
- ResNet
- Attention Is All You Need

## In Progress

- ViT

## Current Understanding

- Patch Embedding ✓
- Position Embedding ✓
- Class Token ◐
- Pre-training Strategy ○

## Recent Questions

- 为什么 ViT 需要大量数据？
- Position Embedding 如何工作？

## Current Recommendation

下一步重点阅读：
ViT Experiments
```

---

## 36. 学习档案的可见性

原则：

> **任何长期影响 AI 判断的重要信息，都应该尽可能让用户看得到。**

不要让系统形成一个完全不可见的判断：

> “AI 私下认为你已经学会 X。”

用户应能够：

- 查看；
- 修改；
- 删除；
- 更正自己的学习状态。

---

## 37. 论文 Paper Mode

论文侧也存在对话模式。

第一种：

> **Paper Mode**

目标：

> 只围绕当前论文进行讲解。

例如用户正在学习 ViT。

用户问：

> 为什么使用 16×16 patch？

Paper Mode 应优先依据：

> ViT 本身。

而不是立即展开整个 CV 历史。

---

## 38. Research Context Mode

第二种论文对话视角：

> **Research Context Mode**

目标：

> 将当前论文放进技术发展历史和图谱中解释。

例如用户问：

> 为什么 ViT 很重要？

系统可以结合：

```text
CNN Era

AlexNet
→ VGG
→ ResNet

Transformer Era

Attention
→ Transformer
→ ViT
```

解释 ViT 的历史位置。

---

## 39. 两种论文模式的区别

### Paper Mode

回答：

> **“这篇论文具体在说什么？”**

### Research Context Mode

回答：

> **“这篇论文在整个技术发展中意味着什么？”**

---

## 40. 论文整理 Agent

用户上传一篇论文后，系统可以触发论文整理过程。

其主要职责：

- 理解论文；
- 提取关键技术；
- 判断论文的技术贡献；
- 判断论文使用了哪些已有技术；
- 判断可能与哪些已有节点相关；
- 为技术图谱产生候选更新；
- 为论文图谱产生候选更新；
- 更新学习路线可能受到的影响。

---

## 41. 图谱更新不应该完全无监督

为了避免图谱随着论文增加而失控：

AI 可以：

> 自动提出图谱更新建议。

但重要结构变化最好保留用户可见性。

例如在页面一角的“邮件”按钮可以查看以下建议信息：

```text
发现新技术：

Residual Attention Block

建议：
加入 Candidate Nodes

理由：
该方法是本论文的主要结构创新。

[接受]
[忽略]
```

---

## 42. 用户不需要感知大量 Agent

系统内部未来可能存在：

```text
Paper Organizer Agent

Graph Agent

Route Agent

Conversation Agent
```

但产品界面不应该让用户面对：

> Agent #1、Agent #2、Agent #3……

用户应该看到的是功能：

```text
整理论文

更新技术图谱

生成学习路线

与论文对话
```

原则：

> **Agent 是内部能力，不应成为用户认知负担。**

---

## 43. Agent 是否拆分的原则

第一阶段不追求：

> Agent 数量越多越好。

一个任务如果一个 Agent 可以稳定完成：

> 不应该为了“多 Agent”而强行拆分。

但如果两个任务本质明显不同，例如：

```text
理解论文

验证论文真实性

维护技术图谱

规划学习路线
```

则未来拆成独立 Agent 是合理的。

---

## 44. 多 Agent 的主要风险

当前 API 成本不是主要限制。

真正需要关注：

```text
重复工作

响应延迟

错误传播

上下文混乱

系统复杂度

Agent 相互强化错误
```

典型风险：

```text
论文整理 Agent 判断错误
        ↓
图谱 Agent 接受错误
        ↓
路线 Agent 继续采用错误
        ↓
推荐 Agent 给出错误论文
```

因此：

> 多 Agent 最大的问题不是成本，而是错误链条。

---

## 45. API 成本判断

假设使用低成本 Flash 类模型。

典型个人规模：

```text
论文池：

约 10 篇论文
```

即使执行：

- 论文整理；
- 图谱更新；
- 路线规划；
- 学习进度维护；

原愿景对整体成本的预期仍然是：

> **个人可以轻松承担的范围。**

API 成本不应成为是否开发关键 Agent 功能的主要决策因素。

---

## 46. 成本设计原则

虽然价格低，但应避免无意义浪费。

原则：

> 不应该让每个 Agent 反复全文读取整个知识库。

例如上传一篇新论文后：

不应该：

```text
论文 Agent：
重新读 10 篇论文

图谱 Agent：
重新读 10 篇论文

路线 Agent：
重新读 10 篇论文
```

更合理的产品逻辑是：

> 各 Agent 读取自己完成任务需要的最少信息。

即：

```text
新论文全文

+

已有技术节点摘要

+

相关论文摘要

+

当前学习路线
```

---

## 47. 输出长度也是成本来源

Agent 之间不应该为了中间传递产生大量自然语言长文。

例如内部判断更适合形成：

```text
Technology:
Residual Connection

Relation:
Extends

Importance:
Landmark
```

而不是每个 Agent 都生成：

> 大段解释性文章。

这不仅降低成本，也降低错误传播。

---

## 48. 产品首页与论文空间理想结构

首页在本阶段暂定为信息总览页，用于集成显示时间、DDL、各学习进度等。

论文空间采用单页面、左右结构，两个结构可以展开折叠或调整分界线：

```text
Research

├── Paper Library

├── Technology Graph

├── Paper Graph

├── Learning Routes

├── Learning Journal

└── Chats【右侧】
```

聊天界面应始终让用户明确知道当前使用的是 Paper Mode 还是 Research Context Mode，并可以切换这两种对话视角。

---

## 49. 第一阶段核心产品原则

### 原则一：Workspace 优先

AI 永远应该知道：

> 当前在哪一个研究空间。

### 原则二：默认严格隔离

不同研究空间的记忆：

> 默认不混用。

### 原则三：用户显式控制跨域知识

只有用户明确允许跨 Workspace 引用时，才可以建立跨空间联系。

### 原则四：长期知识不能只存在于聊天记录

重要学习结果应沉淀为：

- Technology Node；
- Paper Node；
- Learning Route；
- Learning Journal。

### 原则五：AI 推测与事实必须分离

特别是：

- 技术历史；
- 论文推荐；
- 技术起源。

### 原则六：人工明确输入拥有高优先级

用户明确输入的信息应优先于 AI 自行推测。用户可以更正自己的学习状态。

### 原则七：图谱必须控制复杂度

不能为了完整：

> 把论文中所有名词都变成节点。

### 原则八：推荐论文必须可验证

宁可少推荐，也不要制造假论文。

### 原则九：Agent 不应成为 UI 主角

用户关心的是功能，而不是后台运行了多少 Agent。

### 原则十：新功能必须改善至少一件事情

第一阶段新增功能应至少明显改善：

```text
学习

组织

连接

规划
```

之一。

否则暂缓开发。

---

## 50. 第一阶段明确需要实现的产品能力

- 论文上传；
- 论文库；
- 单篇论文整理；
- 技术提取；
- 技术图谱；
- 论文图谱；
- 技术节点类型；
- 节点颜色；
- 节点大小；
- 实线节点；
- 虚线节点；
- Candidate Node；
- 节点详情；
- 时间轴；
- 技术关系；
- 论文关系；
- 技术图谱与论文图谱联动；
- 学习路线生成；
- 用户选择路线；
- 大目标 → 小目标 → 论文；
- Necessary Side Quest；
- 推荐未学习论文；
- 推荐论文真实性验证；
- arXiv 地址；
- 学习进度；
- Learning Journal；
- Paper Mode；
- Research Context Mode。

---

## 51. 第一阶段暂不开发

明确暂缓：

```text
自动出题

自动测验

自动评分

错题分析

错题本

Mastery 数值体系

间隔复习

完整考试模拟

成绩预测

过度复杂的多 Agent 自治系统

完全自动修改大量图谱结构

多人协作

社交功能

笔记社区
```

---

## 52. 第一阶段成功标准

用户上传论文以后能够感受到：

> 这篇论文不是孤立存在的。

> 我能看到它在技术发展中的位置。

> 我能看到这篇论文和其他论文的关系。

> 我能发现自己知识链条中缺失的关键环节。

> 我知道当前研究方向下一步值得读什么。

> AI 推荐给我的论文是真实存在的。

> 随着论文越读越多，我的技术图谱会越来越完整。

---

## 53. 产品长期愿景

论文学习侧最终沉淀：

```text
论文库

技术图谱

论文图谱

个人研究路线

学习档案

个人研究认知
```

因此本应用长期希望成为：

> **一个持续生长的个人 AI 论文与研究学习知识空间。**

它不只是：

> “帮用户回答问题。”

而是随着用户持续学习：

> **逐渐形成一张越来越接近用户真实知识结构的个人学习地图。**

---

## 54. 第一阶段一句话愿景

> **让 AI 不仅知道用户正在问什么，还知道用户现在在学什么、这篇论文处于哪里，以及下一步值得往哪里走。**

---

## 55. 当前阶段产品边界总结

当前阶段优先级（剥离课程功能后，保留原有相关能力的优先顺序）：

```text
第一优先级：
Workspace 与学习空间感

第二优先级：
技术图谱与论文图谱

第三优先级：
研究学习路线

第四优先级：
长期记忆与学习进度

第五优先级：
Agent 自动化程度
```

第一阶段不以：

> Agent 数量

作为产品能力指标。

而以：

> **用户是否形成一个清晰、连续、可信、不会混乱的个人学习环境**

作为最重要成功标准。
