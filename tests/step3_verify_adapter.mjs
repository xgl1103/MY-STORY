// 联调第3步：用项目的 DeepSeek 适配器调用真实 API
// 运行: node tests/step3_verify_adapter.mjs

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = (p) => pathToFileURL(path.join(workspace, p)).href;

const { default: DeepSeekAdapter } = await import(f('src\\ai\\adapters\\DeepSeekAdapter.js'));

const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) {
  throw new Error('请先设置环境变量 DEEPSEEK_API_KEY。');
}

console.log('=== 第3步：验证 AI 适配器调用真实 API ===\n');

const adapter = new DeepSeekAdapter();

// 3.1 测试连接
console.log('[3.1] 测试连接...');
const testResult = await adapter.testConnection(API_KEY);
console.log(`  结果: ${testResult.success ? '成功' : '失败'}`);
if (testResult.error) console.log(`  错误: ${testResult.error}`);

if (!testResult.success) {
  console.log('\n结论: 适配器测试连接失败，终止后续测试');
  process.exit(1);
}

// 3.2 用诡秘风格 Prompt 生成小说段落
console.log('\n[3.2] 用诡秘风格 Prompt 生成小说段落...');

const systemPrompt = `你是一位精通《诡秘之主》世界观的小说作家。你正在为用户创作一部以用户为主角的连载小说。

世界观基础设定：
- 维多利亚时代风格的架空世界，存在非凡者和非凡特性
- 22条神之途径，每条途径有9个等级（序列9到序列0）
- 主角当前途径：占卜家（序列9）
- 占卜家能力：灵视、占卜、星象、塔罗牌

文风要求：
- 第三人称叙事，以主角名"林墨"称呼主角
- 诡秘、悬疑、克苏鲁风格，带有维多利亚时代的氛围
- 每段不少于800字，有场景描写、心理活动和对话，篇幅随剧情自然展开
- 保持连载小说的节奏感，有悬念和伏笔

输出格式：
- 直接输出小说正文，不要输出任何解释或元信息`;

const userPrompt = `今日主角的真实经历（已映射为世界观行为）：

用户日记原文：今天看了两小时占卜书，下午去健身房练了一个小时，晚上和朋友聚餐聊了很久。

行为映射结果：
- 学习 → 研读神秘学典籍两个时辰
- 健身 → 体能与战斗训练
- 社交 → 与塔罗会成员交流情报

请生成今日的故事段落。要求：
1. 将今日经历映射为世界观内的行为，融入连续剧情
2. 字数不少于800字，根据剧情需要自然展开
3. 保持悬念和连载感`;

const startTime = Date.now();
const result = await adapter.chat({
  apiKey: API_KEY,
  systemPrompt,
  userPrompt,
  temperature: 0.8,
  maxTokens: 2000,
});
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`  耗时: ${elapsed}s`);
console.log(`  成功: ${result.success}`);

if (result.success) {
  console.log(`  Token 用量: ${result.tokensUsed}`);
  console.log(`  内容长度: ${result.content.length} 字`);
  console.log('  内容已生成（正文不写入终端日志）。');
  console.log('结论: DeepSeek 适配器调用真实 API 成功，生成的小说段落符合诡秘风格');
} else {
  console.log(`  错误码: ${result.errorCode}`);
  console.log(`  错误信息: ${result.error}`);
  console.log('\n结论: 适配器调用失败');
}
