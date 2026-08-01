// src/utils/TokenCounter.js
//
// 简易 Token 计数器：用于 Prompt 组装阶段的预算估算。
// 中文约 1 字 ≈ 1.5 token，英文约 1 词 ≈ 1.3 token，标点/空白按 0.4 token 估算。
// 此为估算值，实际以模型 API 返回的 tokensUsed 为准。

class TokenCounter {
  /**
   * 估算文本的 Token 数
   * @param {string} text - 待估算文本
   * @returns {number} 估算 token 数（向上取整，空文本返回 0）
   */
  static estimate(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + otherChars * 0.4);
  }

  /**
   * 估算多段文本的总 Token 数
   * @param {string[]} texts - 文本数组
   * @returns {number}
   */
  static estimateMany(texts) {
    if (!Array.isArray(texts)) return 0;
    return texts.reduce((sum, t) => sum + TokenCounter.estimate(t), 0);
  }

  /**
   * 估算由对象数组拼接而成的总 Token 数
   * @param {Array<Object>} items - 对象数组
   * @param {Function} extractor - 从对象中提取文本的函数
   * @returns {number}
   */
  static estimateObjects(items, extractor) {
    if (!Array.isArray(items)) return 0;
    return items.reduce(
      (sum, item) => sum + TokenCounter.estimate(extractor(item) || ''),
      0
    );
  }
}

export default TokenCounter;
