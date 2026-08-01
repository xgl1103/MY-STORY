// src/utils/ErrorHandler.js
//
// 错误处理工具：14 个错误码体系 + 差异化重试逻辑。
// 错误码与功能规划文档 11.1 节、AI 开发指南 9.1 节完全一致。
//
// AI 工程师主责：E001-E007（AI 调用相关）
// 前端工程师主责：E008-E010（数据库）、E011-E014（其他功能），AI 层捕获并传递

class ErrorHandler {
  // 可重试的错误码
  static RETRYABLE_ERRORS = ['E003', 'E005', 'E006', 'E007'];

  // 各错误码的重试配置（AI 开发指南 9.2 节）
  static RETRY_CONFIG = {
    E003: { maxRetries: 2, delayMs: 5000, description: '频率限制，等待后重试' },
    E005: { maxRetries: 0, delayMs: 0,    description: '超时，不自动重试（用户手动重试）' },
    E006: { maxRetries: 1, delayMs: 2000, description: '网络错误，短暂等待后重试' },
    E007: { maxRetries: 1, delayMs: 1000, description: '响应错误，快速重试' },
  };

  // 不可重试的错误码（直接返回给用户）
  static NON_RETRYABLE_ERRORS = ['E001', 'E002', 'E004'];

  // 用户提示文案
  static USER_MESSAGES = {
    E001: 'API Key 无效，请检查设置',
    E002: 'API Key 已过期，请更新',
    E003: '请求过于频繁，请稍后重试',
    E004: 'AI 额度已用完，请充值或更换 Key',
    E005: '生成超时，请检查网络后重试',
    E006: '网络连接失败，请检查网络',
    E007: 'AI 返回异常，请重试',
    E008: '数据初始化失败，请重启 App',
    E009: '数据保存失败，请重试',
    E010: '数据损坏，请从备份恢复或重置',
    E011: '语音识别不支持，请使用文字输入',
    E012: '语音识别失败，请重试或使用文字输入',
  };

  /**
   * 判断错误是否可重试
   * @param {string} errorCode
   * @returns {boolean}
   */
  static isRetryable(errorCode) {
    return this.RETRYABLE_ERRORS.includes(errorCode);
  }

  /**
   * 获取重试配置
   * @param {string} errorCode
   * @returns {{ maxRetries: number, delayMs: number, description: string }}
   */
  static getRetryConfig(errorCode) {
    return this.RETRY_CONFIG[errorCode] || { maxRetries: 0, delayMs: 0, description: '' };
  }

  /**
   * 延迟函数
   * @param {number} ms
   * @returns {Promise<void>}
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带差异化重试的 AI 调用封装。
   * 根据错误码决定是否重试、重试次数和等待时间。
   *
   * @param {Function} apiCall - AI 调用函数，返回 { success, error, errorCode, ... }
   * @param {string} operation - 操作名称（用于日志）
   * @returns {Promise<Object>} 调用结果
   */
  static async callWithRetry(apiCall, operation = 'AI调用') {
    let lastResult = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      let result;
      try {
        result = await apiCall();
      } catch (e) {
        // adapter 抛出异常（而非返回 {success:false}），封装为统一格式
        console.error(`${operation}抛出异常:`, e);
        result = {
          success: false,
          error: e.message || '调用过程中发生未知异常',
          errorCode: 'E007',
        };
      }

      // R7 修复：防御 result 为 null/undefined 的情况
      if (result && result.success) {
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
   * 将错误码映射为用户可读消息
   * @param {string} errorCode
   * @param {string} [errorMsg] - 后备消息
   * @returns {string}
   */
  static getUserMessage(errorCode, errorMsg) {
    return this.USER_MESSAGES[errorCode] || errorMsg || '未知错误';
  }
}

export default ErrorHandler;
