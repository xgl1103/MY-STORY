// src/ai/adapters/OpenAIAdapter.js
//
// OpenAI 适配器（原生格式）。
// 端点：https://api.openai.com/v1/chat/completions
// 模型：gpt-4o-mini（默认，可在高级设置中修改）
// 认证：Authorization: Bearer {api_key}
// 温度范围：0-2

import { BaseAdapter } from './AIAdapter.js';

class OpenAIAdapter extends BaseAdapter {
  constructor() {
    super();
    this.providerId = 'openai';
    this.providerName = 'OpenAI';
    this.defaultBaseUrl = 'https://api.openai.com';
    this.model = 'gpt-4o-mini';
  }

  _adjustTemperature(temperature) {
    return temperature;
  }

  _testSystemPrompt() {
    return 'You are a test assistant.';
  }

  _testUserPrompt() {
    return 'Say "OK" only.';
  }
}

export default OpenAIAdapter;
