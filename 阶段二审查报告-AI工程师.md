# 阶段二审查报告 — AI 工程师

> 审查日期：2026-07-06  
> 审查人：项目经理  
> 审查结论：**未通过，4 个阻断问题（P0）必须修复**

---

## 审查结果总览

| # | 文件 | 状态 | 说明 |
|---|------|------|------|
| 1 | StoryEngine.js | **不通过** | 4 个 P0 阻断 + 6 个严重问题 |
| 2 | index.js | **不通过** | 真实环境初始化必崩 |
| 3 | DiaryParser.js | 通过 | AI 解析日记、行为大类提取、三级 JSON 容错 |
| 4 | MappingEngine.js | 通过 | 行为标签匹配、默认映射 |
| 5 | ChapterManager.js | 基本通过 | 边界检测、新章节创建、摘要触发 |
| 6 | EncounterEngine.js | 通过 | 随机触发、min/max_chapter 检查 |
| 7 | ProgressTracker.js | 通过 | 天数追踪、断更检测、完结判定 |
| 8 | SummaryGenerator.js | 通过 | 章节摘要生成、字数限制、失败不阻断 |
| 9 | 全链路测试 | **不通过** | 无测试文件 |

---

## P0 阻断问题（必须修复，否则阶段三联调会崩溃）

### P0-1：StoryEngine.js 使用无效状态 'draft'

**位置**：StoryEngine.js 第 171 行、第 178 行

**问题**：代码中使用了状态值 `'draft'`，但 SegmentRepository 的 VALID_STATUS 中不存在这个值。正确的状态应为 `'draft_ready'`。

**后果**：调用 `SegmentRepository.updateStatus(id, 'draft')` 时，真实 Repository 会因状态校验失败而报错。Mock Repository 没有做状态校验所以 Mock 测试能通过，但联调时真实环境会崩溃。

**修复方式**：将所有 `'draft'` 替换为 `'draft_ready'`。

```javascript
// 错误
await this.segmentRepo.updateStatus(segmentId, 'draft');

// 正确
await this.segmentRepo.updateStatus(segmentId, 'draft_ready');
```

---

### P0-2：StoryEngine.js 调用不存在的 SegmentRepository.update() 方法

**位置**：StoryEngine.js 第 173 行、第 303 行

**问题**：代码中调用了 `this.segmentRepo.update(id, fields)` 方法，但真实 SegmentRepository 没有通用的 `update()` 方法。真实 Repository 只有以下专用方法：
- `updateContent(id, content)`
- `updateStatus(id, status)`
- `updateMapping(id, mappingDesc)`
- `incrementRevision(id)`
- `markEdited(id)`
- `markFinalized(id)`

Mock Repository 有 `update()` 方法所以 Mock 测试能通过，但联调时真实环境会崩溃。

**修复方式**：将所有 `segmentRepo.update(id, { field: value })` 调用拆分为对应的专用方法调用。

```javascript
// 错误
await this.segmentRepo.update(segmentId, { content: content, status: 'draft_ready' });

// 正确
await this.segmentRepo.updateContent(segmentId, content);
await this.segmentRepo.updateStatus(segmentId, 'draft_ready');
```

---

### P0-3：index.js 中 `new RealEngine()` 未传入 repos 参数

**位置**：index.js 第 36 行

**问题**：初始化真实 StoryEngine 时未传入 Repository 依赖，导致构造函数中 `this.userRepo`、`this.diaryRepo`、`this.chapterRepo`、`this.segmentRepo`、`this.worldRepo` 全部为 undefined。任何调用都会报 `Cannot read property of undefined`。

**修复方式**：在初始化时传入所有 Repository 实例。

```javascript
// 错误
const engine = new RealEngine();

// 正确
const engine = new RealEngine({
  userRepo: userRepository,
  diaryRepo: diaryRepository,
  chapterRepo: chapterRepository,
  segmentRepo: segmentRepository,
  worldRepo: worldRepository,
  // 以及其他依赖
  promptBuilder: promptBuilder,
  reviewLoop: reviewLoop,
  adapter: aiAdapter,
  immediateContext: immediateContext,
  summaryMemory: summaryMemory,
  ragRetriever: ragRetriever,
  summaryGenerator: summaryGenerator,
  chapterManager: chapterManager,
  encounterEngine: encounterEngine,
  progressTracker: progressTracker
});
```

---

### P0-4：无全链路测试文件

**问题**：Day 5 任务要求用 MockRepository 跑通完整链路并编写测试用例，但项目中未发现任何测试文件。

**修复方式**：编写全链路测试脚本，至少覆盖以下场景：

1. 首日生成（无上下文）：`generateStory({ diaryText: '今天看了两小时书', behaviorTags: ['学习'], dayNumber: 1 })` 应返回 success
2. 重新生成：`regenerate(segmentId)` 应返回新的内容
3. 定稿：`finalize(segmentId)` 应更新进度
4. 手动编辑：`saveEdit(segmentId, '修改后的内容')` 应保存成功
5. 章节边界：finalize 时如果是章节最后一天，应触发摘要生成
6. 错误处理：AI 调用失败时应返回 errorCode

测试文件放在项目根目录的 `tests/` 目录下。

---

## 严重问题（需一并修复）

### S-1：8 状态状态机基本未实现

**问题**：8 个状态中仅 `finalized` 正确使用，其余 6 个完全缺失：
- `pending`：日记提交后应设置此状态
- `parsing`：AI 解析日记中应设置此状态
- `generating`：AI 生成+审查中应设置此状态
- `draft_ready`：审查完成等待用户预览应设置此状态（当前误用 'draft'）
- `regenerating`：用户要求重新生成应设置此状态
- `editing`：用户手动编辑中应设置此状态
- `generate_failed`：生成失败应设置此状态

**修复方式**：参照 AI 开发指南 3.3 节的状态流转图，在 generateStory 的每一步中正确设置状态。参照 `MyStory-AI开发指南.md` 的 3.3 节状态流转表。

---

### S-2：generateStory 错误地将天数递增和章节边界检查放在生成流程中

**问题**：generateStory 中包含了 `current_day + 1` 和章节边界检查逻辑，但开发指南明确要求这两步在 `finalize()` 中执行。

**后果**：用户点击"重新生成"时天数会重复递增；用户未确认通过时进度就被推进。

**修复方式**：
- generateStory 只负责生成内容，不更新 `current_day`
- finalize 中执行：更新段落状态为 finalized → current_day + 1 → 检查章节边界 → 如到章节末尾则触发摘要生成

---

### S-3：generateStory 未创建日记记录

**问题**：generateStory 中 `diary_id` 设为 null，未调用 `DiaryRepository.create()` 保存用户日记。

**后果**：`regenerate(segmentId)` 需要通过 `segment.diary_id` 获取原始日记来重新生成，但 diary_id 为 null 会导致重新生成失败。

**修复方式**：generateStory 第一步应调用 `DiaryRepository.create()` 保存日记，获得 diary_id 后存入 segment。

---

### S-4：saveEdit 硬编码返回值

**问题**：saveEdit 方法中 `chapterCompleted` 和 `storyEnded` 硬编码为 false，未调用 ChapterManager 和 ProgressTracker。

**修复方式**：saveEdit 保存后应与 finalize 一样执行：更新段落状态 → current_day + 1 → 检查章节边界 → 检查故事完结。

---

### S-5：regenerate 未正确恢复上下文

**问题**：regenerate 需要通过 segment 获取原始日记（diary_id），但因为 S-3 导致 diary_id 为 null。

**修复方式**：修复 S-3 后，regenerate 应：获取 segment → 通过 diary_id 获取原始日记 → 重新组装 Prompt → 生成 → 审查 → 返回。

---

### S-6：并发锁释放不完整

**问题**：`isGenerating` 锁在部分异常路径下可能未释放。

**修复方式**：确保所有 return 路径（包括 catch 中的 return）都释放 `this.isGenerating = false`。建议使用 try-finally。

---

## 合格项确认

以下模块审查通过，无需修改：

- **DiaryParser.js**：AI 解析日记、行为大类提取、三级 JSON 容错、Mock 模式
- **MappingEngine.js**：行为标签匹配、默认映射、纯本地逻辑
- **ChapterManager.js**：边界检测、新章节创建、摘要触发
- **EncounterEngine.js**：随机触发 1-2 次/周、min/max_chapter 检查
- **ProgressTracker.js**：天数追踪、断更检测、完结判定
- **SummaryGenerator.js**：章节摘要生成、字数限制、失败不阻断
- **ReviewLoop.js**（阶段一）：2 轮审查 + 三级 JSON 容错 + 4 种降级策略
- **PromptBuilder.js**（阶段一）：8 层模板 + Token 预算 + 三级削减
- **三层记忆**（阶段一）：各有 Token 预算和降级策略
- **4 个 AI 适配器**（阶段一）：端点、请求、解析、错误码映射正确

---

## 修复优先级

| 优先级 | 问题 | 预估时间 |
|--------|------|---------|
| P0-1 | 'draft' → 'draft_ready' | 10 分钟 |
| P0-2 | update() → 专用方法 | 30 分钟 |
| P0-3 | index.js 传入 repos | 20 分钟 |
| P0-4 | 编写全链路测试 | 2 小时 |
| S-1 | 实现 8 状态状态机 | 1 小时 |
| S-2 | 天数递增移到 finalize | 30 分钟 |
| S-3 | generateStory 创建日记记录 | 20 分钟 |
| S-4 | saveEdit 调用进度更新 | 30 分钟 |
| S-5 | regenerate 恢复上下文 | 30 分钟 |
| S-6 | 并发锁 try-finally | 15 分钟 |

总预估：约 6 小时

---

## 修复后验收标准

1. 所有状态值使用 8 状态中的合法值
2. 所有 Repository 调用使用真实存在的专用方法
3. index.js 正确传入所有依赖
4. 全链路测试覆盖 6 个场景并全部通过
5. 8 状态状态机完整实现
6. generateStory 只生成内容，finalize 负责进度更新
7. generateStory 创建日记记录，regenerate 可获取原始日记
8. saveEdit 正确更新进度

修复完成后通知项目经理重新审查，通过后方可进入阶段三。
