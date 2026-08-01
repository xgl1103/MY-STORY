// src/core/DiaryParser.js
//
// 日记解析器：调用 AI 从用户日记中提取结构化事件和行为大类。
// 对应 10 步生成流程的步骤 1。
//
// 输入：diaryText（用户日记原文）、behaviorTags（用户选的行为标签，可能为空）
// 输出：{ events: string[], detectedBehaviors: string[], keywords: string[] }
//
// 异常处理（AI 开发指南 2.2 步骤1）：
//   - AI 调用失败 → 重试 1 次；仍失败 → 使用 behaviorTags 作为 fallback
//   - JSON 解析失败 → 使用 behaviorTags 作为 fallback
//   - events 为空 → 用日记原文前 100 字作为 events
//
// Prompt 文本从 PromptBuilder.DIARY_PARSE_PROMPT 复用，保证唯一来源。

import PromptBuilder from '../ai/PromptBuilder.js';
import ErrorHandler from '../utils/ErrorHandler.js';

class DiaryParser {
  /**
   * @param {Object} options - 可选配置
   * @param {boolean} options.useMock - 为 true 时跳过 AI 调用，用本地规则解析（测试用）
   */
  constructor(options = {}) {
    this.useMock = options.useMock || false;
  }

  /**
   * 解析日记，提取事件、行为分类和关键词
   * @param {string} diaryText - 用户日记原文
   * @param {string[]} behaviorTags - 用户选的行为标签（可能为空）
   * @param {Object} aiContext - AI 调用上下文 { adapter, apiKey, baseUrl }
   * @returns {Promise<{events: string[], detectedBehaviors: string[], keywords: string[]}>}
   */
  async parse(diaryText, behaviorTags = [], aiContext = null) {
    // Mock 模式：用本地规则解析（不调用 AI，用于无 API Key 的测试场景）
    if (this.useMock || !aiContext) {
      return this._mockParse(diaryText, behaviorTags);
    }

    const systemPrompt = PromptBuilder.DIARY_PARSE_PROMPT;
    const userPrompt = `用户日记：${diaryText}\n用户选的标签：${behaviorTags.join(', ')}`;

    // 调用 AI，带 1 次重试（E007 可重试）
    const result = await ErrorHandler.callWithRetry(async () => {
      return aiContext.adapter.chat({
        apiKey: aiContext.apiKey,
        baseUrl: aiContext.baseUrl,
        systemPrompt,
        userPrompt,
        temperature: 0.3,
        maxTokens: 500,
      });
    }, '日记解析');

    if (!result.success) {
      // 降级：直接用用户标签，不提取事件
      console.warn('日记解析 AI 调用失败，使用 fallback:', result.error);
      return this._fallback(diaryText, behaviorTags);
    }

    // JSON 解析（三级容错，与 ReviewLoop 一致）
    let parsed;
    try {
      parsed = this._parseJson(result.content);
    } catch (e) {
      console.warn('日记解析 JSON 解析失败，使用 fallback');
      return this._fallback(diaryText, behaviorTags);
    }

    // 补全空字段
    if (!parsed.events || parsed.events.length === 0) {
      parsed.events = [diaryText.slice(0, 100)];
    }
    if (!parsed.detectedBehaviors || parsed.detectedBehaviors.length === 0) {
      parsed.detectedBehaviors = behaviorTags.length > 0 ? behaviorTags : ['其他'];
    }
    if (!parsed.keywords) {
      parsed.keywords = [];
    }

    return parsed;
  }

  /**
   * JSON 三级容错解析（与 ReviewLoop._parseReviewJson 逻辑一致）
   * @private
   */
  _parseJson(content) {
    if (!content || typeof content !== 'string') {
      throw new Error('内容为空');
    }
    // 1. 直接解析
    try { return JSON.parse(content); } catch (_) { /* 继续 */ }
    // 2. 提取 ```json ... ``` 代码块
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch (_) { /* 继续 */ }
    }
    // 3. 提取第一个 { ... } 花括号块
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try { return JSON.parse(braceMatch[0]); } catch (_) { /* 继续 */ }
    }
    throw new Error('无法解析 JSON');
  }

  /**
   * 降级处理：使用用户标签，events 用日记原文前 100 字
   * @private
   */
  _fallback(diaryText, behaviorTags) {
    return {
      events: diaryText ? [diaryText.slice(0, 100)] : [],
      detectedBehaviors: behaviorTags.length > 0 ? behaviorTags : ['其他'],
      keywords: [],
    };
  }

  /**
   * Mock 解析：用简单的关键词匹配规则模拟 AI 解析（无 API Key 时使用）
   * @private
   */
  _mockParse(diaryText, behaviorTags) {
    const text = diaryText || '';
    const detectedBehaviors = [...behaviorTags];
    const keywords = [];

    // 简单关键词匹配
    const rules = [
      { behavior: '学习', keywords: ['看书', '读书', '学习', '上课', '复习', '写作业', '听课', '研究', '书'] },
      { behavior: '工作', keywords: ['上班', '加班', '开会', '写报告', '项目', '工作'] },
      { behavior: '健身', keywords: ['运动', '跑步', '锻炼', '游泳', '打球', '健身', '健身房'] },
      { behavior: '社交', keywords: ['聚会', '聊天', '朋友', '聚餐', '见面', '社交'] },
      { behavior: '休息', keywords: ['睡觉', '午休', '放松', '发呆', '休息'] },
      { behavior: '娱乐', keywords: ['游戏', '电影', '音乐', '逛街', '旅游', '娱乐'] },
    ];

    for (const rule of rules) {
      if (rule.keywords.some(kw => text.includes(kw)) && !detectedBehaviors.includes(rule.behavior)) {
        detectedBehaviors.push(rule.behavior);
      }
    }

    if (detectedBehaviors.length === 0) {
      detectedBehaviors.push('其他');
    }

    // 提取事件（按句号分割）
    const events = text
      .split(/[。！？\n]/)
      .map(s => s.trim())
      .filter(s => s.length >= 5)
      .slice(0, 5);

    // 提取关键词（简单提取名词性词汇）
    if (text.includes('占卜') || text.includes('塔罗')) keywords.push('占卜');
    if (text.includes('书') || text.includes('学习')) keywords.push('学习');
    if (text.includes('神秘') || text.includes('灵')) keywords.push('神秘学');

    return { events, detectedBehaviors, keywords };
  }
}

export default DiaryParser;
