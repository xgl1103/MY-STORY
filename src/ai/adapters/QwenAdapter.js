// src/ai/adapters/QwenAdapter.js
//
// 通义千问（阿里云）适配器（OpenAI 兼容模式）。
// 端点：https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
// 模型：qwen-turbo（速度快、成本低，适合日常生成）
// 认证：Authorization: Bearer {api_key}
// 温度范围：0-2（与 OpenAI 兼容）
//
// 注意：通义千问错误格式有两种
//   原生：{ "code": "...", "message": "..." }
//   兼容模式：{ "error": { "message": "..." } }
// 通过覆盖 _extractErrorMessage 兼容两种格式。

import { BaseAdapter } from './AIAdapter.js';

class QwenAdapter extends BaseAdapter {
  constructor() {
    super();
    this.providerId = 'qwen';
    this.providerName = '通义千问 (Qwen)';
    this.defaultBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode';
    this.model = 'qwen-turbo';
  }

  _adjustTemperature(temperature) {
    return temperature;
  }

  // 兼容通义千问原生与 OpenAI 兼容模式两种错误格式
  _extractErrorMessage(errorBody) {
    return errorBody?.error?.message
        || errorBody?.message
        || errorBody?.msg
        || null;
  }

  // 通义千问额度错误可能以 400 + quota 文案出现，需额外兜底
  _mapHttpError(status, errorMsg) {
    if (status === 401) return 'E001';
    if (status === 403) return 'E002';
    if (status === 429) return 'E003';
    if (status === 402) return 'E004';
    if (status === 400 && errorMsg && /quota/i.test(errorMsg)) return 'E004';
    return 'E007';
  }

  _testSystemPrompt() {
    return '你是测试助手。';
  }

  _testUserPrompt() {
    return '请回复"连接成功"。';
  }
}

export default QwenAdapter;
