// src/ai/adapters/index.js
//
// 适配器工厂：根据 user_settings.ai_provider 返回对应的适配器类。
// 新增 AI 模型只需在此处注册一个映射，无需改动调用方。

import DeepSeekAdapter from './DeepSeekAdapter.js';
import OpenAIAdapter from './OpenAIAdapter.js';
import KimiAdapter from './KimiAdapter.js';
import QwenAdapter from './QwenAdapter.js';

const ADAPTER_MAP = {
  deepseek: DeepSeekAdapter,
  openai: OpenAIAdapter,
  kimi: KimiAdapter,
  qwen: QwenAdapter,
};

/**
 * 获取适配器类
 * @param {string} providerId - 厂商标识（deepseek/openai/kimi/qwen）
 * @returns {Function} 适配器类（构造函数）
 * @throws {Error} 不支持的提供商时抛出
 */
function getAdapterClass(providerId) {
  const AdapterClass = ADAPTER_MAP[providerId];
  if (!AdapterClass) {
    throw new Error(`不支持的 AI 提供商: ${providerId}`);
  }
  return AdapterClass;
}

/**
 * 获取所有支持的厂商标识
 * @returns {string[]}
 */
function getSupportedProviders() {
  return Object.keys(ADAPTER_MAP);
}

export { getAdapterClass, getSupportedProviders, ADAPTER_MAP };
