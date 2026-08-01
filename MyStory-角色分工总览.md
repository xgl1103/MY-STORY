# My Story — 角色分工总览

> 版本：v1.0  
> 日期：2026-07-06  
> 依赖文档：`MyStory-功能规划文档.md`  
> 说明：本文档定义三角色（前端工程师、AI 工程师、内容创作者）的职责边界、接口约定和并行工作流，是三人并行开发的协调依据。

---

## 一、三角色职责矩阵

### 1.1 职责划分

| 职责域 | 前端工程师 | AI 工程师 | 内容创作者 |
|--------|-----------|----------|-----------|
| 页面 UI 与交互 | **主责** | — | — |
| 路由与导航 | **主责** | — | — |
| SQLite 数据层 | **主责** | — | — |
| 数据导出/导入 | **主责** | — | — |
| Capacitor 打包 | **主责** | — | — |
| Prompt 模板 | — | **主责** | 协助（提供世界观素材） |
| AI 适配器 | — | **主责** | — |
| 审查循环 | — | **主责** | — |
| 三层记忆管理 | — | **主责** | — |
| 故事引擎（总调度） | — | **主责** | — |
| 剧情大纲 | — | — | **主责** |
| 映射规则表 | — | 协助（定义数据格式） | **主责** |
| 世界观资料 | — | — | **主责** |
| 奇遇库 | — | — | **主责** |
| 配置 JSON 文件 | — | 协助（校验格式） | **主责** |

### 1.2 各角色"不做什么"

| 角色 | 不做的事 |
|------|---------|
| 前端工程师 | 不写 Prompt 模板、不实现 AI 调用逻辑、不编写剧情内容 |
| AI 工程师 | 不写页面 UI、不建数据库表、不编写剧情大纲 |
| 内容创作者 | 不写代码、不实现 AI 逻辑、只产出 JSON 配置和 MD 文档 |

---

## 二、系统分层与角色归属

```
┌─────────────────────────────────────────────────┐
│  表现层（前端工程师）                              │
│  页面 UI · 路由 · 交互 · 语音输入 · 打包           │
├─────────────────────────────────────────────────┤
│  ═══ 接口层 A：StoryEngine API ═══               │
│  前端调用，AI 工程师实现                           │
├─────────────────────────────────────────────────┤
│  AI 编排层 + 记忆管理层（AI 工程师）               │
│  Prompt 拼装 · AI 适配器 · 审查循环 · 三层记忆     │
├─────────────────────────────────────────────────┤
│  ═══ 接口层 B：Repository API ═══                │
│  AI 工程师调用，前端工程师实现                      │
├─────────────────────────────────────────────────┤
│  数据层（前端工程师）                              │
│  SQLite · Repository · 配置加载 · 导出导入         │
├─────────────────────────────────────────────────┤
│  ═══ 接口层 C：配置数据格式 ═══                   │
│  前端加载，AI 使用，内容创作者产出                  │
├─────────────────────────────────────────────────┤
│  内容数据层（内容创作者）                          │
│  剧情大纲 · 映射规则 · 世界观资料 · 奇遇库          │
└─────────────────────────────────────────────────┘
```

三层接口是三人并行开发的关键：
- **接口 A（StoryEngine API）**：前端 ← AI 工程师。前端调用故事生成功能
- **接口 B（Repository API）**：AI 工程师 → 前端工程师。AI 层通过 Repository 读写数据
- **接口 C（配置数据格式）**：内容创作者 → 前端 + AI。JSON 配置文件的格式约定

---

## 三、接口 A：StoryEngine API

前端工程师调用、AI 工程师实现。这是前端和 AI 层之间的唯一边界。

### 3.1 StoryEngine 接口

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
  dayCompleted: number;     // 完成的天数
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

### 3.2 调用示例

```javascript
// 前端工程师的调用方式
const result = await storyEngine.generateStory({
  diaryText: "今天看了两小时书，下午去健身房练了一个小时",
  behaviorTags: ["学习", "健身"],
  dayNumber: 7
});

if (result.success) {
  // 展示 result.content 和 result.mappingDesc
  // 用户可选择通过/重生成/编辑
} else {
  // 展示 result.error，根据 errorCode 处理
}
```

### 3.3 前端 Mock 策略

AI 工程师完成实现前，前端工程师使用 Mock 版本独立开发：

```javascript
// MockStoryEngine.js — 前端开发阶段使用
class MockStoryEngine {
  async generateStory(params) {
    await this._delay(2000); // 模拟网络延迟
    return {
      success: true,
      segmentId: Math.floor(Math.random() * 1000),
      content: "这是 Mock 生成的故事段落。{heroName}在占卜家小屋中翻开了那本泛黄的神秘学典籍...",
      mappingDesc: JSON.stringify([
        { behavior: "学习", worldBehavior: "研读神秘学典籍" },
        { behavior: "健身", worldBehavior: "体能训练" }
      ])
    };
  }
  
  async regenerate(segmentId) { /* 同上，返回不同内容 */ }
  async finalize(segmentId) { /* 返回成功 */ }
  async saveEdit(segmentId, content) { /* 返回成功 */ }
  async getStatus(segmentId) { return 'draft_ready'; }
  
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
```

---

## 四、接口 B：Repository API

AI 工程师调用、前端工程师实现。这是 AI 层访问数据的唯一通道。

### 4.1 Repository 接口清单

```typescript
// ===== UserRepository =====
interface UserRepository {
  get(): Promise<UserSettings>;
  update(fields: Partial<UserSettings>): Promise<boolean>;
}

interface UserSettings {
  id: number;
  hero_name: string;
  world_id: string;
  path_id: string;
  duration_days: number;
  current_day: number;
  current_chapter: number;
  ai_provider: string;
  ai_base_url: string | null;
  api_key_encrypted: string;
  ai_temperature: number;
  ai_max_tokens: number;
  story_started: boolean;
}

// ===== DiaryRepository =====
interface DiaryRepository {
  create(data: {
    day_number: number;
    raw_text: string;
    behavior_tags: string[];
    is_blank_day?: boolean;
  }): Promise<number>;  // 返回 id
  
  getByDay(dayNumber: number): Promise<DiaryEntry | null>;
  getByRange(startDay: number, endDay: number): Promise<DiaryEntry[]>;
  update(id: number, fields: Partial<DiaryEntry>): Promise<boolean>;
}

interface DiaryEntry {
  id: number;
  day_number: number;
  raw_text: string;
  behavior_tags: string;  // JSON 字符串
  is_blank_day: boolean;
  created_at: string;
}

// ===== ChapterRepository =====
interface ChapterRepository {
  getByNumber(chapterNumber: number): Promise<Chapter | null>;
  getCurrent(): Promise<Chapter | null>;
  getAll(): Promise<Chapter[]>;
  create(data: Partial<Chapter>): Promise<number>;
  update(id: number, fields: Partial<Chapter>): Promise<boolean>;
  updateContent(chapterId: number, content: string): Promise<boolean>;
  updateSummary(chapterId: number, summary: string): Promise<boolean>;
}

interface Chapter {
  id: number;
  chapter_number: number;
  title: string;
  content: string;
  summary: string;
  start_day: number;
  end_day: number;
  status: 'ongoing' | 'completed';
  created_at: string;
  completed_at: string | null;
}

// ===== SegmentRepository =====
interface SegmentRepository {
  create(data: {
    day_number: number;
    chapter_id: number;
    diary_id: number;
    status?: string;
  }): Promise<number>;
  
  getById(id: number): Promise<Segment | null>;
  getByDay(dayNumber: number): Promise<Segment | null>;
  getRecent(days: number): Promise<Segment[]>;  // 最近 N 天已定稿段落
  getByChapter(chapterId: number): Promise<Segment[]>;
  
  updateContent(id: number, content: string): Promise<boolean>;
  updateStatus(id: number, status: string): Promise<boolean>;
  updateMapping(id: number, mappingDesc: string): Promise<boolean>;
  incrementRevision(id: number): Promise<boolean>;
  markEdited(id: number): Promise<boolean>;
  markFinalized(id: number): Promise<boolean>;
}

interface Segment {
  id: number;
  day_number: number;
  chapter_id: number;
  diary_id: number;
  content: string;
  mapping_desc: string;
  revision_count: number;
  internal_review_count: number;
  is_edited: boolean;
  status: string;
  created_at: string;
  finalized_at: string | null;
}

// ===== WorldRepository =====
interface WorldRepository {
  getSettings(worldId: string, category?: string): Promise<WorldSetting[]>;
  searchByKeywords(worldId: string, keywords: string[], limit?: number): Promise<WorldSetting[]>;
  getEncounters(worldId: string, chapterNumber: number, pathLevel: number): Promise<Encounter[]>;
  getLogEncounterIds(): Promise<string[]>;  // 已触发的奇遇 ID
  logEncounter(dayNumber: number, encounterId: string, content: string): Promise<boolean>;
  getOutlineNodes(worldId: string, chapterNumber: number): Promise<OutlineNode[]>;
  getMappings(worldId: string): Promise<MappingRule[]>;
}

interface WorldSetting {
  id: number;
  world_id: string;
  category: string;
  key: string;
  value: string;
  keywords: string;
  priority: number;
}

interface Encounter {
  encounter_id: string;
  title: string;
  content_template: string;
  min_chapter: number;
  max_chapter: number;
  tags: string;
}

interface OutlineNode {
  node_id: string;
  node_type: string;
  trigger_day: number | null;
  content: string;
  prerequisites: string;
  branch_options: string;
}

interface MappingRule {
  behavior: string;
  world_behavior: string;
  keywords: string[];
  description: string;
}

// ===== AppConfigRepository =====
interface AppConfigRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  getAll(): Promise<Record<string, string>>;
}
```

### 4.2 AI 工程师 Mock 策略

前端工程师完成 Repository 实现前，AI 工程师使用 Mock 版本独立开发：

```javascript
// MockRepositories.js — AI 工程师开发阶段使用
class MockUserRepository {
  async get() {
    return {
      id: 1, hero_name: '你', world_id: 'lord_of_mysteries',
      path_id: 'seer', duration_days: 90, current_day: 7,
      current_chapter: 1, ai_provider: 'deepseek',
      ai_temperature: 0.8, ai_max_tokens: 2000,
      story_started: true
    };
  }
  async update(fields) { return true; }
}

class MockSegmentRepository {
  constructor() { this.data = []; this.idCounter = 1; }
  async create(data) { 
    const id = this.idCounter++;
    this.data.push({ id, ...data, content: '', status: 'pending' });
    return id;
  }
  async getById(id) { return this.data.find(s => s.id === id); }
  async getRecent(days) { return this.data.slice(-days); }
  async updateContent(id, content) { /* ... */ return true; }
  async updateStatus(id, status) { /* ... */ return true; }
  // ... 其他方法
}
```

---

## 五、接口 C：配置数据格式

内容创作者产出、前端工程师加载、AI 工程师使用。所有配置文件为 JSON 格式，放在 `src/config/worlds/{world_id}/` 目录下。

### 5.1 文件清单

| 文件 | 内容 | 产出者 | 加载者 | 使用者 |
|------|------|--------|--------|--------|
| `world.json` | 世界观基础设定 | 内容创作者 | 前端工程师 | 前端+AI |
| `paths.json` | 途径配置 | 内容创作者 | 前端工程师 | 前端+AI |
| `mappings.json` | 行为映射规则 | 内容创作者 | 前端工程师 | AI 工程师 |
| `outline.json` | 剧情大纲节点 | 内容创作者 | 前端工程师 | AI 工程师 |
| `encounters.json` | 随机奇遇库 | 内容创作者 | 前端工程师 | AI 工程师 |
| `settings.json` | 世界观设定档案 | 内容创作者 | 前端工程师 | AI 工程师 |

### 5.2 各文件格式定义

#### world.json

```json
{
  "world_id": "lord_of_mysteries",
  "world_name": "诡秘之主",
  "description": "维多利亚时代风格的架空世界，存在非凡者和非凡特性，22条神之途径各对应一种力量体系。",
  "style_guide": "诡秘、悬疑、克苏鲁风格，带有维多利亚时代的氛围。叙事节奏沉稳，善用伏笔和反转。",
  "default_path": "seer",
  "default_duration": 90,
  "chapters": [
    { "number": 0, "name": "序章", "start_day": 1, "end_day": 5, "purpose": "主角觉醒，获得占卜家途径非凡能力" },
    { "number": 1, "name": "第一章", "start_day": 6, "end_day": 25, "purpose": "适应与探索，建立基础，加入塔罗会" },
    { "number": 2, "name": "第二章", "start_day": 26, "end_day": 45, "purpose": "冲突升级，遭遇第一个重大挑战" },
    { "number": 3, "name": "第三章", "start_day": 46, "end_day": 65, "purpose": "危机与转折，途径晋升" },
    { "number": 4, "name": "第四章", "start_day": 66, "end_day": 85, "purpose": "高潮与对抗，主线冲突爆发" },
    { "number": 5, "name": "终章", "start_day": 86, "end_day": 90, "purpose": "结局与收束，故事完结" }
  ]
}
```

#### paths.json

```json
{
  "world_id": "lord_of_mysteries",
  "paths": [
    {
      "path_id": "seer",
      "path_name": "占卜家",
      "description": "掌握灵视、占卜、星象等能力的非凡者途径，善于获取信息和分析局势。",
      "levels": [
        { "level": 9, "name": "序列9·占卜家", "abilities": ["灵视", "基础占卜", "星象观测"], "description": "能看见灵体和非凡特性，进行简单占卜" },
        { "level": 8, "name": "序列8·小丑", "abilities": ["肢体控制", "表情伪装"], "description": "增强身体控制力，善于伪装" },
        { "level": 7, "name": "序列7·魔术师", "abilities": ["火焰跳跃", "纸人替身", "伤害转移"], "description": "掌握多种逃脱和防御技巧" }
      ],
      "available": true
    },
    {
      "path_id": "assassin",
      "path_name": "刺客",
      "description": "擅长潜行、暗杀和突袭的非凡者途径。",
      "levels": [],
      "available": false
    }
  ]
}
```

#### mappings.json

```json
{
  "world_id": "lord_of_mysteries",
  "mappings": [
    {
      "behavior": "学习",
      "world_behavior": "研读神秘学典籍",
      "keywords": ["学习", "看书", "上课", "读书", "复习", "写作业", "听课", "研究"],
      "description": "将学习行为映射为研读神秘学相关书籍或向导师求教"
    },
    {
      "behavior": "工作",
      "world_behavior": "完成塔罗会委托任务",
      "keywords": ["工作", "上班", "加班", "开会", "写报告", "项目"],
      "description": "将工作行为映射为完成塔罗会或非凡者组织的委托"
    },
    {
      "behavior": "健身",
      "world_behavior": "体能与战斗训练",
      "keywords": ["健身", "运动", "跑步", "锻炼", "游泳", "打球"],
      "description": "将健身行为映射为保持非凡者身体素质的体能训练"
    },
    {
      "behavior": "社交",
      "world_behavior": "与塔罗会成员交流情报",
      "keywords": ["社交", "聚会", "聊天", "朋友", "聚餐", "见面"],
      "description": "将社交行为映射为与塔罗会成员或其他非凡者交流情报"
    },
    {
      "behavior": "休息",
      "world_behavior": "冥想与灵性恢复",
      "keywords": ["休息", "睡觉", "午休", "放松", "发呆"],
      "description": "将休息行为映射为冥想恢复灵性和精神力"
    },
    {
      "behavior": "娱乐",
      "world_behavior": "探索非凡现象",
      "keywords": ["娱乐", "游戏", "电影", "音乐", "逛街", "旅游"],
      "description": "将娱乐行为映射为探索城市中的神秘事件或非凡现象"
    },
    {
      "behavior": "其他",
      "world_behavior": "日常琐事",
      "keywords": ["其他", "购物", "做饭", "打扫", "通勤"],
      "description": "将其他日常行为映射为世界观内的日常琐事"
    }
  ]
}
```

#### outline.json

```json
{
  "world_id": "lord_of_mysteries",
  "outline": [
    {
      "chapter_number": 0,
      "node_id": "ch0_awakening",
      "node_type": "mainline",
      "trigger_day": 1,
      "content": "主角在日常生活中偶然接触到非凡现象，被一位神秘人引导觉醒为占卜家途径序列9。",
      "prerequisites": [],
      "branch_options": []
    },
    {
      "chapter_number": 0,
      "node_id": "ch0_first_divination",
      "node_type": "mainline",
      "trigger_day": 3,
      "content": "主角第一次成功进行占卜，获得关于自身命运的第一条线索。",
      "prerequisites": ["ch0_awakening"],
      "branch_options": []
    },
    {
      "chapter_number": 1,
      "node_id": "ch1_tarot_club",
      "node_type": "mainline",
      "trigger_day": 8,
      "content": "主角被邀请加入一个秘密的塔罗会组织，结识其他非凡者。",
      "prerequisites": ["ch0_first_divination"],
      "branch_options": [
        { "id": "ch1_join_mage", "desc": "选择与法师成员合作", "effect": "获得魔法知识线索" },
        { "id": "ch1_join_spy", "desc": "选择与间谍成员合作", "effect": "获得情报网络线索" }
      ]
    }
  ]
}
```

#### encounters.json

```json
{
  "world_id": "lord_of_mysteries",
  "encounters": [
    {
      "encounter_id": "enc_strange_letter",
      "title": "神秘信件",
      "content_template": "主角在住所发现一封没有署名的信件，信中用隐晦的语言提及了一个与{hero_name}近期占卜相关的预言。信封上印着一个不认识的纹章。",
      "min_chapter": 0,
      "max_chapter": 3,
      "min_path_level": 9,
      "tags": ["悬疑", "线索"]
    },
    {
      "encounter_id": "enc_stray_cat",
      "title": "流浪猫的低语",
      "content_template": "一只黑猫突然出现在主角面前，用异常聪慧的眼神注视着{hero_name}。在灵视中，这只猫散发着微弱的非凡气息。",
      "min_chapter": 0,
      "max_chapter": 5,
      "min_path_level": 9,
      "tags": ["日常", "灵异"]
    },
    {
      "encounter_id": "enc_old_bookshop",
      "title": "旧书店奇遇",
      "content_template": "主角路过一家从未注意过的旧书店，店内一本古书自行翻开，页面上的文字似乎是某种古代语言的占卜记录。",
      "min_chapter": 1,
      "max_chapter": 4,
      "min_path_level": 9,
      "tags": ["探索", "线索"]
    }
  ]
}
```

#### settings.json

```json
{
  "world_id": "lord_of_mysteries",
  "settings": [
    {
      "category": "power_system",
      "key": "non_extraordinary",
      "value": "普通人无法感知非凡现象，世界大多数人不了解非凡者的存在。",
      "keywords": "普通人 非凡者 隐藏",
      "priority": 10
    },
    {
      "category": "power_system",
      "key": "sequence_system",
      "value": "22条神之途径，每条途径从序列9到序列0共10个等级。序列9最弱，序列0相当于真神。服用对应魔药可晋升。",
      "keywords": "序列 途径 魔药 晋升 等级",
      "priority": 10
    },
    {
      "category": "power_system",
      "key": "potion_side_effect",
      "value": "服用魔药可能带来精神污染和失控风险，需要通过消化和理解来稳定。",
      "keywords": "魔药 副作用 失控 精神污染",
      "priority": 8
    },
    {
      "category": "path",
      "key": "seer_abilities",
      "value": "占卜家途径序列9能力：灵视（看见灵体和非凡特性）、基础占卜（使用星象、塔罗牌等进行简单预测）、星象观测。",
      "keywords": "占卜家 灵视 占卜 星象 序列9",
      "priority": 10
    },
    {
      "category": "location",
      "key": "tarot_club",
      "value": "塔罗会是一个秘密的非凡者组织，成员以塔罗牌代号相称，定期举行above-the-fog的聚会。",
      "keywords": "塔罗会 组织 聚会 秘密",
      "priority": 8
    },
    {
      "category": "character",
      "key": "mentor_figure",
      "value": "引导主角觉醒的神秘人，身份不明，似乎与塔罗会有某种联系。",
      "keywords": "导师 神秘人 引导 觉醒",
      "priority": 6
    },
    {
      "category": "lore",
      "key": "above_the_fog",
      "value": "雾之上的空间，非凡者可以通过冥想进入，在其中可以更清晰地感知灵性和进行交流。",
      "keywords": "雾之上 冥想 灵性 空间",
      "priority": 7
    }
  ]
}
```

---

## 六、并行工作流

### 6.1 阶段划分

```
阶段 1（完全并行，无依赖）
├── 内容创作者：编写全部 6 个 JSON 配置文件 + 4 份 MD 文档
├── AI 工程师：实现 Prompt 模板 + 4 个 AI 适配器 + Mock Repository
└── 前端工程师：搭项目框架 + 数据层 Repository + Mock StoryEngine + 页面骨架

阶段 2（部分依赖）
├── 内容创作者：完成配置文件，交付给前端加载
├── AI 工程师：实现审查循环 + 三层记忆 + 故事引擎（用 Mock Repository）
└── 前端工程师：完成全部页面 UI + 交互逻辑（用 Mock StoryEngine）

阶段 3（联调）
├── 前端工程师：将 MockStoryEngine 替换为真实 StoryEngine
├── AI 工程师：将 MockRepository 替换为真实 Repository
└── 内容创作者：将配置文件导入，验证数据格式正确

阶段 4（测试调优）
├── 三方共同：全流程联调
├── AI 工程师：Prompt 调优
└── 内容创作者：根据测试结果调整剧情大纲和映射规则
```

### 6.2 依赖关系图

```
内容创作者 ──(配置 JSON 文件)──→ 前端工程师（加载配置）
                                    │
                                    │ (Repository 实现)
                                    ▼
前端工程师 ──(Repository API)──→ AI 工程师
                                    │
                                    │ (StoryEngine 实现)
                                    ▼
AI 工程师 ──(StoryEngine API)──→ 前端工程师（调用故事生成）
```

关键依赖路径：
1. 内容创作者的配置文件 → 前端工程师加载（阶段 1 结束时交付）
2. 前端工程师的 Repository → AI 工程师调用（阶段 2 结束时交付）
3. AI 工程师的 StoryEngine → 前端工程师调用（阶段 2 结束时交付）

通过 Mock 机制，三条依赖路径在阶段 1 和阶段 2 都可以解耦并行。

### 6.3 交付时间线

| 时间 | 内容创作者 | 前端工程师 | AI 工程师 |
|------|-----------|-----------|----------|
| 第 1-3 天 | 编写 6 个 JSON 配置 + 4 份 MD 文档 | 搭框架 + 数据层 + Mock StoryEngine | Prompt 模板 + 4 个适配器 + Mock Repository |
| 第 4-5 天 | 交付配置文件，协助校验 | 完成全部页面 UI | 实现审查循环 + 三层记忆 + 故事引擎 |
| 第 6-7 天 | 根据联调反馈调整内容 | 联调：替换 Mock，全流程测试 | 联调：替换 Mock，全流程测试 |
| 第 8-9 天 | 调优剧情和映射规则 | Bug 修复 + 打包 | Prompt 调优 + 文风调整 |
| 第 10 天 | 最终交付 | 交付 App 安装包 | 交付 AI 链路 |

---

## 七、接口变更管理

### 7.1 变更规则

- 任何一方修改接口定义，必须通知另外两方
- 接口变更在 `docs/MyStory-角色分工总览.md` 中记录变更日志
- 接口新增字段不破坏兼容性，可自由新增
- 接口删除或修改已有字段需要三方确认

### 7.2 变更日志

| 日期 | 变更内容 | 影响角色 | 变更人 |
|------|---------|---------|--------|
| 2026-07-06 | 初始版本创建 | 全部 | — |

---

## 八、沟通机制

- **每日同步**：三方每日简短同步进展和阻塞项（10 分钟）
- **接口问题**：接口相关问题优先处理，阻塞方需在 4 小时内响应
- **代码集成**：阶段 3 联调时，使用 Git 分支管理，主分支只合并通过测试的代码
- **文档更新**：任何一方发现文档与实际实现不一致，立即更新文档并通知
