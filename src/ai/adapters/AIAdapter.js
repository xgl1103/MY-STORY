// src/ai/adapters/AIAdapter.js
//
// AI 适配器统一接口定义 + 共享基类 BaseAdapter。
//
// 接口定义与功能规划文档 9.3 节、角色分工总览、AI 开发指南 5.1 节完全一致。
// 所有厂商适配器必须实现 AIAdapter 接口；共享逻辑继承自 BaseAdapter。
//
// ===== 接口定义（TypeScript 风格描述）=====
//
// interface AIAdapter {
//   providerId: string;
//   providerName: string;
//   testConnection(apiKey: string, baseUrl?: string): Promise<{
//     success: boolean;
//     error?: string;
//   }>;
//   chat(params: {
//     apiKey: string;
//     baseUrl?: string;
//     systemPrompt: string;
//     userPrompt: string;
//     temperature?: number;
//     maxTokens?: number;
//   }): Promise<{
//     success: boolean;
//     content?: string;
//     error?: string;
//     tokensUsed?: number;
//   }>;
// }

/**
 * 适配器共享基类。
 * 四个适配器共享相同的错误处理模式（AI 开发指南 5.7 节），
 * 仅 model / defaultBaseUrl / temperature 处理 / testConnection 文案 不同，
 * 因此提取公共逻辑到基类，子类只覆盖差异点。
 */
class BaseAdapter {
  constructor() {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter 不能直接实例化，请使用具体子类');
    }
    this.providerId = '';
    this.providerName = '';
    this.defaultBaseUrl = '';
    this.model = '';
    this.timeout = 60000; // 60 秒超时（功能规划 11.1 / 性能 12 节）
  }

  /**
   * 子类可覆盖：对 temperature 做厂商特定调整。
   * @param {number} temperature
   * @returns {number}
   */
  _adjustTemperature(temperature) {
    return temperature;
  }

  /**
   * 子类可覆盖：从错误响应体中提取消息文案。
   * 默认兼容 OpenAI 兼容格式 { error: { message } }。
   * @param {Object} errorBody
   * @returns {string|null}
   */
  _extractErrorMessage(errorBody) {
    return errorBody?.error?.message || errorBody?.message || errorBody?.msg || null;
  }

  /**
   * 子类可覆盖：将 HTTP 状态码 + 错误消息映射为业务错误码（E001-E007）。
   * @param {number} status
   * @param {string} errorMsg
   * @returns {string}
   */
  _mapHttpError(status, errorMsg) {
    if (status === 401) return 'E001';
    if (status === 403) return 'E002';
    if (status === 429) return 'E003';
    if (status === 402) return 'E004';
    // 额度相关错误文案兜底
    if (errorMsg && /quota|insufficient/i.test(errorMsg)) return 'E004';
    return 'E007';
  }

  /**
   * 对话补全（核心方法）。子类共享实现，差异点通过覆盖钩子方法实现。
   */
  async chat({ apiKey, baseUrl, systemPrompt, userPrompt,
               temperature = 0.8, maxTokens = 2000 }) {
    const url = `${baseUrl || this.defaultBaseUrl}/v1/chat/completions`;

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this._adjustTemperature(temperature),
      max_tokens: maxTokens,
      stream: false,
    };

    try {
      const response = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      }, this.timeout);

      if (!response.ok) {
        return this._handleHttpError(response);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return { success: false, error: 'AI 返回内容为空', errorCode: 'E007' };
      }

      return {
        success: true,
        content: content.trim(),
        tokensUsed: data.usage?.total_tokens,
      };
    } catch (error) {
      return this._handleNetworkError(error);
    }
  }

  /**
   * 测试连接（引导页/设置页使用）。发送最小请求验证 Key 有效性。
   * 子类可覆盖 testSystemPrompt / testUserPrompt 以适配不同模型的语言偏好。
   */
  async testConnection(apiKey, baseUrl) {
    const result = await this.chat({
      apiKey,
      baseUrl,
      systemPrompt: this._testSystemPrompt(),
      userPrompt: this._testUserPrompt(),
      temperature: 0,
      maxTokens: 20,
    });
    return {
      success: result.success,
      error: result.success ? undefined : result.error,
    };
  }

  /** 子类可覆盖：测试连接用的 system prompt */
  _testSystemPrompt() {
    return '你是测试助手。';
  }

  /** 子类可覆盖：测试连接用的 user prompt */
  _testUserPrompt() {
    return '请回复"连接成功"。';
  }

  // ===== 共享内部方法 =====

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
      const apiMsg = this._extractErrorMessage(errorBody);
      if (apiMsg) errorMsg = apiMsg;
    } catch (_) { /* 忽略 JSON 解析失败 */ }

    const errorCode = this._mapHttpError(response.status, errorMsg);
    return { success: false, error: errorMsg, errorCode };
  }

  _handleNetworkError(error) {
    if (error.name === 'AbortError') {
      return { success: false, error: '请求超时', errorCode: 'E005' };
    }
    return { success: false, error: `网络错误: ${error.message}`, errorCode: 'E006' };
  }
}

export { BaseAdapter };
