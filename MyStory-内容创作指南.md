# My Story — 内容创作指南

> 版本：v1.0
> 日期：2026-07-06
> 依赖文档：`MyStory-功能规划文档.md`、`MyStory-角色分工总览.md`
> 说明：本文档是内容创作者的工作指南，涵盖世界观设定编写、途径配置、行为映射规则、剧情大纲、奇遇库、设定档案的编写规范与完整内容，以及配套 MD 文档的编写要求。所有 JSON 配置文件均为完整可用版本，可直接导入项目使用。

---

## 目录

- [一、角色职责边界](#一角色职责边界)
- [二、世界观基础设定编写指南](#二世界观基础设定编写指南)
- [三、途径配置编写指南](#三途径配置编写指南)
- [四、行为映射规则编写指南](#四行为映射规则编写指南)
- [五、剧情大纲编写指南](#五剧情大纲编写指南)
- [六、随机奇遇库编写指南](#六随机奇遇库编写指南)
- [七、世界观设定档案编写指南](#七世界观设定档案编写指南)
- [八、配套 MD 文档编写指南](#八配套-md-文档编写指南)
- [九、内容质量标准](#九内容质量标准)
- [十、开发计划](#十开发计划)

---

## 一、角色职责边界

### 1.1 内容创作者负责什么

内容创作者是 My Story 项目的"编剧"与"世界观档案管理员"，负责产出全部内容数据，为 AI 生成小说提供剧情骨架、映射规则和世界观素材。具体职责包括：

| 职责域 | 具体内容 |
|--------|---------|
| 剧情大纲 | 编写 6 个章节的完整剧情节点（主线、分支、高潮、收束），构建 90 天的故事框架 |
| 映射规则 | 编写 7 个行为大类到诡秘世界观行为的映射规则，覆盖用户日常表达 |
| 世界观资料 | 编写诡秘之主的力量体系、途径、地点、人物、传说等结构化设定档案 |
| 奇遇库 | 编写至少 15 个随机奇遇，覆盖悬疑、线索、日常、灵异、探索、战斗六大类 |
| 途径配置 | 编写占卜家途径序列 9-7 的完整能力配置，其他途径标记为占位 |
| 配套文档 | 编写 4 份人类可读的 MD 文档（剧情大纲、映射规则表、AI Prompt 模板、世界观资料） |
| 文风把控 | 确保所有内容符合诡秘、悬疑、克苏鲁风格，不违背诡秘之主原著设定 |
| 调优配合 | 联调阶段根据 AI 生成结果调整剧情走向、映射精度和关键词覆盖度 |

### 1.2 内容创作者不负责什么

| 不做的事 | 归属角色 |
|---------|---------|
| 编写任何代码（HTML/CSS/JS/SQL） | 前端工程师 / AI 工程师 |
| 实现 AI 调用逻辑、Prompt 拼装代码 | AI 工程师 |
| 实现审查循环、三层记忆管理代码 | AI 工程师 |
| 建数据库表、写 Repository | 前端工程师 |
| 设计页面 UI 和交互 | 前端工程师 |
| App 打包与发布 | 前端工程师 |

> 核心原则：内容创作者只产出 JSON 配置文件和 MD 文档，不碰代码。所有内容通过配置文件格式（接口 C）与工程团队对接。

### 1.3 与前端工程师的协作关系

- **交付物流向**：内容创作者产出的 6 个 JSON 配置文件，由前端工程师通过配置加载器（`src/config/worlds/lord_of_mysteries/`）加载到 SQLite 数据库的 `world_settings`、`encounter_library`、`story_outline` 等预置表中。
- **格式约定**：JSON 文件的字段名和结构必须严格遵守本文档定义的格式（即接口 C），前端工程师据此编写加载逻辑。任何字段变更必须三方确认。
- **世界观设置页**：前端工程师实现的世界观设置页会展示 `world.json` 的世界观列表、`paths.json` 的途径列表、`mappings.json` 的映射规则预览，内容创作者需确保这些数据在 UI 上展示合理。
- **首次启动预置**：App 首次启动时，前端工程师从配置文件加载预置数据，内容创作者需保证数据完整、无格式错误。

### 1.4 与 AI 工程师的协作关系

- **数据使用方式**：AI 工程师的 Prompt 拼装器（`PromptBuilder.js`）会读取内容创作者的配置数据，按以下方式使用：
  - `world.json` → 拼入系统 Prompt（世界观基础 + 文风要求）
  - `mappings.json` → 映射规则引擎匹配用户行为，拼入"当日日记 + 映射结果"
  - `outline.json` → 章节阶段指令，拼入当前章节的剧情指导
  - `encounters.json` → 奇遇引擎触发后，拼入"奇遇注入"
  - `settings.json` → RAG 检索器按关键词匹配，拼入"档案记忆"
  - `paths.json` → 拼入系统 Prompt 的主角途径能力说明
- **关键词质量**：`mappings.json` 的 keywords 和 `settings.json` 的 keywords 直接影响 AI 映射准确性和 RAG 检索质量，内容创作者需确保关键词覆盖用户常见表达。
- **剧情连贯性**：`outline.json` 的节点 content 是给 AI 的剧情指导，需写得足够明确但又留有 AI 发挥空间，避免过于死板导致生成内容生硬。
- **调优反馈循环**：联调阶段 AI 工程师反馈生成质量问题（如世界观不一致、映射生硬、剧情断裂），内容创作者据此调整配置。

### 1.5 产出物清单

内容创作者共需产出 **6 个 JSON 配置文件 + 4 份 MD 文档**，合计 10 份交付物：

#### JSON 配置文件（放置于 `src/config/worlds/lord_of_mysteries/`）

| # | 文件名 | 内容 | 字段数 | 预估体量 |
|---|--------|------|--------|---------|
| 1 | `world.json` | 世界观基础设定、文风指南、章节划分 | 7 个顶层字段 | 约 50 行 |
| 2 | `paths.json` | 途径配置（占卜家完整 + 其他途径占位） | 占卜家 3 个序列 | 约 80 行 |
| 3 | `mappings.json` | 7 个行为大类的映射规则 | 7 条映射 | 约 60 行 |
| 4 | `outline.json` | 6 个章节的完整剧情大纲节点 | 35 个节点 | 约 350 行 |
| 5 | `encounters.json` | 随机奇遇库 | 17 个奇遇 | 约 180 行 |
| 6 | `settings.json` | 世界观设定档案（RAG 检索数据） | 22 个条目 | 约 200 行 |

#### MD 文档（放置于 `docs/`）

| # | 文件名 | 内容 | 受众 |
|---|--------|------|------|
| 1 | `MyStory-剧情大纲.md` | 人类可读的剧情大纲文档 | 全团队 |
| 2 | `MyStory-映射规则表.md` | 人类可读的映射规则文档 | 全团队 |
| 3 | `MyStory-AI-Prompt模板.md` | 完整 Prompt 模板文档（含变量占位符） | AI 工程师 |
| 4 | `MyStory-世界观资料.md` | 人类可读的世界观资料文档 | 全团队 |

> 交付时间：根据角色分工总览的阶段 1，内容创作者需在第 1-3 天完成全部 10 份交付物，第 4-5 天交付并协助校验格式。

---

## 二、世界观基础设定编写指南

### 2.1 诡秘之主核心设定摘要（供内容创作者参考）

本节是内容创作者编写所有配置文件的世界观基础，务必确保所有产出内容与此一致。

#### 2.1.1 世界背景

诡秘之主是一个维多利亚时代风格的架空世界，蒸汽与神秘并存。这个世界表面上由普通人类社会运转，但暗中存在"非凡者"——通过服用"魔药"获得超凡力量的人。普通人大都不知晓非凡者的存在，世界维持着表里两层秩序。

#### 2.1.2 力量体系：序列与途径

- **22 条神之途径**：每条途径对应一种力量体系，如占卜家、刺客、学徒、阅读者、猎人、失眠者等。不同途径的能力风格迥异。
- **序列等级**：每条途径从序列 9（最弱）到序列 0（最强，相当于真神），共 10 个等级。序列越低数字越小但越强（序列 0 > 序列 9）。
- **魔药晋升**：非凡者通过服用对应序列的魔药来晋升，每次晋升获得新能力。
- **代价与风险**：服用魔药可能带来"精神污染"和"失控"风险。非凡者需要通过"消化"魔药——即理解并运用其能力——来稳定自身，否则可能异变为怪物。

#### 2.1.3 非凡特性

- 非凡特性是世界运行的本源力量之一，可以理解为"超凡能量的结晶"。
- 非凡者死后，体内的非凡特性会析出，可被他人获取。
- 非凡特性总量守恒，这决定了高序列强者的数量有限。

#### 2.1.4 雾之上

- "雾之上"是一个特殊的空间概念，非凡者可以通过冥想进入。
- 在雾之上，灵性感知更为清晰，非凡者可以在此进行更纯粹的交流与占卜。
- 塔罗会的聚会即在雾之上举行。

#### 2.1.5 占卜家途径（本项目主角途径）

| 序列 | 名称 | 核心能力 | 简介 |
|------|------|---------|------|
| 序列 9 | 占卜家 | 灵视、基础占卜、星象观测 | 能看见灵体和非凡特性，使用星象、塔罗牌等进行简单预测 |
| 序列 8 | 小丑 | 肢体控制、表情伪装 | 增强身体控制力，善于伪装情绪和身份 |
| 序列 7 | 魔术师 | 火焰跳跃、纸人替身、伤害转移 | 掌握多种逃脱和防御技巧，机动性强 |

#### 2.1.6 塔罗会

- 塔罗会是一个秘密的非凡者组织，成员以塔罗牌代号相称（如"愚者""正义""倒吊人"等）。
- 聚会在"雾之上"举行，成员间通过灵性连接交流。
- 塔罗会是非凡者交换情报、委托任务、互相帮助的重要平台。

#### 2.1.7 红月与旧日

- 天空中有"红月"这一特殊天体，与非凡现象密切相关，红月之夜常发生灵异事件。
- 远古存在"旧日支配者"等古神级别的存在，它们的影响至今仍在世界暗面涌动。
- 这些设定为悬疑、克苏鲁风格的剧情提供了土壤。

#### 2.1.8 文风基调

- 诡秘、悬疑、克苏鲁风格，带有维多利亚时代的氛围。
- 叙事节奏沉稳，善用伏笔和反转。
- 重视氛围描写：雾气、煤气灯、钟塔、雨水、阴影。
- 日常之下暗藏危机，平凡之中隐现非凡。

### 2.2 world.json 的编写规范

#### 2.2.1 文件作用

`world.json` 是世界观的"身份证"，定义世界观的标识、名称、描述、文风指南、默认途径、默认时长和章节划分。它是：
- 前端工程师加载世界观列表的依据
- AI 工程师拼装系统 Prompt 的世界观基础部分
- 章节管理器判断章节边界的依据

#### 2.2.2 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `world_id` | string | 是 | 世界观唯一标识，全小写英文+下划线 |
| `world_name` | string | 是 | 世界观显示名称 |
| `description` | string | 是 | 世界观简介（100-300 字），用于引导页展示 |
| `style_guide` | string | 是 | 文风指南（100-200 字），AI 据此控制文风 |
| `default_path` | string | 是 | 默认途径 ID，对应 paths.json 中的 path_id |
| `default_duration` | number | 是 | 默认故事时长（天），第一版固定 90 |
| `chapters` | array | 是 | 章节划分数组，每项含 number/name/start_day/end_day/purpose |

#### 2.2.3 章节划分原则

- 序章和终章较短（5 天），用于开篇引入和结局收束。
- 中间 4 章各 20 天，是故事主体。
- `purpose` 字段是给 AI 的章节定位指导，需简明扼要。
- 章节天数之和必须等于 `default_duration`。

### 2.3 world.json 完整内容

```json
{
  "world_id": "lord_of_mysteries",
  "world_name": "诡秘之主",
  "description": "维多利亚时代风格的架空世界，蒸汽与神秘并存。表层是普通人运转的工业社会，暗处却潜藏着服用魔药获得超凡力量的'非凡者'。22 条神之途径各自对应一套力量体系，从序列 9 到序列 0，每一次晋升都伴随能力跃升与失控风险。雾气弥漫的街巷、煤气灯下的阴影、红月之夜的异象——平凡日常之下，暗流涌动。",
  "style_guide": "诡秘、悬疑、克苏鲁风格，带有维多利亚时代的氛围。叙事节奏沉稳，善用伏笔和反转。重视氛围描写：雾气、煤气灯、钟塔、雨水、阴影。第三人称叙事，以主角名称呼主角。日常之下暗藏危机，平凡之中隐现非凡。每段 800-1200 字，包含场景描写、心理活动和对话，保持连载小说的悬念感。",
  "default_path": "seer",
  "default_duration": 90,
  "chapters": [
    {
      "number": 0,
      "name": "序章",
      "start_day": 1,
      "end_day": 5,
      "purpose": "主角觉醒，获得占卜家途径非凡能力，踏入非凡者世界"
    },
    {
      "number": 1,
      "name": "第一章·雾中初行",
      "start_day": 6,
      "end_day": 25,
      "purpose": "适应与探索，建立基础，加入塔罗会，完成第一个正式任务"
    },
    {
      "number": 2,
      "name": "第二章·暗流涌动",
      "start_day": 26,
      "end_day": 45,
      "purpose": "冲突升级，调查神秘失踪事件，遭遇第一个重大挑战与挫折"
    },
    {
      "number": 3,
      "name": "第三章·雾散见真",
      "start_day": 46,
      "end_day": 65,
      "purpose": "危机与转折，疗伤恢复后晋升序列 8，发现事件背后的真相"
    },
    {
      "number": 4,
      "name": "第四章·破雾之战",
      "start_day": 66,
      "end_day": 85,
      "purpose": "高潮与对抗，晋升序列 7，主线冲突全面爆发并迎来决战"
    },
    {
      "number": 5,
      "name": "终章·新的黎明",
      "start_day": 86,
      "end_day": 90,
      "purpose": "结局与收束，回收伏笔，展望未来，故事完结"
    }
  ]
}
```

> **编写要点**：`description` 用于引导页给用户看，要吸引人但不过度剧透；`style_guide` 是给 AI 的文风指令，要具体可执行，避免空泛的"写得好看"之类要求；章节 `purpose` 与后续 `outline.json` 的节点设计要呼应。

---

## 三、途径配置编写指南

### 3.1 paths.json 的编写规范

#### 3.1.1 文件作用

`paths.json` 定义世界观中所有途径的配置，包括途径名称、描述、各序列等级的能力。它是：
- 前端工程师加载途径列表的依据（`available` 字段控制是否可选）
- AI 工程师拼装系统 Prompt 时引用主角途径能力的依据
- RAG 检索的力量体系数据来源之一

#### 3.1.2 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `world_id` | string | 是 | 所属世界观 ID |
| `paths` | array | 是 | 途径数组 |
| `paths[].path_id` | string | 是 | 途径唯一标识 |
| `paths[].path_name` | string | 是 | 途径显示名称 |
| `paths[].description` | string | 是 | 途径简介 |
| `paths[].levels` | array | 是 | 序列等级数组（占位途径可为空数组） |
| `paths[].levels[].level` | number | 是 | 序列数字（9-0） |
| `paths[].levels[].name` | string | 是 | 序列名称 |
| `paths[].levels[].abilities` | array | 是 | 能力列表 |
| `paths[].levels[].description` | string | 是 | 该序列的能力描述 |
| `paths[].available` | boolean | 是 | 是否开放（第一版仅占卜家为 true） |

#### 3.1.3 编写原则

- 第一版只详细配置占卜家途径序列 9-7（对应 90 天故事进度），更高序列留给后续扩展。
- 其他途径以占位形式列出（`available: false`，`levels: []`），让前端 UI 显示"敬请期待"。
- 能力描述要准确，基于诡秘之主原著设定，不可臆造。
- `abilities` 数组的每项是简短能力名，`description` 是该序列的整体描述。

### 3.2 paths.json 完整内容

```json
{
  "world_id": "lord_of_mysteries",
  "paths": [
    {
      "path_id": "seer",
      "path_name": "占卜家",
      "description": "掌握灵视、占卜、星象等能力的非凡者途径，善于获取信息和分析局势。占卜家擅长从蛛丝马迹中窥见命运的走向，是情报与预言的掌控者。随着序列提升，逐步获得伪装、逃脱、操纵等能力，攻守兼备。",
      "levels": [
        {
          "level": 9,
          "name": "序列9·占卜家",
          "abilities": ["灵视", "基础占卜", "星象观测", "灵体感知"],
          "description": "能看见灵体和非凡特性的微光，使用星象、塔罗牌、水晶球等媒介进行简单占卜预测。灵视可感知周围灵性波动，辨别非凡者与普通人。此时能力有限，占卜结果模糊且消耗精神力较大，需要长期练习才能提升准确度。这是非凡者的起点，也是认识隐秘世界的第一扇窗。"
        },
        {
          "level": 8,
          "name": "序列8·小丑",
          "abilities": ["肢体控制", "表情伪装", "情绪收敛", "柔韧强化"],
          "description": "身体控制力大幅增强，能够精准控制每一块肌肉和面部表情，进行伪装与表演。可以收敛自身情绪波动，在灵视中降低存在感。身体柔韧性显著提升，能完成常人无法做出的动作。此序列偏向伪装与生存，是占卜家在危险世界中保护自己的重要手段。小丑并非可笑，而是以滑稽掩饰锋芒。"
        },
        {
          "level": 7,
          "name": "序列7·魔术师",
          "abilities": ["火焰跳跃", "纸人替身", "伤害转移", "快速逃脱", "幻象制造"],
          "description": "掌握多种逃脱与防御技巧。火焰跳跃可在短距离内瞬移脱身；纸人替身能制造替身承受致命伤害；伤害转移可将自身受到的伤害转移给替身或物品。还能制造简单幻象迷惑敌人。此序列机动性极强，是占卜家途径从被动防御转向主动应对的关键阶段，亦是故事高潮阶段主角的主要战力。"
        }
      ],
      "available": true
    },
    {
      "path_id": "assassin",
      "path_name": "刺客",
      "description": "擅长潜行、暗杀和突袭的非凡者途径，在阴影中行动，一击致命。",
      "levels": [],
      "available": false
    },
    {
      "path_id": "scholar",
      "path_name": "阅读者",
      "description": "以知识和学习为核心的非凡者途径，善于从书籍和文献中汲取超凡力量。",
      "levels": [],
      "available": false
    },
    {
      "path_id": "apprentice",
      "path_name": "学徒",
      "description": "掌握空间与门之力量的非凡者途径，能穿梭于不同空间。",
      "levels": [],
      "available": false
    },
    {
      "path_id": "hunter",
      "path_name": "猎人",
      "description": "擅长追踪、捕猎和野外生存的非凡者途径，是危险的追踪者。",
      "levels": [],
      "available": false
    },
    {
      "path_id": "sleepless",
      "path_name": "失眠者",
      "description": "无需睡眠、精神力充沛的非凡者途径，在黑夜中保持清醒与力量。",
      "levels": [],
      "available": false
    }
  ]
}
```

> **编写要点**：占卜家三个序列的能力描述既要准确反映原著设定，又要为 AI 生成提供足够的创作素材。其他途径保留 `path_id` 和 `path_name` 供前端展示，`levels` 留空、`available: false` 标记为不可选。后续扩展时只需填充 `levels` 并改为 `true`。

---

## 四、行为映射规则编写指南

### 4.1 mappings.json 的编写规范

#### 4.1.1 文件作用

`mappings.json` 是连接"用户真实日记"与"诡秘世界观行为"的桥梁。AI 工程师的映射规则引擎（`MappingEngine.js`）会：
1. 从用户日记中提取关键词
2. 与每条映射规则的 `keywords` 匹配
3. 将匹配到的 `behavior` 映射为 `world_behavior`
4. 将映射结果拼入 Prompt 的"当日日记 + 映射结果"部分

#### 4.1.2 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `world_id` | string | 是 | 所属世界观 ID |
| `mappings` | array | 是 | 映射规则数组 |
| `mappings[].behavior` | string | 是 | 行为大类（学习/工作/健身/社交/休息/娱乐/其他） |
| `mappings[].world_behavior` | string | 是 | 映射到的世界观行为 |
| `mappings[].keywords` | array | 是 | 触发关键词列表（至少 5 个） |
| `mappings[].description` | string | 是 | 映射说明，给 AI 的指导 |

#### 4.1.3 编写原则：大类映射不写死细节

这是最重要的编写原则。映射规则定义的是"行为大类 → 世界观行为大类"的对应关系，**不要把具体细节写死**，要给 AI 留发挥空间。

| 错误写法（写死细节） | 正确写法（留空间） |
|---------------------|-------------------|
| "学习 2 小时 → 研读《神秘学基础》第 3 章两个时辰" | "学习 → 研读神秘学典籍" |
| "去健身房练胸 → 在训练场练习格斗术" | "健身 → 体能与战斗训练" |

原因：用户日记千差万别，映射规则只需告诉 AI "这类行为对应世界观里的哪类活动"，具体怎么融入剧情、用什么场景包装，由 AI 根据上下文自由发挥。`description` 字段给 AI 额外指导，但也应保持开放。

#### 4.1.4 关键词覆盖原则

`keywords` 要覆盖用户可能使用的各种表达，包括：
- 直接词（如"学习"）
- 同义词（如"看书""读书"）
- 口语表达（如"刷题""背单词"）
- 相关活动（如"上课""听课""写作业"）
- 至少 5 个关键词，多多益善

### 4.2 mappings.json 完整内容

```json
{
  "world_id": "lord_of_mysteries",
  "mappings": [
    {
      "behavior": "学习",
      "world_behavior": "研读神秘学典籍与修炼灵性",
      "keywords": ["学习", "看书", "上课", "读书", "复习", "写作业", "听课", "研究", "背书", "刷题", "考试", "预习", "笔记", "论文", "自学"],
      "description": "将学习行为映射为研读神秘学相关书籍、向导师求教或修炼灵性感知。可根据学习内容细化：如学外语对应研读古代神秘语言，学数学对应推演星象规律。具体研读什么典籍、获得什么启发，由 AI 根据上下文发挥。"
    },
    {
      "behavior": "工作",
      "world_behavior": "完成塔罗会或非凡者组织的委托任务",
      "keywords": ["工作", "上班", "加班", "开会", "写报告", "项目", "任务", "出差", "汇报", " deadline", "赶工", "值班", "处理事务", "办公", "业务"],
      "description": "将工作行为映射为完成塔罗会分派的委托、调查任务或维持身份掩护的日常事务。工作的繁忙程度对应委托的难度与紧迫感。具体是什么委托、涉及什么势力，由 AI 根据剧情阶段发挥。"
    },
    {
      "behavior": "健身",
      "world_behavior": "非凡者体能与战斗训练",
      "keywords": ["健身", "运动", "跑步", "锻炼", "游泳", "打球", "瑜伽", "举铁", "拉伸", "骑车", "爬山", "散步", "武术", "搏击", "训练"],
      "description": "将健身行为映射为保持非凡者身体素质的体能训练、战斗技巧练习或灵性与身体的协调训练。非凡者需要强健体魄以承受魔药副作用和应对危险。具体训练形式由 AI 根据当前序列能力发挥。"
    },
    {
      "behavior": "社交",
      "world_behavior": "与塔罗会成员及非凡者圈子交流情报",
      "keywords": ["社交", "聚会", "聊天", "朋友", "聚餐", "见面", "约会", "拜访", "联络", "寒暄", "应酬", "茶话", "串门", "通话", "消息"],
      "description": "将社交行为映射为与塔罗会成员、导师或其他非凡者交流情报、建立人脉、交换线索。社交中可能获得关键信息或触发新剧情。具体交流对象和内容由 AI 根据剧情阶段和已出场人物发挥。"
    },
    {
      "behavior": "休息",
      "world_behavior": "冥想与灵性恢复",
      "keywords": ["休息", "睡觉", "午休", "放松", "发呆", "躺平", "小憩", "补觉", "放空", "养神", "打盹", "歇息", "冥想", "静坐"],
      "description": "将休息行为映射为冥想恢复灵性和精神力。非凡者消耗精神力后需要通过冥想或睡眠恢复，这也是消化魔药、整理思绪的重要时刻。休息时可能产生灵感或预兆性梦境。具体内容由 AI 发挥。"
    },
    {
      "behavior": "娱乐",
      "world_behavior": "探索城市中的神秘现象与非凡事件",
      "keywords": ["娱乐", "游戏", "电影", "音乐", "逛街", "旅游", "看剧", "追番", "听歌", "展览", "演出", "游玩", "消遣", "看戏", "闲逛"],
      "description": "将娱乐行为映射为探索城市中偶遇的神秘事件、非凡现象或消遣性质的暗中调查。娱乐活动可能成为接触新线索、新人物的契机。具体探索到什么由 AI 根据当前章节和奇遇触发情况发挥。"
    },
    {
      "behavior": "其他",
      "world_behavior": "世界观内的日常琐事与生活起居",
      "keywords": ["其他", "购物", "做饭", "打扫", "通勤", "理发", "洗衣", "缴费", "取快递", "办事", "杂事", "琐事", "家务", "采购", "整理"],
      "description": "将其他日常行为映射为世界观内的生活琐事，如采购炼金材料、整理占卜室、维持普通人身份的日常起居。这些琐事可用于调节故事节奏，也可埋入细微伏笔。具体内容由 AI 发挥。"
    }
  ]
}
```

> **编写要点**：7 个大类覆盖了用户日记的绝大多数场景。每个 `world_behavior` 只定义"行为类别"而非"具体动作"，给 AI 充分发挥空间。`keywords` 尽量丰富，覆盖书面语、口语、网络用语。`description` 中给出"可根据什么细化"的提示，引导 AI 做合理联想而非死板翻译。

---

## 五、剧情大纲编写指南

### 5.1 outline.json 的编写规范

#### 5.1.1 文件作用

`outline.json` 是 90 天故事的骨架，定义每个章节的关键剧情节点。AI 工程师的 Prompt 拼装器会根据当前天数和章节，将对应的节点 `content` 拼入"章节阶段指令"，指导 AI 生成符合主线走向的剧情。它是保证故事连贯性、起伏感和分支多样性的核心配置。

#### 5.1.2 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `world_id` | string | 是 | 所属世界观 ID |
| `outline` | array | 是 | 大纲节点数组 |
| `outline[].chapter_number` | number | 是 | 所属章节号（0=序章, 1-4=正章, 5=终章） |
| `outline[].node_id` | string | 是 | 节点唯一标识，格式 `ch{章号}_{描述}` |
| `outline[].node_type` | string | 是 | 节点类型：mainline / branch / climax / resolution |
| `outline[].trigger_day` | number | 是 | 触发天数（灵活，允许 AI 在附近天数展开） |
| `outline[].content` | string | 是 | 给 AI 的剧情指导（要明确方向但留发挥空间） |
| `outline[].prerequisites` | array | 是 | 前置节点 ID 数组（无前置则为空数组） |
| `outline[].branch_options` | array | 是 | 分支选项数组（非分支节点为空数组） |
| `branch_options[].id` | string | 是 | 分支选项 ID |
| `branch_options[].desc` | string | 是 | 分支选项描述 |
| `branch_options[].effect` | string | 是 | 分支效果说明 |

#### 5.1.3 节点类型说明

| 节点类型 | 作用 | 使用频率 |
|---------|------|---------|
| `mainline` | 主线必经节点，推动核心剧情发展 | 每章 2-3 个 |
| `branch` | 分支选择节点，根据用户输入决定走向 | 每章 1-2 个 |
| `climax` | 高潮节点，章节冲突的集中爆发 | 每章 1 个 |
| `resolution` | 收束节点，解决本章冲突、衔接下章 | 每章 1 个 |

#### 5.1.4 编写原则

1. **预设主线框架但留分支空间**：`mainline` 节点定义必须发生的主线事件，`branch` 节点提供选择，根据用户日记内容和倾向决定走向。
2. **根据用户输入决定走向**：`branch_options` 中的选项是给 AI 的参考方向，AI 会根据用户当天的行为倾向（如偏战斗还是偏智谋）选择合适分支。
3. **保证连贯性和起伏感**：每章有"铺垫→发展→高潮→收束"的节奏，`prerequisites` 确保节点间逻辑连贯。
4. **content 写法**：用第二人称或中性描述写"剧情指导"，告诉 AI 这一节点应该发生什么、达到什么效果，但不规定具体台词和场景细节，留发挥空间。
5. **trigger_day 灵活**：标记大致触发时间，允许 AI 在前后 1-2 天内自然展开。

### 5.2 outline.json 完整内容

```json
{
  "world_id": "lord_of_mysteries",
  "outline": [
    {
      "chapter_number": 0,
      "node_id": "ch0_awakening",
      "node_type": "mainline",
      "trigger_day": 1,
      "content": "故事开篇。主角{hero_name}原本过着普通人的生活，在某次日常活动中偶然接触到非凡现象（如目睹灵体、发现奇异物品、经历无法解释的事件）。一位神秘人出现，引导主角觉醒为占卜家途径序列9的非凡者。这是主角踏入隐秘世界的第一步，需要营造出'平凡日常被打破'的震撼感和悬疑氛围。主角第一次开启灵视，看见平日里看不见的灵性世界。",
      "prerequisites": [],
      "branch_options": []
    },
    {
      "chapter_number": 0,
      "node_id": "ch0_first_divination",
      "node_type": "mainline",
      "trigger_day": 2,
      "content": "主角尝试进行人生中第一次正式占卜。在导师（神秘人）的指点下，使用塔罗牌或星象进行占卜，获得关于自身命运的第一条模糊线索。占卜过程要体现精神力消耗和灵性感知的体验，结果要有悬念感，暗示后续剧情走向但不可点破。",
      "prerequisites": ["ch0_awakening"],
      "branch_options": []
    },
    {
      "chapter_number": 0,
      "node_id": "ch0_path_accept",
      "node_type": "branch",
      "trigger_day": 3,
      "content": "主角面临第一个抉择：是否正式接受这份非凡力量及其带来的风险。导师告知服用魔药会获得力量但也伴随失控危险。根据用户日记反映的心态（积极进取还是犹豫谨慎），AI 决定主角是主动接受还是经历一番内心挣扎后接受。无论哪条路，最终都踏上非凡者之路，但心态和动机不同。",
      "prerequisites": ["ch0_first_divination"],
      "branch_options": [
        { "id": "ch0_accept_eager", "desc": "主动积极接受力量，渴望探索未知", "effect": "主角性格偏向果敢好奇，后续剧情更主动出击" },
        { "id": "ch0_accept_cautious", "desc": "谨慎权衡后接受，对风险保持警惕", "effect": "主角性格偏向沉稳谨慎，后续剧情更重谋划" }
      ]
    },
    {
      "chapter_number": 0,
      "node_id": "ch0_first_danger",
      "node_type": "climax",
      "trigger_day": 4,
      "content": "序章高潮。主角刚获得力量不久，就遭遇第一次非凡危险——可能是被一只低阶灵体盯上、卷入一场非凡者冲突的余波、或被某个势力注意到。主角必须凭借新获得的灵视和基础占卜能力化险为夷。这是对主角的第一次考验，体现'力量伴随危险'的主题。危机的解决不必完美，可以带点狼狈，凸显新手的稚嫩。",
      "prerequisites": ["ch0_path_accept"],
      "branch_options": []
    },
    {
      "chapter_number": 0,
      "node_id": "ch0_stabilize",
      "node_type": "resolution",
      "trigger_day": 5,
      "content": "序章收束。主角从第一次危机中脱身，开始消化这段经历。导师给予进一步指点，告知主角若想在这条路上走远，需要前往更大的城市、加入非凡者组织。主角整理心绪，准备踏上新的旅程。为第一章做铺垫，营造'暴风雨前的宁静'感。",
      "prerequisites": ["ch0_first_danger"],
      "branch_options": []
    },
    {
      "chapter_number": 1,
      "node_id": "ch1_new_city",
      "node_type": "mainline",
      "trigger_day": 6,
      "content": "主角{hero_name}来到一座雾气弥漫的大城市（可参考维多利亚时代的伦敦），开始以非凡者身份安顿下来。需要描写城市氛围：煤气灯、钟塔、浓雾、蒸汽火车。主角找到住所，初步了解当地非凡者圈子的概况。这一节点节奏放缓，着重建立故事舞台。",
      "prerequisites": ["ch0_stabilize"],
      "branch_options": []
    },
    {
      "chapter_number": 1,
      "node_id": "ch1_mentor",
      "node_type": "mainline",
      "trigger_day": 9,
      "content": "主角结识一位正式的导师或引路人（可与序章的神秘人不同，是新城市的联系人）。导师教授主角更系统的占卜技巧、灵性修炼方法和非凡者世界的常识与规矩。通过导师之口，自然地交代世界观设定（序列体系、魔药风险、势力格局）。主角的占卜能力在此阶段稳步提升。",
      "prerequisites": ["ch1_new_city"],
      "branch_options": []
    },
    {
      "chapter_number": 1,
      "node_id": "ch1_focus_branch",
      "node_type": "branch",
      "trigger_day": 12,
      "content": "导师建议主角选择一个专研方向深入。根据用户日记中反映的倾向（偏理论学习、偏实战训练、还是偏社交情报），AI 决定主角的专研方向。不同方向会影响后续获得的能力侧重和结识的人脉。",
      "prerequisites": ["ch1_mentor"],
      "branch_options": [
        { "id": "ch1_focus_divination", "desc": "专研占卜与预言，提升信息获取能力", "effect": "占卜精度提升，后续更易发现隐藏线索" },
        { "id": "ch1_focus_combat", "desc": "专研体能与自保，提升生存能力", "effect": "战斗力提升，后续危机中更从容" },
        { "id": "ch1_focus_social", "desc": "专研人脉与情报，提升社交能力", "effect": "人脉更广，后续获得更多助力" }
      ]
    },
    {
      "chapter_number": 1,
      "node_id": "ch1_tarot_invite",
      "node_type": "mainline",
      "trigger_day": 15,
      "content": "主角因在专研方向上的表现引起注意，收到一份神秘的塔罗会邀请。邀请方式带有悬疑色彩（如梦中指引、匿名信件、导师转交）。主角第一次参加塔罗会聚会——在雾之上的空间中，以塔罗牌代号与其他非凡者交流。这是主角融入非凡者社会的关键节点。塔罗会成员的代号和性格可由 AI 发挥，但要符合诡秘氛围。",
      "prerequisites": ["ch1_focus_branch"],
      "branch_options": []
    },
    {
      "chapter_number": 1,
      "node_id": "ch1_ally_branch",
      "node_type": "branch",
      "trigger_day": 18,
      "content": "在塔罗会中，主角需要选择与哪位成员建立更紧密的合作关系。根据用户日记反映的社交倾向和前序分支选择，AI 决定主角的盟友。不同盟友提供不同资源和线索，影响后续剧情。",
      "prerequisites": ["ch1_tarot_invite"],
      "branch_options": [
        { "id": "ch1_ally_mage", "desc": "与擅长魔法的成员合作", "effect": "获得魔法知识与神秘学线索" },
        { "id": "ch1_ally_spy", "desc": "与擅长情报的成员合作", "effect": "获得情报网络与势力内幕" },
        { "id": "ch1_ally_warrior", "desc": "与擅长战斗的成员合作", "effect": "获得战斗支援与保护" }
      ]
    },
    {
      "chapter_number": 1,
      "node_id": "ch1_first_mission",
      "node_type": "climax",
      "trigger_day": 22,
      "content": "第一章高潮。主角接到第一个正式委托任务（调查一起小型非凡事件，如某街区出现的灵异现象、一件丢失的非凡物品、或一个失踪的普通人）。主角需综合运用占卜能力、盟友资源和前序专研成果完成任务。任务过程中遭遇意外困难，考验主角的成长。任务不必圆满完成，可留有悬念或伏笔。",
      "prerequisites": ["ch1_ally_branch"],
      "branch_options": []
    },
    {
      "chapter_number": 1,
      "node_id": "ch1_recognition",
      "node_type": "resolution",
      "trigger_day": 25,
      "content": "第一章收束。任务结束后，主角在塔罗会中获得一定认可，站稳脚跟。导师对主角的成长表示肯定，同时暗示更大的挑战即将到来。主角回望这段时间的成长，内心更加坚定。为第二章的冲突升级埋下伏笔——可在结尾让主角听闻一些不安的传闻或察觉到异常征兆。",
      "prerequisites": ["ch1_first_mission"],
      "branch_options": []
    },
    {
      "chapter_number": 2,
      "node_id": "ch2_rumors",
      "node_type": "mainline",
      "trigger_day": 27,
      "content": "主角{hero_name}开始听闻一系列不安的传闻：城市中接连发生普通人神秘失踪事件，线索隐隐指向非凡者世界的暗面。主角出于占卜家的直觉或塔罗会的委托，开始关注此事。这一节点营造悬疑氛围，失踪事件的真相尚不明朗，但危机感逐渐累积。",
      "prerequisites": ["ch1_recognition"],
      "branch_options": []
    },
    {
      "chapter_number": 2,
      "node_id": "ch2_investigate_branch",
      "node_type": "branch",
      "trigger_day": 30,
      "content": "主角决定深入调查失踪事件，需要选择调查方向。根据用户日记反映的行事风格（偏暗中搜集情报、偏正面探访、还是偏占卜推演），AI 决定主角的调查路径。不同路径发现不同线索，但都指向同一个幕后势力。",
      "prerequisites": ["ch2_rumors"],
      "branch_options": [
        { "id": "ch2_inv_intel", "desc": "通过情报网络暗中搜集线索", "effect": "获得幕后势力的组织结构线索" },
        { "id": "ch2_inv_visit", "desc": "实地探访失踪现场与相关人员", "effect": "获得作案手法与动机线索" },
        { "id": "ch2_inv_divine", "desc": "通过占卜推演追踪失踪者下落", "effect": "获得幕后势力的目的与下一步行动线索" }
      ]
    },
    {
      "chapter_number": 2,
      "node_id": "ch2_discover_enemy",
      "node_type": "mainline",
      "trigger_day": 35,
      "content": "调查深入后，主角发现失踪事件背后有一个隐秘的非凡者势力在操纵。这个势力可能在进行某种禁忌仪式、收集特定非凡特性、或为某个更高阶的存在服务。主角初步摸清敌人的轮廓，但尚未掌握全貌。这一节点要让敌人显出'冰山一角'，既危险又神秘，激发主角的警惕与斗志。",
      "prerequisites": ["ch2_investigate_branch"],
      "branch_options": []
    },
    {
      "chapter_number": 2,
      "node_id": "ch2_trap",
      "node_type": "climax",
      "trigger_day": 40,
      "content": "第二章高潮。主角在追查线索时落入敌人设下的陷阱，被迫正面对抗。敌人实力高于主角（可能是序列8甚至更高的非凡者），主角陷入苦战。这一节点要体现主角在实力差距下的挣扎与智慧，不靠蛮力而靠占卜预判和临场应变周旋。战斗激烈且危机感十足，主角处于劣势。",
      "prerequisites": ["ch2_discover_enemy"],
      "branch_options": []
    },
    {
      "chapter_number": 2,
      "node_id": "ch2_escape_branch",
      "node_type": "branch",
      "trigger_day": 42,
      "content": "主角陷入绝境，需要选择脱身方式。根据用户日记反映的特质和前序分支（专研方向、盟友选择），AI 决定主角的脱身策略。不同脱身方式带来不同代价，但都让主角暂时脱离危险。",
      "prerequisites": ["ch2_trap"],
      "branch_options": [
        { "id": "ch2_escape_ally", "desc": "依靠盟友及时救援脱身", "effect": "欠下盟友人情，盟友关系加深" },
        { "id": "ch2_escape_wit", "desc": "依靠占卜预判与智谋脱身", "effect": "获得敌人破绽信息，但精神力严重透支" },
        { "id": "ch2_escape_sacrifice", "desc": "付出代价（受伤/失去物品）强行脱身", "effect": "身受重伤，但保住关键线索" }
      ]
    },
    {
      "chapter_number": 2,
      "node_id": "ch2_setback",
      "node_type": "resolution",
      "trigger_day": 45,
      "content": "第二章收束。主角虽脱身但付出代价（受伤、失去重要物品、或暴露身份），这是主角遭遇的第一次重大挫折。主角意识到以目前序列9的实力难以对抗敌人，萌生晋升的念头。盟友和导师给予安慰与建议。为第三章的恢复与晋升做铺垫，结尾营造'卧薪尝胆'的氛围。",
      "prerequisites": ["ch2_escape_branch"],
      "branch_options": []
    },
    {
      "chapter_number": 3,
      "node_id": "ch3_recover",
      "node_type": "mainline",
      "trigger_day": 47,
      "content": "主角{hero_name}进入疗伤与恢复阶段。身体和精神的双重创伤需要时间修复，主角在此期间反思第二章的失败，总结教训。导师帮助主角分析敌人的弱点。这一节点节奏放缓，着重心理描写和成长沉淀，为后续晋升积蓄力量。",
      "prerequisites": ["ch2_setback"],
      "branch_options": []
    },
    {
      "chapter_number": 3,
      "node_id": "ch3_potion_material",
      "node_type": "branch",
      "trigger_day": 50,
      "content": "主角决定晋升序列8，需要收集序列8·小丑的魔药材料。材料获取途径有不同选择，根据用户日记反映的行事风格和前序积累（盟友、专研方向），AI 决定主角的获取方式。不同方式影响晋升过程的顺利程度和额外收获。",
      "prerequisites": ["ch3_recover"],
      "branch_options": [
        { "id": "ch3_mat_purchase", "desc": "通过黑市和盟友网络购买材料", "effect": "安全但耗费资源，可能买到赝品需鉴别" },
        { "id": "ch3_mat_hunt", "desc": "亲自冒险猎取非凡生物材料", "effect": "危险但获得额外历练，可能发现新线索" },
        { "id": "ch3_mat_quest", "desc": "接取塔罗会委托以材料为报酬", "effect": "稳妥但耗时，同时推进支线剧情" }
      ]
    },
    {
      "chapter_number": 3,
      "node_id": "ch3_train",
      "node_type": "mainline",
      "trigger_day": 55,
      "content": "材料备齐后，主角在导师指导下进行晋升前的准备训练。包括精神力强化、灵性冥想、以及对小丑序列能力的预研。训练过程要体现主角的成长和决心，同时交代'消化魔药'的概念——晋升不是终点，理解并运用能力才是关键。为高潮晋升做铺垫。",
      "prerequisites": ["ch3_potion_material"],
      "branch_options": []
    },
    {
      "chapter_number": 3,
      "node_id": "ch3_promotion",
      "node_type": "climax",
      "trigger_day": 60,
      "content": "第三章高潮。主角服下序列8·小丑的魔药，经历晋升过程。这是危险时刻——魔药可能带来精神污染和失控风险，主角需要在幻觉与痛苦中保持自我。晋升过程要有克苏鲁式的精神体验：扭曲的意象、远古的低语、自我认知的动摇。主角凭借序章以来的意志力和成长成功晋升，获得小丑的能力。晋升后需要一段消化期。",
      "prerequisites": ["ch3_train"],
      "branch_options": []
    },
    {
      "chapter_number": 3,
      "node_id": "ch3_truth",
      "node_type": "mainline",
      "trigger_day": 63,
      "content": "晋升恢复后，主角凭借新获得的小丑能力（伪装、情绪收敛）和更强的占卜，重新审视第二章的敌人线索，发现了一个被忽略的关键真相——敌人的真正目的远比想象中危险，可能涉及更高阶的存在或更大的阴谋。这一发现将剧情推向第四章的高潮。",
      "prerequisites": ["ch3_promotion"],
      "branch_options": []
    },
    {
      "chapter_number": 3,
      "node_id": "ch3_resolve",
      "node_type": "resolution",
      "trigger_day": 65,
      "content": "第三章收束。主角掌握了敌人的真相，决心主动出击而非被动防守。与盟友和导师商议对策，制定反击计划。主角此刻已是序列8的非凡者，信心与实力都有提升。为第四章的决战做铺垫，结尾营造'暴风雨将至'的紧张感。",
      "prerequisites": ["ch3_truth"],
      "branch_options": []
    },
    {
      "chapter_number": 4,
      "node_id": "ch4_counterattack",
      "node_type": "mainline",
      "trigger_day": 66,
      "content": "主角{hero_name}开始主动反击。利用小丑的伪装能力潜入敌人外围，搜集更多情报，逐步瓦解敌人的布局。这一阶段主角从被动转为主动，节奏加快，行动密集。主角的占卜与小丑能力配合使用，展现成长后的实力。",
      "prerequisites": ["ch3_resolve"],
      "branch_options": []
    },
    {
      "chapter_number": 4,
      "node_id": "ch4_alliance_branch",
      "node_type": "branch",
      "trigger_day": 70,
      "content": "主角意识到敌人势力庞大，单靠个人和小团队难以抗衡，需要联合更多力量。根据用户日记反映的社交策略和前序积累的人脉，AI 决定主角联合哪些势力。不同联合方式影响决战的走向和代价。",
      "prerequisites": ["ch4_counterattack"],
      "branch_options": [
        { "id": "ch4_ally_tarot", "desc": "联合塔罗会多成员共同行动", "effect": "获得全方位支援，但需分享情报与功劳" },
        { "id": "ch4_ally_official", "desc": "寻求官方非凡者组织介入", "effect": "获得正规力量，但受规则约束可能被动" },
        { "id": "ch4_ally_rival", "desc": "联合与敌对势力有仇的其他势力", "effect": "获得战力，但盟友动机复杂，有隐患" }
      ]
    },
    {
      "chapter_number": 4,
      "node_id": "ch4_promotion7",
      "node_type": "mainline",
      "trigger_day": 75,
      "content": "决战前夕，主角为应对更强敌人，冒险晋升序列7·魔术师。这次晋升比序列8更危险，但主角凭借之前的积累和更坚定的意志成功晋升，获得火焰跳跃、纸人替身等关键战斗能力。晋升过程要体现主角的成长与决心，为最终决战提供战力基础。晋升后主角几乎没有消化时间便投入战斗，增加紧迫感。",
      "prerequisites": ["ch4_alliance_branch"],
      "branch_options": []
    },
    {
      "chapter_number": 4,
      "node_id": "ch4_final_battle",
      "node_type": "climax",
      "trigger_day": 80,
      "content": "全书高潮。主角率领联合力量与敌人展开决战。战斗要宏大且紧张，主角综合运用占卜预判、小丑伪装、魔术师逃脱等多序列能力，与敌人斗智斗勇。敌人的真正阴谋在战斗中揭露，危机达到顶点。主角面临生死考验，可能需要牺牲什么才能阻止敌人。这是对主角全程成长的总检验。",
      "prerequisites": ["ch4_promotion7"],
      "branch_options": []
    },
    {
      "chapter_number": 4,
      "node_id": "ch4_sacrifice_branch",
      "node_type": "branch",
      "trigger_day": 82,
      "content": "决战关键时刻，主角面临重大抉择——为阻止敌人需要付出某种代价。根据用户日记反映的价值观和前序所有分支积累，AI 决定主角的抉择。不同抉择导向略有不同的结局，但都让主角赢得胜利。",
      "prerequisites": ["ch4_final_battle"],
      "branch_options": [
        { "id": "ch4_sac_item", "desc": "牺牲一件重要非凡物品封印敌人", "effect": "胜利但失去重要道具，结局偏务实" },
        { "id": "ch4_sac_power", "desc": "透支部分非凡力量彻底消灭敌人", "effect": "胜利但实力暂时受损，结局偏悲壮" },
        { "id": "ch4_sac_risk", "desc": "冒险以智谋化解危机，不付出大代价", "effect": "险胜但埋下隐患，结局偏开放" }
      ]
    },
    {
      "chapter_number": 4,
      "node_id": "ch4_victory",
      "node_type": "resolution",
      "trigger_day": 85,
      "content": "第四章收束。决战胜利，敌人被击败或封印。主角在废墟中喘息，回望这场战斗的代价与收获。盟友的伤亡、自身的损失、城市的创伤——胜利不是没有代价。主角开始收拾残局，为终章的收束做准备。结尾营造'尘埃落定但余波未平'的氛围。",
      "prerequisites": ["ch4_sacrifice_branch"],
      "branch_options": []
    },
    {
      "chapter_number": 5,
      "node_id": "ch5_aftermath",
      "node_type": "mainline",
      "trigger_day": 86,
      "content": "终章开篇。决战后的余波。主角{hero_name}处理善后事宜：安抚盟友、向塔罗会汇报、修复因战斗受损的掩护身份。城市逐渐恢复平静，但非凡世界的格局已因这场战斗而改变。主角在忙碌中回味这 90 天的经历，感慨万千。这一节点节奏舒缓，重在情感沉淀。",
      "prerequisites": ["ch4_victory"],
      "branch_options": []
    },
    {
      "chapter_number": 5,
      "node_id": "ch5_farewell_branch",
      "node_type": "branch",
      "trigger_day": 87,
      "content": "故事接近尾声，主角需要与某些重要人物告别或道别——可能是导师完成使命离去、盟友各奔前程、或某个角色的最终归宿。根据用户日记反映的情感倾向和前序分支，AI 决定告别的对象和方式。告别要动人但不煽情，符合诡秘世界克制的情感表达。",
      "prerequisites": ["ch5_aftermath"],
      "branch_options": [
        { "id": "ch5_far_mentor", "desc": "与导师道别，导师踏上自己的旅途", "effect": "传承主题，主角真正独立" },
        { "id": "ch5_far_ally", "desc": "与并肩作战的盟友道别", "effect": "友情主题，留下重逢的可能" },
        { "id": "ch5_far_enemy", "desc": "面对败敌的最终结局", "effect": "宿命主题，对敌人有更深的理解" }
      ]
    },
    {
      "chapter_number": 5,
      "node_id": "ch5_future",
      "node_type": "mainline",
      "trigger_day": 88,
      "content": "主角展望未来。经历了这 90 天，主角已从普通人成长为序列7的成熟非凡者，在塔罗会中有了稳固地位。主角思考接下来的路——继续晋升、守护城市、还是探索更广阔的世界。这一节点体现主角的成长蜕变，为最终结局定调。",
      "prerequisites": ["ch5_farewell_branch"],
      "branch_options": []
    },
    {
      "chapter_number": 5,
      "node_id": "ch5_final_divination",
      "node_type": "climax",
      "trigger_day": 89,
      "content": "终章高潮。主角进行人生中最重要的一次占卜——回望自己的命运轨迹，也窥见未来的可能。这次占卜串联起全书伏笔，让序章的预言在此时得到呼应和解释。占卜中主角看见自己走过的路、遇到的人、经历的事，形成一个完整的命运闭环。这是情感与叙事的高点。",
      "prerequisites": ["ch5_future"],
      "branch_options": []
    },
    {
      "chapter_number": 5,
      "node_id": "ch5_ending",
      "node_type": "resolution",
      "trigger_day": 90,
      "content": "故事结局。占卜结束后，主角收起塔罗牌，走出占卜室，迎接新的黎明。结尾要点题'你的日常，就是主角的传奇'——暗示主角的故事还将以另一种方式继续（每天的生活仍在创造新的传奇）。结局要令人满意但留有余韵，不刻意大团圆也不强行悲剧，符合诡秘世界'平静中见深远'的基调。为整个 90 天旅程画上句号。",
      "prerequisites": ["ch5_final_divination"],
      "branch_options": []
    }
  ]
}
```

> **编写要点**：6 个章节共 35 个节点，覆盖"铺垫→发展→高潮→收束"的完整节奏。`mainline` 节点串联主线（14 个），`branch` 节点根据用户日记倾向决定走向（共 9 个分支节点，每个 2-3 个选项），`climax` 每章一个集中爆发冲突（6 个），`resolution` 衔接下一章（6 个）。`content` 写明"应该发生什么、达到什么效果"，但不规定具体台词场景，给 AI 充分发挥空间。晋升节点（ch3_promotion、ch4_promotion7）与 paths.json 的序列配置呼应。

---

## 六、随机奇遇库编写指南

### 6.1 encounters.json 的编写规范

#### 6.1.1 文件作用

`encounters.json` 是随机奇遇库，为故事增添意外性和层次感。AI 工程师的奇遇引擎（`EncounterEngine.js`）会每 7 天检查一次，按概率触发 1-2 个奇遇，将奇遇内容注入当日 Prompt，由 AI 自然融入剧情。奇遇不改变主线大方向，但丰富故事层次、引入新 NPC/线索/物品。

#### 6.1.2 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `world_id` | string | 是 | 所属世界观 ID |
| `encounters` | array | 是 | 奇遇数组 |
| `encounters[].encounter_id` | string | 是 | 奇遇唯一标识，格式 `enc_{描述}` |
| `encounters[].title` | string | 是 | 奇遇标题 |
| `encounters[].content_template` | string | 是 | 奇遇内容模板（含 `{hero_name}` 等变量占位符） |
| `encounters[].min_chapter` | number | 是 | 最小章节要求（0-5） |
| `encounters[].max_chapter` | number | 是 | 最大章节限制（0-5） |
| `encounters[].min_path_level` | number | 是 | 最小途径等级要求（9-7） |
| `encounters[].tags` | array | 是 | 奇遇类型标签 |

#### 6.1.3 奇遇分类

| 分类 | 说明 | 典型场景 |
|------|------|---------|
| 悬疑类 | 制造悬念和谜团，引发好奇心 | 神秘信件、预言之梦、无法解释的现象 |
| 线索类 | 提供与主线相关的碎片线索 | 遗失的日记、旧档案、知情人的暗示 |
| 日常类 | 调节节奏的轻松日常，丰富生活感 | 神秘商人、旧友重逢、市集见闻 |
| 灵异类 | 克苏鲁式的超自然体验 | 幽灵记忆、雾中人影、红月异象 |
| 探索类 | 发现新地点或隐藏空间 | 旧书店、地下集市、隐藏房间 |
| 战斗类 | 小规模战斗或冲突 | 巷中袭击、诅咒之物、遭遇敌对非凡者 |

#### 6.1.4 编写原则

1. **不改变主线大方向**：奇遇是"调味品"而非"主菜"，可以引入新元素但不能让主线脱轨。
2. **丰富故事层次**：通过奇遇引入新 NPC、新线索、新物品，让世界观更立体。
3. **变量占位符**：`content_template` 中使用 `{hero_name}` 等占位符，由引擎替换为实际值。
4. **章节限制合理**：`min_chapter`/`max_chapter` 控制奇遇在合适的剧情阶段出现，避免违和（如序章不宜出现太强的敌人）。
5. **不重复**：奇遇引擎会检查 `encounter_log` 确保同一奇遇不重复触发，每个奇遇设计为独立事件。

### 6.2 encounters.json 完整内容

```json
{
  "world_id": "lord_of_mysteries",
  "encounters": [
    {
      "encounter_id": "enc_strange_letter",
      "title": "神秘信件",
      "content_template": "主角{hero_name}回到住所时，发现桌上多了一封没有署名的信件。信封用暗红色火漆封口，印着一个主角从未见过的纹章——一只衔着星辰的渡鸦。信中用晦涩的诗句提及了{hero_name}近期的一次占卜，并预言'当红月升起第三次时，旧日的回声将敲响你的门'。信件没有落款，纸张散发着淡淡的灵性波动。",
      "min_chapter": 0,
      "max_chapter": 3,
      "min_path_level": 9,
      "tags": ["悬疑", "线索"]
    },
    {
      "encounter_id": "enc_stray_cat",
      "title": "流浪猫的低语",
      "content_template": "一只通体漆黑的猫突然出现在{hero_name}的必经之路上，用异常聪慧的碧绿眼眸注视着主角。在灵视中，这只猫周身萦绕着微弱的非凡气息，似乎并非普通的生灵。它引领主角走到一条平时不会注意的小巷尽头，那里有一样被人遗落的东西。之后黑猫便消失在雾气中，仿佛从未出现。",
      "min_chapter": 0,
      "max_chapter": 5,
      "min_path_level": 9,
      "tags": ["日常", "灵异", "线索"]
    },
    {
      "encounter_id": "enc_old_bookshop",
      "title": "旧书店奇遇",
      "content_template": "{hero_name}路过一家此前从未注意过的旧书店，橱窗里积着厚厚的灰尘。鬼使神差地推门而入，店内一本泛黄的古书自行翻开，页面上的文字似乎是某种古代神秘语言的占卜记录。书中记载的一段内容与{hero_name}最近困扰的一个问题隐隐相关。书店老板是个佝偻的老人，对主角的到来毫不意外，只说了一句'它等了你很久'。",
      "min_chapter": 1,
      "max_chapter": 4,
      "min_path_level": 9,
      "tags": ["探索", "线索"]
    },
    {
      "encounter_id": "enc_fog_figure",
      "title": "雾中人影",
      "content_template": "一个浓雾弥漫的夜晚，{hero_name}走在回家的路上，忽然察觉雾气深处有一个人影在注视着自己。人影的轮廓在灵视中呈现出异常的灵性波动——不像活人，也不像普通的灵体。当主角试图靠近时，人影消散在雾中，只在地面留下一枚古老的硬币，正面刻着主角的塔罗代号。这枚硬币散发着若有若无的预言之力。",
      "min_chapter": 1,
      "max_chapter": 5,
      "min_path_level": 9,
      "tags": ["灵异", "悬疑"]
    },
    {
      "encounter_id": "enc_dream_prophecy",
      "title": "预言之梦",
      "content_template": "这一夜{hero_name}做了一个异常清晰的梦。梦中主角站在一座被红光笼罩的钟塔顶端，俯瞰着整座城市。远处有什么巨大的东西正在雾海之下苏醒。一个模糊的声音在梦中念出了一段主角听不懂的咒语。醒来后，主角发现自己无意识地在床头的纸上写下了梦中咒语的几个音节。这些音节似乎蕴含着某种力量，但也透着危险。",
      "min_chapter": 0,
      "max_chapter": 4,
      "min_path_level": 9,
      "tags": ["悬疑", "灵异", "线索"]
    },
    {
      "encounter_id": "enc_lost_diary",
      "title": "遗失的日记",
      "content_template": "{hero_name}在整理占卜室或住所时，发现了一个不属于自己旧物。那是一本残破的日记，属于一位已故的非凡者。日记的最后几页记录了死者生前调查的一桩秘事，笔迹越到后面越潦草，似乎主人的精神状态正在恶化。最后一页只写着一句话：'它们一直在雾的另一边看着我们。'日记中夹着一张手绘的地图，标记着一个未知地点。",
      "min_chapter": 1,
      "max_chapter": 4,
      "min_path_level": 9,
      "tags": ["线索", "悬疑"]
    },
    {
      "encounter_id": "enc_market_merchant",
      "title": "神秘商人",
      "content_template": "在城市的黑市角落，{hero_name}遇到一个戴着面具的神秘商人。商人的摊位上摆满了各种稀奇古怪的非凡物品和材料，其中一件引起了主角的注意——那是一个能够增强占卜精度的灵性媒介。商人开出的价格不是金钱，而是要求{hero_name}为他占卜一卦，占卜的内容关乎商人自己的命运。这个交易背后似乎隐藏着更深的秘密。",
      "min_chapter": 1,
      "max_chapter": 4,
      "min_path_level": 9,
      "tags": ["日常", "线索"]
    },
    {
      "encounter_id": "enc_alley_attack",
      "title": "巷中袭击",
      "content_template": "深夜归家途中，{hero_name}在一条偏僻小巷遭遇袭击。袭击者是一名蒙面的低阶非凡者，似乎受雇于某股势力来试探主角的实力。对方出手狠辣，但不致命——更像是在试探而非暗杀。战斗中{hero_name}需要凭借占卜预判和已有能力化解危机。击退或摆脱袭击者后，主角从对方遗落的物品中获得一条追查幕后主使的线索。",
      "min_chapter": 1,
      "max_chapter": 4,
      "min_path_level": 8,
      "tags": ["战斗", "线索"]
    },
    {
      "encounter_id": "enc_tarot_reading",
      "title": "意外的塔罗占卜",
      "content_template": "{hero_name}进行日常占卜练习时，塔罗牌却给出了一个完全超出预期的牌阵。牌面组合指向一个主角从未占卜过的问题，预言中提及的'转折点'与{hero_name}近期的某个决定密切相关。这次占卜的清晰度远超平时，仿佛有某种力量在借主角之手传递信息。占卜结束后，主角的精神力出现异常波动，需要一段时间恢复。",
      "min_chapter": 1,
      "max_chapter": 5,
      "min_path_level": 9,
      "tags": ["悬疑", "线索"]
    },
    {
      "encounter_id": "enc_underground_market",
      "title": "地下集市的入口",
      "content_template": "通过一次偶然的占卜或盟友的指引，{hero_name}发现了一处隐藏在城市地下的非凡者黑市入口。这里聚集着各路非凡者，交易着表世界无法想象的物品——非凡材料、禁忌魔药配方、灵性媒介、甚至情报。主角第一次踏入这个地下世界，既大开眼界又深感危险。在集市中，主角注意到一个被严密看守的摊位，似乎在出售与近期事件相关的东西。",
      "min_chapter": 2,
      "max_chapter": 4,
      "min_path_level": 9,
      "tags": ["探索", "日常"]
    },
    {
      "encounter_id": "enc_ghost_memory",
      "title": "幽灵的残忆",
      "content_template": "在一次冥想或占卜中，{hero_name}的灵视突然捕捉到一缕游离的灵性残影——那是一位已故非凡者留在世间的最后一段记忆。残忆如走马灯般闪过：死者生前的最后时刻、他看见的某个可怕存在、以及一句未说完的警告。这段记忆给主角带来剧烈的精神冲击，但也包含一条关键线索。事后主角需要长时间休息来平复灵性波动。",
      "min_chapter": 2,
      "max_chapter": 5,
      "min_path_level": 8,
      "tags": ["灵异", "线索"]
    },
    {
      "encounter_id": "enc_old_friend",
      "title": "旧识重逢",
      "content_template": "在街头偶遇一位主角觉醒前的旧识。对方是普通人，对{hero_name}如今的非凡者身份一无所知，只当老友重逢般热情寒暄。这次相遇让主角短暂回到普通人的视角，感慨两个世界的落差。交谈中，旧识无意间提起的一则见闻——他目击的某个'奇怪现象'——恰好与{hero_name}正在调查的事件有关。普通人的视角有时能看到非凡者忽略的细节。",
      "min_chapter": 1,
      "max_chapter": 3,
      "min_path_level": 9,
      "tags": ["日常", "线索"]
    },
    {
      "encounter_id": "enc_hidden_room",
      "title": "隐藏的密室",
      "content_template": "在探索一处旧建筑或调查某地时，{hero_name}的灵视捕捉到墙壁后面异常的灵性波动。仔细探查后，主角发现了一间被魔法封印的隐藏密室。密室内陈设简朴却透着岁月感，墙上刻满了神秘符号，桌上放着一本记录着某种失传占卜手法的笔记和几件保存完好的灵性媒介。这间密室似乎属于一位前辈非凡者，他留下了这些'遗产'等待有缘人。",
      "min_chapter": 2,
      "max_chapter": 4,
      "min_path_level": 8,
      "tags": ["探索", "线索"]
    },
    {
      "encounter_id": "enc_cursed_item",
      "title": "诅咒之物",
      "content_template": "{hero_name}获得（或捡到）一件看似普通的物品——可能是一枚戒指、一面镜子或一把钥匙。这件物品在灵视中散发着不祥的暗红色光芒，附着着某种诅咒。接触物品后，主角开始经历一些诡异现象：幻觉、厄运、或被某种存在窥视的感觉。主角需要通过占卜和调查弄清物品的来历与诅咒的解除方法，这个过程本身就是一次惊险的小型冒险。",
      "min_chapter": 2,
      "max_chapter": 5,
      "min_path_level": 8,
      "tags": ["战斗", "灵异", "悬疑"]
    },
    {
      "encounter_id": "enc_prophecy_child",
      "title": "预言之子",
      "content_template": "{hero_name}在一次外出中遇到一个孩子，这个孩子似乎能'看见'一些普通人看不见的东西。孩子天真地拉着主角的衣角，说出几句令{hero_name}心头一震的话——那些话像是某种预言，与主角的命运或正在调查的事件紧密相关。孩子的父母对此毫不知情，只当童言无忌。主角需要判断这是灵性天赋的萌芽，还是某种力量借孩子之口传递信息。",
      "min_chapter": 1,
      "max_chapter": 4,
      "min_path_level": 9,
      "tags": ["线索", "悬疑", "灵异"]
    },
    {
      "encounter_id": "enc_nightmare_realm",
      "title": "梦魇领域",
      "content_template": "入睡后，{hero_name}发现自己陷入了一个异常的梦境——这并非普通梦境，而是某种非凡力量构建的'梦魇领域'。在梦中，现实的规则被扭曲，主角面对的是自己内心深处的恐惧与阴影。要脱困，{hero_name}必须在梦中直面恐惧并找到破绽。这个经历虽然危险，但战胜后能让主角的精神力得到淬炼，对后续的晋升有所助益。",
      "min_chapter": 3,
      "max_chapter": 5,
      "min_path_level": 8,
      "tags": ["灵异", "战斗"]
    },
    {
      "encounter_id": "enc_secret_meeting",
      "title": "秘密集会",
      "content_template": "通过盟友情报或占卜指引，{hero_name}偶然窥见了一场秘密集会。集会的参与者都是蒙面的非凡者，商议着某件与城市非凡者格局相关的大事。主角藏身暗处偷听，获得了珍贵的情报，但也因此被卷入了更深的漩涡——集会中似乎有人察觉到了窥视者的存在。主角需要在暴露前安全撤离，这次冒险获得的情报可能改变后续的局势判断。",
      "min_chapter": 2,
      "max_chapter": 4,
      "min_path_level": 9,
      "tags": ["悬疑", "线索", "战斗"]
    }
  ]
}
```

> **编写要点**：共 17 个奇遇，覆盖六大分类，分布在 0-5 章不同阶段。`content_template` 中使用 `{hero_name}` 占位符（由奇遇引擎替换为主角名）。`min_path_level` 控制战斗类奇遇在主角有足够实力后才出现（如 `enc_alley_attack` 要求序列 8）。每个奇遇都是独立事件，可自然融入当日剧情而不破坏主线。奇遇内容留有"AI 发挥"的开放结尾，不规定具体结局。

---

## 七、世界观设定档案编写指南

### 7.1 settings.json 的编写规范

#### 7.1.1 文件作用

`settings.json` 是世界观的结构化设定档案，供 AI 工程师的 RAG 检索器（`RAGRetriever.js`）使用。当 AI 生成故事时，检索器会根据当日日记关键词 + 当前章节阶段关键词，匹配 `settings.json` 中的条目，取 Top 5 相关条目拼入"档案记忆"。这保证 AI 引用的世界观设定准确、一致，且不会超出 Token 预算。

#### 7.1.2 字段规范

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `world_id` | string | 是 | 所属世界观 ID |
| `settings` | array | 是 | 设定条目数组 |
| `settings[].category` | string | 是 | 分类：power_system / path / location / character / lore |
| `settings[].key` | string | 是 | 设定项键名（英文小写下划线） |
| `settings[].value` | string | 是 | 设定项内容（详细描述） |
| `settings[].keywords` | string | 是 | 检索关键词（空格分隔） |
| `settings[].priority` | number | 是 | 优先级权重（1-10，越高越优先检索） |

#### 7.1.3 分类说明

| 分类 | category 值 | 内容 |
|------|------------|------|
| 力量体系 | `power_system` | 序列、魔药、非凡特性、失控等通用规则 |
| 途径 | `path` | 各途径的具体设定（占卜家序列能力等） |
| 地点 | `location` | 塔罗会、黑市、城市等场景设定 |
| 人物 | `character` | 导师、盟友、敌人等角色设定 |
| 传说 | `lore` | 雾之上、红月、旧日等世界观传说 |

#### 7.1.4 编写原则

1. **供 RAG 检索使用**：`keywords` 是检索的核心，要覆盖用户日记和剧情节点可能触发的各种表达。
2. **keywords 覆盖度**：每个条目的 keywords 至少 4-6 个词，覆盖同义词、相关词、用户可能的说法。
3. **priority 权重**：核心设定（如序列体系、占卜家能力）设为 10，重要但非核心的设为 7-8，背景性设定设为 5-6。
4. **value 详尽**：`value` 是给 AI 的设定参考，要写得详尽准确，让 AI 据此生成符合设定的内容。
5. **不与原著矛盾**：所有设定基于诡秘之主原著，不可臆造违背原著的内容。

### 7.2 settings.json 完整内容

```json
{
  "world_id": "lord_of_mysteries",
  "settings": [
    {
      "category": "power_system",
      "key": "non_extraordinary",
      "value": "普通人大都不知晓非凡者的存在，世界维持着表里两层秩序。普通人无法感知灵体、非凡特性和灵性现象。非凡者在普通人面前需要隐藏身份，避免暴露隐秘世界的存在。这是非凡者社会的基本规矩之一。",
      "keywords": "普通人 凡人 隐藏 身份 秩序 表里世界",
      "priority": 10
    },
    {
      "category": "power_system",
      "key": "sequence_system",
      "value": "22 条神之途径，每条途径从序列 9（最弱）到序列 0（最强，相当于真神）共 10 个等级。序列数字越小实力越强。非凡者通过服用对应序列的魔药逐级晋升。高序列强者数量稀少，是各方势力争夺的核心战力。",
      "keywords": "序列 途径 等级 晋升 22条 神之途径 序列0 序列9",
      "priority": 10
    },
    {
      "category": "power_system",
      "key": "potion_and_promotion",
      "value": "非凡者通过服用对应序列的魔药来晋升，每次晋升获得新能力。魔药由非凡材料和特殊配方炼制。晋升是危险的过程，需要足够的准备和精神力基础。晋升后需要'消化'魔药——即理解并运用其能力——才能稳定，否则容易失控。",
      "keywords": "魔药 晋升 服用 消化 稳定 准备 炼制 配方",
      "priority": 10
    },
    {
      "category": "power_system",
      "key": "potion_side_effect",
      "value": "服用魔药可能带来精神污染和失控风险。精神污染表现为幻觉、疯狂念头、人格扭曲；失控则是彻底丧失理智异变为怪物。非凡者需要通过消化魔药、保持精神稳定来对抗这些风险。过度使用能力、连续晋升、精神受创都会增加失控概率。",
      "keywords": "副作用 精神污染 失控 疯狂 幻觉 异变 风险 精神",
      "priority": 9
    },
    {
      "category": "power_system",
      "key": "extraordinary_characteristics",
      "value": "非凡特性是世界运行的本源力量之一，是超凡能量的结晶。非凡者体内蕴含非凡特性，死后会析出，可被他人获取。非凡特性总量守恒，这决定了高序列强者的数量有限，也是各方势力争夺的核心资源。",
      "keywords": "非凡特性 特性 析出 守恒 资源 结晶 力量本源",
      "priority": 8
    },
    {
      "category": "power_system",
      "key": "loss_of_control",
      "value": "失控是非凡者最恐惧的结局。当精神污染积累到临界点，或魔药未被充分消化时，非凡者会丧失人性，异变为怪物。失控者通常具有攻击性，需被其他非凡者处理。防止失控是每个非凡者的首要课题，也是晋升必须谨慎的原因。",
      "keywords": "失控 异变 怪物 精神污染 恐惧 临界点 危险",
      "priority": 8
    },
    {
      "category": "path",
      "key": "seer_path_overview",
      "value": "占卜家途径是 22 条神之途径之一，以信息获取和局势分析见长。从序列 9 占卜家起步，逐步获得伪装（序列 8 小丑）、逃脱（序列 7 魔术师）等能力，攻守兼备。占卜家善于从蛛丝马迹中窥见命运走向，是情报与预言的掌控者。",
      "keywords": "占卜家 途径 seer 信息 占卜 预言 情报 分析",
      "priority": 10
    },
    {
      "category": "path",
      "key": "seer_sequence_9",
      "value": "占卜家途径序列 9·占卜家。核心能力：灵视（看见灵体和非凡特性的微光，感知灵性波动）、基础占卜（使用星象、塔罗牌、水晶球等媒介进行简单预测）、星象观测、灵体感知。此时能力有限，占卜结果模糊且消耗精神力较大，需长期练习提升准确度。是认识隐秘世界的起点。",
      "keywords": "序列9 占卜家 灵视 占卜 星象 塔罗牌 水晶球 灵体 感知",
      "priority": 10
    },
    {
      "category": "path",
      "key": "seer_sequence_8",
      "value": "占卜家途径序列 8·小丑。核心能力：肢体控制（精准控制每块肌肉）、表情伪装、情绪收敛（在灵视中降低存在感）、柔韧强化。此序列偏向伪装与生存，是占卜家在危险世界中保护自己的重要手段。小丑以滑稽掩饰锋芒，善于伪装身份与意图。",
      "keywords": "序列8 小丑 伪装 肢体控制 表情 情绪 收敛 柔韧 隐藏",
      "priority": 9
    },
    {
      "category": "path",
      "key": "seer_sequence_7",
      "value": "占卜家途径序列 7·魔术师。核心能力：火焰跳跃（短距离瞬移脱身）、纸人替身（制造替身承受致命伤害）、伤害转移（将伤害转移给替身或物品）、快速逃脱、幻象制造。此序列机动性极强，是占卜家从被动防御转向主动应对的关键阶段。",
      "keywords": "序列7 魔术师 火焰跳跃 纸人替身 伤害转移 逃脱 幻象 瞬移 机动",
      "priority": 9
    },
    {
      "category": "path",
      "key": "other_paths_brief",
      "value": "其他已知途径包括：刺客（潜行暗杀）、阅读者（知识学习）、学徒（空间之门）、猎人（追踪捕猎）、失眠者（无需睡眠）等。各途径能力风格迥异，但都遵循序列 9-0 的晋升体系。不同途径的非凡者之间存在复杂的关系网络。",
      "keywords": "刺客 阅读者 学徒 猎人 失眠者 其他途径 22条",
      "priority": 6
    },
    {
      "category": "location",
      "key": "tarot_club",
      "value": "塔罗会是一个秘密的非凡者组织，成员以塔罗牌代号相称（如愚者、正义、倒吊人等）。聚会在'雾之上'的空间举行，成员间通过灵性连接交流。塔罗会是非凡者交换情报、委托任务、互相帮助的重要平台，加入需经介绍和认可。",
      "keywords": "塔罗会 组织 聚会 秘密 代号 塔罗牌 雾之上 情报 委托",
      "priority": 9
    },
    {
      "category": "location",
      "key": "main_city",
      "value": "故事主舞台是一座雾气弥漫的大城市，参考维多利亚时代的伦敦。煤气灯照明、钟塔报时、蒸汽火车穿梭、浓雾常年笼罩。城市表层是普通人运转的工业社会，暗处则是非凡者世界的势力交错之地。城市有繁华的商业区、阴暗的贫民窟、隐秘的黑市和非凡者据点。",
      "keywords": "城市 伦敦 维多利亚 雾 煤气灯 钟塔 蒸汽 商业区 贫民窟",
      "priority": 8
    },
    {
      "category": "location",
      "key": "underground_market",
      "value": "地下黑市是隐藏在城市地下的非凡者交易场所，聚集各路非凡者。交易非凡材料、禁忌魔药配方、灵性媒介、情报等表世界无法想象的物品。黑市有自己的规矩，禁止在内部斗殴，但出了黑市则各凭本事。 newcomer 需有引荐人才能进入。",
      "keywords": "黑市 地下 集市 交易 材料 配方 媒介 情报 规矩",
      "priority": 7
    },
    {
      "category": "location",
      "key": "divination_room",
      "value": "主角的占卜室是进行占卜、冥想和灵性修炼的私人空间。室内布置有星象图、塔罗牌、水晶球、蜡烛等占卜媒介，以及神秘学典籍。占卜室经过简单的灵性防护，是主角的'安全屋'。整理占卜室也是主角日常生活的一部分。",
      "keywords": "占卜室 房间 冥想 塔罗牌 水晶球 星象 蜡烛 典籍 防护",
      "priority": 7
    },
    {
      "category": "character",
      "key": "mentor_figure",
      "value": "引导主角觉醒和成长的导师。身份神秘，似乎是经验丰富的非凡者，与塔罗会有联系。导师性格沉稳、话不多但字字珠玑，对主角既严格又关怀。导师自身有不为人知的过去和目的，在适当时候会透露部分真相。导师是主角前期最重要的依靠和指引者。",
      "keywords": "导师 引路人 神秘人 觉醒 引导 师父 指点 教导",
      "priority": 8
    },
    {
      "category": "character",
      "key": "tarot_members",
      "value": "塔罗会的其他成员，各有不同的途径和能力。成员间以塔罗牌代号相称，彼此未必知晓真实身份。有的成员擅长魔法，有的擅长情报，有的擅长战斗。成员关系复杂，有合作也有竞争。主角需在其中选择盟友，建立信任关系。具体成员的代号和性格由 AI 在剧情中丰富。",
      "keywords": "塔罗会成员 盟友 代号 朋友 合作 魔法 情报 战斗 同伴",
      "priority": 7
    },
    {
      "category": "character",
      "key": "mysterious_enemy",
      "value": "故事中的主要敌对势力，一个隐秘的非凡者组织。他们在暗中操纵普通人失踪事件，进行某种禁忌仪式，目的可能与更高阶的存在或力量有关。敌人实力强大，有高序列非凡者坐镇。他们的真正目的和背景在剧情推进中逐步揭露，是主角成长路上的主要对手。",
      "keywords": "敌人 反派 势力 组织 禁忌 阴谋 失踪 幕后 对手",
      "priority": 8
    },
    {
      "category": "lore",
      "key": "above_the_fog",
      "value": "'雾之上'是一个特殊的空间概念，非凡者可以通过冥想进入。在雾之上，灵性感知更为清晰，非凡者可以在此进行更纯粹的交流与占卜。塔罗会的聚会即在雾之上举行。雾之上与现实世界有对应关系但规则不同，是灵性活动的理想场所。",
      "keywords": "雾之上 空间 冥想 灵性 聚会 交流 塔罗会 纯粹",
      "priority": 8
    },
    {
      "category": "lore",
      "key": "red_moon",
      "value": "天空中有'红月'这一特殊天体，与非凡现象密切相关。红月之夜常发生灵异事件，灵性波动增强，灵体活动频繁。非凡者在红月之夜感知更敏锐但也更危险。红月与旧日存在某种联系，是克苏鲁式恐怖的来源之一。红月的周期影响着非凡世界的节奏。",
      "keywords": "红月 月亮 天体 灵异 灵性 波动 灵体 危险 周期",
      "priority": 7
    },
    {
      "category": "lore",
      "key": "old_ones",
      "value": "远古存在'旧日支配者'等古神级别的存在，它们的影响至今仍在世界暗面涌动。这些存在远非凡者所能抗衡，是深层的恐怖来源。某些禁忌仪式和失控事件与旧日的余波有关。旧日是克苏鲁神话色彩的核心，为故事提供宏大而压抑的背景。",
      "keywords": "旧日 古神 支配者 远古 恐怖 禁忌 仪式 余波 克苏鲁",
      "priority": 7
    },
    {
      "category": "lore",
      "key": "history_of_mysteries",
      "value": "神秘学的历史源远流长，远古时代曾有过辉煌的非凡文明，后因某场大灾变而衰落。现存的世界是灾变后的残余，非凡者和非凡特性都是那个时代的遗产。许多神秘学典籍记载着远古的知识，但也隐藏着危险。研究历史可能发现力量，也可能招致灾祸。",
      "keywords": "历史 神秘学 远古 文明 灾变 衰落 遗产 典籍 知识",
      "priority": 6
    }
  ]
}
```

> **编写要点**：共 22 个设定条目，覆盖 5 个分类。`keywords` 用空格分隔，覆盖用户日记和剧情节点可能触发的各种表达（如"导师"条目覆盖了"导师/引路人/神秘人/师父"等多种说法）。`priority` 按重要性分级：核心体系设定 10，主角途径设定 9-10，重要场景人物 7-8，背景传说 6-7。`value` 写得详尽，让 AI 据此生成符合设定的内容。检索时引擎会取 Top 5 相关条目，Token 预算约 1000-2000。

---

## 八、配套 MD 文档编写指南

除 6 个 JSON 配置文件外，内容创作者还需编写 4 份人类可读的 MD 文档，作为团队沟通和参考的依据。这 4 份文档是 JSON 配置的"人类可读版"，方便全团队（尤其是非技术人员）理解内容设计。

### 8.1 MyStory-剧情大纲.md

**文件位置**：`docs/MyStory-剧情大纲.md`

**编写要求**：
- 将 `outline.json` 的 35 个节点转化为人类可读的剧情大纲文档。
- 按章节组织，每章包含：章节概要、主线脉络、分支选择、高潮场景、收束衔接。
- 用小说化的语言描述剧情走向，让读者（团队成员）能直观感受故事节奏。
- 标注每个分支节点的影响和后果，方便团队理解分支设计逻辑。

**内容大纲**：
```
# My Story — 剧情大纲

## 概述
故事总时长 90 天，分为 6 个章节（序章 5 天 + 4 章各 20 天 + 终章 5 天）。
主角从普通人觉醒为占卜家途径序列 9 的非凡者，经历成长、挫折、晋升、决战，
最终在序列 7 时完成使命，故事完结。

## 序章（第 1-5 天）：觉醒
- 主线：日常被打破 → 觉醒为序列 9 → 第一次占卜 → 接受力量 → 初遇危险 → 稳定心绪
- 分支：接受力量的心态（果敢/谨慎）
- 高潮：第一次非凡危险
- 衔接：踏上前往大城市的旅程

## 第一章（第 6-25 天）：雾中初行
...（每章展开）

## 分支影响总览
...（汇总所有分支选项及其后续影响）
```

### 8.2 MyStory-映射规则表.md

**文件位置**：`docs/MyStory-映射规则表.md`

**编写要求**：
- 将 `mappings.json` 的 7 条映射规则转化为人类可读的对照表文档。
- 每条映射包含：行为大类、世界观行为、关键词列表、映射说明、典型示例。
- 提供"用户日记示例 → AI 映射结果示例"的对照，帮助团队理解映射逻辑。
- 说明编写原则（大类映射不写死细节），让团队理解为何这样设计。

**内容大纲**：
```
# My Story — 映射规则表

## 设计原则
大类映射不写死细节，给 AI 留发挥空间。
映射规则只定义"行为类别"对应关系，具体融入方式由 AI 根据上下文发挥。

## 映射规则总览
| 行为大类 | 世界观行为 | 关键词数 | 说明 |
|---------|-----------|---------|------|
| 学习 | 研读神秘学典籍与修炼灵性 | 15 | ... |
| ... | ... | ... | ... |

## 详细规则
### 1. 学习 → 研读神秘学典籍与修炼灵性
- 关键词：学习、看书、上课、读书、复习...
- 映射说明：...
- 示例：用户写"今天看了两小时英语" → AI 生成"主角研读古代神秘语言典籍两个时辰"

## 用户日记 → 映射结果示例
...（提供 5-10 个完整示例）
```

### 8.3 MyStory-AI-Prompt模板.md

**文件位置**：`docs/MyStory-AI-Prompt模板.md`

**编写要求**：
- 这是给 AI 工程师参考的完整 Prompt 模板文档，包含所有层级 Prompt 的完整文本（含变量占位符）。
- 基于功能规划文档 9.2 节的 Prompt 骨架，扩展为完整的、可直接使用的模板。
- 每个模板标注：用途、变量说明、Token 预算、使用场景。
- 包含：系统 Prompt、章节阶段指令、摘要记忆、档案记忆、即时上下文、当日日记+映射、奇遇注入、生成指令、审查 Prompt、摘要生成 Prompt。
- 内容创作者负责提供世界观素材和文风要求部分，AI 工程师负责实现拼装逻辑。

**内容大纲**：
```
# My Story — AI Prompt 模板

## Prompt 分层架构
[系统 Prompt] → [章节阶段指令] → [摘要记忆] → [档案记忆]
→ [即时上下文] → [当日日记+映射] → [奇遇注入] → [生成指令]

## 1. 系统 Prompt（固定，约 1500-2000 tokens）
[完整文本，含世界观基础、文风要求、输出格式]

## 2. 章节阶段指令（半固定，约 200-300 tokens）
[完整文本，含变量 {current_day} {chapter_number} 等]

## 3. 摘要记忆（动态，约 800-1500 tokens）
...（每层完整模板）

## 变量说明表
| 变量 | 来源 | 说明 |
|------|------|------|
| {hero_name} | user_settings.hero_name | 主角名 |
| ... | ... | ... |
```

### 8.4 MyStory-世界观资料.md

**文件位置**：`docs/MyStory-世界观资料.md`

**编写要求**：
- 将 `settings.json` 的 22 个设定条目转化为人类可读的世界观资料文档。
- 按分类组织（力量体系、途径、地点、人物、传说），每个分类下展开详细介绍。
- 这份文档是团队理解诡秘之主世界观的"百科全书"，也是内容创作者自己编写时的参考。
- 比JSON 更详尽，可加入背景说明、原著出处（不直接引用原文）、设计意图。

**内容大纲**：
```
# My Story — 世界观资料

## 一、力量体系
### 1.1 序列与途径
[详细说明 22 条途径、序列 9-0 体系]
### 1.2 魔药与晋升
[详细说明魔药炼制、晋升过程、消化机制]
### 1.3 失控与精神污染
[详细说明风险与对抗]
### 1.4 非凡特性
[详细说明特性守恒、析出机制]

## 二、途径
### 2.1 占卜家途径（主角途径）
[序列 9-7 详细介绍，含能力、描述、剧情中的应用]
### 2.2 其他途径简介
[刺客、阅读者等简介]

## 三、地点
### 3.1 塔罗会
### 3.2 主舞台城市
### 3.3 地下黑市
### 3.4 占卜室

## 四、人物
### 4.1 导师
### 4.2 塔罗会成员
### 4.3 神秘敌人

## 五、传说
### 5.1 雾之上
### 5.2 红月
### 5.3 旧日支配者
### 5.4 神秘学历史
```

> **编写要点**：4 份 MD 文档是 JSON 配置的"人类可读版"，帮助全团队理解内容设计。其中剧情大纲和映射规则表侧重"可读性"，AI Prompt 模板侧重"可执行性"，世界观资料侧重"完整性"。文档与 JSON 配置内容必须保持一致，任何一方修改需同步另一方。

---

## 九、内容质量标准

本节定义内容创作者产出物的质量验收标准，联调阶段据此检查内容质量。

### 9.1 世界观一致性

**标准**：所有内容不能违背诡秘之主原著的核心设定。

| 检查项 | 要求 |
|--------|------|
| 序列体系 | 序列 9-0 的等级、晋升方式、能力描述与原著一致 |
| 途径能力 | 占卜家序列 9-7 的能力不臆造，基于原著设定 |
| 世界规则 | 非凡特性守恒、魔药副作用、失控风险等规则与原著一致 |
| 势力设定 | 塔罗会等组织设定与原著一致，不杜撰原著不存在的核心势力 |
| 文风基调 | 诡秘、悬疑、克苏鲁风格，不出戏为其他风格 |

**禁止事项**：
- 不可让序列 9 的主角拥有序列 7 的能力（除非已晋升）
- 不可让普通人轻易知晓非凡者的存在
- 不可出现与原著矛盾的力量体系（如魔法少女、修仙等）
- 不可让晋升过程过于轻松，忽略失控风险

### 9.2 文风匹配

**标准**：所有文本符合诡秘、悬疑、克苏鲁风格。

| 维度 | 要求 |
|------|------|
| 氛围词 | 雾气、煤气灯、钟塔、雨水、阴影、红月、低语、凝视 |
| 叙事节奏 | 沉稳克制，不急不躁，善用伏笔和反转 |
| 情感表达 | 克制内敛，不直白煽情，以细节传递情感 |
| 悬念营造 | 每段留有悬念，信息逐步揭露，不一次性说透 |
| 克苏鲁元素 | 未知恐惧、不可名状之物、理智的脆弱、知识的危险 |

**示例对比**：
- 不合格："主角开心地去上班，今天又是元气满满的一天！"
- 合格："浓雾吞没了街角的煤气灯，{hero_name}裹紧大衣踏入灰暗的晨光，今日塔罗会有一桩委托等待应承。"

### 9.3 分支合理性

**标准**：分支选项要有意义，不是随便写的。

| 检查项 | 要求 |
|--------|------|
| 选项差异化 | 每个分支选项导向明显不同的后续走向 |
| 效果可感知 | `effect` 字段说明的后果在后续剧情中能体现 |
| 与用户输入相关 | 分支选择应能根据用户日记倾向合理决定 |
| 无废选项 | 没有明显的"最优解"和"废选项"，每个选择都有利有弊 |
| 数量适中 | 每个分支节点 2-3 个选项，不少于 2 个 |

### 9.4 奇遇多样性

**标准**：奇遇不重复，覆盖不同章节阶段。

| 检查项 | 要求 |
|--------|------|
| 分类覆盖 | 六大分类（悬疑/线索/日常/灵异/探索/战斗）均有覆盖 |
| 阶段覆盖 | 序章到终章各阶段都有可触发的奇遇 |
| 内容不重复 | 17 个奇遇的内容、场景、机制各不相同 |
| 等级适配 | 战斗类奇遇的 `min_path_level` 合理，不在主角弱小时出现强敌 |
| 融入自然 | 奇遇内容能自然融入当日剧情，不突兀 |

### 9.5 关键词覆盖度

**标准**：映射规则的 keywords 要覆盖用户常见表达。

| 检查项 | 要求 |
|--------|------|
| 数量充足 | 每条映射至少 5 个关键词（本项目实际 14-15 个） |
| 覆盖口语 | 包含口语化表达（如"躺平""刷题""追番"） |
| 覆盖同义词 | 同一行为的不同说法都覆盖（如学习：看书/读书/上课/听课） |
| 覆盖相关活动 | 行为的子类型都覆盖（如健身：跑步/游泳/打球/瑜伽） |
| 无遗漏大类 | 7 个行为大类覆盖用户日记的绝大多数场景 |

### 9.6 质量检查清单

联调阶段，内容创作者按以下清单自查：

- [ ] world.json 的 description 和 style_guide 是否吸引人且可执行
- [ ] paths.json 的占卜家序列 9-7 能力是否与原著一致
- [ ] mappings.json 的 7 个大类是否覆盖完整，keywords 是否充足
- [ ] outline.json 的 35 个节点是否逻辑连贯、节奏合理
- [ ] outline.json 的分支选项是否都有意义、effect 是否能体现
- [ ] encounters.json 的 17 个奇遇是否分类覆盖、阶段覆盖、不重复
- [ ] settings.json 的 22 个条目 keywords 是否覆盖用户常见表达
- [ ] 所有 JSON 文件格式是否正确（可用 JSON 校验工具检查）
- [ ] 4 份 MD 文档是否与 JSON 配置内容一致
- [ ] 文风是否统一为诡秘悬疑风格，无出戏内容

---

## 十、开发计划

本节按天拆分内容创作者的任务清单，与角色分工总览的阶段 1（第 1-3 天编写、第 4-5 天交付校验）对齐。

### 10.1 任务总览

| 阶段 | 天数 | 主要任务 | 交付物 |
|------|------|---------|--------|
| 编写期 | 第 1-3 天 | 编写 6 个 JSON + 4 份 MD | 10 份交付物 |
| 交付期 | 第 4-5 天 | 交付配置、协助校验格式 | 校验通过的配置 |
| 联调期 | 第 6-7 天 | 根据联调反馈调整内容 | 调整后的配置 |
| 调优期 | 第 8-9 天 | 调优剧情和映射规则 | 最终版配置 |
| 交付 | 第 10 天 | 最终交付 | 全部内容定稿 |

### 10.2 按天任务清单

#### 第 1 天：世界观基础 + 途径配置

| 时段 | 任务 | 产出 |
|------|------|------|
| 上午 | 梳理诡秘之主核心设定，撰写本指南第二章的世界观摘要 | 2.1 节内容 |
| 下午 | 编写 `world.json`（世界观基础设定、文风指南、章节划分） | world.json |
| 下午 | 编写 `paths.json`（占卜家序列 9-7 完整配置 + 其他途径占位） | paths.json |
| 晚间 | 编写本指南第二章、第三章的编写规范 | 指南 2-3 节 |

#### 第 2 天：映射规则 + 剧情大纲

| 时段 | 任务 | 产出 |
|------|------|------|
| 上午 | 编写 `mappings.json`（7 个行为大类映射规则，每类 14-15 个关键词） | mappings.json |
| 上午 | 编写本指南第四章映射规则编写指南 | 指南 4 节 |
| 下午 | 设计 6 章剧情框架（每章主线/分支/高潮/收束节点） | 剧情框架草稿 |
| 晚间 | 编写 `outline.json`（30 个完整节点，含 content/prerequisites/branch_options） | outline.json |

#### 第 3 天：奇遇库 + 设定档案 + 配套文档

| 时段 | 任务 | 产出 |
|------|------|------|
| 上午 | 编写 `encounters.json`（17 个奇遇，覆盖六大分类） | encounters.json |
| 上午 | 编写本指南第六章奇遇库编写指南 | 指南 6 节 |
| 下午 | 编写 `settings.json`（22 个设定条目，覆盖 5 个分类） | settings.json |
| 下午 | 编写本指南第七章设定档案编写指南 | 指南 7 节 |
| 晚间 | 编写 4 份配套 MD 文档（剧情大纲/映射规则表/AI Prompt 模板/世界观资料） | 4 份 MD |
| 晚间 | 编写本指南第八章配套 MD 文档编写指南 | 指南 8 节 |

#### 第 4 天：本指南收尾 + 交付校验

| 时段 | 任务 | 产出 |
|------|------|------|
| 上午 | 编写本指南第一章（角色职责）、第九章（质量标准）、第十章（开发计划） | 指南 1/9/10 节 |
| 下午 | 全部 JSON 文件格式校验（JSON 语法检查、字段完整性检查） | 校验报告 |
| 下午 | 将 6 个 JSON + 4 份 MD 交付给前端工程师加载 | 交付物 |
| 晚间 | 协助前端工程师校验配置加载是否正确 | 加载验证 |

#### 第 5 天：格式校验 + 修正

| 时段 | 任务 | 产出 |
|------|------|------|
| 上午 | 根据前端工程师反馈修正配置格式问题 | 修正后的配置 |
| 下午 | 根据前端工程师反馈修正配置格式问题 | 修正后的配置 |
| 晚间 | 确认全部配置可正确加载到数据库 | 加载确认 |

#### 第 6-7 天：联调配合

| 天 | 任务 | 产出 |
|----|------|------|
| 第 6 天 | 配合 AI 工程师联调，检查 Prompt 拼装是否正确引用配置 | 联调反馈 |
| 第 7 天 | 根据 AI 生成结果调整剧情走向、映射精度、关键词覆盖度 | 调整后的配置 |

#### 第 8-9 天：调优

| 天 | 任务 | 产出 |
|----|------|------|
| 第 8 天 | 根据测试生成的小说段落，调优 outline 节点 content 和 mappings 描述 | 调优配置 |
| 第 9 天 | 调优奇遇内容模板和设定档案关键词，确保 RAG 检索准确 | 调优配置 |

#### 第 10 天：最终交付

| 任务 | 产出 |
|------|------|
| 全部内容定稿，交付最终版 6 个 JSON + 4 份 MD + 本指南 | 最终交付物 |

### 10.3 关键依赖与风险

| 依赖/风险 | 说明 | 应对 |
|-----------|------|------|
| 前端工程师的配置加载器 | 第 4 天交付配置时需要前端加载器就绪 | 前端在第 1-3 天同步开发加载器，用 Mock 数据测试 |
| AI 工程师的 Prompt 拼装 | 第 6 天联调时需要 Prompt 拼装器引用配置 | AI 工程师在第 1-3 天同步开发，用 Mock 配置测试 |
| JSON 格式正确性 | 格式错误会导致加载失败 | 第 4 天严格校验，使用 JSON lint 工具 |
| 世界观准确性 | 设定错误会被 AI 放大为生成错误 | 编写时反复核对原著设定，联调时重点检查 |
| 关键词覆盖不足 | 用户日记无法正确映射 | 调优阶段根据真实日记样本补充关键词 |

### 10.4 与工程团队的并行节奏

```
第 1-3 天（完全并行）：
  内容创作者：编写 6 JSON + 4 MD（本指南为主线）
  前端工程师：搭框架 + 数据层 + Mock StoryEngine + 配置加载器
  AI 工程师：Prompt 模板 + 4 适配器 + Mock Repository

第 4-5 天（交付校验）：
  内容创作者：交付配置 + 协助校验格式
  前端工程师：加载真实配置 + 完成页面 UI
  AI 工程师：实现审查循环 + 三层记忆 + 故事引擎

第 6-7 天（联调）：
  内容创作者：根据联调反馈调整内容
  前端工程师：替换 Mock，全流程测试
  AI 工程师：替换 Mock，全流程测试

第 8-9 天（调优）：
  内容创作者：调优剧情和映射规则
  前端工程师：Bug 修复 + 打包
  AI 工程师：Prompt 调优 + 文风调整

第 10 天（交付）：
  三方共同交付最终版本
```

---

## 附录：配置文件与文档对照表

| 配置文件/文档 | 本指南章节 | 数据库表 | 使用者 | Token 预算 |
|--------------|-----------|---------|--------|-----------|
| `world.json` | 第二章 | （前端加载，不入库） | 前端+AI | 系统 Prompt 1500-2000 |
| `paths.json` | 第三章 | （前端加载，不入库） | 前端+AI | 系统 Prompt 内 |
| `mappings.json` | 第四章 | （前端加载，不入库） | AI 工程师 | 当日映射 500-800 |
| `outline.json` | 第五章 | `story_outline` | AI 工程师 | 章节指令 200-300 |
| `encounters.json` | 第六章 | `encounter_library` | AI 工程师 | 奇遇注入 200-400 |
| `settings.json` | 第七章 | `world_settings` | AI 工程师 | 档案记忆 1000-2000 |
| `MyStory-剧情大纲.md` | 第八章 8.1 | — | 全团队 | — |
| `MyStory-映射规则表.md` | 第八章 8.2 | — | 全团队 | — |
| `MyStory-AI-Prompt模板.md` | 第八章 8.3 | — | AI 工程师 | — |
| `MyStory-世界观资料.md` | 第八章 8.4 | — | 全团队 | — |

> 本指南是内容创作者的完整工作手册，涵盖从世界观理解到配置编写、从质量标准到开发计划的全流程。所有 JSON 配置均为完整可用版本，联调阶段只需根据生成结果做微调，无需重写。
