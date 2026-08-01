# My Story — AI 工程师开发指南

> 版本：v1.0
> 日期：2026-07-06
> 依赖文档：`MyStory-功能规划文档.md`、`MyStory-角色分工总览.md`
> 适用对象：AI 工程师
> 说明：本文档是 AI 工程师的完整开发手册，涵盖角色职责、生成流程、StoryEngine 实现、Prompt 模板系统、AI 适配器、审查循环、三层记忆管理、Repository Mock、错误处理与开发计划。所有接口定义与功能规划文档、角色分工总览保持完全一致，工程师可直接照此写代码。

---

## 目录

- [一、角色职责边界](#一角色职责边界)
- [二、AI 生成完整流程](#二ai-生成完整流程)
- [三、StoryEngine 实现指南](#三storyengine-实现指南)
- [四、Prompt 模板系统](#四prompt-模板系统)
- [五、AI 适配器实现](#五ai-适配器实现)
- [六、审查循环实现](#六审查循环实现)
- [七、三层记忆管理实现](#七三层记忆管理实现)
- [八、Repository Mock 实现](#八repository-mock-实现)
- [九、错误处理](#九错误处理)
- [十、开发计划](#十开发计划)

---

## 一、角色职责边界

### 1.1 AI 工程师负责的模块

AI 工程师是 My Story 项目中"AI 编排层"和"记忆管理层"的唯一负责人，承担从用户日记到小说段落的全部 AI 逻辑。

| 模块 | 文件路径 | 职责说明 |
|------|---------|---------|
| 故事引擎（总调度） | `src/core/StoryEngine.js` | 实现接口 A（StoryEngine API），编排完整 10 步生成流程 |
| 日记解析器 | `src/core/DiaryParser.js` | 调用 AI 从日记中提取关键事件和行为大类 |
| 映射规则引擎 | `src/core/MappingEngine.js` | 将行为大类匹配到世界观行为 |
| 章节管理器 | `src/core/ChapterManager.js` | 章节边界检测、新章节创建、摘要触发 |
| 奇遇引擎 | `src/core/EncounterEngine.js` | 随机奇遇触发逻辑、去重、注入 |
| 进度追踪器 | `src/core/ProgressTracker.js` | 天数递增、断更检测、完结判定 |
| Prompt 拼装器 | `src/ai/PromptBuilder.js` | 组装 8 层 Prompt 模板，变量替换 |
| 审查循环器 | `src/ai/ReviewLoop.js` | 2-3 轮 AI 自我审查与修改 |
| 摘要生成器 | `src/ai/SummaryGenerator.js` | 章节结束时生成 200-300 字摘要 |
| AI 适配器 | `src/ai/adapters/*.js` | DeepSeek / OpenAI / Kimi / Qwen 四个适配器 |
| 即时上下文提供器 | `src/memory/ImmediateContext.js` | 从 SegmentRepository 获取最近 3 天原文 |
| 摘要记忆提供器 | `src/memory/SummaryMemory.js` | 从 ChapterRepository 获取所有章节摘要 |
| RAG 检索器 | `src/memory/RAGRetriever.js` | 从 WorldRepository 关键词检索 Top 5 |
| Mock Repository | （阶段 1 临时文件） | AI 工程师开发期使用，接口 B 的 Mock 实现 |

### 1.2 AI 工程师不负责的模块

| 模块 | 负责人 | AI 工程师不做什么 |
|------|--------|------------------|
| 页面 UI 与交互 | 前端工程师 | 不写 Vue 组件、不写 CSS、不处理 DOM 事件 |
| 路由与导航 | 前端工程师 | 不定义路由、不实现页面跳转 |
| SQLite 数据层 | 前端工程师 | 不建表、不写 SQL、不实现 Repository 的真实版本 |
| 数据导出/导入 | 前端工程师 | 不实现 JSON 导出导入逻辑 |
| Capacitor 打包 | 前端工程师 | 不处理 App 打包配置 |
| 剧情大纲 | 内容创作者 | 不编写大纲节点内容 |
| 映射规则表内容 | 内容创作者 | 不编写映射规则的文字内容（但定义数据格式） |
| 世界观资料 | 内容创作者 | 不编写世界观设定文本 |
| 奇遇库内容 | 内容创作者 | 不编写奇遇的 content_template |
| 配置 JSON 文件 | 内容创作者 | 不产出配置文件（但负责校验格式） |

### 1.3 与前端工程师的协作关系

AI 工程师与前端工程师之间通过两个接口边界协作，双方不越过接口直接访问对方内部实现：

```
┌──────────────────────────┐         ┌──────────────────────────┐
│     前端工程师             │         │       AI 工程师           │
│                          │         │                          │
│  页面 UI · 路由 · 交互     │         │  Prompt · 适配器 · 审查    │
│  SQLite · Repository     │         │  三层记忆 · 故事引擎       │
│  导出导入 · 打包           │         │                          │
│                          │         │                          │
│   调用方                   │ 接口 A  │   实现方                  │
│   StoryEngine ◄──────────┼─────────┼─► StoryEngine 实现        │
│                          │         │                          │
│   实现方                   │ 接口 B  │   调用方                  │
│   Repository 实现 ────────┼─────────┼─► Repository ◄            │
│                          │         │                          │
└──────────────────────────┘         └──────────────────────────┘
```

**接口 A（StoryEngine API）**：前端调用，AI 实现。前端工程师通过 `storyEngine.generateStory()`、`storyEngine.regenerate()` 等方法触发故事生成。AI 工程师保证返回值结构严格符合 `GenerateResult` / `FinalizeResult` / `SegmentStatus` 类型定义。

**接口 B（Repository API）**：AI 调用，前端实现。AI 工程师通过 `UserRepository`、`DiaryRepository`、`ChapterRepository`、`SegmentRepository`、`WorldRepository` 读写数据。前端工程师保证这些方法可用且行为正确。

**Mock 机制**：阶段 1-2 开发期间，双方各自使用对方的 Mock 版本独立开发。前端使用 `MockStoryEngine`，AI 使用 `MockRepositories`。阶段 3 联调时替换为真实实现。

### 1.4 与内容创作者的协作关系

AI 工程师与内容创作者之间通过接口 C（配置数据格式）协作：

| 协作点 | 内容创作者产出 | AI 工程师使用 | AI 工程师协助 |
|--------|--------------|-------------|--------------|
| 映射规则 | `mappings.json` | MappingEngine 读取并匹配行为 | 定义数据格式（`MappingRule` 接口） |
| 剧情大纲 | `outline.json` | PromptBuilder 注入章节阶段指令 | 校验 JSON 格式有效性 |
| 世界观设定 | `settings.json` | RAGRetriever 检索档案记忆 | 校验 keywords 格式 |
| 奇遇库 | `encounters.json` | EncounterEngine 选取并注入 | 校验 content_template 变量 |
| 世界观基础 | `world.json` | PromptBuilder 注入系统 Prompt | — |
| 途径配置 | `paths.json` | RAGRetriever 检索途径设定 | — |

**协作约定**：
- 内容创作者交付配置文件后，AI 工程师负责校验 JSON 格式和字段完整性，发现问题反馈给内容创作者修改。
- AI 工程师若需要新的配置字段（如新增奇遇参数），需向内容创作者提出需求，由内容创作者在配置文件中添加。
- AI 工程师不直接修改配置文件内容，只读取和使用。

---

## 二、AI 生成完整流程

### 2.1 流程总览

从用户提交日记到最终定稿，完整 10 步流程如下。每一步标注了输入、输出、调用方式、异常处理。

```
用户提交日记
  │
  ▼
[1] 日记解析 — AI 从用户输入中提取关键事件和行为大类
  │
  ▼
[2] 映射匹配 — 映射规则引擎将行为大类匹配到世界观行为
  │
  ▼
[3] 上下文组装 — 拼装三层记忆 + 当日映射结果 + 章节阶段指令
  │
  ▼
[4] 初稿生成 — AI 根据组装好的 Prompt 生成小说段落初稿
  │
  ▼
[5] 审查轮 1 — AI 审查初稿：世界观一致性、逻辑矛盾、文风
  │  ├─ 通过 → 进入轮 2
  │  └─ 不通过 → 修改后重新审查（最多重试 2 次）
  │
  ▼
[6] 审查轮 2 — AI 审查修改稿：是否引入新问题、叙事流畅性
  │  ├─ 通过 → 进入润色
  │  └─ 不通过 → 再次修改（最多重试 1 次）
  │
  ▼
[7] 润色轮（可选） — AI 最终润色，确保文风统一和起伏感
  │
  ▼
[8] 输出预览 — 将最终版本展示给用户
  │
  ▼
[9] 用户审核（Human-in-the-Loop）
  │  ├─ 通过 → 存入数据库，更新进度
  │  ├─ 重新生成 → 回到步骤 [4]（最多 3 次）
  │  └─ 手动编辑 → 用户修改后存入数据库
  │
  ▼
[10] 章节检查 — 判断是否到达章节边界，若是则触发摘要生成
```

### 2.2 各步骤详细说明

#### 步骤 1：日记解析

| 项目 | 说明 |
|------|------|
| **目的** | 从用户自由文本中提取结构化事件和行为大类 |
| **输入** | `diaryText`（用户日记原文）、`behaviorTags`（用户选的行为标签，可能为空） |
| **输出** | `{ events: string[], detectedBehaviors: string[], keywords: string[] }` |
| **调用方式** | 通过 `AIAdapter.chat()` 调用，System Prompt 指示 AI 提取事件和分类行为 |
| **异常处理** | AI 调用失败 → 重试 1 次；仍失败 → 使用 `behaviorTags` 作为 fallback 直接进入步骤 2，`events` 为空则用日记原文前 100 字 |

**实现逻辑**：

```javascript
// DiaryParser.js
async parse(diaryText, behaviorTags) {
  const systemPrompt = `你是一个日记分析助手。请从用户日记中提取关键事件和行为分类。
输出 JSON 格式：
{
  "events": ["事件1", "事件2", ...],
  "detectedBehaviors": ["学习", "健身", ...],
  "keywords": ["用于RAG检索的关键词1", "关键词2", ...]
}
行为大类限定为：学习、工作、健身、社交、休息、娱乐、其他
keywords 提取与世界观相关的词汇，用于后续档案检索。`;

  const result = await this.adapter.chat({
    apiKey: this.apiKey,
    baseUrl: this.baseUrl,
    systemPrompt,
    userPrompt: `用户日记：${diaryText}\n用户选的标签：${behaviorTags.join(', ')}`,
    temperature: 0.3,
    maxTokens: 500
  });

  if (!result.success) {
    // 降级：直接用用户标签，不提取事件
    return {
      events: [],
      detectedBehaviors: behaviorTags,
      keywords: []
    };
  }

  try {
    return JSON.parse(result.content);
  } catch {
    // JSON 解析失败，降级处理
    return {
      events: [],
      detectedBehaviors: behaviorTags,
      keywords: []
    };
  }
}
```

#### 步骤 2：映射匹配

| 项目 | 说明 |
|------|------|
| **目的** | 将行为大类映射为世界观内行为 |
| **输入** | `detectedBehaviors`（步骤 1 输出）、`MappingRule[]`（从 WorldRepository 获取） |
| **输出** | `mappingDesc`（JSON 字符串，记录每个行为→世界观行为的映射） |
| **调用方式** | 纯本地逻辑，不调用 AI。通过关键词匹配 `mappings.json` 中的规则 |
| **异常处理** | 无匹配规则 → 使用"其他"分类的默认映射 |

**实现逻辑**：

```javascript
// MappingEngine.js
async map(behaviors, mappingRules) {
  const mappings = [];
  for (const behavior of behaviors) {
    const rule = mappingRules.find(r => r.behavior === behavior)
              || mappingRules.find(r => r.behavior === '其他');
    if (rule) {
      mappings.push({
        behavior: rule.behavior,
        worldBehavior: rule.world_behavior,
        description: rule.description
      });
    }
  }
  return JSON.stringify(mappings);
}
```

#### 步骤 3：上下文组装

| 项目 | 说明 |
|------|------|
| **目的** | 拼装三层记忆 + 当日映射结果 + 章节阶段指令，形成完整 Prompt |
| **输入** | 当天日记、映射结果、当前天数/章节、用户设置、各 Repository 数据 |
| **输出** | `{ systemPrompt: string, userPrompt: string }` |
| **调用方式** | 调用 `PromptBuilder.build()` 方法，内部调用三层记忆提供器 |
| **异常处理** | 记忆获取失败 → 跳过该层，用空字符串填充；不阻断生成流程 |

**实现逻辑**：

```javascript
// StoryEngine.js 中的上下文组装步骤
async _assembleContext(diaryText, mappingDesc, dayNumber, parsedResult) {
  const user = await this.userRepo.get();
  const chapter = await this.chapterRepo.getCurrent();
  const outlineNodes = await this.worldRepo.getOutlineNodes(
    user.world_id, chapter.chapter_number
  );

  // 三层记忆（并行获取，提高效率）
  const [immediateCtx, summaryMemory, ragResults] = await Promise.allSettled([
    this.immediateContext.get(dayNumber),
    this.summaryMemory.getAll(),
    this.ragRetriever.retrieve(parsedResult.keywords, user.world_id, user.path_id)
  ]);

  // 奇遇检测
  const encounter = await this.encounterEngine.checkAndTrigger(dayNumber, user);

  // 拼装 Prompt
  return this.promptBuilder.build({
    heroName: user.hero_name,
    currentDay: dayNumber,
    chapterNumber: chapter.chapter_number,
    chapterTitle: chapter.title,
    chapterPurpose: this._getChapterPurpose(chapter),
    outlineContent: outlineNodes.map(n => n.content).join('\n'),
    branchGuidance: this._getBranchGuidance(outlineNodes, dayNumber),
    summaries: summaryMemory.status === 'fulfilled' ? summaryMemory.value : [],
    ragResults: ragResults.status === 'fulfilled' ? ragResults.value : [],
    immediateContext: immediateCtx.status === 'fulfilled' ? immediateCtx.value : [],
    rawText: diaryText,
    mappingDesc: mappingDesc,
    encounterContent: encounter ? encounter.content : null,
    isRegenerate: false
  });
}
```

#### 步骤 4：初稿生成

| 项目 | 说明 |
|------|------|
| **目的** | 调用 AI 生成小说段落初稿 |
| **输入** | 步骤 3 组装的 `{ systemPrompt, userPrompt }`、用户 AI 设置（temperature、maxTokens） |
| **输出** | `generatedContent`（AI 生成的小说段落文本） |
| **调用方式** | 通过 `AIAdapter.chat()` 调用 |
| **异常处理** | 见第九章错误处理。Key 问题 → 返回 E001/E002；频率限制 → 等待 5 秒重试；网络 → 返回 E006；超时 → 返回 E005 |

**实现逻辑**：

```javascript
const generateResult = await this.adapter.chat({
  apiKey,
  baseUrl,
  systemPrompt: context.systemPrompt,
  userPrompt: context.userPrompt,
  temperature: user.ai_temperature,
  maxTokens: user.ai_max_tokens
});

if (!generateResult.success) {
  return {
    success: false,
    error: generateResult.error,
    errorCode: this._mapApiError(generateResult.error)
  };
}
let currentDraft = generateResult.content;
```

#### 步骤 5：审查轮 1

| 项目 | 说明 |
|------|------|
| **目的** | 审查初稿的世界观一致性、行为映射正确性、逻辑矛盾 |
| **输入** | `currentDraft`（初稿）、系统 Prompt、审查标准 |
| **输出** | `{ passed: boolean, issues: string[], suggestions: string, revisedContent: string }` |
| **调用方式** | 通过 `ReviewLoop.review()` 调用 AI 审查 + 修改 |
| **异常处理** | 审查 AI 调用失败 → 跳过审查，直接进入轮 2（视为通过）；最多内部重试 2 次 |

#### 步骤 6：审查轮 2

| 项目 | 说明 |
|------|------|
| **目的** | 审查修改稿是否引入新问题、前后文衔接、叙事流畅性 |
| **输入** | 轮 1 的修改稿、系统 Prompt |
| **输出** | 同轮 1 的结构 |
| **调用方式** | 通过 `ReviewLoop.review()` 调用 |
| **异常处理** | 审查 AI 调用失败 → 跳过，直接进入润色；最多内部重试 1 次 |

#### 步骤 7：润色轮（可选）

| 项目 | 说明 |
|------|------|
| **目的** | 最终润色，确保文风统一、节奏感、伏笔回收 |
| **输入** | 轮 2 的修改稿 |
| **输出** | 润色后的最终版本 |
| **调用方式** | 通过 `AIAdapter.chat()` 调用 |
| **异常处理** | 润色失败 → 使用轮 2 的修改稿作为最终版本；润色为可选步骤，失败不影响主流程 |

#### 步骤 8：输出预览

| 项目 | 说明 |
|------|------|
| **目的** | 将最终版本写入数据库，状态置为 `draft_ready`，返回给前端展示 |
| **输入** | 最终版本内容、segmentId |
| **输出** | `GenerateResult`（返回给前端） |
| **调用方式** | 调用 `SegmentRepository.updateContent()` + `updateStatus('draft_ready')` |
| **异常处理** | 数据库写入失败 → 返回 E009，内容仍保存在内存中 |

#### 步骤 9：用户审核（Human-in-the-Loop）

| 项目 | 说明 |
|------|------|
| **目的** | 用户对预览内容做出决策 |
| **输入** | 用户操作（通过/重生成/编辑） |
| **输出** | 触发 `finalize()` / `regenerate()` / `saveEdit()` |
| **调用方式** | 前端调用 StoryEngine 的对应方法 |
| **异常处理** | 重生成达 3 次 → 前端禁用按钮；编辑内容为空 → 前端校验拦截 |

#### 步骤 10：章节检查

| 项目 | 说明 |
|------|------|
| **目的** | 判断是否到达章节边界，若是则触发摘要生成和新章节创建 |
| **输入** | `current_day`、当前章节的 `end_day` |
| **输出** | `{ chapterCompleted: boolean, chapterSummary?: string }` |
| **调用方式** | 在 `finalize()` 内部调用，定稿后自动执行 |
| **异常处理** | 摘要生成失败 → 章节仍标记完成，摘要为空字符串，下次启动时补生成 |

**实现逻辑**：

```javascript
async _checkChapterBoundary(dayNumber) {
  const chapter = await this.chapterRepo.getCurrent();
  if (dayNumber >= chapter.end_day) {
    // 章节完成
    const segments = await this.segmentRepo.getByChapter(chapter.id);
    const fullContent = segments.map(s => s.content).join('\n\n');

    let summary = '';
    try {
      summary = await this.summaryGenerator.generate(fullContent);
    } catch (e) {
      // 摘要生成失败，不阻断流程
      console.warn('摘要生成失败，稍后补生成');
    }

    await this.chapterRepo.update(chapter.id, {
      status: 'completed',
      content: fullContent,
      summary: summary,
      completed_at: new Date().toISOString()
    });

    // 创建下一章（如果还有下一章）
    const nextChapterNumber = chapter.chapter_number + 1;
    const nextChapter = await this.chapterRepo.getByNumber(nextChapterNumber);
    if (!nextChapter && nextChapterNumber <= 5) {
      await this._createNextChapter(nextChapterNumber);
    }

    return { chapterCompleted: true, chapterSummary: summary };
  }
  return { chapterCompleted: false };
}
```

---

## 三、StoryEngine 实现指南

### 3.1 StoryEngine 接口定义

StoryEngine 是前端工程师和 AI 工程师之间的唯一接口边界（接口 A）。以下接口定义与角色分工总览完全一致，AI 工程师必须严格实现。

```typescript
interface StoryEngine {
  // 生成故事段落（主流程）
  generateStory(params: {
    diaryText: string;          // 用户日记原文
    behaviorTags: string[];     // 行为大类标签
    dayNumber: number;          // 第几天
  }): Promise<GenerateResult>;

  // 重新生成（用户点击"重新生成"）
  regenerate(segmentId: number): Promise<GenerateResult>;

  // 确认定稿（用户点击"通过"）
  finalize(segmentId: number): Promise<FinalizeResult>;

  // 保存手动编辑（用户点击"编辑"后保存）
  saveEdit(segmentId: number, content: string): Promise<FinalizeResult>;

  // 获取生成状态（轮询用）
  getStatus(segmentId: number): Promise<SegmentStatus>;
}

interface GenerateResult {
  success: boolean;
  segmentId?: number;       // 生成的段落 ID
  content?: string;         // AI 生成的小说段落
  mappingDesc?: string;     // 映射说明（JSON 字符串）
  error?: string;           // 错误信息
  errorCode?: string;       // 错误码（E001-E014）
}

interface FinalizeResult {
  success: boolean;
  dayCompleted: number;      // 完成的天数
  chapterCompleted: boolean; // 是否完成了章节
  chapterSummary?: string;  // 章节摘要（如果章节完成）
  storyEnded: boolean;      // 故事是否完结
  error?: string;
}

type SegmentStatus =
  | 'pending' | 'parsing' | 'generating'
  | 'draft_ready' | 'regenerating' | 'editing'
  | 'finalized' | 'generate_failed';
```

### 3.2 StoryEngine 类构造与依赖注入

StoryEngine 通过构造函数注入所有依赖（Repository 和 AI 编排组件），便于测试和 Mock 替换：

```javascript
// src/core/StoryEngine.js

class StoryEngine {
  constructor({
    userRepo,        // UserRepository（接口 B）
    diaryRepo,       // DiaryRepository（接口 B）
    chapterRepo,     // ChapterRepository（接口 B）
    segmentRepo,     // SegmentRepository（接口 B）
    worldRepo,       // WorldRepository（接口 B）
    adapterFactory,  // AIAdapter 工厂函数
    promptBuilder,   // PromptBuilder 实例
    reviewLoop,      // ReviewLoop 实例
    summaryGenerator,// SummaryGenerator 实例
    immediateContext,// ImmediateContext 实例
    summaryMemory,   // SummaryMemory 实例
    ragRetriever,    // RAGRetriever 实例
    encounterEngine, // EncounterEngine 实例
    diaryParser,     // DiaryParser 实例
    mappingEngine,   // MappingEngine 实例
  }) {
    this.userRepo = userRepo;
    this.diaryRepo = diaryRepo;
    this.chapterRepo = chapterRepo;
    this.segmentRepo = segmentRepo;
    this.worldRepo = worldRepo;
    this.adapterFactory = adapterFactory;
    this.promptBuilder = promptBuilder;
    this.reviewLoop = reviewLoop;
    this.summaryGenerator = summaryGenerator;
    this.immediateContext = immediateContext;
    this.summaryMemory = summaryMemory;
    this.ragRetriever = ragRetriever;
    this.encounterEngine = encounterEngine;
    this.diaryParser = diaryParser;
    this.mappingEngine = mappingEngine;

    // 并发锁
    this._generatingLock = false;
    this._currentSegmentId = null;
  }

  // ===== 私有：获取 AI 适配器 =====
  async _getAdapter() {
    const user = await this.userRepo.get();
    const AdapterClass = this.adapterFactory(user.ai_provider);
    return new AdapterClass();
  }

  // ===== 私有：获取解密后的 API Key =====
  async _getApiKey() {
    const user = await this.userRepo.get();
    // 实际解密由前端工程师的 Crypto.js 实现
    // AI 工程师通过 userRepo 获取的 api_key_encrypted 已解密
    // 或通过约定的 getDecryptedApiKey() 方法获取
    return user.api_key_encrypted; // 实际项目中此处为解密后的 Key
  }
}
```

### 3.3 generateStory 方法实现

这是主流程方法，对应 10 步生成流程的步骤 1-8。

```javascript
async generateStory({ diaryText, behaviorTags, dayNumber }) {
  // 0. 并发检查
  if (this._generatingLock) {
    return {
      success: false,
      error: '已有生成任务进行中，请等待完成',
      errorCode: null
    };
  }
  this._generatingLock = true;

  try {
    const user = await this.userRepo.get();
    const chapter = await this.chapterRepo.getCurrent();
    const adapter = await this._getAdapter();
    const apiKey = await this._getApiKey();
    const baseUrl = user.ai_base_url;

    // 1. 创建日记记录
    const diaryId = await this.diaryRepo.create({
      day_number: dayNumber,
      raw_text: diaryText,
      behavior_tags: behaviorTags,
      is_blank_day: false
    });

    // 2. 创建段落记录，状态置为 parsing
    const segmentId = await this.segmentRepo.create({
      day_number: dayNumber,
      chapter_id: chapter.id,
      diary_id: diaryId,
      status: 'parsing'
    });
    this._currentSegmentId = segmentId;

    // 3. 步骤1：日记解析
    const parsed = await this.diaryParser.parse(diaryText, behaviorTags);

    // 4. 步骤2：映射匹配
    const mappingRules = await this.worldRepo.getMappings(user.world_id);
    const mappingDesc = await this.mappingEngine.map(
      parsed.detectedBehaviors, mappingRules
    );
    await this.segmentRepo.updateMapping(segmentId, mappingDesc);

    // 5. 步骤3：上下文组装
    const context = await this._assembleContext(
      diaryText, mappingDesc, dayNumber, parsed
    );

    // 6. 状态置为 generating
    await this.segmentRepo.updateStatus(segmentId, 'generating');

    // 7. 步骤4：初稿生成
    const generateResult = await adapter.chat({
      apiKey,
      baseUrl,
      systemPrompt: context.systemPrompt,
      userPrompt: context.userPrompt,
      temperature: user.ai_temperature,
      maxTokens: user.ai_max_tokens
    });

    if (!generateResult.success) {
      await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
      return {
        success: false,
        segmentId,
        error: generateResult.error,
        errorCode: this._mapApiError(generateResult.error)
      };
    }

    let currentDraft = generateResult.content;

    // 8. 步骤5-6：审查循环（2-3 轮）
    const reviewResult = await this.reviewLoop.run(
      currentDraft,
      context.systemPrompt,
      adapter,
      apiKey,
      baseUrl,
      { temperature: 0.3, maxTokens: 1500 }
    );

    currentDraft = reviewResult.finalContent;
    await this.segmentRepo.update(segmentId, {
      internal_review_count: reviewResult.totalRounds
    });

    // 9. 步骤7：润色（可选）
    if (reviewResult.passed) {
      const polishResult = await this._polish(
        currentDraft, adapter, apiKey, baseUrl, user
      );
      if (polishResult.success) {
        currentDraft = polishResult.content;
      }
      // 润色失败不影响主流程，使用审查后的版本
    }

    // 10. 步骤8：写入数据库，状态置为 draft_ready
    await this.segmentRepo.updateContent(segmentId, currentDraft);
    await this.segmentRepo.updateStatus(segmentId, 'draft_ready');

    return {
      success: true,
      segmentId,
      content: currentDraft,
      mappingDesc
    };

  } catch (error) {
    // 未知异常处理
    if (this._currentSegmentId) {
      try {
        await this.segmentRepo.updateStatus(
          this._currentSegmentId, 'generate_failed'
        );
      } catch (_) { /* 忽略二次错误 */ }
    }
    return {
      success: false,
      error: error.message || '生成过程中发生未知错误',
      errorCode: 'E007'
    };
  } finally {
    this._generatingLock = false;
    this._currentSegmentId = null;
  }
}
```

### 3.4 regenerate 方法实现

用户点击"重新生成"时调用。使用相同日记重新生成，但在 Prompt 中加入"请生成与之前不同版本"的指令。

```javascript
async regenerate(segmentId) {
  const segment = await this.segmentRepo.getById(segmentId);
  if (!segment) {
    return { success: false, error: '段落不存在', errorCode: null };
  }

  // 检查重生成次数上限（3 次）
  if (segment.revision_count >= 3) {
    return {
      success: false,
      error: '已达重生成上限（3次），可手动编辑',
      errorCode: null
    };
  }

  // 状态置为 regenerating
  await this.segmentRepo.updateStatus(segmentId, 'regenerating');
  await this.segmentRepo.incrementRevision(segmentId);

  // 获取原始日记
  const diary = await this.diaryRepo.getByDay(segment.day_number);
  if (!diary) {
    return { success: false, error: '找不到原始日记', errorCode: null };
  }

  const behaviorTags = JSON.parse(diary.behavior_tags || '[]');

  // 重新走生成流程，但 isRegenerate=true
  // 关键差异：Prompt 中加入"请生成与之前不同的版本"指令
  const user = await this.userRepo.get();
  const chapter = await this.chapterRepo.getCurrent();
  const adapter = await this._getAdapter();
  const apiKey = await this._getApiKey();

  // 复用解析结果（不重新解析日记，节省一次 AI 调用）
  const parsed = await this.diaryParser.parse(diary.raw_text, behaviorTags);
  const mappingRules = await this.worldRepo.getMappings(user.world_id);
  const mappingDesc = await this.mappingEngine.map(
    parsed.detectedBehaviors, mappingRules
  );

  // 组装上下文，标记为重生成
  const context = await this._assembleContext(
    diary.raw_text, mappingDesc, segment.day_number, parsed
  );
  // 在 userPrompt 末尾追加重生成指令
  context.userPrompt += '\n\n【重要】这是重新生成请求，请生成一个与之前版本完全不同的剧情走向和表达方式，但保持世界观和行为映射一致。';

  await this.segmentRepo.updateStatus(segmentId, 'generating');

  const generateResult = await adapter.chat({
    apiKey,
    baseUrl: user.ai_base_url,
    systemPrompt: context.systemPrompt,
    userPrompt: context.userPrompt,
    temperature: Math.min(user.ai_temperature + 0.2, 2.0), // 重生成时提高温度增加多样性
    maxTokens: user.ai_max_tokens
  });

  if (!generateResult.success) {
    await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
    return {
      success: false,
      segmentId,
      error: generateResult.error,
      errorCode: this._mapApiError(generateResult.error)
    };
  }

  // 审查循环
  const reviewResult = await this.reviewLoop.run(
    generateResult.content,
    context.systemPrompt,
    adapter, apiKey, user.ai_base_url,
    { temperature: 0.3, maxTokens: 1500 }
  );

  let finalContent = reviewResult.finalContent;

  // 润色
  if (reviewResult.passed) {
    const polishResult = await this._polish(
      finalContent, adapter, apiKey, user.ai_base_url, user
    );
    if (polishResult.success) {
      finalContent = polishResult.content;
    }
  }

  await this.segmentRepo.updateContent(segmentId, finalContent);
  await this.segmentRepo.updateStatus(segmentId, 'draft_ready');

  return {
    success: true,
    segmentId,
    content: finalContent,
    mappingDesc
  };
}
```

### 3.5 finalize 方法实现

用户点击"确认通过"时调用。将段落定稿，更新进度，检查章节边界。

```javascript
async finalize(segmentId) {
  const segment = await this.segmentRepo.getById(segmentId);
  if (!segment) {
    return { success: false, error: '段落不存在', storyEnded: false };
  }

  if (segment.status !== 'draft_ready') {
    return {
      success: false,
      error: '当前段落状态不允许定稿',
      storyEnded: false
    };
  }

  // 1. 标记定稿
  await this.segmentRepo.markFinalized(segmentId);

  // 2. 更新进度
  const user = await this.userRepo.get();
  const newDay = segment.day_number; // 当前完成的天数
  await this.userRepo.update({ current_day: newDay });

  // 3. 更新章节内容（追加段落）
  const chapter = await this.chapterRepo.getByNumber(segment.chapter_id);
  // chapter_id 存的是章节 id，需要获取对应 chapter
  const currentChapter = await this.chapterRepo.getCurrent();
  const existingContent = currentChapter.content || '';
  await this.chapterRepo.updateContent(
    currentChapter.id,
    existingContent + '\n\n' + segment.content
  );

  // 4. 步骤10：章节边界检查
  const boundaryResult = await this._checkChapterBoundary(newDay);

  // 5. 故事完结检查
  let storyEnded = false;
  if (newDay >= user.duration_days) {
    storyEnded = true;
    await this.userRepo.update({ story_started: false });
    // 生成终章总结
    await this._generateFinale();
  }

  return {
    success: true,
    dayCompleted: newDay,
    chapterCompleted: boundaryResult.chapterCompleted,
    chapterSummary: boundaryResult.chapterSummary,
    storyEnded
  };
}
```

### 3.6 saveEdit 方法实现

用户手动编辑后保存时调用。

```javascript
async saveEdit(segmentId, content) {
  const segment = await this.segmentRepo.getById(segmentId);
  if (!segment) {
    return { success: false, error: '段落不存在', storyEnded: false };
  }

  if (!content || content.trim().length === 0) {
    return { success: false, error: '内容不能为空', storyEnded: false };
  }

  // 1. 更新内容
  await this.segmentRepo.updateContent(segmentId, content.trim());
  // 2. 标记为已编辑
  await this.segmentRepo.markEdited(segmentId);
  // 3. 标记定稿
  await this.segmentRepo.markFinalized(segmentId);

  // 4. 更新进度（与 finalize 相同）
  const user = await this.userRepo.get();
  const newDay = segment.day_number;
  await this.userRepo.update({ current_day: newDay });

  // 5. 更新章节内容
  const currentChapter = await this.chapterRepo.getCurrent();
  const existingContent = currentChapter.content || '';
  await this.chapterRepo.updateContent(
    currentChapter.id,
    existingContent + '\n\n' + content.trim()
  );

  // 6. 章节边界检查
  const boundaryResult = await this._checkChapterBoundary(newDay);

  // 7. 故事完结检查
  let storyEnded = false;
  if (newDay >= user.duration_days) {
    storyEnded = true;
    await this.userRepo.update({ story_started: false });
    await this._generateFinale();
  }

  return {
    success: true,
    dayCompleted: newDay,
    chapterCompleted: boundaryResult.chapterCompleted,
    chapterSummary: boundaryResult.chapterSummary,
    storyEnded
  };
}
```

### 3.7 getStatus 方法实现

前端轮询生成状态时调用。

```javascript
async getStatus(segmentId) {
  const segment = await this.segmentRepo.getById(segmentId);
  if (!segment) {
    return 'pending';
  }
  return segment.status;
}
```

### 3.8 故事段落状态机

每个 `story_segment` 在生命周期中经历以下 8 个状态。状态流转由 StoryEngine 的方法触发：

```
                        generateStory()
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    ▼                                          │
              ┌──────────┐    开始解析    ┌──────────┐         │
              │ pending  │ ───────────► │ parsing  │         │
              └──────────┘               └────┬─────┘         │
                                               │ 解析完成       │
                                               ▼               │
                                         ┌─────────────┐      │
                                         │ generating  │      │
                                         └─────┬───┬───┘      │
                                   生成成功      │   │ 生成失败   │
                                    ┌──────────┘   └────────┐ │
                                    ▼                       ▼ │
                              ┌────────────┐         ┌─────────────────┐
                              │ draft_ready│         │ generate_failed │
                              └──┬──┬──┬───┘         └────────┬────────┘
                    finalize()  │  │  │ regenerate()        │ 用户手动重试
                                 │  │  │                     │
                    ┌────────────┘  │  └──────────┐          │
                    │       saveEdit()            │          │
                    │               │             │          │
                    │     ┌─────────▼──┐  ┌───────▼──────┐   │
                    │     │  editing   │  │ regenerating │   │
                    │     └─────┬──────┘  └──────┬───────┘   │
                    │    saveEdit()      回到 generating      │
                    │           │              │             │
                    ▼           ▼              ▼             │
              ┌──────────┐  ┌──────────┐  重新生成成功/失败     │
              │ finalized│  │ finalized│  → draft_ready /     │
              │ (终态)    │  │ (终态)    │    generate_failed  │
              └──────────┘  └──────────┘                      │
                                                               │
                              generate_failed → generating ────┘
                              （用户手动重试时）
```

**状态流转条件表**：

| 当前状态 | 触发条件 | 目标状态 | 触发方法 |
|---------|---------|---------|---------|
| `pending` | generateStory() 开始执行 | `parsing` | generateStory |
| `parsing` | 日记解析完成，开始组装 Prompt | `generating` | generateStory |
| `generating` | AI 生成 + 审查循环全部完成 | `draft_ready` | generateStory |
| `generating` | AI 生成失败（重试耗尽） | `generate_failed` | generateStory |
| `draft_ready` | 用户点击"确认通过" | `finalized` | finalize |
| `draft_ready` | 用户点击"重新生成" | `regenerating` → `generating` | regenerate |
| `draft_ready` | 用户点击"编辑" | `editing` | 前端 UI 状态 |
| `regenerating` | 重新生成完成 | `draft_ready` | regenerate |
| `regenerating` | 重新生成失败 | `generate_failed` | regenerate |
| `editing` | 用户保存编辑 | `finalized` | saveEdit |
| `generate_failed` | 用户手动点击重试 | `generating` | generateStory |
| `finalized` | — （终态） | — | — |

**状态机实现要点**：
- 每次状态变更都必须通过 `SegmentRepository.updateStatus()` 写入数据库。
- `finalized` 是终态，不可回退。如需修改已定稿内容，需通过数据管理页重置。
- `generate_failed` 状态下，用户可通过前端"重试"按钮重新触发 `generateStory()`，此时复用已有 segmentId。
- 并发锁保证同一时间只有一个段落处于 `generating` 状态。

---

## 四、Prompt 模板系统

### 4.1 Prompt 分层与组装顺序

每次故事生成调用的完整 Prompt 由以下 8 层按顺序组装，前 1-2 层放入 System Prompt，3-8 层放入 User Prompt：

```
[System Prompt]
  ├── [1] 系统 Prompt — 世界观基础 + 文风要求 + 输出格式（固定）
  └── [2] 章节阶段指令 — 当前章节的剧情指导（半固定）

[User Prompt]
  ├── [3] 摘要记忆 — 已完成章节的摘要（动态）
  ├── [4] 档案记忆 — RAG 检索到的世界观设定（动态）
  ├── [5] 即时上下文 — 近 3 天剧情原文（动态）
  ├── [6] 当日日记 + 映射结果 — 用户输入和映射后的世界观行为（动态）
  ├── [7] 奇遇注入 — 当日触发的随机奇遇（动态，可选）
  └── [8] 生成指令 — 具体生成要求（固定）
```

### 4.2 八种 Prompt 模板完整文本

#### 模板 1：系统 Prompt（System Prompt）

此模板固定不变，放入 System Prompt 的第一部分。变量 `{hero_name}` 在运行时替换。

```
你是一位精通《诡秘之主》世界观的资深小说作家。你正在为用户创作一部以用户为主角的连载小说。

【世界观基础设定】
- 这是一个维多利亚时代风格的架空世界，存在非凡者和非凡特性。
- 世界共有 22 条神之途径，每条途径有 10 个等级（序列 9 到序列 0），序列 9 最弱，序列 0 相当于真神。
- 普通人无法感知非凡现象，世界大多数人不了解非凡者的存在。
- 服用对应魔药可以晋升序列，但魔药可能带来精神污染和失控风险。
- 主角当前途径：占卜家（序列 9）。
- 占卜家序列 9 的能力：灵视（看见灵体和非凡特性）、基础占卜（使用星象、塔罗牌等进行简单预测）、星象观测。
- 塔罗会是一个秘密的非凡者组织，成员以塔罗牌代号相称，定期举行"雾之上"的聚会。

【文风要求】
- 使用第三人称叙事，以主角名"{hero_name}"称呼主角，不要使用"你"或"我"。
- 整体风格为诡秘、悬疑、克苏鲁风格，带有维多利亚时代的氛围。
- 叙事节奏沉稳，善用伏笔和反转，营造神秘感和不可名状的恐惧。
- 每段故事 800-1200 字，包含场景描写、心理活动和对话。
- 保持连载小说的节奏感，每段结尾留下适当的悬念和期待感。
- 对话使用中文引号「」，环境描写注重氛围营造。
- 避免使用现代网络用语，保持时代感。

【输出格式】
- 直接输出小说正文，不要输出任何解释、元信息或注释。
- 不要输出标题或章节名，直接从正文第一句开始。
- 不要输出字数统计或任何 AI 辅助生成的痕迹。
- 如果需要分段，使用空行分隔。
```

#### 模板 2：章节阶段指令

此模板半固定，根据当前章节动态填充。放入 System Prompt 的第二部分。

```
【当前故事进度】
- 第 {current_day} 天 / 共 90 天
- 当前章节：第 {chapter_number} 章「{chapter_title}」
- 章节定位：{chapter_purpose}

【本章剧情指导】
{outline_content}

【当前阶段剧情方向】
{branch_guidance}

{chapter_transition_hint}
```

**变量说明**：
- `{current_day}`：当前天数，如 7
- `{chapter_number}`：章节号，如 1
- `{chapter_title}`：章节标题，如"第一章"
- `{chapter_purpose}`：章节定位，如"适应与探索，建立基础，加入塔罗会"
- `{outline_content}`：当前章节的大纲节点内容，多个节点用换行连接
- `{branch_guidance}`：当前阶段的分支引导，如"主角正在考虑是否加入塔罗会"
- `{chapter_transition_hint}`：章节切换提示，新章节第一天时填入"本章为新章节的开始，请自然引出本章主题，做好与上一章的衔接。"，否则为空字符串

#### 模板 3：摘要记忆

此模板动态生成，放入 User Prompt 的第一部分。根据已完成的章节数量动态拼接。

```
【前情提要（之前章节摘要）】

{chapter_summaries}
```

其中 `{chapter_summaries}` 按章节顺序拼接，每章格式如下：

```
序章摘要：{chapter_0_summary}

第一章摘要：{chapter_1_summary}

第二章摘要：{chapter_2_summary}
```

如果没有任何已完成章节（第 1 天），则此部分为：

```
【前情提要】
（这是故事的开端，尚无前情摘要。）
```

#### 模板 4：档案记忆（RAG 检索结果）

此模板动态生成，放入 User Prompt 的第二部分。由 RAGRetriever 检索到的 Top 5 世界观设定条目拼接。

```
【相关世界观设定（供参考，确保剧情符合设定）】

{rag_entries}
```

其中 `{rag_entries}` 按 category 分类拼接，每条格式如下：

```
【途径】{path_setting}

【力量体系】{power_system_setting}

【地点】{location_setting}

【人物】{character_setting}

【背景知识】{lore_setting}
```

每个 category 下可能有多个条目，用换行分隔。如果某个 category 无检索结果则跳过该分类。

#### 模板 5：即时上下文

此模板动态生成，放入 User Prompt 的第三部分。由 ImmediateContext 获取最近 3 天的剧情原文。

```
【最近故事原文（请保持剧情衔接）】

{recent_segments}
```

其中 `{recent_segments}` 按天数倒序拼接，格式如下：

```
━━━ 第 {day_minus_2} 天 ━━━
{content_day_minus_2}

━━━ 第 {day_minus_1} 天 ━━━
{content_day_minus_1}

━━━ 第 {day_minus_0} 天（昨日）━━━
{content_day_minus_0}
```

如果是第 1 天（无历史段落），则此部分为：

```
【最近故事原文】
（这是故事的第一天，尚无历史剧情。请从主角觉醒开始叙述。）
```

如果只有 1-2 天历史，则只展示已有的天数。

#### 模板 6：当日日记 + 映射结果

此模板动态生成，放入 User Prompt 的第四部分。

```
【今日主角的真实经历（已映射为世界观行为）】

用户日记原文：
{raw_text}

行为映射结果：
{mapping_lines}

请根据以上映射结果，将今日经历自然融入主角的故事中。不要生硬地照搬映射结果，而是将其作为剧情素材进行文学化创作。
```

其中 `{mapping_lines}` 由映射结果生成，每行一条：

```
- {behavior_1} → {world_behavior_1}（{description_1}）
- {behavior_2} → {world_behavior_2}（{description_2}）
```

示例：
```
- 学习 → 研读神秘学典籍（将学习行为映射为研读神秘学相关书籍或向导师求教）
- 健身 → 体能与战斗训练（将健身行为映射为保持非凡者身体素质的体能训练）
```

#### 模板 7：奇遇注入

此模板动态生成，仅当当日触发奇遇时加入。放入 User Prompt 的第五部分。

```
【今日额外事件（随机奇遇）】

奇遇标题：{encounter_title}
奇遇内容：{encounter_content}

请将此事件自然融入今日剧情中，作为当天故事的一个额外情节节点。不要让奇遇事件喧宾夺主，应与日记映射的主线剧情有机结合。奇遇可能引入新的 NPC、线索或物品，为后续剧情埋下伏笔。
```

其中 `{encounter_content}` 是奇遇模板渲染后的内容（`{hero_name}` 已替换为实际主角名）。

如果当日未触发奇遇，则此部分完全省略，不输出任何内容。

#### 模板 8：生成指令

此模板固定不变，放入 User Prompt 的最后一部分。

```
【生成要求】

请生成今日（第 {current_day} 天）的故事段落。具体要求：
1. 将今日经历映射为世界观内的行为，自然融入连续剧情中。
2. 与最近 3 天的故事自然衔接，保持时间和情节的连贯性。
3. 符合当前章节（第 {chapter_number} 章）的剧情走向和定位。
4. 字数控制在 800-1200 字。
5. 如有奇遇事件，将其自然融入今日剧情。
6. 保持悬念和连载感，结尾留下适当的期待。
7. 推进主角的成长或剧情发展，不要原地踏步。
8. 严格遵守系统 Prompt 中的世界观设定，不创造与设定矛盾的内容。
{regenerate_hint}
```

其中 `{regenerate_hint}` 在重新生成时填入：

```
9. 【重要】这是重新生成请求，请生成一个与之前版本完全不同的剧情走向和表达方式，但保持世界观和行为映射一致。
```

首次生成时 `{regenerate_hint}` 为空字符串。

### 4.3 审查 Prompt

审查循环器内部使用的 Prompt，要求 AI 输出 JSON 格式的审查结果。

#### 审查 Prompt 完整文本（轮次 1）

```
你是一位严格的小说编辑，精通《诡秘之主》世界观。请审查以下小说段落，从以下维度进行评估：

【审查维度】
1. 世界观一致性：是否有不符合《诡秘之主》设定的内容？（如出现不存在的途径、错误的能力描述、不符合时代背景的元素等）
2. 行为映射正确性：用户日常行为是否被正确映射到世界观行为？映射是否合理自然？
3. 逻辑矛盾：是否有前后矛盾的情节？角色行为是否符合其设定？
4. 文风一致性：是否符合诡秘悬疑风格？是否有出戏的表达？
5. 衔接性：是否与前 3 天的剧情自然衔接？时间线是否连贯？
6. 节奏感：是否有适当的悬念和起伏？是否推进了剧情？

【待审查段落】
{generated_content}

【审查标准】
- 如果存在任何世界观设定错误或逻辑矛盾，判定为不通过。
- 如果文风严重偏离或衔接生硬，判定为不通过。
- 如果仅有轻微瑕疵（如个别用词不够准确），可判定为通过但在建议中指出。

请输出严格的 JSON 格式（不要输出其他任何内容）：
{
  "passed": true或false,
  "issues": ["问题1的详细描述", "问题2的详细描述"],
  "severity": "high"或"medium"或"low",
  "suggestions": "针对问题的具体修改建议，如果不通过则必须给出修改方向",
  "revised_content": "如果不通过，请在此字段中输出修改后的完整段落；如果通过，此字段为空字符串"
}
```

#### 审查 Prompt 完整文本（轮次 2）

```
你是一位严格的小说编辑，精通《诡秘之主》世界观。这是第二轮审查，请重点检查以下维度：

【第二轮审查重点】
1. 修改是否引入了新问题：上一轮修改后是否有新的逻辑矛盾或设定错误？
2. 前后文衔接：修改部分与未修改部分的衔接是否自然？
3. 叙事流畅性：整体阅读体验是否流畅？有无突兀的转折？
4. 重复第二轮审查维度1-6的基础检查。

【上一轮审查发现的问题】
{previous_issues}

【待审查段落（修改稿）】
{generated_content}

请输出严格的 JSON 格式（不要输出其他任何内容）：
{
  "passed": true或false,
  "issues": ["仍存在的问题或新引入的问题"],
  "severity": "high"或"medium"或"low",
  "suggestions": "修改建议",
  "revised_content": "如果不通过，输出修改后的完整段落；如果通过，为空字符串"
}
```

### 4.4 摘要生成 Prompt

章节结束时生成摘要使用的 Prompt。

```
你是一位小说编辑。请为以下章节内容生成一段 200-300 字的剧情摘要。

【摘要要求】
1. 概括本章的核心事件和主要情节。
2. 标记关键转折点（如角色关系变化、能力提升、重要发现等）。
3. 记录人物关系的变化（新出场人物、关系发展等）。
4. 列出未解决的悬念和伏笔。
5. 语言精炼，使用叙述性语言，不要使用列表格式。
6. 字数严格控制在 200-300 字。

【章节内容】
{chapter_full_content}

请直接输出摘要正文，不要输出标题、字数统计或其他任何额外内容。
```

### 4.5 润色 Prompt

最终润色使用的 Prompt。

```
你是一位精通《诡秘之主》世界观的文学编辑。请对以下小说段落进行最终润色。

【润色要求】
1. 统一文风，确保整体风格为诡秘、悬疑、克苏鲁风格，带有维多利亚时代氛围。
2. 优化叙事节奏，确保有适当的起伏感和悬念。
3. 检查并回收或呼应前文埋下的伏笔（如有）。
4. 润色语言表达，使其更加文学化和沉浸感更强。
5. 不要改变核心情节和人物行为，仅做文风和表达层面的优化。
6. 保持字数在 800-1200 字范围内。
7. 不要添加新的情节或设定。

【待润色段落】
{content}

请直接输出润色后的完整段落，不要输出任何解释或说明。
```

### 4.6 日记解析 Prompt

日记解析步骤使用的 Prompt。

```
你是一个日记分析助手。请从用户的日记中提取关键事件和行为分类。

【分析要求】
1. events：提取用户日记中的具体事件（如"看了两小时书"、"去健身房练了一小时"）。
2. detectedBehaviors：将事件归类为行为大类，可选值：学习、工作、健身、社交、休息、娱乐、其他。可多选。
3. keywords：提取与世界观相关的关键词，用于后续档案检索。提取与神秘学、占卜、非凡者、塔罗会等主题相关的词汇，以及事件中的关键名词。

【行为大类说明】
- 学习：看书、上课、读书、复习、写作业、听课、研究
- 工作：上班、加班、开会、写报告、做项目
- 健身：运动、跑步、锻炼、游泳、打球
- 社交：聚会、聊天、见朋友、聚餐
- 休息：睡觉、午休、放松、发呆
- 娱乐：游戏、电影、音乐、逛街、旅游
- 其他：购物、做饭、打扫、通勤等日常琐事

请输出严格的 JSON 格式（不要输出其他任何内容）：
{
  "events": ["事件1", "事件2"],
  "detectedBehaviors": ["学习", "健身"],
  "keywords": ["关键词1", "关键词2"]
}
```

### 4.7 Prompt 拼装器实现

`PromptBuilder` 负责将 8 层模板组装成最终的 `{ systemPrompt, userPrompt }`。

```javascript
// src/ai/PromptBuilder.js

class PromptBuilder {
  constructor() {
    // 系统 Prompt 模板（固定部分）
    this.SYSTEM_PROMPT_TEMPLATE = `你是一位精通《诡秘之主》世界观的资深小说作家。...（完整模板1文本）`;
    
    this.CHAPTER_STAGE_TEMPLATE = `【当前故事进度】\n- 第 {current_day} 天 / 共 90 天\n...`;
    
    // User Prompt 各层模板
    this.SUMMARY_MEMORY_TEMPLATE = `【前情提要（之前章节摘要）】\n\n{chapter_summaries}`;
    this.RAG_MEMORY_TEMPLATE = `【相关世界观设定（供参考，确保剧情符合设定）】\n\n{rag_entries}`;
    this.IMMEDIATE_CONTEXT_TEMPLATE = `【最近故事原文（请保持剧情衔接）】\n\n{recent_segments}`;
    this.DIARY_MAPPING_TEMPLATE = `【今日主角的真实经历（已映射为世界观行为）】\n\n用户日记原文：\n{raw_text}\n\n行为映射结果：\n{mapping_lines}\n\n请根据以上映射结果...`;
    this.ENCOUNTER_TEMPLATE = `【今日额外事件（随机奇遇）】\n\n奇遇标题：{encounter_title}\n奇遇内容：{encounter_content}\n\n请将此事件自然融入今日剧情中...`;
    this.GENERATE_INSTRUCTION_TEMPLATE = `【生成要求】\n\n请生成今日（第 {current_day} 天）的故事段落。...`;
    this.REGENERATE_HINT = `\n9. 【重要】这是重新生成请求，请生成一个与之前版本完全不同的剧情走向和表达方式，但保持世界观和行为映射一致。`;
  }

  /**
   * 组装完整 Prompt
   * @param {Object} params - 所有变量
   * @returns {{ systemPrompt: string, userPrompt: string }}
   */
  build(params) {
    // ===== System Prompt = 模板1 + 模板2 =====
    const systemPrompt = this._buildSystemPrompt(params);

    // ===== User Prompt = 模板3 + 模板4 + 模板5 + 模板6 + 模板7(可选) + 模板8 =====
    const userPrompt = this._buildUserPrompt(params);

    return { systemPrompt, userPrompt };
  }

  _buildSystemPrompt(params) {
    // 模板1：系统 Prompt（替换 hero_name）
    const template1 = this.SYSTEM_PROMPT_TEMPLATE.replace(
      /\{hero_name\}/g, params.heroName
    );

    // 模板2：章节阶段指令
    const transitionHint = params.isNewChapter
      ? '本章为新章节的开始，请自然引出本章主题，做好与上一章的衔接。'
      : '';
    
    const template2 = this.CHAPTER_STAGE_TEMPLATE
      .replace('{current_day}', params.currentDay)
      .replace('{chapter_number}', params.chapterNumber)
      .replace('{chapter_title}', params.chapterTitle)
      .replace('{chapter_purpose}', params.chapterPurpose)
      .replace('{outline_content}', params.outlineContent || '（暂无具体大纲指导）')
      .replace('{branch_guidance}', params.branchGuidance || '（自由发展）')
      .replace('{chapter_transition_hint}', transitionHint);

    return template1 + '\n\n' + template2;
  }

  _buildUserPrompt(params) {
    const parts = [];

    // 模板3：摘要记忆
    parts.push(this._buildSummaryMemory(params.summaries));

    // 模板4：档案记忆（RAG）
    parts.push(this._buildRagMemory(params.ragResults));

    // 模板5：即时上下文
    parts.push(this._buildImmediateContext(params.immediateContext, params.currentDay));

    // 模板6：当日日记 + 映射结果
    parts.push(this._buildDiaryMapping(params.rawText, params.mappingDesc));

    // 模板7：奇遇注入（可选）
    if (params.encounterContent) {
      parts.push(this._buildEncounter(
        params.encounterTitle, params.encounterContent
      ));
    }

    // 模板8：生成指令
    parts.push(this._buildGenerateInstruction(
      params.currentDay, params.chapterNumber, params.isRegenerate
    ));

    return parts.filter(p => p).join('\n\n');
  }

  _buildSummaryMemory(summaries) {
    if (!summaries || summaries.length === 0) {
      return this.SUMMARY_MEMORY_TEMPLATE.replace(
        '{chapter_summaries}', '（这是故事的开端，尚无前情摘要。）'
      );
    }
    const lines = summaries.map(s => `${s.title}摘要：${s.summary}`).join('\n\n');
    return this.SUMMARY_MEMORY_TEMPLATE.replace('{chapter_summaries}', lines);
  }

  _buildRagMemory(ragResults) {
    if (!ragResults || ragResults.length === 0) {
      return this.RAG_MEMORY_TEMPLATE.replace(
        '{rag_entries}', '（暂无特别需要参考的设定。）'
      );
    }
    // 按 category 分组
    const grouped = {};
    for (const item of ragResults) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item.value);
    }
    const categoryNames = {
      path: '途径', power_system: '力量体系', location: '地点',
      character: '人物', lore: '背景知识', item: '物品'
    };
    const lines = Object.entries(grouped).map(([cat, values]) => {
      return `【${categoryNames[cat] || cat}】${values.join('\n')}`;
    }).join('\n\n');
    return this.RAG_MEMORY_TEMPLATE.replace('{rag_entries}', lines);
  }

  _buildImmediateContext(segments, currentDay) {
    if (!segments || segments.length === 0) {
      return this.IMMEDIATE_CONTEXT_TEMPLATE.replace(
        '{recent_segments}', '（这是故事的第一天，尚无历史剧情。请从主角觉醒开始叙述。）'
      );
    }
    const lines = segments.map(s => {
      return `━━━ 第 ${s.day_number} 天 ━━━\n${s.content}`;
    }).join('\n\n');
    return this.IMMEDIATE_CONTEXT_TEMPLATE.replace('{recent_segments}', lines);
  }

  _buildDiaryMapping(rawText, mappingDesc) {
    let mappingLines = '（无映射结果）';
    try {
      const mappings = JSON.parse(mappingDesc);
      if (mappings.length > 0) {
        mappingLines = mappings.map(m =>
          `- ${m.behavior} → ${m.worldBehavior}（${m.description}）`
        ).join('\n');
      }
    } catch (_) { /* 使用默认值 */ }
    
    return this.DIARY_MAPPING_TEMPLATE
      .replace('{raw_text}', rawText)
      .replace('{mapping_lines}', mappingLines);
  }

  _buildEncounter(title, content) {
    return this.ENCOUNTER_TEMPLATE
      .replace('{encounter_title}', title)
      .replace('{encounter_content}', content);
  }

  _buildGenerateInstruction(currentDay, chapterNumber, isRegenerate) {
    let instruction = this.GENERATE_INSTRUCTION_TEMPLATE
      .replace('{current_day}', currentDay)
      .replace('{chapter_number}', chapterNumber);
    
    if (isRegenerate) {
      instruction += this.REGENERATE_HINT;
    }
    return instruction;
  }
}

module.exports = PromptBuilder;
```

### 4.8 Token 预算管理

PromptBuilder 在组装过程中需监控各层 Token 数量，超限时执行降级策略：

| 组成部分 | Token 预算 | 超限降级策略 |
|---------|-----------|-------------|
| 系统 Prompt（模板1+2） | 1500-2000 | 不降级（固定部分） |
| 摘要记忆（模板3） | 800-1500 | 超限时只保留最近 2 章摘要 |
| 档案记忆（模板4） | 1000-2000 | 超限时从 Top 5 降为 Top 3 |
| 即时上下文（模板5） | 3000-4000 | 超限时从 3 天降为 2 天 |
| 当日日记+映射（模板6） | 500-800 | 超限时截断日记原文 |
| 奇遇注入（模板7） | 200-400 | 不降级（本身较短） |
| 生成指令（模板8） | 200-300 | 不降级（固定部分） |
| **输入总计** | **7000-10600** | — |
| 输出（生成段落） | 800-1500 | — |
| **单次调用总计** | **8000-12000** | — |

```javascript
// TokenCounter.js — 简易 Token 计数器
class TokenCounter {
  // 中文约 1 字 = 1.5 token，英文约 1 词 = 1.3 token
  // 此为估算值，实际以模型 API 返回的 tokensUsed 为准
  static estimate(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + otherChars * 0.4);
  }
}
```

---

## 五、AI 适配器实现

### 5.1 AIAdapter 接口定义

所有 AI 厂商适配器需实现统一接口。以下定义与功能规划文档 9.3 节完全一致。

```typescript
// src/ai/adapters/AIAdapter.js

/**
 * AI 适配器统一接口
 * 所有厂商适配器必须实现此接口
 */
interface AIAdapter {
  // 厂商标识
  providerId: string;
  providerName: string;

  // 测试连接（引导页和设置页使用）
  testConnection(apiKey: string, baseUrl?: string): Promise<{
    success: boolean;
    error?: string;
  }>;

  // 对话补全（核心方法，故事生成/审查/摘要均通过此方法调用）
  chat(params: {
    apiKey: string;
    baseUrl?: string;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    success: boolean;
    content?: string;
    error?: string;
    tokensUsed?: number;
  }>;
}
```

### 5.2 适配器工厂

通过工厂函数根据 `ai_provider` 字段返回对应的适配器类：

```javascript
// src/ai/adapters/index.js

const DeepSeekAdapter = require('./DeepSeekAdapter');
const OpenAIAdapter = require('./OpenAIAdapter');
const KimiAdapter = require('./KimiAdapter');
const QwenAdapter = require('./QwenAdapter');

const ADAPTER_MAP = {
  deepseek: DeepSeekAdapter,
  openai: OpenAIAdapter,
  kimi: KimiAdapter,
  qwen: QwenAdapter
};

/**
 * 适配器工厂
 * @param {string} providerId - 厂商标识
 * @returns {Function} 适配器类
 */
function getAdapterClass(providerId) {
  const AdapterClass = ADAPTER_MAP[providerId];
  if (!AdapterClass) {
    throw new Error(`不支持的 AI 提供商: ${providerId}`);
  }
  return AdapterClass;
}

module.exports = { getAdapterClass, ADAPTER_MAP };
```

### 5.3 DeepSeekAdapter 实现

DeepSeek 使用 OpenAI 兼容格式，API 端点和请求结构与 OpenAI 一致，仅 base URL 不同。

| 项目 | 说明 |
|------|------|
| **API 端点** | `https://api.deepseek.com/v1/chat/completions` |
| **请求格式** | OpenAI 兼容（messages 数组） |
| **模型名称** | `deepseek-chat` |
| **认证方式** | `Authorization: Bearer {api_key}` |
| **默认 Base URL** | `https://api.deepseek.com` |

```javascript
// src/ai/adapters/DeepSeekAdapter.js

class DeepSeekAdapter {
  constructor() {
    this.providerId = 'deepseek';
    this.providerName = 'DeepSeek';
    this.defaultBaseUrl = 'https://api.deepseek.com';
    this.model = 'deepseek-chat';
    this.timeout = 60000; // 60 秒超时
  }

  async chat({ apiKey, baseUrl, systemPrompt, userPrompt, temperature = 0.8, maxTokens = 2000 }) {
    const url = `${baseUrl || this.defaultBaseUrl}/v1/chat/completions`;

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens,
      stream: false
    };

    try {
      const response = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      }, this.timeout);

      if (!response.ok) {
        return this._handleHttpError(response);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        return { success: false, error: 'AI 返回内容为空' };
      }

      return {
        success: true,
        content: content.trim(),
        tokensUsed: data.usage?.total_tokens
      };
    } catch (error) {
      return this._handleNetworkError(error);
    }
  }

  async testConnection(apiKey, baseUrl) {
    const result = await this.chat({
      apiKey,
      baseUrl,
      systemPrompt: 'You are a test assistant.',
      userPrompt: '请回复"连接成功"四个字。',
      temperature: 0,
      maxTokens: 20
    });
    return {
      success: result.success,
      error: result.success ? undefined : result.error
    };
  }

  // 带超时的 fetch 封装
  async _fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // HTTP 错误处理
  async _handleHttpError(response) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      const apiMsg = errorBody.error?.message || errorBody.message;
      if (apiMsg) errorMsg = apiMsg;
    } catch (_) { /* 忽略 JSON 解析失败 */ }

    // 根据 HTTP 状态码映射错误码
    if (response.status === 401) {
      return { success: false, error: errorMsg, errorCode: 'E001' };
    } else if (response.status === 403) {
      return { success: false, error: errorMsg, errorCode: 'E002' };
    } else if (response.status === 429) {
      return { success: false, error: errorMsg, errorCode: 'E003' };
    } else if (response.status === 402) {
      return { success: false, error: errorMsg, errorCode: 'E004' };
    } else {
      return { success: false, error: errorMsg, errorCode: 'E007' };
    }
  }

  // 网络错误处理
  _handleNetworkError(error) {
    if (error.name === 'AbortError') {
      return { success: false, error: '请求超时', errorCode: 'E005' };
    }
    return { success: false, error: `网络错误: ${error.message}`, errorCode: 'E006' };
  }
}

module.exports = DeepSeekAdapter;
```

### 5.4 OpenAIAdapter 实现

OpenAI 原生格式，与 DeepSeek 格式基本相同，但模型名称和默认 Base URL 不同。

| 项目 | 说明 |
|------|------|
| **API 端点** | `https://api.openai.com/v1/chat/completions` |
| **请求格式** | OpenAI 原生（messages 数组） |
| **模型名称** | `gpt-4o-mini`（默认，可配置） |
| **认证方式** | `Authorization: Bearer {api_key}` |
| **默认 Base URL** | `https://api.openai.com` |

```javascript
// src/ai/adapters/OpenAIAdapter.js

class OpenAIAdapter {
  constructor() {
    this.providerId = 'openai';
    this.providerName = 'OpenAI';
    this.defaultBaseUrl = 'https://api.openai.com';
    this.model = 'gpt-4o-mini'; // 默认模型，可在高级设置中修改
    this.timeout = 60000;
  }

  async chat({ apiKey, baseUrl, systemPrompt, userPrompt, temperature = 0.8, maxTokens = 2000 }) {
    const url = `${baseUrl || this.defaultBaseUrl}/v1/chat/completions`;

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens,
      stream: false
    };

    try {
      const response = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      }, this.timeout);

      if (!response.ok) {
        return this._handleHttpError(response);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return { success: false, error: 'AI 返回内容为空' };
      }

      return {
        success: true,
        content: content.trim(),
        tokensUsed: data.usage?.total_tokens
      };
    } catch (error) {
      return this._handleNetworkError(error);
    }
  }

  async testConnection(apiKey, baseUrl) {
    const result = await this.chat({
      apiKey,
      baseUrl,
      systemPrompt: 'You are a test assistant.',
      userPrompt: 'Say "OK" only.',
      temperature: 0,
      maxTokens: 5
    });
    return {
      success: result.success,
      error: result.success ? undefined : result.error
    };
  }

  async _fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _handleHttpError(response) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      const apiMsg = errorBody.error?.message || errorBody.message;
      if (apiMsg) errorMsg = apiMsg;
    } catch (_) { /* 忽略 */ }

    if (response.status === 401) {
      return { success: false, error: errorMsg, errorCode: 'E001' };
    } else if (response.status === 429) {
      return { success: false, error: errorMsg, errorCode: 'E003' };
    } else if (response.status === 422 || response.status === 402) {
      return { success: false, error: errorMsg, errorCode: 'E004' };
    } else {
      return { success: false, error: errorMsg, errorCode: 'E007' };
    }
  }

  _handleNetworkError(error) {
    if (error.name === 'AbortError') {
      return { success: false, error: '请求超时', errorCode: 'E005' };
    }
    return { success: false, error: `网络错误: ${error.message}`, errorCode: 'E006' };
  }
}

module.exports = OpenAIAdapter;
```

### 5.5 KimiAdapter 实现

Kimi（Moonshot AI）使用类 OpenAI 格式，但 API 端点和模型名称不同。

| 项目 | 说明 |
|------|------|
| **API 端点** | `https://api.moonshot.cn/v1/chat/completions` |
| **请求格式** | OpenAI 兼容（messages 数组） |
| **模型名称** | `moonshot-v1-8k` |
| **认证方式** | `Authorization: Bearer {api_key}` |
| **默认 Base URL** | `https://api.moonshot.cn` |

```javascript
// src/ai/adapters/KimiAdapter.js

class KimiAdapter {
  constructor() {
    this.providerId = 'kimi';
    this.providerName = 'Kimi (Moonshot)';
    this.defaultBaseUrl = 'https://api.moonshot.cn';
    this.model = 'moonshot-v1-8k'; // 8k 上下文窗口，适合本项目 token 预算
    this.timeout = 60000;
  }

  async chat({ apiKey, baseUrl, systemPrompt, userPrompt, temperature = 0.8, maxTokens = 2000 }) {
    const url = `${baseUrl || this.defaultBaseUrl}/v1/chat/completions`;

    // Moonshot 格式与 OpenAI 兼容，但 temperature 范围为 0-1
    // 如果 temperature > 1，截断为 1
    const adjustedTemp = Math.min(temperature, 1.0);

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: adjustedTemp,
      max_tokens: maxTokens,
      stream: false
    };

    try {
      const response = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      }, this.timeout);

      if (!response.ok) {
        return this._handleHttpError(response);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return { success: false, error: 'AI 返回内容为空' };
      }

      return {
        success: true,
        content: content.trim(),
        tokensUsed: data.usage?.total_tokens
      };
    } catch (error) {
      return this._handleNetworkError(error);
    }
  }

  async testConnection(apiKey, baseUrl) {
    const result = await this.chat({
      apiKey,
      baseUrl,
      systemPrompt: '你是测试助手。',
      userPrompt: '请回复"连接成功"。',
      temperature: 0,
      maxTokens: 20
    });
    return {
      success: result.success,
      error: result.success ? undefined : result.error
    };
  }

  async _fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _handleHttpError(response) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      const apiMsg = errorBody.error?.message || errorBody.message;
      if (apiMsg) errorMsg = apiMsg;
    } catch (_) { /* 忽略 */ }

    if (response.status === 401) {
      return { success: false, error: errorMsg, errorCode: 'E001' };
    } else if (response.status === 403) {
      return { success: false, error: errorMsg, errorCode: 'E002' };
    } else if (response.status === 429) {
      return { success: false, error: errorMsg, errorCode: 'E003' };
    } else if (response.status === 402) {
      return { success: false, error: errorMsg, errorCode: 'E004' };
    } else {
      return { success: false, error: errorMsg, errorCode: 'E007' };
    }
  }

  _handleNetworkError(error) {
    if (error.name === 'AbortError') {
      return { success: false, error: '请求超时', errorCode: 'E005' };
    }
    return { success: false, error: `网络错误: ${error.message}`, errorCode: 'E006' };
  }
}

module.exports = KimiAdapter;
```

### 5.6 QwenAdapter 实现

通义千问（阿里云）使用 OpenAI 兼容模式，API 端点和模型名称不同。

| 项目 | 说明 |
|------|------|
| **API 端点** | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |
| **请求格式** | OpenAI 兼容模式（messages 数组） |
| **模型名称** | `qwen-turbo` |
| **认证方式** | `Authorization: Bearer {api_key}` |
| **默认 Base URL** | `https://dashscope.aliyuncs.com/compatible-mode` |

```javascript
// src/ai/adapters/QwenAdapter.js

class QwenAdapter {
  constructor() {
    this.providerId = 'qwen';
    this.providerName = '通义千问 (Qwen)';
    this.defaultBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode';
    this.model = 'qwen-turbo'; // 速度快、成本低，适合日常生成
    this.timeout = 60000;
  }

  async chat({ apiKey, baseUrl, systemPrompt, userPrompt, temperature = 0.8, maxTokens = 2000 }) {
    const url = `${baseUrl || this.defaultBaseUrl}/v1/chat/completions`;

    // 通义千问 temperature 范围为 0-2，与 OpenAI 兼容
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens,
      stream: false
    };

    try {
      const response = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      }, this.timeout);

      if (!response.ok) {
        return this._handleHttpError(response);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return { success: false, error: 'AI 返回内容为空' };
      }

      return {
        success: true,
        content: content.trim(),
        tokensUsed: data.usage?.total_tokens
      };
    } catch (error) {
      return this._handleNetworkError(error);
    }
  }

  async testConnection(apiKey, baseUrl) {
    const result = await this.chat({
      apiKey,
      baseUrl,
      systemPrompt: '你是测试助手。',
      userPrompt: '请回复"连接成功"。',
      temperature: 0,
      maxTokens: 20
    });
    return {
      success: result.success,
      error: result.success ? undefined : result.error
    };
  }

  async _fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _handleHttpError(response) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      // 通义千问错误格式：{ "code": "...", "message": "..." }
      // OpenAI 兼容模式：{ "error": { "message": "..." } }
      const apiMsg = errorBody.error?.message || errorBody.message || errorBody.msg;
      if (apiMsg) errorMsg = apiMsg;
    } catch (_) { /* 忽略 */ }

    if (response.status === 401) {
      return { success: false, error: errorMsg, errorCode: 'E001' };
    } else if (response.status === 403) {
      return { success: false, error: errorMsg, errorCode: 'E002' };
    } else if (response.status === 429) {
      return { success: false, error: errorMsg, errorCode: 'E003' };
    } else if (response.status === 400 && errorMsg.includes('quota')) {
      return { success: false, error: errorMsg, errorCode: 'E004' };
    } else {
      return { success: false, error: errorMsg, errorCode: 'E007' };
    }
  }

  _handleNetworkError(error) {
    if (error.name === 'AbortError') {
      return { success: false, error: '请求超时', errorCode: 'E005' };
    }
    return { success: false, error: `网络错误: ${error.message}`, errorCode: 'E006' };
  }
}

module.exports = QwenAdapter;
```

### 5.7 四个适配器对比总结

| 特性 | DeepSeek | OpenAI | Kimi | Qwen |
|------|---------|--------|------|------|
| API 格式 | OpenAI 兼容 | OpenAI 原生 | OpenAI 兼容 | OpenAI 兼容模式 |
| 默认 Base URL | `api.deepseek.com` | `api.openai.com` | `api.moonshot.cn` | `dashscope.aliyuncs.com/compatible-mode` |
| 默认模型 | `deepseek-chat` | `gpt-4o-mini` | `moonshot-v1-8k` | `qwen-turbo` |
| 温度范围 | 0-2 | 0-2 | 0-1（需截断） | 0-2 |
| 认证方式 | Bearer Token | Bearer Token | Bearer Token | Bearer Token |
| 请求体格式 | messages 数组 | messages 数组 | messages 数组 | messages 数组 |
| 响应解析 | choices[0].message.content | choices[0].message.content | choices[0].message.content | choices[0].message.content |
| Token 用量 | usage.total_tokens | usage.total_tokens | usage.total_tokens | usage.total_tokens |

**实现注意事项**：
1. 所有适配器共享相同的错误处理模式（HTTP 状态码 → 错误码映射）。
2. Kimi 的 temperature 上限为 1.0，需在适配器内截断，避免 API 报错。
3. 所有适配器使用 `AbortController` 实现 60 秒超时控制。
4. 支持自定义 Base URL，方便用户使用代理或中转服务。
5. `testConnection` 方法发送一个最小请求验证 Key 有效性，用于引导页和设置页。

---

## 六、审查循环实现

### 6.1 ReviewLoop 整体设计

ReviewLoop 是 AI 内部自我审查的核心组件，在用户不可见的情况下运行 2-3 轮审查与修改循环。其目标是：在输出给用户之前，尽量消除世界观设定错误、逻辑矛盾和文风问题。

```
初稿生成完成
  │
  ▼
┌─────────────────────┐
│  审查轮 1            │
│  审查初稿            │
│  ┌─ passed=true ────┼─→ 跳过修改，进入轮 2
│  └─ passed=false ───┼─→ 使用 revised_content 替换 → 重试（最多 2 次）
└─────────────────────┘
  │
  ▼
┌─────────────────────┐
│  审查轮 2            │
│  审查修改稿          │
│  ┌─ passed=true ────┼─→ 审查通过，进入润色
│  └─ passed=false ───┼─→ 再次修改（最多 1 次）→ 输出当前最优版本
└─────────────────────┘
  │
  ▼
最终版本输出
```

### 6.2 ReviewLoop 接口与实现

```javascript
// src/ai/ReviewLoop.js

class ReviewLoop {
  constructor() {
    // 审查 Prompt 模板（轮次 1 和轮次 2）
    this.REVIEW_PROMPT_ROUND_1 = `你是一位严格的小说编辑，精通《诡秘之主》世界观。...（完整审查 Prompt 轮次1文本）`;
    this.REVIEW_PROMPT_ROUND_2 = `你是一位严格的小说编辑，精通《诡秘之主》世界观。这是第二轮审查...（完整审查 Prompt 轮次2文本）`;

    // 最大重试次数配置
    this.MAX_RETRIES_ROUND_1 = 2;  // 轮 1 最多重试 2 次
    this.MAX_RETRIES_ROUND_2 = 1;  // 轮 2 最多重试 1 次
  }

  /**
   * 运行完整审查循环
   * @param {string} initialDraft - 初稿内容
   * @param {string} systemPrompt - 系统 Prompt（用于审查调用的 system 角色）
   * @param {AIAdapter} adapter - AI 适配器实例
   * @param {string} apiKey - API Key
   * @param {string} baseUrl - API Base URL
   * @param {Object} reviewParams - 审查调用的参数 { temperature, maxTokens }
   * @returns {Promise<{ finalContent: string, passed: boolean, totalRounds: number, issues: string[] }>}
   */
  async run(initialDraft, systemPrompt, adapter, apiKey, baseUrl, reviewParams) {
    let currentContent = initialDraft;
    let totalRounds = 0;
    let allIssues = [];
    let passed = false;

    // ===== 审查轮 1 =====
    let round1Result = await this._reviewRound(
      currentContent,
      this.REVIEW_PROMPT_ROUND_1,
      null, // 无上一轮问题
      systemPrompt,
      adapter,
      apiKey,
      baseUrl,
      reviewParams,
      this.MAX_RETRIES_ROUND_1
    );

    currentContent = round1Result.content;
    totalRounds += round1Result.roundsUsed;
    allIssues = allIssues.concat(round1Result.issues);

    // ===== 审查轮 2 =====
    let round2Result = await this._reviewRound(
      currentContent,
      this.REVIEW_PROMPT_ROUND_2,
      round1Result.lastIssues, // 传入上一轮发现的问题
      systemPrompt,
      adapter,
      apiKey,
      baseUrl,
      reviewParams,
      this.MAX_RETRIES_ROUND_2
    );

    currentContent = round2Result.content;
    totalRounds += round2Result.roundsUsed;
    allIssues = allIssues.concat(round2Result.issues);
    passed = round2Result.passed;

    return {
      finalContent: currentContent,
      passed: passed,
      totalRounds: totalRounds,
      issues: allIssues
    };
  }

  /**
   * 执行单个审查轮次（含重试逻辑）
   */
  async _reviewRound(
    content, reviewPrompt, previousIssues, systemPrompt,
    adapter, apiKey, baseUrl, reviewParams, maxRetries
  ) {
    let currentContent = content;
    let lastIssues = previousIssues || [];
    let roundsUsed = 0;
    let passed = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      roundsUsed++;

      // 构建审查 Prompt
      let prompt = reviewPrompt.replace('{generated_content}', currentContent);
      if (previousIssues) {
        prompt = prompt.replace('{previous_issues}', previousIssues.join('\n'));
      }

      // 调用 AI 审查
      const reviewResult = await adapter.chat({
        apiKey,
        baseUrl,
        systemPrompt: systemPrompt, // 复用故事生成的 system prompt，保持世界观上下文
        userPrompt: prompt,
        temperature: reviewParams.temperature || 0.3,
        maxTokens: reviewParams.maxTokens || 1500
      });

      if (!reviewResult.success) {
        // 审查 AI 调用失败：跳过此轮审查，视为通过
        // 降级策略：保证用户始终能拿到结果
        console.warn(`审查轮次 AI 调用失败: ${reviewResult.error}，跳过此轮审查`);
        passed = true;
        break;
      }

      // 解析审查结果 JSON
      let review;
      try {
        review = this._parseReviewJson(reviewResult.content);
      } catch (e) {
        // JSON 解析失败：跳过此轮，视为通过
        console.warn('审查结果 JSON 解析失败，跳过此轮审查');
        passed = true;
        break;
      }

      lastIssues = review.issues || [];

      if (review.passed) {
        // 审查通过
        passed = true;
        break;
      }

      // 审查不通过：使用修改稿
      if (review.revised_content && review.revised_content.trim().length > 0) {
        currentContent = review.revised_content.trim();
      }

      // 如果已经是最后一次重试，仍不通过，则输出当前版本
      if (attempt === maxRetries) {
        passed = false; // 标记为未通过，但仍然输出当前最优版本
        break;
      }
    }

    return {
      content: currentContent,
      passed: passed,
      roundsUsed: roundsUsed,
      issues: lastIssues,
      lastIssues: lastIssues
    };
  }

  /**
   * 解析审查结果 JSON
   * AI 可能输出非标准 JSON（如包含注释、多余文本），需要容错处理
   */
  _parseReviewJson(content) {
    // 尝试直接解析
    try {
      return JSON.parse(content);
    } catch (_) { /* 继续 */ }

    // 尝试提取 JSON 块（AI 可能将 JSON 包裹在 ```json ... ``` 中）
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (_) { /* 继续 */ }
    }

    // 尝试提取第一个 { ... } 块
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch (_) { /* 继续 */ }
    }

    // 所有解析方式均失败
    throw new Error('无法解析审查结果 JSON');
  }
}

module.exports = ReviewLoop;
```

### 6.3 审查通过/不通过判定逻辑

**审查通过条件**（以下全部满足）：
1. AI 返回的 JSON 中 `passed` 字段为 `true`。
2. `issues` 数组为空，或仅包含 `severity: "low"` 的问题。
3. AI 调用成功且 JSON 解析成功。

**审查不通过条件**（以下任一满足）：
1. AI 返回的 JSON 中 `passed` 字段为 `false`。
2. `issues` 数组包含 `severity: "high"` 的问题（世界观错误、逻辑矛盾）。
3. `issues` 数组包含 `severity: "medium"` 的问题且数量 ≥ 2。

**降级判定**（以下情况视为"通过"，输出当前版本）：
1. 审查 AI 调用失败（网络错误、超时等）→ 跳过此轮，视为通过。
2. 审查结果 JSON 解析失败 → 跳过此轮，视为通过。
3. 重试次数耗尽仍未通过 → 输出最后一次修改稿作为最终版本。

### 6.4 最大重试次数与降级策略

| 轮次 | 最大重试次数 | 审查失败时的行为 |
|------|------------|----------------|
| 审查轮 1 | 2 次（共 3 次审查机会） | 重试耗尽 → 使用最后一次修改稿进入轮 2 |
| 审查轮 2 | 1 次（共 2 次审查机会） | 重试耗尽 → 使用最后一次修改稿进入润色 |
| 润色轮 | 0 次（仅执行 1 次） | 润色失败 → 使用轮 2 的修改稿作为最终版本 |

**总内部重试上限**：审查轮 1（3 次）+ 审查轮 2（2 次）= 最多 5 次 AI 调用用于审查。加上初稿生成（1 次）和润色（1 次），单次故事生成最多 7 次 AI 调用。

**降级策略优先级**：
1. 第一优先级：保证用户始终能拿到一个结果，不会卡在"生成中"状态。
2. 第二优先级：审查通过的结果优先于审查不通过的结果。
3. 第三优先级：修改稿优先于初稿（修改稿经过 AI 修正，理论上质量更高）。
4. 第四优先级：润色后的版本优先于未润色版本。

### 6.5 审查循环与 StoryEngine 的集成

在 StoryEngine 的 `generateStory` 和 `regenerate` 方法中，审查循环的调用方式如下：

```javascript
// 在 generateStory 方法中（步骤 5-6）
const reviewResult = await this.reviewLoop.run(
  currentDraft,           // 初稿内容
  context.systemPrompt,   // 系统 Prompt
  adapter,                // AI 适配器
  apiKey,                 // API Key
  baseUrl,                // Base URL
  { temperature: 0.3, maxTokens: 1500 }  // 审查参数（低温度保证一致性）
);

currentDraft = reviewResult.finalContent;

// 记录内部审查轮次
await this.segmentRepo.update(segmentId, {
  internal_review_count: reviewResult.totalRounds
});

// 步骤 7：润色（仅当审查通过时执行润色，不通过时跳过润色直接输出）
if (reviewResult.passed) {
  const polishResult = await this._polish(
    currentDraft, adapter, apiKey, baseUrl, user
  );
  if (polishResult.success) {
    currentDraft = polishResult.content;
  }
}
```

**设计说明**：
- 审查未通过时仍输出内容（最后一次修改稿），但不执行润色（避免在有问题的基础上浪费一次 AI 调用）。
- 审查的 temperature 设为 0.3（低于生成的 0.8），确保审查判断的稳定性和一致性。
- 审查调用的 maxTokens 设为 1500（低于生成的 2000），因为审查结果包含 JSON 和修改稿，需要足够空间但不需过长。

---

## 七、三层记忆管理实现

三层记忆架构是解决"三个月累积剧情约 4-5 万字远超模型上下文窗口"问题的核心方案。每一层负责不同时间跨度的信息，通过 Token 预算控制总输入量在 12000 以内。

### 7.1 三层记忆架构总览

```
┌─────────────────────────────────────────────────────┐
│                  PromptBuilder                        │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │  第一层      │  │  第二层      │  │  第三层       │ │
│  │  即时上下文   │  │  摘要记忆    │  │  档案记忆     │ │
│  │  (近3天原文)  │  │  (章节摘要)  │  │  (RAG检索)   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘ │
│         │                │                │          │
└─────────┼────────────────┼────────────────┼──────────┘
          │                │                │
          ▼                ▼                ▼
  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
  │SegmentRepo    │ │ChapterRepo    │ │WorldRepo      │
  │.getRecent(3)  │ │.getAll()      │ │.searchByKw()  │
  └───────────────┘ └───────────────┘ └───────────────┘
          │                │                │
          ▼                ▼                ▼
    story_segments     chapters         world_settings
    (最近3条finalized)  (所有摘要)       (Top 5匹配)
```

### 7.2 ImmediateContext（即时上下文提供器）

**职责**：从 SegmentRepository 获取最近 3 天已定稿的完整剧情原文，保证最近剧情的细节连贯。

```javascript
// src/memory/ImmediateContext.js

class ImmediateContext {
  constructor(segmentRepo) {
    this.segmentRepo = segmentRepo;
    this.maxDays = 3;           // 默认获取最近 3 天
    this.fallbackDays = 2;      // Token 超限时降级为 2 天
    this.tokenBudget = 4000;    // Token 预算上限
  }

  /**
   * 获取即时上下文
   * @param {number} currentDay - 当前天数
   * @returns {Promise<Array<{day_number: number, content: string}>>}
   */
  async get(currentDay) {
    // 第 1 天无历史数据
    if (currentDay <= 1) {
      return [];
    }

    try {
      // 从 SegmentRepository 获取最近 N 天已定稿段落
      let segments = await this.segmentRepo.getRecent(this.maxDays);

      // 过滤掉非 finalized 状态和内容为空的段落
      segments = segments.filter(
        s => s.status === 'finalized' && s.content && s.content.trim().length > 0
      );

      // 按天数正序排列（旧 → 新）
      segments.sort((a, b) => a.day_number - b.day_number);

      // Token 预算检查
      const totalTokens = this._estimateTokens(segments);
      if (totalTokens > this.tokenBudget && segments.length > this.fallbackDays) {
        // 降级：只保留最近 2 天
        segments = segments.slice(-this.fallbackDays);
      }

      return segments.map(s => ({
        day_number: s.day_number,
        content: s.content
      }));
    } catch (error) {
      // 获取失败返回空数组，不阻断生成流程
      console.warn('即时上下文获取失败:', error.message);
      return [];
    }
  }

  /**
   * 估算段落数组的总 Token 数
   */
  _estimateTokens(segments) {
    let totalChars = 0;
    for (const s of segments) {
      totalChars += (s.content || '').length;
    }
    // 中文约 1.5 token/字
    return Math.ceil(totalChars * 1.5);
  }
}

module.exports = ImmediateContext;
```

**数据来源**：`story_segments` 表中最近 3 条 `status = 'finalized'` 记录的 `content` 字段。

**Token 预算**：约 3000-4000 tokens（假设每天 800-1200 字）。

**降级策略**：当 3 天内容总 Token 超过 4000 时，降级为只取最近 2 天。

### 7.3 SummaryMemory（摘要记忆提供器）

**职责**：从 ChapterRepository 获取所有已完成章节的摘要，让 AI 了解故事宏观进展。

```javascript
// src/memory/SummaryMemory.js

class SummaryMemory {
  constructor(chapterRepo) {
    this.chapterRepo = chapterRepo;
    this.maxChapters = 6;       // 最多 6 个章节
    this.fallbackChapters = 2;  // Token 超限时只保留最近 2 章摘要
    this.tokenBudget = 1500;    // Token 预算上限
  }

  /**
   * 获取所有已完成章节的摘要
   * @returns {Promise<Array<{title: string, summary: string}>>}
   */
  async getAll() {
    try {
      const chapters = await this.chapterRepo.getAll();

      // 只取已完成且有摘要的章节
      let completed = chapters.filter(
        c => c.status === 'completed' && c.summary && c.summary.trim().length > 0
      );

      // 按章节号正序排列
      completed.sort((a, b) => a.chapter_number - b.chapter_number);

      // Token 预算检查
      const totalTokens = this._estimateTokens(completed);
      if (totalTokens > this.tokenBudget && completed.length > this.fallbackChapters) {
        // 降级：只保留最近 2 章摘要
        completed = completed.slice(-this.fallbackChapters);
      }

      return completed.map(c => ({
        title: this._getChapterTitle(c.chapter_number, c.title),
        summary: c.summary
      }));
    } catch (error) {
      console.warn('摘要记忆获取失败:', error.message);
      return [];
    }
  }

  /**
   * 获取章节标题
   */
  _getChapterTitle(chapterNumber, title) {
    if (title) return title;
    const names = ['序章', '第一章', '第二章', '第三章', '第四章', '终章'];
    return names[chapterNumber] || `第${chapterNumber}章`;
  }

  /**
   * 估算摘要数组的总 Token 数
   */
  _estimateTokens(chapters) {
    let totalChars = 0;
    for (const c of chapters) {
      totalChars += (c.summary || '').length;
    }
    return Math.ceil(totalChars * 1.5);
  }
}

module.exports = SummaryMemory;
```

**数据来源**：`chapters` 表中 `status = 'completed'` 且 `summary` 非空的记录。

**Token 预算**：约 800-1500 tokens（6 个章节 x 200-300 字）。

**降级策略**：当所有摘要总 Token 超过 1500 时，只保留最近 2 章摘要。

### 7.4 RAGRetriever（RAG 检索器）

**职责**：从 WorldRepository 按关键词检索 Top 5 相关的世界观设定条目，为 AI 提供精确的设定参考。

```javascript
// src/memory/RAGRetriever.js

class RAGRetriever {
  constructor(worldRepo) {
    this.worldRepo = worldRepo;
    this.topN = 5;              // 默认检索 Top 5
    this.fallbackN = 3;         // Token 超限时降级为 Top 3
    this.tokenBudget = 2000;    // Token 预算上限
  }

  /**
   * 检索相关世界观设定
   * @param {string[]} keywords - 检索关键词（来自日记解析 + 章节阶段关键词）
   * @param {string} worldId - 世界观 ID
   * @param {string} pathId - 途径 ID
   * @returns {Promise<WorldSetting[]>}
   */
  async retrieve(keywords, worldId, pathId) {
    try {
      // 合并关键词：日记解析关键词 + 途径相关关键词 + 章节阶段关键词
      const allKeywords = this._expandKeywords(keywords, pathId);

      // 从 WorldRepository 检索
      let results = await this.worldRepo.searchByKeywords(
        worldId, allKeywords, this.topN * 2  // 多检索一些，后面做去重和筛选
      );

      // 去重（按 key 去重，保留 priority 更高的）
      results = this._deduplicate(results);

      // 按 priority 降序排序
      results.sort((a, b) => b.priority - a.priority);

      // 取 Top N
      results = results.slice(0, this.topN);

      // Token 预算检查
      const totalTokens = this._estimateTokens(results);
      if (totalTokens > this.tokenBudget && results.length > this.fallbackN) {
        results = results.slice(0, this.fallbackN);
      }

      return results;
    } catch (error) {
      console.warn('RAG 检索失败:', error.message);
      return [];
    }
  }

  /**
   * 扩展关键词
   * 加入途径相关关键词，确保途径设定总是被检索到
   */
  _expandKeywords(keywords, pathId) {
    const expanded = [...(keywords || [])];
    
    // 途径相关关键词
    if (pathId === 'seer') {
      expanded.push('占卜家', '灵视', '占卜', '星象', '序列9', '塔罗会');
    }
    
    // 基础世界观关键词（始终包含）
    expanded.push('序列', '途径', '魔药', '非凡者');
    
    return [...new Set(expanded)]; // 去重
  }

  /**
   * 去重：按 key 字段去重，保留 priority 更高的
   */
  _deduplicate(results) {
    const map = new Map();
    for (const item of results) {
      const existing = map.get(item.key);
      if (!existing || item.priority > existing.priority) {
        map.set(item.key, item);
      }
    }
    return Array.from(map.values());
  }

  /**
   * 估算检索结果的总 Token 数
   */
  _estimateTokens(results) {
    let totalChars = 0;
    for (const r of results) {
      totalChars += (r.value || '').length;
    }
    return Math.ceil(totalChars * 1.5);
  }
}

module.exports = RAGRetriever;
```

**数据来源**：`world_settings` 表，按 `keywords` 字段匹配检索。

**检索方式**：
1. 从日记解析结果中提取 `keywords`（如"学习"、"占卜"、"神秘学"等）。
2. 合并途径相关关键词（确保占卜家设定始终被检索到）。
3. 合并基础世界观关键词（确保序列体系设定始终被检索到）。
4. 从 `world_settings` 表中匹配 `keywords` 字段包含任一关键词的条目。
5. 按 `priority` 权重降序排序，取 Top 5。

**Token 预算**：约 1000-2000 tokens。

**降级策略**：当检索结果总 Token 超过 2000 时，从 Top 5 降为 Top 3。

### 7.5 三层配合与不同场景的加载策略

| 场景 | 即时上下文 | 摘要记忆 | 档案记忆 |
|------|-----------|---------|---------|
| 日常剧情生成（第 2 天起） | 近 3 天原文 | 已完成章节摘要 | 按关键词检索 Top 5 |
| 首日生成（第 1 天） | 无 | 无 | 占卜家途径设定 + 基础世界观 |
| 章节边界日 | 近 3 天原文 | 所有已完成章节摘要 | 当前章节阶段关键设定 |
| 断更过渡生成 | 近 3 天原文 | 已完成章节摘要 | 无需额外检索 |
| 摘要生成（章节结束时） | 本章所有段落原文 | 之前所有章节摘要 | 无 |

**场景判断逻辑**（在 StoryEngine 中实现）：

```javascript
// StoryEngine 中的场景判断
_getMemoryScenario(dayNumber, user, chapter) {
  // 首日生成
  if (dayNumber === 1) {
    return 'first_day';
  }
  // 章节边界日（章节最后一天）
  if (dayNumber === chapter.end_day) {
    return 'chapter_boundary';
  }
  // 断更检测：上次记录天数与当前天数差距 > 1
  if (user.current_day > 0 && dayNumber - user.current_day > 1) {
    return 'gap_transition';
  }
  // 日常生成
  return 'daily';
}
```

### 7.6 Token 预算管理总结

| 组成部分 | Token 预算 | 超限降级策略 | 负责组件 |
|---------|-----------|-------------|---------|
| 系统 Prompt | 1500-2000 | 不降级（固定） | PromptBuilder |
| 即时上下文 | 3000-4000 | 3 天 → 2 天 | ImmediateContext |
| 摘要记忆 | 800-1500 | 全部 → 最近 2 章 | SummaryMemory |
| 档案记忆 | 1000-2000 | Top 5 → Top 3 | RAGRetriever |
| 当日日记+映射 | 500-800 | 截断日记原文 | PromptBuilder |
| 章节阶段指令 | 200-300 | 不降级（固定） | PromptBuilder |
| **输入总计** | **7000-10600** | — | — |
| 输出（生成段落） | 800-1500 | — | AIAdapter |
| **单次调用总计** | **8000-12000** | — | — |

**Token 预算管理流程**：
1. 三层记忆各自独立检查 Token 预算，超限时各自降级。
2. PromptBuilder 在组装完成后，对总 Prompt 做一次 Token 估算。
3. 如果总 Token 超过 11000（预留 1000 给输出），则按优先级依次削减：
   - 第一削减：档案记忆从 Top 5 → Top 3
   - 第二削减：即时上下文从 3 天 → 2 天
   - 第三削减：摘要记忆从全部 → 最近 2 章
4. 削减后总 Token 仍超限（极端情况），截断即时上下文中最早的段落。

---

## 八、Repository Mock 实现

在阶段 1-2 开发期间，前端工程师尚未完成真实的 Repository 实现。AI 工程师使用以下 Mock 版本独立开发和测试。所有 Mock 严格实现接口 B（Repository API）定义的方法签名和行为约定。

### 8.1 MockUserRepository

```javascript
// mock/MockUserRepository.js

class MockUserRepository {
  constructor() {
    this.data = {
      id: 1,
      hero_name: '林墨',
      world_id: 'lord_of_mysteries',
      path_id: 'seer',
      duration_days: 90,
      current_day: 7,
      current_chapter: 1,
      ai_provider: 'deepseek',
      ai_base_url: null,
      api_key_encrypted: 'YOUR_DEEPSEEK_API_KEY',
      ai_temperature: 0.8,
      ai_max_tokens: 2000,
      story_started: true,
      created_at: '2026-07-06T12:00:00'
    };
  }

  async get() {
    // 返回深拷贝，防止外部修改内部数据
    return JSON.parse(JSON.stringify(this.data));
  }

  async update(fields) {
    Object.assign(this.data, fields);
    return true;
  }

  // 测试辅助方法：重置为初始状态
  reset() {
    this.data.current_day = 7;
    this.data.current_chapter = 1;
    this.data.story_started = true;
  }

  // 测试辅助方法：设置特定状态
  setState(state) {
    Object.assign(this.data, state);
  }
}

module.exports = MockUserRepository;
```

### 8.2 MockDiaryRepository

```javascript
// mock/MockDiaryRepository.js

class MockDiaryRepository {
  constructor() {
    this.data = [];
    this.idCounter = 1;
    
    // 预置一些测试数据
    this._seedTestData();
  }

  _seedTestData() {
    const samples = [
      {
        day_number: 5,
        raw_text: '今天看了两小时占卜相关的书，下午去健身房练了一个小时。',
        behavior_tags: ['学习', '健身'],
        is_blank_day: false
      },
      {
        day_number: 6,
        raw_text: '今天上班开会讨论了新项目，晚上和朋友聚餐。',
        behavior_tags: ['工作', '社交'],
        is_blank_day: false
      },
      {
        day_number: 7,
        raw_text: '今天在家休息，看了一部电影，下午睡了午觉。',
        behavior_tags: ['休息', '娱乐'],
        is_blank_day: false
      }
    ];
    
    for (const sample of samples) {
      this.create(sample);
    }
  }

  async create({ day_number, raw_text, behavior_tags, is_blank_day = false }) {
    const id = this.idCounter++;
    this.data.push({
      id,
      day_number,
      raw_text,
      behavior_tags: JSON.stringify(behavior_tags || []),
      is_blank_day,
      created_at: new Date().toISOString()
    });
    return id;
  }

  async getByDay(dayNumber) {
    const found = this.data.find(d => d.day_number === dayNumber);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getByRange(startDay, endDay) {
    const results = this.data.filter(
      d => d.day_number >= startDay && d.day_number <= endDay
    );
    return results.map(d => JSON.parse(JSON.stringify(d)));
  }

  async update(id, fields) {
    const item = this.data.find(d => d.id === id);
    if (item) {
      Object.assign(item, fields);
      return true;
    }
    return false;
  }

  // 测试辅助方法
  clear() {
    this.data = [];
    this.idCounter = 1;
  }
}

module.exports = MockDiaryRepository;
```

### 8.3 MockChapterRepository

```javascript
// mock/MockChapterRepository.js

class MockChapterRepository {
  constructor() {
    this.data = [];
    this.idCounter = 1;
    this._seedTestData();
  }

  _seedTestData() {
    // 序章（已完成）
    this.data.push({
      id: this.idCounter++,
      chapter_number: 0,
      title: '序章',
      content: '林墨在日常生活中偶然接触到非凡现象，被一位神秘人引导觉醒为占卜家途径序列9...',
      summary: '主角林墨接触非凡现象，在神秘人引导下觉醒为占卜家途径序列9，获得了灵视和基础占卜能力，开始了非凡者之路。',
      start_day: 1,
      end_day: 5,
      status: 'completed',
      created_at: '2026-07-06T12:00:00',
      completed_at: '2026-07-06T18:00:00'
    });

    // 第一章（进行中）
    this.data.push({
      id: this.idCounter++,
      chapter_number: 1,
      title: '第一章',
      content: '',
      summary: '',
      start_day: 6,
      end_day: 25,
      status: 'ongoing',
      created_at: '2026-07-06T18:00:00',
      completed_at: null
    });
  }

  async getByNumber(chapterNumber) {
    const found = this.data.find(c => c.chapter_number === chapterNumber);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getCurrent() {
    const found = this.data.find(c => c.status === 'ongoing');
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getAll() {
    return this.data.map(c => JSON.parse(JSON.stringify(c)));
  }

  async create(data) {
    const id = this.idCounter++;
    const chapter = {
      id,
      chapter_number: data.chapter_number || 0,
      title: data.title || '',
      content: data.content || '',
      summary: data.summary || '',
      start_day: data.start_day || 1,
      end_day: data.end_day || 5,
      status: data.status || 'ongoing',
      created_at: new Date().toISOString(),
      completed_at: null,
      ...data
    };
    this.data.push(chapter);
    return id;
  }

  async update(id, fields) {
    const item = this.data.find(c => c.id === id);
    if (item) {
      Object.assign(item, fields);
      return true;
    }
    return false;
  }

  async updateContent(chapterId, content) {
    const item = this.data.find(c => c.id === chapterId);
    if (item) {
      item.content = content;
      return true;
    }
    return false;
  }

  async updateSummary(chapterId, summary) {
    const item = this.data.find(c => c.id === chapterId);
    if (item) {
      item.summary = summary;
      return true;
    }
    return false;
  }

  // 测试辅助方法
  clear() {
    this.data = [];
    this.idCounter = 1;
  }
}

module.exports = MockChapterRepository;
```

### 8.4 MockSegmentRepository

```javascript
// mock/MockSegmentRepository.js

class MockSegmentRepository {
  constructor() {
    this.data = [];
    this.idCounter = 1;
    this._seedTestData();
  }

  _seedTestData() {
    // 预置最近 3 天的已定稿段落（用于即时上下文测试）
    const samples = [
      {
        day_number: 5,
        chapter_id: 1,
        diary_id: 1,
        content: '林墨翻开那本泛黄的神秘学典籍，烛光在书页上跳动。他感到一阵寒意从脊背升起，仿佛有什么东西正在暗处注视着他。灵视中，书页上的文字似乎在缓缓蠕动...',
        status: 'finalized'
      },
      {
        day_number: 6,
        chapter_id: 2,
        diary_id: 2,
        content: '塔罗会的聚会如期举行。林墨以「愚者」的代号参与了这次雾之上的集会。其他成员带来了关于城市中异常波动的情报，似乎有什么东西正在苏醒...',
        status: 'finalized'
      },
      {
        day_number: 7,
        chapter_id: 2,
        diary_id: 3,
        content: '午后的阳光透过窗帘的缝隙洒入房间，林墨从冥想中缓缓睁开双眼。灵性力量的恢复让他感到前所未有的清明。他取出一副塔罗牌，开始为今晚的行动进行占卜...',
        status: 'finalized'
      }
    ];

    for (const sample of samples) {
      const id = this.idCounter++;
      this.data.push({
        id,
        ...sample,
        mapping_desc: JSON.stringify([
          { behavior: '学习', world_behavior: '研读神秘学典籍', description: '研读神秘学相关书籍' }
        ]),
        revision_count: 0,
        internal_review_count: 2,
        is_edited: false,
        created_at: new Date(Date.now() - (8 - sample.day_number) * 86400000).toISOString(),
        finalized_at: new Date(Date.now() - (8 - sample.day_number) * 86400000 + 3600000).toISOString()
      });
    }
  }

  async create({ day_number, chapter_id, diary_id, status = 'pending' }) {
    const id = this.idCounter++;
    this.data.push({
      id,
      day_number,
      chapter_id,
      diary_id,
      content: '',
      mapping_desc: '',
      revision_count: 0,
      internal_review_count: 0,
      is_edited: false,
      status,
      created_at: new Date().toISOString(),
      finalized_at: null
    });
    return id;
  }

  async getById(id) {
    const found = this.data.find(s => s.id === id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getByDay(dayNumber) {
    const found = this.data.find(s => s.day_number === dayNumber);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getRecent(days) {
    // 返回最近 N 天已定稿段落
    const finalized = this.data
      .filter(s => s.status === 'finalized')
      .sort((a, b) => b.day_number - a.day_number)
      .slice(0, days);
    return finalized.map(s => JSON.parse(JSON.stringify(s)));
  }

  async getByChapter(chapterId) {
    const results = this.data.filter(s => s.chapter_id === chapterId);
    return results.map(s => JSON.parse(JSON.stringify(s)));
  }

  async updateContent(id, content) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.content = content;
      return true;
    }
    return false;
  }

  async updateStatus(id, status) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.status = status;
      return true;
    }
    return false;
  }

  async updateMapping(id, mappingDesc) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.mapping_desc = mappingDesc;
      return true;
    }
    return false;
  }

  async update(id, fields) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      Object.assign(item, fields);
      return true;
    }
    return false;
  }

  async incrementRevision(id) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.revision_count++;
      return true;
    }
    return false;
  }

  async markEdited(id) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.is_edited = true;
      return true;
    }
    return false;
  }

  async markFinalized(id) {
    const item = this.data.find(s => s.id === id);
    if (item) {
      item.status = 'finalized';
      item.finalized_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  // 测试辅助方法
  clear() {
    this.data = [];
    this.idCounter = 1;
  }
}

module.exports = MockSegmentRepository;
```

### 8.5 MockWorldRepository

```javascript
// mock/MockWorldRepository.js

class MockWorldRepository {
  constructor() {
    this.settings = [];
    this.encounters = [];
    this.encounterLogs = [];
    this.outlineNodes = [];
    this.mappings = [];
    this._seedTestData();
  }

  _seedTestData() {
    // 世界观设定
    this.settings = [
      { id: 1, world_id: 'lord_of_mysteries', category: 'power_system', key: 'sequence_system', value: '22条神之途径，每条途径从序列9到序列0共10个等级。序列9最弱，序列0相当于真神。服用对应魔药可晋升。', keywords: '序列 途径 魔药 晋升 等级', priority: 10 },
      { id: 2, world_id: 'lord_of_mysteries', category: 'power_system', key: 'non_extraordinary', value: '普通人无法感知非凡现象，世界大多数人不了解非凡者的存在。', keywords: '普通人 非凡者 隐藏', priority: 10 },
      { id: 3, world_id: 'lord_of_mysteries', category: 'path', key: 'seer_abilities', value: '占卜家途径序列9能力：灵视（看见灵体和非凡特性）、基础占卜（使用星象、塔罗牌等进行简单预测）、星象观测。', keywords: '占卜家 灵视 占卜 星象 序列9', priority: 10 },
      { id: 4, world_id: 'lord_of_mysteries', category: 'location', key: 'tarot_club', value: '塔罗会是一个秘密的非凡者组织，成员以塔罗牌代号相称，定期举行雾之上的聚会。', keywords: '塔罗会 组织 聚会 秘密', priority: 8 },
      { id: 5, world_id: 'lord_of_mysteries', category: 'character', key: 'mentor_figure', value: '引导主角觉醒的神秘人，身份不明，似乎与塔罗会有某种联系。', keywords: '导师 神秘人 引导 觉醒', priority: 6 },
      { id: 6, world_id: 'lord_of_mysteries', category: 'lore', key: 'above_the_fog', value: '雾之上的空间，非凡者可以通过冥想进入，在其中可以更清晰地感知灵性和进行交流。', keywords: '雾之上 冥想 灵性 空间', priority: 7 },
      { id: 7, world_id: 'lord_of_mysteries', category: 'power_system', key: 'potion_side_effect', value: '服用魔药可能带来精神污染和失控风险，需要通过消化和理解来稳定。', keywords: '魔药 副作用 失控 精神污染', priority: 8 }
    ];

    // 奇遇库
    this.encounters = [
      { encounter_id: 'enc_strange_letter', title: '神秘信件', content_template: '主角在住所发现一封没有署名的信件，信中用隐晦的语言提及了一个与{hero_name}近期占卜相关的预言。信封上印着一个不认识的纹章。', min_chapter: 0, max_chapter: 3, min_path_level: 9, tags: '["悬疑","线索"]' },
      { encounter_id: 'enc_stray_cat', title: '流浪猫的低语', content_template: '一只黑猫突然出现在主角面前，用异常聪慧的眼神注视着{hero_name}。在灵视中，这只猫散发着微弱的非凡气息。', min_chapter: 0, max_chapter: 5, min_path_level: 9, tags: '["日常","灵异"]' },
      { encounter_id: 'enc_old_bookshop', title: '旧书店奇遇', content_template: '主角路过一家从未注意过的旧书店，店内一本古书自行翻开，页面上的文字似乎是某种古代语言的占卜记录。', min_chapter: 1, max_chapter: 4, min_path_level: 9, tags: '["探索","线索"]' }
    ];

    // 剧情大纲节点
    this.outlineNodes = [
      { node_id: 'ch0_awakening', node_type: 'mainline', trigger_day: 1, content: '主角在日常生活中偶然接触到非凡现象，被一位神秘人引导觉醒为占卜家途径序列9。', prerequisites: '[]', branch_options: '[]' },
      { node_id: 'ch1_tarot_club', node_type: 'mainline', trigger_day: 8, content: '主角被邀请加入一个秘密的塔罗会组织，结识其他非凡者。', prerequisites: '["ch0_first_divination"]', branch_options: '[{"id":"ch1_join_mage","desc":"选择与法师成员合作","effect":"获得魔法知识线索"},{"id":"ch1_join_spy","desc":"选择与间谍成员合作","effect":"获得情报网络线索"}]' }
    ];

    // 映射规则
    this.mappings = [
      { behavior: '学习', world_behavior: '研读神秘学典籍', keywords: ['学习', '看书', '上课', '读书', '复习', '写作业', '听课', '研究'], description: '将学习行为映射为研读神秘学相关书籍或向导师求教' },
      { behavior: '工作', world_behavior: '完成塔罗会委托任务', keywords: ['工作', '上班', '加班', '开会', '写报告', '项目'], description: '将工作行为映射为完成塔罗会或非凡者组织的委托' },
      { behavior: '健身', world_behavior: '体能与战斗训练', keywords: ['健身', '运动', '跑步', '锻炼', '游泳', '打球'], description: '将健身行为映射为保持非凡者身体素质的体能训练' },
      { behavior: '社交', world_behavior: '与塔罗会成员交流情报', keywords: ['社交', '聚会', '聊天', '朋友', '聚餐', '见面'], description: '将社交行为映射为与塔罗会成员或其他非凡者交流情报' },
      { behavior: '休息', world_behavior: '冥想与灵性恢复', keywords: ['休息', '睡觉', '午休', '放松', '发呆'], description: '将休息行为映射为冥想恢复灵性和精神力' },
      { behavior: '娱乐', world_behavior: '探索非凡现象', keywords: ['娱乐', '游戏', '电影', '音乐', '逛街', '旅游'], description: '将娱乐行为映射为探索城市中的神秘事件或非凡现象' },
      { behavior: '其他', world_behavior: '日常琐事', keywords: ['其他', '购物', '做饭', '打扫', '通勤'], description: '将其他日常行为映射为世界观内的日常琐事' }
    ];
  }

  async getSettings(worldId, category) {
    let results = this.settings.filter(s => s.world_id === worldId);
    if (category) {
      results = results.filter(s => s.category === category);
    }
    return results.map(s => JSON.parse(JSON.stringify(s)));
  }

  async searchByKeywords(worldId, keywords, limit = 5) {
    let results = this.settings.filter(s => s.world_id === worldId);
    
    // 关键词匹配：检查 settings 的 keywords 字段是否包含任一搜索关键词
    results = results.filter(s => {
      if (!s.keywords) return false;
      const settingKeywords = s.keywords.split(' ');
      return keywords.some(kw => 
        settingKeywords.some(sk => sk.includes(kw) || kw.includes(sk))
      );
    });

    // 按 priority 降序排序
    results.sort((a, b) => b.priority - a.priority);

    // 取 Top N
    if (limit) {
      results = results.slice(0, limit);
    }

    return results.map(s => JSON.parse(JSON.stringify(s)));
  }

  async getEncounters(worldId, chapterNumber, pathLevel) {
    let results = this.encounters.filter(e => 
      e.min_chapter <= chapterNumber && 
      e.max_chapter >= chapterNumber &&
      e.min_path_level <= pathLevel
    );
    return results.map(e => JSON.parse(JSON.stringify(e)));
  }

  async getLogEncounterIds() {
    return this.encounterLogs.map(log => log.encounter_id);
  }

  async logEncounter(dayNumber, encounterId, content) {
    this.encounterLogs.push({
      id: this.encounterLogs.length + 1,
      day_number: dayNumber,
      encounter_id: encounterId,
      content,
      created_at: new Date().toISOString()
    });
    return true;
  }

  async getOutlineNodes(worldId, chapterNumber) {
    let results = this.outlineNodes.filter(n => 
      n.chapter_number === chapterNumber || n.trigger_day === chapterNumber
    );
    return results.map(n => JSON.parse(JSON.stringify(n)));
  }

  async getMappings(worldId) {
    return this.mappings.map(m => JSON.parse(JSON.stringify(m)));
  }

  // 测试辅助方法
  clear() {
    this.settings = [];
    this.encounters = [];
    this.encounterLogs = [];
    this.outlineNodes = [];
    this.mappings = [];
  }
}

module.exports = MockWorldRepository;
```

### 8.6 Mock 配置的初始化与使用

在 AI 工程师开发阶段，通过以下方式初始化所有 Mock 组件并注入 StoryEngine：

```javascript
// mock/index.js — Mock 环境初始化

const MockUserRepository = require('./MockUserRepository');
const MockDiaryRepository = require('./MockDiaryRepository');
const MockChapterRepository = require('./MockChapterRepository');
const MockSegmentRepository = require('./MockSegmentRepository');
const MockWorldRepository = require('./MockWorldRepository');

const StoryEngine = require('../src/core/StoryEngine');
const PromptBuilder = require('../src/ai/PromptBuilder');
const ReviewLoop = require('../src/ai/ReviewLoop');
const SummaryGenerator = require('../src/ai/SummaryGenerator');
const ImmediateContext = require('../src/memory/ImmediateContext');
const SummaryMemory = require('../src/memory/SummaryMemory');
const RAGRetriever = require('../src/memory/RAGRetriever');
const { getAdapterClass } = require('../src/ai/adapters');
const DiaryParser = require('../src/core/DiaryParser');
const MappingEngine = require('../src/core/MappingEngine');

/**
 * 创建使用 Mock Repository 的 StoryEngine 实例
 * 用于 AI 工程师独立开发和测试
 */
function createMockStoryEngine() {
  const userRepo = new MockUserRepository();
  const diaryRepo = new MockDiaryRepository();
  const chapterRepo = new MockChapterRepository();
  const segmentRepo = new MockSegmentRepository();
  const worldRepo = new MockWorldRepository();

  const promptBuilder = new PromptBuilder();
  const reviewLoop = new ReviewLoop();
  const summaryGenerator = new SummaryGenerator();
  const immediateContext = new ImmediateContext(segmentRepo);
  const summaryMemory = new SummaryMemory(chapterRepo);
  const ragRetriever = new RAGRetriever(worldRepo);
  const diaryParser = new DiaryParser(/* adapter will be injected per call */);
  const mappingEngine = new MappingEngine();

  const storyEngine = new StoryEngine({
    userRepo, diaryRepo, chapterRepo, segmentRepo, worldRepo,
    adapterFactory: getAdapterClass,
    promptBuilder, reviewLoop, summaryGenerator,
    immediateContext, summaryMemory, ragRetriever,
    encounterEngine: null, // 可后续注入
    diaryParser, mappingEngine
  });

  return storyEngine;
}

module.exports = { createMockStoryEngine };
```

**阶段 3 联调时**，只需将 Mock Repository 替换为前端工程师实现的真实 Repository，StoryEngine 和所有 AI 组件代码无需任何修改。

---

## 九、错误处理

### 9.1 错误码体系

AI 工程师需处理的 14 个错误码及其触发条件和处理策略如下。其中 E001-E007 为 AI 调用相关错误（AI 工程师主责），E008-E010 为数据库相关错误（前端工程师主责，AI 工程师需捕获并传递），E011-E014 为其他功能错误。

| 错误码 | 类型 | 说明 | 触发条件 | AI 工程师处理策略 | 用户提示 |
|--------|------|------|---------|------------------|---------|
| E001 | API_KEY_INVALID | API Key 无效 | AI 适配器返回 HTTP 401 | 返回错误，不重试，提示用户检查 Key | "API Key 无效，请检查设置" |
| E002 | API_KEY_EXPIRED | API Key 过期 | AI 适配器返回 HTTP 403 | 返回错误，不重试，提示用户更新 Key | "API Key 已过期，请更新" |
| E003 | API_RATE_LIMIT | 触发频率限制 | AI 适配器返回 HTTP 429 | 等待 5 秒后自动重试，最多 2 次 | "请求过于频繁，请稍后重试" |
| E004 | API_QUOTA_EXCEEDED | 额度用尽 | AI 适配器返回 HTTP 402 或额度相关错误 | 返回错误，不重试，提示充值或更换 Key | "AI 额度已用完，请充值或更换 Key" |
| E005 | API_TIMEOUT | 请求超时（>60s） | AbortController 触发超时 | 返回错误，不消耗重生成次数，用户可手动重试 | "生成超时，请检查网络后重试" |
| E006 | API_NETWORK_ERROR | 网络错误 | fetch 抛出非超时异常 | 返回错误，用户可手动重试 | "网络连接失败，请检查网络" |
| E007 | API_RESPONSE_ERROR | 响应格式错误 | AI 返回空内容、JSON 解析失败、未知 HTTP 错误 | 自动重试 1 次，仍失败则返回错误 | "AI 返回异常，请重试" |
| E008 | DB_INIT_ERROR | 数据库初始化失败 | Repository 方法抛出初始化异常 | 捕获并传递给前端，AI 层不处理 | "数据初始化失败，请重启 App" |
| E009 | DB_WRITE_ERROR | 数据库写入失败 | Repository 写入方法返回 false 或抛出异常 | 捕获异常，尝试重试 1 次，仍失败则返回错误 | "数据保存失败，请重试" |
| E010 | DB_CORRUPT_ERROR | 数据库损坏 | Repository 读取返回异常数据 | 捕获并传递给前端 | "数据损坏，请从备份恢复或重置" |
| E011 | SPEECH_NOT_SUPPORTED | 语音识别不支持 | — | AI 工程师不处理（前端职责） | "当前设备不支持语音输入，请使用文字" |
| E012 | SPEECH_RECOGNITION_FAILED | 语音识别失败 | — | AI 工程师不处理（前端职责） | "语音识别失败，请重试或手动输入" |
| E013 | EXPORT_FAILED | 导出失败 | — | AI 工程师不处理（前端职责） | "导出失败，请重试" |
| E014 | IMPORT_INVALID_FORMAT | 导入格式错误 | — | AI 工程师不处理（前端职责） | "文件格式不正确，请选择有效的备份文件" |

### 9.2 AI 调用失败的重试逻辑

AI 调用失败时的重试策略根据错误类型差异化处理：

```javascript
// src/utils/ErrorHandler.js

class ErrorHandler {
  // 可重试的错误码
  static RETRYABLE_ERRORS = ['E003', 'E005', 'E006', 'E007'];

  // 各错误码的重试配置
  static RETRY_CONFIG = {
    E003: { maxRetries: 2, delayMs: 5000, description: '频率限制，等待后重试' },
    E005: { maxRetries: 0, delayMs: 0,    description: '超时，不自动重试（用户手动重试）' },
    E006: { maxRetries: 1, delayMs: 2000, description: '网络错误，短暂等待后重试' },
    E007: { maxRetries: 1, delayMs: 1000, description: '响应错误，快速重试' }
  };

  // 不可重试的错误码（直接返回给用户）
  static NON_RETRYABLE_ERRORS = ['E001', 'E002', 'E004'];

  /**
   * 判断错误是否可重试
   */
  static isRetryable(errorCode) {
    return this.RETRYABLE_ERRORS.includes(errorCode);
  }

  /**
   * 获取重试配置
   */
  static getRetryConfig(errorCode) {
    return this.RETRY_CONFIG[errorCode] || { maxRetries: 0, delayMs: 0 };
  }

  /**
   * 延迟函数
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带重试的 AI 调用封装
   * @param {Function} apiCall - AI 调用函数，返回 { success, error, errorCode }
   * @param {string} operation - 操作名称（用于日志）
   * @returns {Promise<Object>} 调用结果
   */
  static async callWithRetry(apiCall, operation = 'AI调用') {
    let lastResult = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await apiCall();

      if (result.success) {
        return result;
      }

      lastResult = result;
      const errorCode = result.errorCode;

      // 不可重试的错误，直接返回
      if (this.NON_RETRYABLE_ERRORS.includes(errorCode)) {
        return result;
      }

      // 可重试的错误
      if (this.isRetryable(errorCode)) {
        const config = this.getRetryConfig(errorCode);
        if (attempt < config.maxRetries) {
          console.warn(`${operation}失败（${errorCode}），${config.delayMs}ms 后重试...`);
          await this.delay(config.delayMs);
          continue;
        }
      }

      // 其他错误或重试次数耗尽
      return result;
    }

    return lastResult;
  }

  /**
   * 将适配器返回的错误码映射为用户可读的消息
   */
  static getUserMessage(errorCode, errorMsg) {
    const messages = {
      E001: 'API Key 无效，请检查设置',
      E002: 'API Key 已过期，请更新',
      E003: '请求过于频繁，请稍后重试',
      E004: 'AI 额度已用完，请充值或更换 Key',
      E005: '生成超时，请检查网络后重试',
      E006: '网络连接失败，请检查网络',
      E007: 'AI 返回异常，请重试',
      E008: '数据初始化失败，请重启 App',
      E009: '数据保存失败，请重试',
      E010: '数据损坏，请从备份恢复或重置'
    };
    return messages[errorCode] || errorMsg || '未知错误';
  }
}

module.exports = ErrorHandler;
```

### 9.3 AI 生成失败处理流程图

```
用户点击"生成故事"
  │
  ▼
调用 AI API（初稿生成）
  │
  ├─ 成功 → 进入审查循环 → 输出预览
  │
  └─ 失败
       ├─ E001/E002（Key 问题）
       │    → 返回错误，不重试
       │    → 前端提示检查 Key，可跳转设置页
       │
       ├─ E003（频率限制）
       │    → 等待 5 秒自动重试，最多 2 次
       │    → 重试成功 → 继续生成流程
       │    → 重试耗尽 → 返回错误
       │
       ├─ E004（额度用尽）
       │    → 返回错误，不重试
       │    → 前端提示充值或更换 Key
       │
       ├─ E005（超时）
       │    → 返回错误，不自动重试
       │    → 不消耗用户重生成次数
       │    → 前端显示"重试"按钮
       │
       ├─ E006（网络错误）
       │    → 自动重试 1 次（等待 2 秒）
       │    → 重试成功 → 继续生成流程
       │    → 重试失败 → 返回错误
       │
       └─ E007（响应错误）
            → 自动重试 1 次（等待 1 秒）
            → 重试成功 → 继续生成流程
            → 重试失败 → 返回错误
```

### 9.4 内部审查失败的降级策略

内部审查循环中的失败处理遵循"保证用户始终能拿到结果"的原则：

| 失败场景 | 降级策略 | 说明 |
|---------|---------|------|
| 审查轮 1 AI 调用失败 | 跳过轮 1，直接进入轮 2 | 使用初稿进入下一轮审查 |
| 审查轮 1 JSON 解析失败 | 跳过轮 1，直接进入轮 2 | AI 返回非标准格式时容错 |
| 审查轮 1 重试耗尽仍未通过 | 使用最后一次修改稿进入轮 2 | 输出当前最优版本 |
| 审查轮 2 AI 调用失败 | 跳过轮 2，直接进入润色 | 使用轮 1 结果进入润色 |
| 审查轮 2 JSON 解析失败 | 跳过轮 2，直接进入润色 | 同上 |
| 审查轮 2 重试耗尽仍未通过 | 使用最后一次修改稿进入润色 | 输出当前最优版本 |
| 润色 AI 调用失败 | 跳过润色，直接输出 | 使用审查后的版本作为最终版本 |
| 摘要生成 AI 调用失败 | 摘要为空，章节仍标记完成 | 下次启动时补生成摘要 |
| 日记解析 AI 调用失败 | 使用用户选的标签作为 fallback | 不阻断生成流程 |
| 三层记忆获取失败 | 跳过该层，用空字符串填充 | 不阻断生成流程 |

**核心原则**：
1. 任何 AI 调用失败都不应导致整个生成流程卡死。
2. 审查和润色是"锦上添花"的步骤，失败时降级为"输出当前最优版本"。
3. 只有初稿生成失败才是真正的"生成失败"，需要返回错误给用户。
4. 初稿生成失败时，状态置为 `generate_failed`，用户可手动重试。

### 9.5 StoryEngine 中的错误映射

StoryEngine 需要将 AI 适配器返回的错误码映射到 `GenerateResult.errorCode` 字段：

```javascript
// StoryEngine 中的错误映射方法
_mapApiError(error) {
  // 适配器已经返回了 errorCode（如 E001-E007）
  // 此方法用于处理适配器未返回 errorCode 的边缘情况
  if (!error) return 'E007';

  const errorLower = error.toLowerCase();
  if (errorLower.includes('invalid api key') || errorLower.includes('unauthorized')) {
    return 'E001';
  }
  if (errorLower.includes('forbidden') || errorLower.includes('expired')) {
    return 'E002';
  }
  if (errorLower.includes('rate limit') || errorLower.includes('too many requests')) {
    return 'E003';
  }
  if (errorLower.includes('quota') || errorLower.includes('insufficient')) {
    return 'E004';
  }
  if (errorLower.includes('timeout') || errorLower.includes('abort')) {
    return 'E005';
  }
  if (errorLower.includes('network') || errorLower.includes('fetch')) {
    return 'E006';
  }
  return 'E007';
}
```

### 9.6 错误处理在 generateStory 中的集成

```javascript
// StoryEngine.generateStory 中的错误处理片段
async generateStory({ diaryText, behaviorTags, dayNumber }) {
  // ... 前置检查 ...

  try {
    // 步骤 4：初稿生成（带重试）
    const generateResult = await ErrorHandler.callWithRetry(
      () => adapter.chat({
        apiKey, baseUrl,
        systemPrompt: context.systemPrompt,
        userPrompt: context.userPrompt,
        temperature: user.ai_temperature,
        maxTokens: user.ai_max_tokens
      }),
      '初稿生成'
    );

    if (!generateResult.success) {
      await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
      return {
        success: false,
        segmentId,
        error: generateResult.error,
        errorCode: generateResult.errorCode || this._mapApiError(generateResult.error)
      };
    }

    // ... 审查循环、润色等后续步骤 ...

  } catch (error) {
    // 未知异常：确保不卡在 generating 状态
    if (this._currentSegmentId) {
      await this.segmentRepo.updateStatus(
        this._currentSegmentId, 'generate_failed'
      ).catch(() => {});
    }
    return {
      success: false,
      error: error.message || '生成过程中发生未知错误',
      errorCode: 'E007'
    };
  } finally {
    this._generatingLock = false;
    this._currentSegmentId = null;
  }
}
```

---

## 十、开发计划

### 10.1 总体时间线

AI 工程师的开发工作对应角色分工总览中的阶段 1-2，共 5 个工作日。阶段 3-4 为联调和调优，与前端工程师和内容创作者协同。

| 阶段 | 天数 | AI 工程师任务 | 交付物 |
|------|------|-------------|--------|
| 阶段 1 | 第 1-3 天 | Prompt 模板 + 4 个 AI 适配器 + Mock Repository | 可独立运行的 AI 编排层骨架 |
| 阶段 2 | 第 4-5 天 | 审查循环 + 三层记忆 + 故事引擎 | 完整的 StoryEngine 实现 |
| 阶段 3 | 第 6-7 天 | 联调：替换 Mock，全流程测试 | 联调通过的 AI 链路 |
| 阶段 4 | 第 8-10 天 | Prompt 调优 + 文风调整 | 最终交付的 AI 链路 |

### 10.2 阶段 1 按天拆分（第 1-3 天）

#### 第 1 天：Prompt 模板系统 + Mock Repository

| 时段 | 任务 | 产出文件 | 验收标准 |
|------|------|---------|---------|
| 上午 | 编写 8 种 Prompt 模板完整文本 | `src/ai/PromptBuilder.js` | 8 个模板字符串完整定义，含变量占位符 |
| 上午 | 编写审查 Prompt（轮次 1+2） | `src/ai/ReviewLoop.js`（模板部分） | 审查 Prompt 输出 JSON 格式定义 |
| 上午 | 编写摘要生成 Prompt、润色 Prompt、日记解析 Prompt | `src/ai/SummaryGenerator.js`（模板部分）等 | 3 个辅助 Prompt 完整文本 |
| 下午 | 实现 PromptBuilder 拼装器 | `src/ai/PromptBuilder.js` | build() 方法可组装完整 systemPrompt + userPrompt |
| 下午 | 实现 TokenCounter 工具 | `src/utils/TokenCounter.js` | estimate() 方法可估算中文 token 数 |
| 下午 | 实现 5 个 Mock Repository | `mock/Mock*.js` | 所有接口 B 方法可调用，返回预置测试数据 |

**第 1 天验收检查清单**：
- [ ] PromptBuilder.build() 传入所有变量后，输出的 systemPrompt 和 userPrompt 格式正确
- [ ] 8 种模板的变量替换无遗漏
- [ ] MockUserRepository.get() 返回完整的 UserSettings 对象
- [ ] MockSegmentRepository.getRecent(3) 返回 3 条 finalized 段落
- [ ] MockWorldRepository.searchByKeywords() 能按关键词匹配返回结果
- [ ] TokenCounter.estimate() 对中文文本估算合理

#### 第 2 天：AI 适配器实现

| 时段 | 任务 | 产出文件 | 验收标准 |
|------|------|---------|---------|
| 上午 | 实现 AIAdapter 接口定义 | `src/ai/adapters/AIAdapter.js` | TypeScript 接口定义完整 |
| 上午 | 实现适配器工厂 | `src/ai/adapters/index.js` | getAdapterClass() 可按 providerId 返回适配器类 |
| 上午 | 实现 DeepSeekAdapter | `src/ai/adapters/DeepSeekAdapter.js` | chat() 和 testConnection() 可调用，错误处理完整 |
| 下午 | 实现 OpenAIAdapter | `src/ai/adapters/OpenAIAdapter.js` | 同上 |
| 下午 | 实现 KimiAdapter | `src/ai/adapters/KimiAdapter.js` | temperature 截断逻辑正确 |
| 下午 | 实现 QwenAdapter | `src/ai/adapters/QwenAdapter.js` | 同上 |
| 下午 | 实现 ErrorHandler 工具 | `src/utils/ErrorHandler.js` | callWithRetry() 可按错误码差异化重试 |

**第 2 天验收检查清单**：
- [ ] 4 个适配器的 chat() 方法都能正确组装请求体（messages 数组格式）
- [ ] 4 个适配器都能正确解析响应（choices[0].message.content）
- [ ] HTTP 401 → E001，403 → E002，429 → E003，402 → E004 映射正确
- [ ] AbortController 超时 60 秒后返回 E005
- [ ] KimiAdapter 的 temperature > 1 时截断为 1.0
- [ ] ErrorHandler.callWithRetry() 对 E003 等待 5 秒后重试
- [ ] 使用真实 API Key 测试至少 1 个适配器的 testConnection() 通过

#### 第 3 天：DiaryParser + MappingEngine + 辅助组件

| 时段 | 任务 | 产出文件 | 验收标准 |
|------|------|---------|---------|
| 上午 | 实现 DiaryParser | `src/core/DiaryParser.js` | parse() 返回 { events, detectedBehaviors, keywords } |
| 上午 | 实现 MappingEngine | `src/core/MappingEngine.js` | map() 返回 JSON 字符串格式的映射结果 |
| 上午 | 实现 EncounterEngine | `src/core/EncounterEngine.js` | checkAndTrigger() 按概率触发奇遇，去重正确 |
| 下午 | 实现 SummaryGenerator | `src/ai/SummaryGenerator.js` | generate() 返回 200-300 字摘要 |
| 下午 | 实现 ProgressTracker | `src/core/ProgressTracker.js` | 天数递增、断更检测、完结判定逻辑正确 |
| 下午 | 实现 ChapterManager | `src/core/ChapterManager.js` | 章节边界检测、新章节创建逻辑正确 |
| 下午 | Mock 环境整合测试 | `mock/index.js` | createMockStoryEngine() 返回完整 StoryEngine 实例 |

**第 3 天验收检查清单**：
- [ ] DiaryParser.parse() 能正确提取事件和行为分类（用真实 AI 测试）
- [ ] MappingEngine.map() 能将"学习"映射为"研读神秘学典籍"
- [ ] EncounterEngine 按概率触发奇遇且不重复触发已触发过的奇遇
- [ ] SummaryGenerator.generate() 返回 200-300 字的摘要
- [ ] ChapterManager 能检测到第 5/25/45/65/85/90 天为章节边界
- [ ] createMockStoryEngine() 返回的 StoryEngine 实例所有依赖注入完整

### 10.3 阶段 2 按天拆分（第 4-5 天）

#### 第 4 天：三层记忆管理 + 审查循环

| 时段 | 任务 | 产出文件 | 验收标准 |
|------|------|---------|---------|
| 上午 | 实现 ImmediateContext | `src/memory/ImmediateContext.js` | get() 返回最近 3 天 finalized 段落，Token 超限时降级为 2 天 |
| 上午 | 实现 SummaryMemory | `src/memory/SummaryMemory.js` | getAll() 返回所有已完成章节摘要，Token 超限时降级为最近 2 章 |
| 上午 | 实现 RAGRetriever | `src/memory/RAGRetriever.js` | retrieve() 返回 Top 5 世界观设定，关键词扩展和去重正确 |
| 下午 | 实现 ReviewLoop 完整逻辑 | `src/ai/ReviewLoop.js` | run() 方法执行 2 轮审查，重试逻辑和降级策略正确 |
| 下午 | 实现 JSON 解析容错 | `src/ai/ReviewLoop.js` | _parseReviewJson() 能处理 ```json 包裹和裸 JSON |
| 下午 | 三层记忆 + 审查循环集成测试 | 临时测试脚本 | 用 Mock 数据跑通记忆获取 + 审查循环 |

**第 4 天验收检查清单**：
- [ ] ImmediateContext.get(8) 返回第 5/6/7 天的段落内容
- [ ] SummaryMemory.getAll() 返回序章摘要
- [ ] RAGRetriever.retrieve(['学习','占卜']) 返回包含 seer_abilities 和 sequence_system 的结果
- [ ] ReviewLoop.run() 在审查通过时返回 passed=true
- [ ] ReviewLoop.run() 在审查不通过时返回修改后的 finalContent
- [ ] ReviewLoop 在 AI 调用失败时跳过审查，返回 passed=true（降级）
- [ ] 三层记忆 Token 预算降级策略生效

#### 第 5 天：StoryEngine 完整实现

| 时段 | 任务 | 产出文件 | 验收标准 |
|------|------|---------|---------|
| 上午 | 实现 StoryEngine 构造和依赖注入 | `src/core/StoryEngine.js` | 所有依赖正确注入，并发锁机制工作 |
| 上午 | 实现 generateStory 方法 | `src/core/StoryEngine.js` | 10 步流程完整执行，状态机正确流转 |
| 上午 | 实现 _assembleContext 私有方法 | `src/core/StoryEngine.js` | 三层记忆并行获取，Prompt 正确组装 |
| 下午 | 实现 regenerate 方法 | `src/core/StoryEngine.js` | 重生成计数正确，Prompt 中加入差异化指令 |
| 下午 | 实现 finalize + saveEdit 方法 | `src/core/StoryEngine.js` | 定稿后进度更新，章节边界检查触发 |
| 下午 | 实现 getStatus + _checkChapterBoundary | `src/core/StoryEngine.js` | 状态查询正确，章节边界触发摘要生成 |
| 下午 | 全流程 Mock 测试 | 临时测试脚本 | 用 Mock + 真实 API Key 跑通完整生成流程 |

**第 5 天验收检查清单**：
- [ ] generateStory() 返回 { success: true, segmentId, content, mappingDesc }
- [ ] 段落状态按 pending → parsing → generating → draft_ready 流转
- [ ] regenerate() 在 revision_count >= 3 时返回错误
- [ ] finalize() 正确更新 current_day 并检查章节边界
- [ ] saveEdit() 标记 is_edited=true 并定稿
- [ ] getStatus() 返回正确的当前状态
- [ ] 第 5 天定稿后触发章节完成流程（序章结束）
- [ ] 并发锁防止重复生成
- [ ] 使用真实 API Key 跑通完整流程，生成的小说段落质量可接受

### 10.4 阶段 3 联调任务（第 6-7 天）

| 天数 | 任务 | 说明 |
|------|------|------|
| 第 6 天 | 替换 Mock Repository 为真实 Repository | 将前端工程师交付的 Repository 实现接入 StoryEngine |
| 第 6 天 | 接口对接验证 | 确认接口 A（StoryEngine API）和接口 B（Repository API）的返回值结构完全匹配 |
| 第 6 天 | 全流程联调 | 从日记输入 → AI 生成 → 预览 → 定稿 → 章节切换的完整流程 |
| 第 7 天 | 边界场景测试 | 首日生成、章节边界日、断更恢复、连续重生成 3 次、90 天完结 |
| 第 7 天 | 错误场景测试 | API Key 错误、网络断开、额度用尽、超时等 |
| 第 7 天 | 多模型测试 | 分别用 DeepSeek / OpenAI / Kimi / Qwen 跑通生成流程 |

### 10.5 阶段 4 调优任务（第 8-10 天）

| 天数 | 任务 | 说明 |
|------|------|------|
| 第 8 天 | Prompt 调优 | 根据联调生成的实际内容，调整系统 Prompt 的文风指令、生成指令的字数要求 |
| 第 8 天 | 审查标准调优 | 调整审查 Prompt 的通过/不通过判定标准，避免过度修改或审查不力 |
| 第 9 天 | 映射规则反馈 | 根据生成结果向内容创作者反馈映射规则需要调整的地方 |
| 第 9 天 | Token 预算实测 | 用实际生成内容验证 Token 预算是否合理，调整降级阈值 |
| 第 10 天 | 最终验收 | 全流程回归测试，确认所有功能正常，交付 AI 链路 |

### 10.6 交付物清单

AI 工程师在阶段 2 结束时（第 5 天）需交付以下文件：

| # | 文件路径 | 说明 |
|---|---------|------|
| 1 | `src/ai/PromptBuilder.js` | Prompt 拼装器，含 8 种模板完整文本 |
| 2 | `src/ai/ReviewLoop.js` | 审查循环器，含审查 Prompt |
| 3 | `src/ai/SummaryGenerator.js` | 摘要生成器，含摘要 Prompt |
| 4 | `src/ai/adapters/AIAdapter.js` | 适配器接口定义 |
| 5 | `src/ai/adapters/index.js` | 适配器工厂 |
| 6 | `src/ai/adapters/DeepSeekAdapter.js` | DeepSeek 适配器 |
| 7 | `src/ai/adapters/OpenAIAdapter.js` | OpenAI 适配器 |
| 8 | `src/ai/adapters/KimiAdapter.js` | Kimi 适配器 |
| 9 | `src/ai/adapters/QwenAdapter.js` | Qwen 适配器 |
| 10 | `src/memory/ImmediateContext.js` | 即时上下文提供器 |
| 11 | `src/memory/SummaryMemory.js` | 摘要记忆提供器 |
| 12 | `src/memory/RAGRetriever.js` | RAG 检索器 |
| 13 | `src/core/StoryEngine.js` | 故事引擎（接口 A 实现） |
| 14 | `src/core/DiaryParser.js` | 日记解析器 |
| 15 | `src/core/MappingEngine.js` | 映射规则引擎 |
| 16 | `src/core/ChapterManager.js` | 章节管理器 |
| 17 | `src/core/EncounterEngine.js` | 奇遇引擎 |
| 18 | `src/core/ProgressTracker.js` | 进度追踪器 |
| 19 | `src/utils/ErrorHandler.js` | 错误处理工具 |
| 20 | `src/utils/TokenCounter.js` | Token 计数器 |
| 21 | `mock/MockUserRepository.js` | Mock 用户仓库 |
| 22 | `mock/MockDiaryRepository.js` | Mock 日记仓库 |
| 23 | `mock/MockChapterRepository.js` | Mock 章节仓库 |
| 24 | `mock/MockSegmentRepository.js` | Mock 段落仓库 |
| 25 | `mock/MockWorldRepository.js` | Mock 世界观仓库 |
| 26 | `mock/index.js` | Mock 环境初始化 |

### 10.7 关键风险与应对

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| AI 生成质量不达标 | 中 | 高 | 预留第 8-10 天调优时间；审查循环兜底；Human-in-the-Loop 允许用户编辑 |
| 不同模型输出差异大 | 高 | 中 | 4 个适配器分别测试；Prompt 模板做模型适配（如 Kimi temperature 截断） |
| Token 超限 | 低 | 高 | 三层记忆各自 Token 预算管理 + 降级策略；总 Token 控制在 12000 以内 |
| 审查 JSON 解析失败 | 中 | 中 | 三级容错解析（直接解析 → ```json 提取 → 花括号提取）；失败时降级跳过 |
| Mock 与真实 Repository 行为不一致 | 中 | 中 | Mock 严格按接口 B 定义实现；联调时逐一验证方法行为一致性 |
| API 调用延迟过高 | 低 | 中 | 60 秒超时控制；三层记忆并行获取（Promise.allSettled）减少总等待时间 |

---

## 附录 A：StoryEngine 接口快速参考

```typescript
// ===== 接口 A：StoryEngine API（前端调用，AI 实现）=====

interface StoryEngine {
  generateStory(params: {
    diaryText: string;
    behaviorTags: string[];
    dayNumber: number;
  }): Promise<GenerateResult>;

  regenerate(segmentId: number): Promise<GenerateResult>;
  finalize(segmentId: number): Promise<FinalizeResult>;
  saveEdit(segmentId: number, content: string): Promise<FinalizeResult>;
  getStatus(segmentId: number): Promise<SegmentStatus>;
}

interface GenerateResult {
  success: boolean;
  segmentId?: number;
  content?: string;
  mappingDesc?: string;
  error?: string;
  errorCode?: string;
}

interface FinalizeResult {
  success: boolean;
  dayCompleted: number;
  chapterCompleted: boolean;
  chapterSummary?: string;
  storyEnded: boolean;
  error?: string;
}

type SegmentStatus =
  | 'pending' | 'parsing' | 'generating'
  | 'draft_ready' | 'regenerating' | 'editing'
  | 'finalized' | 'generate_failed';
```

## 附录 B：Repository 接口快速参考

```typescript
// ===== 接口 B：Repository API（AI 调用，前端实现）=====

interface UserRepository {
  get(): Promise<UserSettings>;
  update(fields: Partial<UserSettings>): Promise<boolean>;
}

interface DiaryRepository {
  create(data: {
    day_number: number;
    raw_text: string;
    behavior_tags: string[];
    is_blank_day?: boolean;
  }): Promise<number>;
  getByDay(dayNumber: number): Promise<DiaryEntry | null>;
  getByRange(startDay: number, endDay: number): Promise<DiaryEntry[]>;
  update(id: number, fields: Partial<DiaryEntry>): Promise<boolean>;
}

interface ChapterRepository {
  getByNumber(chapterNumber: number): Promise<Chapter | null>;
  getCurrent(): Promise<Chapter | null>;
  getAll(): Promise<Chapter[]>;
  create(data: Partial<Chapter>): Promise<number>;
  update(id: number, fields: Partial<Chapter>): Promise<boolean>;
  updateContent(chapterId: number, content: string): Promise<boolean>;
  updateSummary(chapterId: number, summary: string): Promise<boolean>;
}

interface SegmentRepository {
  create(data: {
    day_number: number;
    chapter_id: number;
    diary_id: number;
    status?: string;
  }): Promise<number>;
  getById(id: number): Promise<Segment | null>;
  getByDay(dayNumber: number): Promise<Segment | null>;
  getRecent(days: number): Promise<Segment[]>;
  getByChapter(chapterId: number): Promise<Segment[]>;
  updateContent(id: number, content: string): Promise<boolean>;
  updateStatus(id: number, status: string): Promise<boolean>;
  updateMapping(id: number, mappingDesc: string): Promise<boolean>;
  incrementRevision(id: number): Promise<boolean>;
  markEdited(id: number): Promise<boolean>;
  markFinalized(id: number): Promise<boolean>;
}

interface WorldRepository {
  getSettings(worldId: string, category?: string): Promise<WorldSetting[]>;
  searchByKeywords(worldId: string, keywords: string[], limit?: number): Promise<WorldSetting[]>;
  getEncounters(worldId: string, chapterNumber: number, pathLevel: number): Promise<Encounter[]>;
  getLogEncounterIds(): Promise<string[]>;
  logEncounter(dayNumber: number, encounterId: string, content: string): Promise<boolean>;
  getOutlineNodes(worldId: string, chapterNumber: number): Promise<OutlineNode[]>;
  getMappings(worldId: string): Promise<MappingRule[]>;
}
```

## 附录 C：错误码快速参考

| 错误码 | 类型 | 用户提示 | AI 工程师处理 |
|--------|------|---------|-------------|
| E001 | API_KEY_INVALID | "API Key 无效，请检查设置" | 不重试，返回错误 |
| E002 | API_KEY_EXPIRED | "API Key 已过期，请更新" | 不重试，返回错误 |
| E003 | API_RATE_LIMIT | "请求过于频繁，请稍后重试" | 等待 5 秒重试，最多 2 次 |
| E004 | API_QUOTA_EXCEEDED | "AI 额度已用完，请充值或更换 Key" | 不重试，返回错误 |
| E005 | API_TIMEOUT | "生成超时，请检查网络后重试" | 不自动重试，用户手动重试 |
| E006 | API_NETWORK_ERROR | "网络连接失败，请检查网络" | 自动重试 1 次 |
| E007 | API_RESPONSE_ERROR | "AI 返回异常，请重试" | 自动重试 1 次 |
| E008 | DB_INIT_ERROR | "数据初始化失败，请重启 App" | 捕获并传递（前端主责） |
| E009 | DB_WRITE_ERROR | "数据保存失败，请重试" | 重试 1 次，仍失败则返回错误 |
| E010 | DB_CORRUPT_ERROR | "数据损坏，请从备份恢复或重置" | 捕获并传递（前端主责） |
| E011 | SPEECH_NOT_SUPPORTED | "当前设备不支持语音输入" | AI 不处理（前端职责） |
| E012 | SPEECH_RECOGNITION_FAILED | "语音识别失败，请重试" | AI 不处理（前端职责） |
| E013 | EXPORT_FAILED | "导出失败，请重试" | AI 不处理（前端职责） |
| E014 | IMPORT_INVALID_FORMAT | "文件格式不正确" | AI 不处理（前端职责） |

---

> 本文档为 AI 工程师的完整开发手册。所有接口定义与 `MyStory-功能规划文档.md` 和 `MyStory-角色分工总览.md` 保持一致。如有接口变更，需同步更新本文档并通知前端工程师和内容创作者。
