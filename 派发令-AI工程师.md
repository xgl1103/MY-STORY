# 任务派发令 — AI 工程师

> 派发人：项目经理  
> 接收人：AI 工程师  
> 日期：2026-07-06  
> 项目：My Story — AI 连载小说 App  
> 你的角色：AI 工程师（AI 编排层、记忆管理层、故事引擎）

---

## 你需要做什么

你负责把用户日记变成小说的整个 AI 链路：Prompt 设计、AI 模型调用、多轮审查循环、三层记忆管理、故事引擎总调度。你不写页面 UI、不建数据库、不写剧情内容。

## 第一步：看什么文件（必读，按顺序）

| 序号 | 文件 | 目的 |
|------|------|------|
| 1 | `MyStory-功能规划文档.md` | 了解产品全貌，重点看第五章（AI 架构设计，含三层记忆、审查循环、状态机） |
| 2 | `MyStory-角色分工总览.md` | 了解三角色分工边界，重点看第三章（接口 A：你实现的接口）、第四章（接口 B：你调用的接口）、第五章（接口 C：你使用的配置格式） |
| 3 | `MyStory-AI开发指南.md` | **你的核心工作手册**，逐章阅读，所有代码照此编写 |

## 第二步：你的工作拆解（按天）

### 阶段 1（第 1-3 天）：Prompt 模板 + 适配器 + Mock

**第 1 天：Prompt 模板体系**
- 编写 8 种 Prompt 模板的完整文本（参照 AI 指南第四章）：
  1. 系统 Prompt（世界观 + 文风 + 输出格式）
  2. 章节阶段指令
  3. 摘要记忆
  4. 档案记忆（RAG 检索结果格式）
  5. 即时上下文
  6. 当日日记 + 映射结果
  7. 奇遇注入
  8. 生成指令
- 编写 3 种辅助 Prompt：审查 Prompt（JSON 输出）、摘要生成 Prompt、日记解析 Prompt
- 实现 PromptBuilder.js（拼装器：按固定顺序组装 8 层模板 + 变量替换 + Token 预算检查）

**第 2 天：AI 适配器**
- 实现 AIAdapter 接口定义（TypeScript，参照 AI 指南第五章）
- 实现 4 个适配器（参照 AI 指南第五章完整代码）：
  - DeepSeekAdapter（OpenAI 兼容格式，默认推荐）
  - OpenAIAdapter（原生格式）
  - KimiAdapter（Moonshot 格式，注意 temperature 截断）
  - QwenAdapter（通义千问格式）
- 每个适配器包含：API 端点、请求构造、响应解析、错误码映射、超时处理
- 实现 5 个 MockRepository（参照 AI 指南第八章完整代码）：MockUserRepository、MockDiaryRepository、MockChapterRepository、MockSegmentRepository、MockWorldRepository

**第 3 天：审查循环 + 三层记忆**
- 实现 ReviewLoop.js（2-3 轮审查，JSON 三级容错解析，降级策略）
- 实现 ImmediateContext.js（最近 3 天原文，超限降为 2 天）
- 实现 SummaryMemory.js（章节摘要，超限降为最近 2 章）
- 实现 RAGRetriever.js（关键词检索 Top 5，超限降为 Top 3）
- 实现 ErrorHandler.js（14 个错误码 + callWithRetry 差异化重试）

**阶段 1 交付验收**：PromptBuilder 能拼出完整 Prompt、4 个适配器能正确调用 API 并解析响应、ReviewLoop 能跑通审查循环、三层记忆各组件能从 MockRepository 正确读取数据。

### 阶段 2（第 4-5 天）：故事引擎 + 全链路联调

**第 4 天：StoryEngine 核心方法**
- 实现 StoryEngine.js（参照 AI 指南第三章）：
  - `generateStory()` — 完整的 10 步生成流程
  - `regenerate()` — 重新生成逻辑（与内部审查独立计数）
  - `finalize()` — 定稿 + 章节边界检测 + 摘要生成
  - `saveEdit()` — 手动编辑保存
  - `getStatus()` — 状态查询
- 实现 8 状态状态机完整流转（参照 AI 指南 3.3 节流转图）
- 实现并发锁机制

**第 5 天：全链路测试**
- 用 MockRepository 跑通完整链路：
  日记输入 → 解析 → 映射 → 上下文组装 → 生成 → 审查 → 润色 → 输出
- 测试 4 个适配器各自调用真实 AI API（需自备 API Key）
- 测试边界场景：第 1 天（无上下文）、章节边界日、断更过渡
- 调试 Prompt 直到生成质量可接受

**阶段 2 交付验收**：用真实 AI API 跑通"输入日记 → 输出小说段落"完整链路，审查循环能正常工作，三层记忆能正确加载。

### 阶段 3（第 6-7 天）：联调

- 将 MockRepository 替换为前端工程师提供的真实 Repository
- 联调接口 A（前端调用你的 StoryEngine）和接口 B（你调用前端的 Repository）
- 确认配置数据（内容创作者的 JSON）能被正确加载和使用
- 修复联调问题

### 阶段 4（第 8-10 天）：调优

- Prompt 调优：根据真实生成效果调整 Prompt 模板
- 文风一致性调优：确保生成内容符合诡秘悬疑风格
- Token 预算优化：根据实际消耗调整各层预算
- 边界场景测试和修复

## 第三步：关键注意事项

1. **接口 A 签名不可修改**：你实现的 StoryEngine 5 个方法，参数和返回值结构严格按角色分工总览第三章来
2. **你通过接口 B 调用 Repository**：你调用前端工程师实现的 34 个方法，签名严格按角色分工总览第四章来，不要自己改
3. **Mock Repository 是临时方案**：阶段 1-2 用 Mock 开发，阶段 3 联调时替换为真实实现，你的业务代码不应依赖 Mock 特有行为
4. **审查循环是内部行为**：用户看不到审查过程，审查失败时降级输出当前最优版本，绝不能让用户卡在"生成中"
5. **Token 预算严格控制**：单次调用输入+输出总计不超过 12000 tokens，超限时按降级策略削减
6. **Prompt 模板中的变量**：用 `{变量名}` 占位符，由 PromptBuilder 替换。变量来源见 AI 指南第四章各模板的注释
7. **内容创作者的配置**：`mappings.json`（映射规则）、`outline.json`（剧情大纲）、`encounters.json`（奇遇库）、`settings.json`（设定档案）是你的 Prompt 和检索的数据来源

## 第四步：你需要自备的

- 至少一个 AI 模型的 API Key（推荐 DeepSeek，便宜且中文好）
- 用于阶段 2 和阶段 4 测试真实 AI 调用

## 第五步：有问题找谁

| 问题类型 | 找谁 |
|---------|------|
| Repository 方法需要调整 | 先与前端工程师协商，双方同意后改 |
| 映射规则或剧情大纲有问题 | 内容创作者 |
| Prompt 生成效果不好 | 先自行调优，持续不行找项目经理 |
| 世界观设定不准确 | 内容创作者 |

---

> 签收确认后请开始第 1 天工作。有任何疑问立即提出，不要自己猜测。
