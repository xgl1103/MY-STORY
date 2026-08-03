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

  // 润色后复核：防止润色阶段为了文采而改写既有事实。
  async verify(content, systemPrompt, adapter, apiKey, baseUrl, reviewParams) {
    const result = await this._reviewRound(
      content,
      this.REVIEW_PROMPT_ROUND_2,
      ['核对润色稿是否改变了既有角色状态、分支选择、伏笔和时间线'],
      systemPrompt,
      adapter,
      apiKey,
      baseUrl,
      reviewParams,
      2 // 首次可给出修订稿，第二次核对修订稿；必要时再做一次最终复核，不能把未复核的修订稿当成通过。
    )
    return { finalContent: result.content, passed: result.passed, totalRounds: result.roundsUsed, issues: result.issues }
  }

  // V2 审查接口：Critical 只提供分级问题和正文证据，不再生成 revised_content。
  // 保留 run/verify 供旧草稿与兼容测试使用；新 StoryEngine 主链路应调用 audit。
  async audit(content, systemPrompt, adapter, apiKey, baseUrl, { continuityContext = '', storyPlanContext = '', hardOnly = false, maxTokens = 1400 } = {}) {
    const prompt = `你是互动连载小说的严格 Critical。只检查事实与场景合同执行，不要改写正文。

【待审查正文】
${content}

【必须遵守的既有事实】
${continuityContext}

【必须逐项验收的场景级剧情合同】
${storyPlanContext}

【分级】
- P0：日记事件遗漏或仅提及、用户选择无具体后果、开场未承接、硬事实矛盾。
- P1：时间/地点跳跃未桥接、结尾合同缺失、场景顺序或因果混乱。
- P2：心理、文风、局部重复等文学建议。
${hardOnly ? '本次只报告 P0；P1/P2 不得作为失败理由。' : ''}

只输出严格 JSON：
{
  "passed": true或false,
  "findings": [{"code":"C101","severity":"P0|P1|P2","contractId":"S1|D1|C-selected|ending","issue":"问题","evidence":"正文中的具体证据","repairInstruction":"可执行修复要求"}]
}
当不存在 P0${hardOnly ? '' : ' 或 P1'} 时 passed 为 true；不要输出 revised_content、Markdown 或任何说明。`
    const result = await ErrorHandler.callWithRetry(async () => adapter.chat({
      apiKey, baseUrl, systemPrompt, userPrompt: prompt, temperature: 0, maxTokens,
    }), '场景合同审查')
    if (!result.success || !result.content) {
      return { passed: false, findings: [{ code: 'C109', severity: 'P0', contractId: 'system', issue: 'Critical 调用失败', evidence: result.error || '无响应', repairInstruction: '稍后重试审查，不能将未审查正文标记为通过。' }], systemError: true }
    }
    try {
      const parsed = this._parseReviewJson(result.content)
      const findings = this._normalizeFindings(parsed)
      const blocking = findings.filter(item => hardOnly ? item.severity === 'P0' : ['P0', 'P1'].includes(item.severity))
      // 兼容旧审查 JSON：passed=false 且没有 issues/finding 时仍保持保守不通过。
      if (parsed.passed === false && !findings.length) {
        return { passed: false, findings: [{ code: 'C109', severity: 'P0', contractId: 'critical', issue: 'Critical 判定不通过但未提供可执行证据', evidence: '', repairInstruction: '重新执行审查。' }], systemError: true }
      }
      // P2 是可记录但不阻断的文学建议；只有当前审查范围内的阻断级问题才失败。
      return { passed: blocking.length === 0, findings, systemError: false }
    } catch (_) {
      return { passed: false, findings: [{ code: 'C109', severity: 'P0', contractId: 'system', issue: 'Critical 返回格式无效', evidence: '', repairInstruction: '重新执行审查，不能放行未验证正文。' }], systemError: true }
    }
  }

  _normalizeFindings(parsed) {
    const raw = Array.isArray(parsed?.findings) ? parsed.findings : (Array.isArray(parsed?.issues) ? parsed.issues.map(issue => ({ issue, severity: parsed?.severity })) : [])
    return raw.map((item, index) => {
      const severity = ['P0', 'P1', 'P2'].includes(item?.severity)
        ? item.severity
        : item?.severity === 'high' ? 'P0' : item?.severity === 'low' ? 'P2' : 'P1'
      return {
        code: String(item?.code || `C${String(101 + index).padStart(3, '0')}`),
        severity,
        contractId: String(item?.contractId || 'unknown'),
        issue: String(item?.issue || item || '审查发现问题'),
        evidence: String(item?.evidence || ''),
        repairInstruction: String(item?.repairInstruction || item?.suggestions || '修复该合同项，并保持其他硬事实不变。'),
      }
    })
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
      if (reviewParams.continuityContext) {
        prompt += `\n\n【必须核对的既有叙事事实】\n${reviewParams.continuityContext}`
      }
      if (reviewParams.storyPlanContext) {
        prompt += `\n\n【必须逐项验收的当天剧情计划】\n${reviewParams.storyPlanContext}\n\n若违反开场承接、日记因果、命运后果或禁止改变，请在 issues 中使用 C001～C007 标记并提供修订稿。`
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

    // 3. 提取每一个完整、括号平衡的对象。不能用贪婪正则：模型偶尔会
    // 在 JSON 前后再附带一个对象或说明，/\{[\s\S]*\}/ 会把它们拼在一起。
    for (let start = 0; start < content.length; start++) {
      if (content[start] !== '{') continue
      let depth = 0
      let inString = false
      let escaped = false
      for (let end = start; end < content.length; end++) {
        const char = content[end]
        if (inString) {
          if (escaped) escaped = false
          else if (char === '\\') escaped = true
          else if (char === '"') inString = false
          continue
        }
        if (char === '"') inString = true
        else if (char === '{') depth++
        else if (char === '}') {
          depth--
          if (depth === 0) {
            try {
              const parsed = JSON.parse(content.slice(start, end + 1))
              if (parsed && typeof parsed === 'object' && typeof parsed.passed === 'boolean') return parsed
            } catch (_) { /* 尝试下一个对象 */ }
            break
          }
        }
      }
    }

    // 某些模型会在 revised_content 中写入未转义的换行，导致整个 JSON 无法解析。
    // 可保守挽救明确结论：true 仅在明确通过时放行；false 则保留为未通过，交由
    // StoryEngine 的定向修复流程处理，不能因格式问题把有风险的剧情放行。
    const passedMatch = content.match(/["']?passed["']?\s*[:：]\s*(true|false)/i)
    if (passedMatch?.[1]?.toLowerCase() === 'true') {
      return { passed: true, issues: [], revised_content: '' }
    }
    if (passedMatch?.[1]?.toLowerCase() === 'false') {
      const issuesMatch = content.match(/["']?issues["']?\s*[:：]\s*\[([\s\S]*?)\]/i)
      const issues = issuesMatch?.[1]
        ? issuesMatch[1].split(/(?:",\s*"|”\s*,\s*“)/).map(item => item.replace(/^["'“\s]+|["'”\s]+$/g, '')).filter(Boolean)
        : ['审查模型明确判定未通过，但返回格式不完整']
      return { passed: false, issues, revised_content: '' }
    }

    // 极少数模型会无视 JSON 约束，只给出明确的中文结论。只接受非常窄的
    // “结论/审查结果 + 通过”格式，任何包含问题、修改建议或否定的自然语言都不放行。
    const compact = content.trim()
    const explicitPass = /^(?:【?(?:结论|审查结果|审核结果)】?\s*[：:]?\s*)?(?:通过|合格|PASS)[。！!]?$/i
    if (explicitPass.test(compact)) return { passed: true, issues: [], revised_content: '' }

    // 所有解析方式均失败
    throw new Error('无法解析审查结果 JSON');
  }
}

export default ReviewLoop;
