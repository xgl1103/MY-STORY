// src/ai/ReviewLoop.js
//
// 审查循环器：AI 内部自我审查的核心组件（用户不可见）。
// 运行 2 轮审查与修改循环，目标是在输出给用户之前消除世界观设定错误、
// 逻辑矛盾和文风问题。
//
// 审查 Prompt 文本从 PromptBuilder 复用，保证全链路 Prompt 唯一来源。
//
// 流程（AI 开发指南 6.1 节）：
//   初稿 → 审查轮1(最多重试2次) → 审查轮2(最多重试1次) → 最终版本输出
//
// 降级策略：审查响应格式或调用失败时会重试；重试耗尽则明确判定未通过，
// 交由 StoryEngine 标记生成失败，绝不把未审查内容伪装成已通过。
//
// 单次故事生成最多 AI 调用：初稿1 + 审查轮1(3) + 审查轮2(2) + 润色1 = 7 次。

import PromptBuilder from './PromptBuilder.js';
import ErrorHandler from '../utils/ErrorHandler.js';

class ReviewLoop {
  constructor() {
    // 审查 Prompt 从 PromptBuilder 复用，保证文本唯一来源
    this.REVIEW_PROMPT_ROUND_1 = PromptBuilder.REVIEW_PROMPT_ROUND_1;
    this.REVIEW_PROMPT_ROUND_2 = PromptBuilder.REVIEW_PROMPT_ROUND_2;

    // 最大重试次数配置（AI 开发指南 6.4 节）
    this.MAX_RETRIES_ROUND_1 = 2; // 轮 1 最多重试 2 次（共 3 次审查机会）
    this.MAX_RETRIES_ROUND_2 = 1; // 轮 2 最多重试 1 次（共 2 次审查机会）
  }

  /**
   * 运行完整审查循环
   * @param {string} initialDraft - 初稿内容
   * @param {string} systemPrompt - 系统 Prompt（复用故事生成的 system，保持世界观上下文）
   * @param {AIAdapter} adapter - AI 适配器实例
   * @param {string} apiKey - API Key
   * @param {string} baseUrl - API Base URL
   * @param {Object} reviewParams - 审查参数 { temperature, maxTokens }
   * @returns {Promise<{ finalContent: string, passed: boolean, totalRounds: number, issues: string[] }>}
   */
  async run(initialDraft, systemPrompt, adapter, apiKey, baseUrl, reviewParams) {
    let currentContent = initialDraft;
    let totalRounds = 0;
    let allIssues = [];
    let passed = false;

    // ===== 审查轮 1 =====
    const round1Result = await this._reviewRound(
      currentContent,
      this.REVIEW_PROMPT_ROUND_1,
      null, // 轮 1 无上一轮问题
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

    if (!round1Result.passed) {
      return {
        finalContent: currentContent,
        passed: false,
        totalRounds,
        issues: allIssues,
      };
    }

    // ===== 审查轮 2 =====
    const round2Result = await this._reviewRound(
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
      passed,
      totalRounds,
      issues: allIssues,
    };
  }

  /**
   * 执行单个审查轮次（含重试逻辑）
   * @private
   */
  async _reviewRound(
    content, reviewPrompt, previousIssues, systemPrompt,
    adapter, apiKey, baseUrl, reviewParams, maxRetries
  ) {
    let currentContent = content;
    let lastIssues = previousIssues || [];
    let roundsUsed = 0;
    let passed = false;

    // attempt: 0..maxRetries（共 maxRetries+1 次审查机会）
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      roundsUsed++;

      // 构建审查 Prompt（变量替换）
      // 使用 split-join 替换防止 $ 注入
      let prompt = reviewPrompt.split('{generated_content}').join(currentContent);
      if (reviewPrompt === this.REVIEW_PROMPT_ROUND_2 && previousIssues) {
        prompt = prompt.split('{previous_issues}').join(previousIssues.join('\n'));
      }

      // 调用 AI 审查（复用故事生成的 systemPrompt 保持世界观上下文）
      // 用 callWithRetry 包裹，网络错误时自动重试
      const reviewResult = await ErrorHandler.callWithRetry(async () => {
        return adapter.chat({
          apiKey,
          baseUrl,
          systemPrompt,
          userPrompt: prompt,
          temperature: reviewParams.temperature || 0.3,
          maxTokens: reviewParams.maxTokens || 3000,
        });
      }, `审查轮次${roundsUsed}`);

      if (!reviewResult.success) {
        lastIssues = [`审查调用失败：${reviewResult.error || '未知错误'}`];
        console.warn(`审查轮次 AI 调用失败，${attempt < maxRetries ? '重试审查' : '判定未通过'}:`, reviewResult.error);
        if (attempt < maxRetries) continue;
        break;
      }

      // 解析审查结果 JSON（三级容错）
      let review;
      try {
        review = this._parseReviewJson(reviewResult.content);
      } catch (e) {
        lastIssues = ['审查响应不是有效 JSON，无法确认内容质量'];
        console.warn(`审查结果 JSON 解析失败，${attempt < maxRetries ? '重试审查' : '判定未通过'}`);
        if (attempt < maxRetries) continue;
        break;
      }

      lastIssues = review.issues || [];

      if (review.passed) {
        passed = true;
        break;
      }

      // 审查不通过：使用修改稿（如有）
      if (review.revised_content && review.revised_content.trim().length > 0) {
        currentContent = review.revised_content.trim();
      }

      // 最后一次重试仍不通过：输出当前版本
      if (attempt === maxRetries) {
        passed = false;
        break;
      }
    }

    return {
      content: currentContent,
      passed,
      roundsUsed,
      issues: lastIssues,
      lastIssues,
    };
  }

  /**
   * 解析审查结果 JSON（三级容错，AI 开发指南 6.2 节）
   * 1. 直接解析
   * 2. 提取 ```json ... ``` 代码块
   * 3. 提取第一个 { ... } 花括号块
   * @param {string} content - AI 返回的原始内容
   * @returns {Object} 解析后的审查结果对象
   * @throws {Error} 所有解析方式均失败时抛出
   */
  _parseReviewJson(content) {
    if (!content || typeof content !== 'string') {
      throw new Error('审查结果为空');
    }

    // 1. 直接解析
    try {
      return JSON.parse(content);
    } catch (_) { /* 继续 */ }

    // 2. 提取 ```json ... ``` 代码块
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (_) { /* 继续 */ }
    }

    // 3. 提取第一个 { ... } 花括号块
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

export default ReviewLoop;
