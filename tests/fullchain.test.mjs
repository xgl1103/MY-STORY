// tests/fullchain.test.mjs
//
// 全链路测试：覆盖 StoryEngine 的 6 个核心场景 + N-1 修复验证。
// 运行方式：node tests/fullchain.test.mjs
//
// 测试场景：
//   1. 完整生成流程（generateStory → finalize）
//   2. 重新生成流程（generateStory → regenerate → finalize）
//   3. 编辑保存流程（generateStory → saveEdit）
//   4. 章节边界检测（跨章节生成）
//   5. AI 调用失败降级（adapter 失败时状态流转）
//   6. 并发控制（并发锁防护）
//   7. N-1 验证：_getAIContext 为 async 且解密 API Key

import assert from 'assert';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import path from 'path';

// 动态导入项目模块（Windows 路径需转为 file:// URL）
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = (p) => pathToFileURL(path.join(workspace, p)).href;

const { createMockStoryEngine } = await import(f('mock\\index.js'));

// ===== 测试框架 =====
let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.error(`  \u2717 ${name}`);
    console.error(`    ${e.message}`);
  }
}

// ===== Mock AI 适配器 =====
function createMockAIAdapter() {
  let callCount = 0;
  // 与生产质量闸门一致：测试正文不少于 800 字并覆盖解析关键词。
  const acceptedStory = `占卜学习${'雾气中，林墨学习占卜，并逐项记录每一道异常的灵性痕迹。'.repeat(33)}。`;
  return {
    providerId: 'mock',
    providerName: 'Mock',
    async chat({ systemPrompt, userPrompt }) {
      callCount++;
      const content = (userPrompt || '') + (systemPrompt || '');
      if (content.includes('请从用户的日记中提取')) {
        return { success: true, content: '{"events":["看书","健身"],"detectedBehaviors":["学习","健身"],"keywords":["占卜","学习"]}', tokensUsed: 100 };
      }
      if (content.includes('请为以下章节内容生成')) {
        return { success: true, content: '本章讲述了主角林墨在塔罗会的第一次聚会上结识了其他非凡者，获得了关于城市异常波动的情报。主角尝试了第一次正式占卜，获得了关于自身命运的模糊预兆。', tokensUsed: 200 };
      }
      if (content.includes('润色')) {
        return { success: true, content: acceptedStory, tokensUsed: 300 };
      }
      if (content.includes('审查')) {
        return { success: true, content: '{"passed":true,"issues":[],"severity":"low","suggestions":"","revised_content":""}', tokensUsed: 150 };
      }
      return { success: true, content: acceptedStory, tokensUsed: 500 };
    },
    async testConnection() { return { success: true }; },
    getCallCount() { return callCount; },
  };
}

function createFailAdapter() {
  return { async chat() { return { success: false, error: 'API错误', errorCode: 'E001' }; } };
}

// ===== 开始测试 =====
console.log('=== 全链路测试 ===\n');

// ===== 场景 1：完整生成流程 =====
console.log('[场景1] 完整生成流程（generateStory → finalize）');

await test('1.1 generateStory 返回 success + segmentId + content', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const result = await storyEngine.generateStory({
    diaryText: '今天看了两小时占卜书',
    behaviorTags: ['学习'],
    dayNumber: 8,
  });
  assert.strictEqual(result.success, true);
  assert(result.segmentId !== undefined, '应返回 segmentId');
  assert(result.content !== undefined, '应返回 content');
  assert(result.mappingDesc !== undefined, '应返回 mappingDesc');
});

await test('1.2 段落状态为 draft_ready', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const result = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  const segment = await repos.segmentRepo.getById(result.segmentId);
  assert.strictEqual(segment.status, 'draft_ready');
});

await test('1.3 日记记录已创建并关联', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const result = await storyEngine.generateStory({
    diaryText: '今天看了占卜书', behaviorTags: ['学习'], dayNumber: 8,
  });
  const segment = await repos.segmentRepo.getById(result.segmentId);
  assert(segment.diary_id !== null, '段落应有 diary_id');
  const diary = await repos.diaryRepo.getById(segment.diary_id);
  assert(diary !== null, '应能通过 diary_id 查到日记');
  assert.strictEqual(diary.raw_text, '今天看了占卜书');
});

await test('1.4 generateStory 不递增 current_day', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const before = await repos.userRepo.get();
  await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  const after = await repos.userRepo.get();
  assert.strictEqual(before.current_day, after.current_day, '天数不应在 generateStory 中递增');
});

await test('1.5 finalize 后状态为 finalized + 天数递增', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  const before = await repos.userRepo.get();
  const finalResult = await storyEngine.finalize(genResult.segmentId);
  assert.strictEqual(finalResult.success, true);
  assert.strictEqual(finalResult.dayCompleted, 8);
  const after = await repos.userRepo.get();
  assert(after.current_day > before.current_day, 'finalize 后天数应递增');
  const segment = await repos.segmentRepo.getById(genResult.segmentId);
  assert.strictEqual(segment.status, 'finalized');
});

await test('1.6 生成→定稿→刷新后仍可读', async () => {
  const firstApp = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const generated = await firstApp.storyEngine.generateStory({
    diaryText: '今天完成了占卜笔记并整理线索', behaviorTags: ['学习'], dayNumber: 8,
  });
  assert.strictEqual(generated.success, true);
  const finalized = await firstApp.storyEngine.finalize(generated.segmentId);
  assert.strictEqual(finalized.success, true);

  // 只保留可序列化的持久化数据，再创建全新的应用与 Repository 实例。
  const refreshedApp = createMockStoryEngine({
    mockAdapter: createMockAIAdapter(),
    persistedState: firstApp.snapshot(),
  });
  const segment = await refreshedApp.repos.segmentRepo.getById(generated.segmentId);
  assert(segment, '刷新后应能读取已定稿段落');
  assert.strictEqual(segment.status, 'finalized');
  assert.strictEqual(segment.content, generated.content);
  const diary = await refreshedApp.repos.diaryRepo.getById(segment.diary_id);
  assert(diary, '刷新后应保留关联日记');
  assert.strictEqual(diary.raw_text, '今天完成了占卜笔记并整理线索');
});

// ===== 场景 2：重新生成流程 =====
console.log('\n[场景2] 重新生成流程（generateStory → regenerate → finalize）');

await test('2.1 regenerate 在 draft_ready 状态下成功', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  const regenResult = await storyEngine.regenerate(genResult.segmentId);
  assert.strictEqual(regenResult.success, true);
  assert(regenResult.content !== undefined);
  assert(regenResult.mappingDesc !== undefined);
});

await test('2.2 regenerate 后状态恢复为 draft_ready', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  await storyEngine.regenerate(genResult.segmentId);
  const segment = await repos.segmentRepo.getById(genResult.segmentId);
  assert.strictEqual(segment.status, 'draft_ready');
});

await test('2.3 regenerate 通过 diary_id 恢复原始日记', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看了占卜书', behaviorTags: ['学习'], dayNumber: 8,
  });
  await storyEngine.regenerate(genResult.segmentId);
  // 验证段落仍有 diary_id 指向原始日记
  const segment = await repos.segmentRepo.getById(genResult.segmentId);
  assert(segment.diary_id !== null);
  const diary = await repos.diaryRepo.getById(segment.diary_id);
  assert.strictEqual(diary.raw_text, '今天看了占卜书');
});

await test('2.4 finalize 状态不允许 regenerate', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  await storyEngine.finalize(genResult.segmentId);
  const regenResult = await storyEngine.regenerate(genResult.segmentId);
  assert.strictEqual(regenResult.success, false);
  assert(regenResult.error.includes('不允许重新生成'));
});

// ===== 场景 3：编辑保存流程 =====
console.log('\n[场景3] 编辑保存流程（generateStory → saveEdit）');

await test('3.1 saveEdit 保存用户编辑内容', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  const result = await storyEngine.saveEdit(genResult.segmentId, '用户手动编辑的内容');
  assert.strictEqual(result.success, true);
  const segment = await repos.segmentRepo.getById(genResult.segmentId);
  assert.strictEqual(segment.content, '用户手动编辑的内容');
  assert.strictEqual(segment.status, 'finalized');
  assert.strictEqual(segment.is_edited, true);
});

await test('3.2 saveEdit 递增天数', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  const before = await repos.userRepo.get();
  await storyEngine.saveEdit(genResult.segmentId, '编辑内容');
  const after = await repos.userRepo.get();
  assert(after.current_day > before.current_day, 'saveEdit 应递增天数');
});

// ===== 场景 4：章节边界检测 =====
console.log('\n[场景4] 章节边界检测（跨章节生成）');

await test('4.1 第5天定稿触发序章完成 + 第一章创建', async () => {
  const { storyEngine, repos } = createMockStoryEngine({
    mockAdapter: createMockAIAdapter(),
    userState: { current_day: 4, current_chapter: 0 },
  });
  const genResult = await storyEngine.generateStory({
    diaryText: '第5天看书', behaviorTags: ['学习'], dayNumber: 5,
  });
  const finalResult = await storyEngine.finalize(genResult.segmentId);
  assert(finalResult.chapterCompleted, '序章应完成');
  const user = await repos.userRepo.get();
  assert.strictEqual(user.current_chapter, 1, 'current_chapter 应为 1');
  const currentChapter = await repos.chapterRepo.getCurrent();
  assert.strictEqual(currentChapter.chapter_number, 1);
});

await test('4.2 跨章节连续生成（第5天→第6天）', async () => {
  const { storyEngine, repos } = createMockStoryEngine({
    mockAdapter: createMockAIAdapter(),
    userState: { current_day: 4, current_chapter: 0 },
  });
  // 第5天：序章最后一天
  const r1 = await storyEngine.generateStory({ diaryText: '第5天', behaviorTags: ['学习'], dayNumber: 5 });
  await storyEngine.finalize(r1.segmentId);
  // 第6天：第一章第一天
  const r2 = await storyEngine.generateStory({ diaryText: '第6天', behaviorTags: ['学习'], dayNumber: 6 });
  assert(r2.success, '第6天应生成成功');
  await storyEngine.finalize(r2.segmentId);
  const user = await repos.userRepo.get();
  assert.strictEqual(user.current_day, 6);
});

// ===== 场景 5：AI 调用失败降级 =====
console.log('\n[场景5] AI 调用失败降级');

await test('5.1 初稿生成失败 → 状态为 generate_failed', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createFailAdapter() });
  const result = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  assert.strictEqual(result.success, false);
  assert(result.errorCode === 'E001');
  const segment = await repos.segmentRepo.getById(result.segmentId);
  assert.strictEqual(segment.status, 'generate_failed');
});

await test('5.2 generate_failed 状态可以 regenerate', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createFailAdapter() });
  const failResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  // 切换为成功适配器重新生成
  storyEngine._getAIContext = async () => ({
    adapter: createMockAIAdapter(), apiKey: 'mock-key', baseUrl: null,
  });
  const regenResult = await storyEngine.regenerate(failResult.segmentId);
  assert.strictEqual(regenResult.success, true);
  const segment = await repos.segmentRepo.getById(failResult.segmentId);
  assert.strictEqual(segment.status, 'draft_ready');
});

await test('5.3 不存在的段落 finalize 返回失败', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const result = await storyEngine.finalize(99999);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.dayCompleted, 0);
});

// ===== 场景 6：并发控制 =====
console.log('\n[场景6] 并发控制');

await test('6.1 并发锁防止重复生成', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  storyEngine._generatingLock = true;
  const result = await storyEngine.generateStory({
    diaryText: '日记', behaviorTags: [], dayNumber: 8,
  });
  assert.strictEqual(result.success, false);
  assert(result.error.includes('进行中'));
  storyEngine._generatingLock = false;
});

await test('6.2 失败后并发锁释放', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createFailAdapter() });
  await storyEngine.generateStory({
    diaryText: '日记', behaviorTags: [], dayNumber: 8,
  });
  assert.strictEqual(storyEngine._generatingLock, false, '失败后锁应释放');
});

await test('6.3 成功后并发锁释放', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  await storyEngine.generateStory({
    diaryText: '日记', behaviorTags: ['学习'], dayNumber: 8,
  });
  assert.strictEqual(storyEngine._generatingLock, false);
});

// ===== 场景 7：N-1 修复验证 =====
console.log('\n[场景7] N-1 验证：_getAIContext 解密 API Key');

await test('7.1 _getAIContext 是 async 函数', () => {
  const source = fs.readFileSync(path.join(workspace, 'src', 'core', 'StoryEngine.js'), 'utf-8');
  assert(source.includes('async _getAIContext'), '应为 async _getAIContext');
});

await test('7.2 _getAIContext 调用 Crypto.decrypt', () => {
  const source = fs.readFileSync(path.join(workspace, 'src', 'core', 'StoryEngine.js'), 'utf-8');
  assert(source.includes('Crypto.decrypt'), '应调用 Crypto.decrypt');
  assert(source.includes("user.api_key_encrypted"), '应传入 api_key_encrypted');
});

await test('7.3 不直接传递 api_key_encrypted 给 apiKey', () => {
  const source = fs.readFileSync(path.join(workspace, 'src', 'core', 'StoryEngine.js'), 'utf-8');
  assert(!source.includes('apiKey: user.api_key_encrypted'), '不应直接传递加密密文');
});

await test('7.4 getAdapterClass 返回 undefined 时抛错', () => {
  const source = fs.readFileSync(path.join(workspace, 'src', 'core', 'StoryEngine.js'), 'utf-8');
  assert(source.includes('if (!AdapterClass)'), '应有 AdapterClass 空值检查');
  assert(source.includes('throw new Error'), '应抛出错误');
});

await test('7.5 所有 _getAIContext 调用点有 await', () => {
  const source = fs.readFileSync(path.join(workspace, 'src', 'core', 'StoryEngine.js'), 'utf-8');
  // 查找所有 _getAIContext 调用（排除定义行）
  const lines = source.split('\n');
  const callLines = lines.filter(l =>
    l.includes('_getAIContext(') &&
    !l.includes('async _getAIContext') &&
    !l.includes('storyEngine._getAIContext =')
  );
  for (const line of callLines) {
    assert(line.includes('await'), `调用行缺少 await: ${line.trim()}`);
  }
});

await test('7.6 Crypto 模块已导入', () => {
  const source = fs.readFileSync(path.join(workspace, 'src', 'core', 'StoryEngine.js'), 'utf-8');
  assert(source.includes("import Crypto"), '应导入 Crypto 模块');
});

// ===== 场景 8：端到端连续生成 =====
console.log('\n[场景8] 端到端连续生成3天');

await test('8.1 连续生成第8-10天 + 定稿', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  for (let day = 8; day <= 10; day++) {
    const result = await storyEngine.generateStory({
      diaryText: `第${day}天看书学习`,
      behaviorTags: ['学习'],
      dayNumber: day,
    });
    assert(result.success, `第${day}天生成失败: ${result.error}`);
    const finalResult = await storyEngine.finalize(result.segmentId);
    assert(finalResult.success, `第${day}天定稿失败`);
  }
  const user = await repos.userRepo.get();
  assert.strictEqual(user.current_day, 10);
});

// ===== 场景 9：第一性原理审查修复验证 =====
console.log('\n[场景9] 第一性原理审查修复');

await test('9.1 WorldRepository.getEncounters SQL 包含 min_path_level', () => {
  const source = fs.readFileSync(path.join(workspace, 'src', 'db', 'repositories', 'WorldRepository.js'), 'utf-8');
  const selectMatch = source.match(/SELECT.*FROM encounter_library/s);
  assert(selectMatch, '应找到 getEncounters 的 SQL');
  assert(selectMatch[0].includes('min_path_level'), 'SELECT 列表应包含 min_path_level');
});

await test('9.2 regenerate 检查 revision_count 上限', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  // 手动设置 revision_count 为 3
  const segment = repos.segmentRepo.data.find(s => s.id === genResult.segmentId);
  segment.revision_count = 3;
  const result = await storyEngine.regenerate(genResult.segmentId);
  assert.strictEqual(result.success, false);
  assert(result.error.includes('上限'), `应提示上限，实际: ${result.error}`);
});

await test('9.3 regenerate 未达上限时正常工作', async () => {
  const { storyEngine, repos } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  const segment = repos.segmentRepo.data.find(s => s.id === genResult.segmentId);
  segment.revision_count = 2;
  const result = await storyEngine.regenerate(genResult.segmentId);
  assert.strictEqual(result.success, true);
});

await test('9.4 finalize 在 _getAIContext 抛异常时仍成功', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  // 注入失败的 _getAIContext
  storyEngine._getAIContext = async () => { throw new Error('Crypto 解密失败'); };
  const result = await storyEngine.finalize(genResult.segmentId);
  assert.strictEqual(result.success, true, '定稿应成功（降级处理）');
});

await test('9.5 saveEdit 在 _getAIContext 抛异常时仍成功', async () => {
  const { storyEngine } = createMockStoryEngine({ mockAdapter: createMockAIAdapter() });
  const genResult = await storyEngine.generateStory({
    diaryText: '今天看书', behaviorTags: ['学习'], dayNumber: 8,
  });
  storyEngine._getAIContext = async () => { throw new Error('Crypto 解密失败'); };
  const result = await storyEngine.saveEdit(genResult.segmentId, '编辑内容');
  assert.strictEqual(result.success, true, '保存编辑应成功（降级处理）');
});

await test('9.6 dayNumber <= current_day 时拒绝生成', async () => {
  const { storyEngine } = createMockStoryEngine({
    mockAdapter: createMockAIAdapter(),
    userState: { current_day: 10 },
  });
  const result = await storyEngine.generateStory({
    diaryText: '日记', behaviorTags: [], dayNumber: 10,
  });
  assert.strictEqual(result.success, false);
  assert(result.error.includes('无效'));
});

await test('9.7 dayNumber = current_day + 1 时正常工作', async () => {
  const { storyEngine } = createMockStoryEngine({
    mockAdapter: createMockAIAdapter(),
    userState: { current_day: 10 },
  });
  const result = await storyEngine.generateStory({
    diaryText: '日记', behaviorTags: ['学习'], dayNumber: 11,
  });
  assert.strictEqual(result.success, true);
});

// ===== 总结 =====
console.log('\n=== 全链路测试总结 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failures.length > 0) {
  console.log('\n失败详情:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
