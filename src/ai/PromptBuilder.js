// src/ai/PromptBuilder.js
//
// Prompt 拼装器：按固定顺序组装 8 层模板 + 变量替换 + Token 预算检查。
// 8 层模板顺序（AI 开发指南 4.1 节）：
//   System Prompt = 模板1(系统) + 模板2(章节阶段)
//   User Prompt   = 模板3(摘要) + 模板4(档案) + 模板5(即时) + 模板6(日记映射)
//                   + 模板7(奇遇, 可选) + 模板8(生成指令)
//
// 同时导出辅助 Prompt（审查/摘要/润色/日记解析），供 ReviewLoop、SummaryGenerator、
// DiaryParser 复用，保证全链路 Prompt 文本唯一来源。

import TokenCounter from '../utils/TokenCounter.js';

// ========== 辅助 Prompt 常量（导出供其他组件复用）==========

/**
 * 审查 Prompt — 轮次 1（审查初稿）
 * 变量：{generated_content}
 */
const REVIEW_PROMPT_ROUND_1 = `你是一位严格的小说编辑，精通《诡秘之主》世界观。请审查以下小说段落，从以下维度进行评估：

【审查维度】
1. 世界观一致性：是否有不符合《诡秘之主》设定的内容？（如出现不存在的途径、错误的能力描述、不符合时代背景的元素等）
2. 行为映射正确性：用户日常行为是否被正确映射到世界观行为？映射是否合理自然？
3. 逻辑矛盾：是否有前后矛盾的情节？角色行为是否符合其设定？
4. 文风一致性：是否符合诡秘悬疑风格？是否有出戏的表达？
5. 衔接性：是否与前 3 天的剧情自然衔接？时间线是否连贯？
6. 节奏感：是否有适当的悬念和起伏？是否推进了剧情？
7. 剧情计划遵循：是否承接指定开场、执行日记因果与命运后果，并避免禁止改变的事实？

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
}`;

/**
 * 审查 Prompt — 轮次 2（审查修改稿）
 * 变量：{previous_issues}、{generated_content}
 */
const REVIEW_PROMPT_ROUND_2 = `你是一位严格的小说编辑，精通《诡秘之主》世界观。这是第二轮审查，请重点检查以下维度：

【第二轮审查重点】
1. 修改是否引入了新问题：上一轮修改后是否有新的逻辑矛盾或设定错误？
2. 前后文衔接：修改部分与未修改部分的衔接是否自然？
3. 叙事流畅性：整体阅读体验是否流畅？有无突兀的转折？
4. 重复第二轮审查维度1-6的基础检查。
5. 剧情计划遵循：不得因修订而破坏跨日承接、用户选择后果或日记因果。

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
}`;

/**
 * 摘要生成 Prompt
 * 变量：{chapter_full_content}
 */
const SUMMARY_PROMPT = `你是一位小说编辑。请为以下章节内容生成一段 200-300 字的剧情摘要。

【摘要要求】
1. 概括本章的核心事件和主要情节。
2. 标记关键转折点（如角色关系变化、能力提升、重要发现等）。
3. 记录人物关系的变化（新出场人物、关系发展等）。
4. 列出未解决的悬念和伏笔。
5. 语言精炼，使用叙述性语言，不要使用列表格式。
6. 字数严格控制在 200-300 字。

【章节内容】
{chapter_full_content}

请直接输出摘要正文，不要输出标题、字数统计或其他任何额外内容。`;

/**
 * 润色 Prompt
 * 变量：{content}
 */
const POLISH_PROMPT = `你是一位精通《诡秘之主》世界观的文学编辑。请对以下小说段落进行最终润色。

【润色要求】
1. 统一文风，确保整体风格为诡秘、悬疑、克苏鲁风格，带有维多利亚时代氛围。
2. 优化叙事节奏，确保有适当的起伏感和悬念。
3. 检查并回收或呼应前文埋下的伏笔（如有）。
4. 润色语言表达，使其更加文学化和沉浸感更强。
5. 不要改变核心情节和人物行为，仅做文风和表达层面的优化。
6. 正文不少于 800 字；根据剧情需要自然展开，不设置硬性字数上限。
7. 不要添加新的情节或设定。

【待润色段落】
{content}

请直接输出润色后的完整段落，不要输出任何解释或说明。`;

/**
 * 内容质量修复 Prompt。
 * 变量：{repair_action}、{quality_reasons}、{daily_events}、{coverage_keywords}、{content}
 */
const CONTENT_REPAIR_PROMPT = `你是连载小说的终稿编辑。请对以下故事正文执行一次严格的质量修复。

【本次修复动作】
{repair_action}

【检测到的问题】
{quality_reasons}

【当日日记必须覆盖的事件】
{daily_events}

【必须自然覆盖的具体关键词】
{coverage_keywords}

【硬性验收标准】
1. 只输出完整小说正文，不输出标题、说明、JSON 或引用标注。
2. 正文不少于 800 个汉字/字符；根据剧情需要保留必要细节，不设置硬性字数上限。
3. 必须以完整的中文句号、问号、感叹号或省略号结束，不能在半句截断。
4. 不得删掉当日日记的核心事件；将其自然映射进剧情，而不是机械罗列。
5. 保持已有角色、时间线和世界观一致，不新增与原文无关的主线。

【待修复正文】
{content}`;

/**
 * 日记解析 Prompt
 */
const DIARY_PARSE_PROMPT = `你是一个日记分析助手。请从用户的日记中提取关键事件和行为分类。

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
}`;

class PromptBuilder {
  /**
   * 安全字符串替换：防止 $ 特殊字符注入
   * JS 的 String.replace() 中 $'、$`、$$ 等有特殊含义，
   * 用户日记或 AI 内容中若含 $ 会被错误解析。
   * 使用 split-join 代替 replace 彻底规避此问题。
   */
  static _safeReplace(template, placeholder, value) {
    if (value == null) value = ''
    return template.split(placeholder).join(String(value))
  }

  constructor() {
    // ===== 模板 1：系统 Prompt（固定，变量 {hero_name}） =====
    this.SYSTEM_PROMPT_TEMPLATE = `你是一位精通《诡秘之主》世界观的资深小说作家。你正在为用户创作一部以用户为主角的连载小说。

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
- 每段故事不少于 800 字，包含场景描写、心理活动和对话；篇幅随剧情需要自然展开。
- 保持连载小说的节奏感，每段结尾留下适当的悬念和期待感。
- 对话使用中文引号「」，环境描写注重氛围营造。
- 避免使用现代网络用语，保持时代感。

【输出格式】
- 直接输出小说正文，不要输出任何解释、元信息或注释。
- 不要输出标题或章节名，直接从正文第一句开始。
- 不要输出字数统计或任何 AI 辅助生成的痕迹。
- 如果需要分段，使用空行分隔。`;

    // ===== 模板 2：章节阶段指令（半固定） =====
    this.CHAPTER_STAGE_TEMPLATE = `【当前故事进度】
- 第 {current_day} 天 / 共 90 天
- 当前章节：第 {chapter_number} 章「{chapter_title}」
- 章节定位：{chapter_purpose}

【本章剧情指导】
{outline_content}

【当前阶段剧情方向】
{branch_guidance}

{chapter_transition_hint}`;

    // ===== 模板 3：摘要记忆（动态） =====
    this.SUMMARY_MEMORY_TEMPLATE = `【前情提要（之前章节摘要）】

{chapter_summaries}`;

    // ===== 模板 4：档案记忆（RAG 检索结果，动态） =====
    this.RAG_MEMORY_TEMPLATE = `【相关世界观设定（供参考，确保剧情符合设定）】

{rag_entries}`;

    // ===== 模板 5：即时上下文（动态） =====
    this.IMMEDIATE_CONTEXT_TEMPLATE = `【最近故事原文（请保持剧情衔接）】

{recent_segments}`;

    // ===== 模板 6：当日日记 + 映射结果（动态） =====
    this.DIARY_MAPPING_TEMPLATE = `【今日主角的真实经历（已映射为世界观行为）】

用户日记原文：
{raw_text}

行为映射结果：
{mapping_lines}

请根据以上映射结果，将今日经历自然融入主角的故事中。不要生硬地照搬映射结果，而是将其作为剧情素材进行文学化创作。`;

    this.STORY_PLAN_TEMPLATE = `【当天剧情执行计划（最高优先级，必须执行）】

{story_plan}

这不是可选参考。正文必须承接开场、让日记和用户选择造成后果，并且不得违反“禁止改变”。`;

    // 放在 Prompt 末尾，降低长上下文导致模型忽略当日日记的概率。
    this.DAILY_COVERAGE_TEMPLATE = `【最终硬约束：当日日记必须覆盖】

以下事件必须在正文中以世界观化方式实际发生或被角色处理：
{daily_events}

至少自然覆盖以下 {required_match_count} 个具体关键词：{coverage_keywords}
生成前逐项自检；若正文没有体现这些事件，请先改写再输出。`;

    // ===== 模板 7：奇遇注入（动态，可选） =====
    this.ENCOUNTER_TEMPLATE = `【今日额外事件（随机奇遇）】

奇遇标题：{encounter_title}
奇遇内容：{encounter_content}

请将此事件自然融入今日剧情中，作为当天故事的一个额外情节节点。不要让奇遇事件喧宾夺主，应与日记映射的主线剧情有机结合。奇遇可能引入新的 NPC、线索或物品，为后续剧情埋下伏笔。`;

    // ===== 模板 8：生成指令（固定） =====
    this.GENERATE_INSTRUCTION_TEMPLATE = `【生成要求】

请生成今日（第 {current_day} 天）的故事段落。具体要求：
1. 将今日经历映射为世界观内的行为，自然融入连续剧情中。
2. 与最近 3 天的故事自然衔接，保持时间和情节的连贯性。
3. 符合当前章节（第 {chapter_number} 章）的剧情走向和定位。
4. 正文不少于 800 字；根据剧情需要自然展开，不设置硬性字数上限。
5. 如有奇遇事件，将其自然融入今日剧情。
6. 保持悬念和连载感，结尾留下适当的期待。
7. 推进主角的成长或剧情发展，不要原地踏步。
8. 严格遵守系统 Prompt 中的世界观设定，不创造与设定矛盾的内容。

【输出格式（重要）】
请按以下格式输出，分为"故事正文"和"引用标注"两部分：

第一部分：直接输出小说正文（不少于800字），不要输出标题、解释或元信息。

然后在正文结束后，另起一行输出分隔符：
---DIARY_REFS---

第二部分：在分隔符之后，输出 3-5 条"日记→故事"引用标注，用 JSON 数组格式：
[
  {"diarySnippet": "用户日记中的原文片段", "storySnippet": "故事中对应这句话或段落", "mapping": "一句话说明这个映射关系"},
  ...
]

引用标注要求：
- diarySnippet 必须是用户日记中的真实原文片段（可以截取关键部分）
- storySnippet 必须是你在正文中实际写出的句子
- mapping 简要说明日常行为如何转化为世界观内的活动
- 选择最能体现"用户行动影响剧情"的 3-5 条，不要列举全部
{regenerate_hint}`;

    // 重新生成提示（追加到生成指令末尾）
    this.REGENERATE_HINT = `9. 【重要】这是重新生成请求。可以改变措辞、场景表达、对话和局部节奏，但不得推翻当天剧情执行计划、上一日承接点、用户选择、日记核心因果或既有硬事实。
`;

    // ===== Token 预算配置（升级：充分利用 DeepSeek 64K 窗口）=====
    this.TOKEN_BUDGETS = {
      system: 2000,        // 模板1+2，固定不降级
      summary: 3000,       // 摘要记忆，全部章节不降级（原 1500）
      rag: 3000,           // 档案记忆，超限从 Top8 降为 Top5（原 2000）
      storyRag: 5000,      // 动态RAG（故事事件检索），超限从 Top5 降为 Top3
      entity: 2000,        // 实体记忆（角色/物品/地点状态）
      foreshadowing: 1000, // 伏笔池（未解伏笔）
      immediate: 8000,     // 即时上下文，超限从 5 天降为 3 天（原 4000）
      diary: 1000,         // 当日日记+映射
      encounter: 400,      // 奇遇注入
      instruction: 500,    // 生成指令
    };
    this.TOTAL_INPUT_BUDGET = 32000; // DeepSeek 64K 窗口，留 32K 给输出+余量
  }

  /**
   * 组装完整 Prompt
   * @param {Object} params - 所有变量
   * @param {string} params.heroName - 主角名
   * @param {number} params.currentDay - 当前天数
   * @param {number} params.chapterNumber - 章节号
   * @param {string} params.chapterTitle - 章节标题
   * @param {string} params.chapterPurpose - 章节定位
   * @param {string} params.outlineContent - 大纲内容
   * @param {string} params.branchGuidance - 分支引导
   * @param {boolean} params.isNewChapter - 是否新章节第一天
   * @param {Array<{title:string, summary:string}>} params.summaries - 章节摘要
   * @param {Array<Object>} params.ragResults - RAG 检索结果
   * @param {Array<{day_number:number, content:string}>} params.immediateContext - 即时上下文
   * @param {string} params.rawText - 日记原文
   * @param {string} params.mappingDesc - 映射说明 JSON 字符串
   * @param {string|null} params.encounterTitle - 奇遇标题
   * @param {string|null} params.encounterContent - 奇遇内容
   * @param {boolean} params.isRegenerate - 是否重新生成
   * @returns {{ systemPrompt: string, userPrompt: string, tokenEstimate: Object }}
   */
  build(params) {
    const systemPrompt = this._buildSystemPrompt(params);
    const userPrompt = this._buildUserPrompt(params);

    // 总 Token 预算检查与削减（AI 开发指南 4.8 节流程）
    const adjusted = this._enforceTotalBudget(systemPrompt, userPrompt, params);

    const tokenEstimate = {
      system: TokenCounter.estimate(adjusted.systemPrompt),
      user: TokenCounter.estimate(adjusted.userPrompt),
      total: TokenCounter.estimate(adjusted.systemPrompt) +
             TokenCounter.estimate(adjusted.userPrompt),
    };

    return {
      systemPrompt: adjusted.systemPrompt,
      userPrompt: adjusted.userPrompt,
      continuityContext: this._buildContinuityContext(params),
      storyPlanContext: this._buildStoryPlan(params.storyPlan),
      tokenEstimate,
    };
  }

  // ===== System Prompt = 模板1 + 模板2 =====
  _buildSystemPrompt(params) {
    // 模板1：系统 Prompt（替换 hero_name）
    const template1 = PromptBuilder._safeReplace(
      this.SYSTEM_PROMPT_TEMPLATE, '{hero_name}', params.heroName
    );

    // 模板2：章节阶段指令
    const transitionHint = params.isNewChapter
      ? '本章为新章节的开始，请自然引出本章主题，做好与上一章的衔接。'
      : '';

    let template2 = this.CHAPTER_STAGE_TEMPLATE;
    template2 = PromptBuilder._safeReplace(template2, '{current_day}', params.currentDay);
    template2 = PromptBuilder._safeReplace(template2, '{chapter_number}', params.chapterNumber);
    template2 = PromptBuilder._safeReplace(template2, '{chapter_title}', params.chapterTitle);
    template2 = PromptBuilder._safeReplace(template2, '{chapter_purpose}', params.chapterPurpose);
    template2 = PromptBuilder._safeReplace(template2, '{outline_content}', params.outlineContent || '（暂无具体大纲指导）');
    template2 = PromptBuilder._safeReplace(template2, '{branch_guidance}', params.branchGuidance || '（自由发展）');
    template2 = PromptBuilder._safeReplace(template2, '{chapter_transition_hint}', transitionHint);

    return template1 + '\n\n' + template2;
  }

  // ===== User Prompt = 模板3..8 =====
  _buildUserPrompt(params) {
    const parts = [];

    parts.push(this._buildSummaryMemory(params.summaries));
    if (params.narrativeContext?.text) {
      parts.push(`【叙事状态图（必须遵守）】\n${params.narrativeContext.text}`)
    }
    parts.push(this._buildRagMemory(params.ragResults));
    // 新增：动态 RAG（过去故事事件检索）
    if (params.storyRagResults && params.storyRagResults.length > 0) {
      parts.push(this._buildStoryRagMemory(params.storyRagResults));
    }
    // 新增：实体记忆（角色/物品/地点）
    if (params.entityMemory) {
      parts.push(this._buildEntityMemory(params.entityMemory));
    }
    // 新增：伏笔池（未回收伏笔）
    if (params.foreshadowing) {
      parts.push(this._buildForeshadowing(params.foreshadowing));
    }
    parts.push(this._buildImmediateContext(params.immediateContext, params.currentDay));
    parts.push(this._buildDiaryMapping(params.rawText, params.mappingDesc));
    if (params.storyPlan) parts.push(this._buildStoryPlan(params.storyPlan));

    if (params.encounterContent) {
      parts.push(this._buildEncounter(params.encounterTitle, params.encounterContent));
    }

    parts.push(this._buildGenerateInstruction(
      params.currentDay, params.chapterNumber, params.isRegenerate
    ));
    parts.push(this._buildDailyCoverageChecklist(params.dailyEvents, params.coverageKeywords));

    return parts.filter(p => p).join('\n\n');
  }

  _buildContinuityContext(params) {
    const parts = []
    if (params.narrativeContext?.text) parts.push(params.narrativeContext.text)
    parts.push(this._buildSummaryMemory(params.summaries))
    if (params.storyRagResults?.length) parts.push(this._buildStoryRagMemory(params.storyRagResults))
    if (params.entityMemory) parts.push(this._buildEntityMemory(params.entityMemory))
    if (params.foreshadowing) parts.push(this._buildForeshadowing(params.foreshadowing))
    parts.push(this._buildImmediateContext(params.immediateContext, params.currentDay))
    if (params.storyPlan) parts.push(this._buildStoryPlan(params.storyPlan))
    return parts.filter(Boolean).join('\n\n')
  }

  _buildSummaryMemory(summaries) {
    if (!summaries || summaries.length === 0) {
      return PromptBuilder._safeReplace(
        this.SUMMARY_MEMORY_TEMPLATE, '{chapter_summaries}', '（这是故事的开端，尚无前情摘要。）'
      );
    }
    const lines = summaries
      .map(s => `${s.title}摘要：${s.summary}`)
      .join('\n\n');
    return PromptBuilder._safeReplace(this.SUMMARY_MEMORY_TEMPLATE, '{chapter_summaries}', lines);
  }

  _buildRagMemory(ragResults) {
    if (!ragResults || ragResults.length === 0) {
      return PromptBuilder._safeReplace(
        this.RAG_MEMORY_TEMPLATE, '{rag_entries}', '（暂无特别需要参考的设定。）'
      );
    }
    const grouped = {};
    for (const item of ragResults) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item.value);
    }
    const categoryNames = {
      path: '途径', power_system: '力量体系', location: '地点',
      character: '人物', lore: '背景知识', item: '物品',
    };
    const lines = Object.entries(grouped).map(([cat, values]) => {
      return `【${categoryNames[cat] || cat}】${values.join('\n')}`;
    }).join('\n\n');
    return PromptBuilder._safeReplace(this.RAG_MEMORY_TEMPLATE, '{rag_entries}', lines);
  }

  // ===== 新增：动态 RAG（过去故事事件检索）=====
  _buildStoryRagMemory(results) {
    if (!results || results.length === 0) return ''
    const lines = results.map(r => {
      const dayLabel = r.storyDay != null ? `第${r.storyDay}天` : '早期故事'
      return `【${dayLabel}·相关片段】\n${r.snippet}`
    }).join('\n\n')
    return `【相关历史剧情片段（请保持与这些细节的一致性）】\n${lines}`
  }

  // ===== 新增：实体记忆（角色/物品/地点）=====
  _buildEntityMemory(entityText) {
    if (!entityText) return ''
    return `【角色/物品/地点档案（确保一致性）】\n${entityText}`
  }

  // ===== 新增：伏笔池（未回收伏笔）=====
  _buildForeshadowing(foreshadowText) {
    if (!foreshadowText) return ''
    return `${foreshadowText}\n（请在本次生成中尝试自然地回收部分伏笔，尤其是标记为"高优先级"或"超过15天"的。）`
  }

  _buildImmediateContext(segments, currentDay) {
    if (!segments || segments.length === 0) {
      return PromptBuilder._safeReplace(
        this.IMMEDIATE_CONTEXT_TEMPLATE, '{recent_segments}',
        '（这是故事的第一天，尚无历史剧情。请从主角觉醒开始叙述。）'
      );
    }
    const lines = segments
      .map(s => `━━━ 第 ${s.day_number} 天 ━━━\n${s.content}`)
      .join('\n\n');
    return PromptBuilder._safeReplace(this.IMMEDIATE_CONTEXT_TEMPLATE, '{recent_segments}', lines);
  }

  _buildDiaryMapping(rawText, mappingDesc) {
    let mappingLines = '（无映射结果）';
    try {
      const mappings = JSON.parse(mappingDesc);
      if (Array.isArray(mappings) && mappings.length > 0) {
        mappingLines = mappings
          .map(m => `- ${m.behavior} → ${m.worldBehavior}（${m.description}）`)
          .join('\n');
      }
    } catch (_) { /* 使用默认值 */ }

    let result = PromptBuilder._safeReplace(this.DIARY_MAPPING_TEMPLATE, '{raw_text}', rawText);
    result = PromptBuilder._safeReplace(result, '{mapping_lines}', mappingLines);
    return result;
  }

  _buildStoryPlan(plan) {
    if (!plan || typeof plan !== 'object') return ''
    const lines = []
    const opening = plan.openingBridge || {}
    lines.push(`【开场承接】${opening.sourceFact || '承接上一日结尾'}；第一场景：${opening.firstSceneAction || '自然继续'}`)
    const anchors = Array.isArray(plan.continuityAnchors) ? plan.continuityAnchors : []
    if (anchors.length) lines.push(`【连续性锚点】\n${anchors.map(item => `- ${item.fact} → ${item.requiredUsage}`).join('\n')}`)
    const causality = Array.isArray(plan.diaryCausality) ? plan.diaryCausality : []
    if (causality.length) lines.push(`【日记必须造成的因果】\n${causality.map(item => `- ${item.diaryEvent} → ${item.worldAction} → 后果：${item.storyConsequence}`).join('\n')}`)
    if (plan.choiceConsequence) lines.push(`【用户命运后果】${plan.choiceConsequence.choice}；${plan.choiceConsequence.consequence}`)
    const beats = Array.isArray(plan.beats) ? plan.beats : []
    if (beats.length) lines.push(`【剧情节拍】\n${beats.map(item => `${item.order}. ${item.action}（状态变化：${item.stateChange}）`).join('\n')}`)
    if (plan.endingTarget?.state) lines.push(`【今日结束状态】${plan.endingTarget.state}${plan.endingTarget.nextHook ? `；下一日钩子：${plan.endingTarget.nextHook}` : ''}`)
    const forbidden = Array.isArray(plan.forbiddenChanges) ? plan.forbiddenChanges : []
    if (forbidden.length) lines.push(`【禁止改变】\n${forbidden.map(item => `- ${item}`).join('\n')}`)
    return PromptBuilder._safeReplace(this.STORY_PLAN_TEMPLATE, '{story_plan}', lines.join('\n\n'))
  }

  _buildEncounter(title, content) {
    let result = PromptBuilder._safeReplace(this.ENCOUNTER_TEMPLATE, '{encounter_title}', title);
    result = PromptBuilder._safeReplace(result, '{encounter_content}', content);
    return result;
  }

  _buildGenerateInstruction(currentDay, chapterNumber, isRegenerate) {
    let instruction = PromptBuilder._safeReplace(
      this.GENERATE_INSTRUCTION_TEMPLATE, '{current_day}', currentDay
    );
    instruction = PromptBuilder._safeReplace(instruction, '{chapter_number}', chapterNumber);

    if (isRegenerate) {
      instruction = PromptBuilder._safeReplace(instruction, '{regenerate_hint}', this.REGENERATE_HINT);
    } else {
      instruction = PromptBuilder._safeReplace(instruction, '{regenerate_hint}', '');
    }
    return instruction;
  }

  _buildDailyCoverageChecklist(events = [], keywords = []) {
    const normalizedEvents = Array.isArray(events)
      ? events.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4)
      : []
    const normalizedKeywords = Array.isArray(keywords)
      ? keywords.map(item => String(item || '').trim()).filter(Boolean).slice(0, 6)
      : []
    const eventLines = normalizedEvents.length
      ? normalizedEvents.map((event, index) => `${index + 1}. ${event}`).join('\n')
      : '1. 将用户日记中的核心事件自然转化为剧情。'
    const requiredMatchCount = Math.min(2, normalizedKeywords.length)
    let result = PromptBuilder._safeReplace(this.DAILY_COVERAGE_TEMPLATE, '{daily_events}', eventLines)
    result = PromptBuilder._safeReplace(result, '{coverage_keywords}', normalizedKeywords.join('、') || '（无可用具体关键词，仍须覆盖上述事件）')
    result = PromptBuilder._safeReplace(result, '{required_match_count}', requiredMatchCount)
    return result
  }

  static buildContentRepairPrompt({ action, assessment, dailyEvents, coverageKeywords, content }) {
    const eventLines = (dailyEvents || []).map((item, index) => `${index + 1}. ${item}`).join('\n') || '1. 保留当日日记的核心事件。'
    const reasons = assessment?.reasons?.join('；') || '未通过内容质量验收'
    let prompt = CONTENT_REPAIR_PROMPT
    prompt = PromptBuilder._safeReplace(prompt, '{repair_action}', action)
    prompt = PromptBuilder._safeReplace(prompt, '{quality_reasons}', reasons)
    prompt = PromptBuilder._safeReplace(prompt, '{daily_events}', eventLines)
    prompt = PromptBuilder._safeReplace(prompt, '{coverage_keywords}', (coverageKeywords || []).join('、') || '无')
    return PromptBuilder._safeReplace(prompt, '{content}', content)
  }

  /**
   * 总 Token 预算强制削减（AI 开发指南 4.8 节）
   * 削减优先级：
   *   1. 档案记忆 Top5 → Top3
   *   2. 即时上下文 3 天 → 2 天
   *   3. 摘要记忆 全部 → 最近 2 章
   *   4. 极端情况截断即时上下文最早段落
   *
   * 由于各层降级已在三层记忆组件内完成，这里只做总预算兜底：
   * 若仍超限，则依次削减即时上下文与摘要记忆的重建结果。
   */
  _enforceTotalBudget(systemPrompt, userPrompt, params) {
    let sys = systemPrompt;
    let usr = userPrompt;

    if (TokenCounter.estimate(sys) + TokenCounter.estimate(usr) <= this.TOTAL_INPUT_BUDGET) {
      return { systemPrompt: sys, userPrompt: usr };
    }

    // 第一削减：即时上下文保留最近 2 天
    if (params.immediateContext && params.immediateContext.length > 2) {
      const trimmed = params.immediateContext.slice(-2);
      usr = this._rebuildUserPromptWithImmediate(params, trimmed);
      if (TokenCounter.estimate(sys) + TokenCounter.estimate(usr) <= this.TOTAL_INPUT_BUDGET) {
        return { systemPrompt: sys, userPrompt: usr };
      }
    }

    // 第二削减：摘要记忆保留最近 2 章
    if (params.summaries && params.summaries.length > 2) {
      const trimmedSummaries = params.summaries.slice(-2);
      const trimmedImmediate = (params.immediateContext || []).slice(-2);
      usr = this._rebuildUserPrompt(params, trimmedSummaries, trimmedImmediate);
      if (TokenCounter.estimate(sys) + TokenCounter.estimate(usr) <= this.TOTAL_INPUT_BUDGET) {
        return { systemPrompt: sys, userPrompt: usr };
      }
    }

    // 第三削减：截断即时上下文最早的段落（仅保留最后 1 天）
    if (params.immediateContext && params.immediateContext.length > 1) {
      const trimmedImmediate = params.immediateContext.slice(-1);
      const trimmedSummaries = (params.summaries || []).slice(-2);
      usr = this._rebuildUserPrompt(params, trimmedSummaries, trimmedImmediate);
    }

    return { systemPrompt: sys, userPrompt: usr };
  }

  _rebuildUserPromptWithImmediate(params, immediateContext) {
    const newParams = { ...params, immediateContext };
    return this._buildUserPrompt(newParams);
  }

  _rebuildUserPrompt(params, summaries, immediateContext) {
    const newParams = { ...params, summaries, immediateContext };
    return this._buildUserPrompt(newParams);
  }
}

// 导出辅助 Prompt 常量，供 ReviewLoop / SummaryGenerator / DiaryParser 复用
PromptBuilder.REVIEW_PROMPT_ROUND_1 = REVIEW_PROMPT_ROUND_1;
PromptBuilder.REVIEW_PROMPT_ROUND_2 = REVIEW_PROMPT_ROUND_2;
PromptBuilder.SUMMARY_PROMPT = SUMMARY_PROMPT;
PromptBuilder.POLISH_PROMPT = POLISH_PROMPT;
PromptBuilder.CONTENT_REPAIR_PROMPT = CONTENT_REPAIR_PROMPT;
PromptBuilder.DIARY_PARSE_PROMPT = DIARY_PARSE_PROMPT;

export default PromptBuilder;
