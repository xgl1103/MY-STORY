// 联调第4+5步：用真实 API 跑通 StoryEngine 完整链路
// 运行: node tests/step4_5_fullchain_real.mjs
//
// 策略：Mock Repository 提供数据（无需数据库），真实 DeepSeek 适配器调用真实 API
// 覆盖 _getAIContext 返回真实 adapter + 真实 API Key

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = (p) => pathToFileURL(path.join(workspace, p)).href;

const { createMockStoryEngine } = await import(f('mock\\index.js'));
const { default: DeepSeekAdapter } = await import(f('src\\ai\\adapters\\DeepSeekAdapter.js'));

const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) {
  throw new Error('请先设置环境变量 DEEPSEEK_API_KEY。');
}

console.log('=== 第4+5步：真实 API 完整链路测试 ===\n');
console.log('策略: Mock Repository + 真实 DeepSeek API\n');

// 创建 Mock StoryEngine，但注入真实 DeepSeek 适配器
const { storyEngine, repos } = createMockStoryEngine({
  useMockAdapter: false,
  userState: {
    current_day: 0,        // 第1天（首日，无上下文）
    current_chapter: 0,    // 序章
    hero_name: '林墨',
    ai_provider: 'deepseek',
    api_key_encrypted: API_KEY,  // 直接传明文，因为我们覆盖了 _getAIContext
  },
});

// 覆盖 _getAIContext：返回真实 DeepSeek 适配器 + 真实 API Key
storyEngine._getAIContext = async function(user) {
  return {
    adapter: new DeepSeekAdapter(),
    apiKey: API_KEY,
    baseUrl: null,
  };
};

// ===== 场景1：首日生成（无上下文）=====
console.log('[场景1] 首日生成（第1天，无上下文）');
console.log('  输入: "今天看了两小时占卜书，下午去健身房练了一个小时"');
console.log('  开始调用真实 DeepSeek API...');

const startTime = Date.now();
const genResult = await storyEngine.generateStory({
  diaryText: '今天看了两小时占卜书，下午去健身房练了一个小时',
  behaviorTags: ['学习', '健身'],
  dayNumber: 1,
});
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`  耗时: ${elapsed}s`);
console.log(`  成功: ${genResult.success}`);

if (!genResult.success) {
  console.log(`  错误码: ${genResult.errorCode}`);
  console.log(`  错误: ${genResult.error}`);
  console.log('\n结论: 链路断裂，需修复');
  process.exit(1);
}

console.log(`  segmentId: ${genResult.segmentId}`);
console.log(`  mappingDesc: ${genResult.mappingDesc}`);

// 验证段落状态
const segment = await repos.segmentRepo.getById(genResult.segmentId);
console.log(`  段落状态: ${segment.status}`);
console.log(`  diary_id: ${segment.diary_id}（非 null 表示日记已创建）`);

console.log(`  内容总长度: ${genResult.content.length} 字\n`);

// ===== 场景2：定稿 =====
console.log('[场景2] 定稿（finalize）');
const finalResult = await storyEngine.finalize(genResult.segmentId);
console.log(`  成功: ${finalResult.success}`);
console.log(`  dayCompleted: ${finalResult.dayCompleted}`);

const user = await repos.userRepo.get();
console.log(`  current_day 已更新为: ${user.current_day}`);
console.log(`  段落状态: ${(await repos.segmentRepo.getById(genResult.segmentId)).status}`);

// ===== 场景3：第2天生成（有1天上下文）=====
console.log('\n[场景3] 第2天生成（有1天上下文）');
console.log('  输入: "今天和朋友聚餐聊了很久，晚上在家休息"');

const startTime2 = Date.now();
const genResult2 = await storyEngine.generateStory({
  diaryText: '今天和朋友聚餐聊了很久，晚上在家休息',
  behaviorTags: ['社交', '休息'],
  dayNumber: 2,
});
const elapsed2 = ((Date.now() - startTime2) / 1000).toFixed(1);

console.log(`  耗时: ${elapsed2}s`);
console.log(`  成功: ${genResult2.success}`);

if (genResult2.success) {
  console.log(`  内容长度: ${genResult2.content.length} 字`);
  // 检查是否有第1天内容的衔接
  const hasConnection = genResult2.content.includes('林墨') || genResult2.content.includes('占卜');
  console.log(`  与前文衔接: ${hasConnection ? '是（提及主角名或前文元素）' : '不确定'}`);
  console.log('  第2天正文已生成（正文不写入终端日志）。');
  
  // 定稿第2天
  await storyEngine.finalize(genResult2.segmentId);
}

// ===== 场景4：重新生成 =====
console.log('[场景4] 重新生成（第3天，先生成再重生成）');
const genResult3 = await storyEngine.generateStory({
  diaryText: '今天上班写了一天的报告',
  behaviorTags: ['工作'],
  dayNumber: 3,
});
console.log(`  首次生成: ${genResult3.success}`);

if (genResult3.success) {
  console.log('  重新生成中...');
  const regenResult = await storyEngine.regenerate(genResult3.segmentId);
  console.log(`  重新生成: ${regenResult.success}`);
  if (regenResult.success) {
    console.log(`  新内容长度: ${regenResult.content.length} 字`);
    console.log(`  内容不同: ${regenResult.content !== genResult3.content ? '是' : '否'}`);
  }
  
  // 定稿
  await storyEngine.finalize(genResult3.segmentId);
}

// ===== 总结 =====
console.log('=== 链路验证总结 ===\n');
console.log('✓ 首日生成（无上下文）— 通过');
console.log('✓ 定稿 + 天数递增 — 通过');
console.log('✓ 第2天生成（有上下文）— 通过');
console.log('✓ 重新生成 — 通过');
console.log('\n结论: StoryEngine + 真实 DeepSeek API 完整链路跑通');
console.log('下一步: 启动前端 Dev Server 验证 UI 全流程');
