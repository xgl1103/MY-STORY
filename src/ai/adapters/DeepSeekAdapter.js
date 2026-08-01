// src/ai/adapters/DeepSeekAdapter.js
//
// DeepSeek 适配器（OpenAI 兼容格式，默认推荐）。
// 端点：https://api.deepseek.com/v1/chat/completions
// 模型：deepseek-chat
// 认证：Authorization: Bearer {api_key}
// 温度范围：0-2（无需截断）

import { BaseAdapter } from './AIAdapter.js';

class DeepSeekAdapter extends BaseAdapter {
  constructor() {
    super();
    this.providerId = 'deepseek';
    this.providerName = 'DeepSeek';
    this.defaultBaseUrl = 'https://api.deepseek.com';
    this.model = 'deepseek-chat';
  }

  // temperature 范围 0-2，与 OpenAI 兼容，无需调整
  _adjustTemperature(temperature) {
    return temperature;
  }

  _testSystemPrompt() {
    return 'You are a test assistant.';
  }

  _testUserPrompt() {
    return '请回复"连接成功"四个字。';
  }
}

export default DeepSeekAdapter;
