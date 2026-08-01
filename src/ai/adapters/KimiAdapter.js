// src/ai/adapters/KimiAdapter.js
//
// Kimi（Moonshot AI）适配器（OpenAI 兼容格式）。
// 端点：https://api.moonshot.cn/v1/chat/completions
// 模型：moonshot-v1-8k（8k 上下文窗口，适合本项目 token 预算）
// 认证：Authorization: Bearer {api_key}
// 温度范围：0-1（>1 时需截断为 1.0，否则 API 报错）

import { BaseAdapter } from './AIAdapter.js';

class KimiAdapter extends BaseAdapter {
  constructor() {
    super();
    this.providerId = 'kimi';
    this.providerName = 'Kimi (Moonshot)';
    this.defaultBaseUrl = 'https://api.moonshot.cn';
    this.model = 'moonshot-v1-8k';
  }

  // Moonshot temperature 范围为 0-1，超出需截断
  _adjustTemperature(temperature) {
    return Math.min(temperature, 1.0);
  }

  _testSystemPrompt() {
    return '你是测试助手。';
  }

  _testUserPrompt() {
    return '请回复"连接成功"。';
  }
}

export default KimiAdapter;
