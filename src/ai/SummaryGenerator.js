// src/ai/SummaryGenerator.js
//
// 摘要生成器：章节结束时生成 200-300 字的剧情摘要。
// 对应 10 步生成流程的步骤 10（章节边界检查时触发）。
//
// Prompt 文本从 PromptBuilder.SUMMARY_PROMPT 复用，保证唯一来源。
//
// 异常处理：
//   - AI 调用失败 → 返回空字符串（不阻断章节完成流程）
//   - 生成内容超长 → 截断为 300 字

import PromptBuilder from './PromptBuilder.js';
import ErrorHandler from '../utils/ErrorHandler.js';

class SummaryGenerator {
  /**
   * 生成章节摘要
   * @param {string} chapterFullContent - 章节完整内容（所有段落拼接）
   * @param {Object} aiContext - AI 调用上下文 { adapter, apiKey, baseUrl }
   * @returns {Promise<string>} 200-300 字的摘要文本
   */
  async generate(chapterFullContent, aiContext = null) {
    if (!chapterFullContent || chapterFullContent.trim().length === 0) {
      return '';
    }

    if (!aiContext) {
      // 无 AI 上下文时返回空字符串（不阻断流程）
      return '';
    }

    const systemPrompt = PromptBuilder.SUMMARY_PROMPT.split('{chapter_full_content}').join(chapterFullContent);
    // SUMMARY_PROMPT 已包含完整指令和章节内容，userPrompt 只需简短指令
    const userPrompt = '请直接输出摘要正文。';

    const result = await ErrorHandler.callWithRetry(async () => {
      return aiContext.adapter.chat({
        apiKey: aiContext.apiKey,
        baseUrl: aiContext.baseUrl,
        systemPrompt,
        userPrompt,
        temperature: 0.3,
        maxTokens: 600,
      });
    }, '摘要生成');

    if (!result.success) {
      console.warn('摘要生成失败，返回空字符串:', result.error);
      return '';
    }

    // 清理输出：去除可能的标题、字数统计等额外内容
    let summary = result.content.trim();

    // 截断为最多 300 字（超长保护）
    if (summary.length > 300) {
      summary = summary.slice(0, 297) + '...';
    }

    return summary;
  }
}

export default SummaryGenerator;
