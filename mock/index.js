// mock/index.js
//
// Mock 环境初始化（阶段 1 + 阶段 2）。
// 阶段 1：createMockEnvironment() — 单独测试各组件
// 阶段 2：createMockStoryEngine() — 完整 StoryEngine 装配，用于全流程集成测试

import MockUserRepository from './MockUserRepository.js';
import MockDiaryRepository from './MockDiaryRepository.js';
import MockChapterRepository from './MockChapterRepository.js';
import MockSegmentRepository from './MockSegmentRepository.js';
import MockWorldRepository from './MockWorldRepository.js';

import PromptBuilder from '../src/ai/PromptBuilder.js';
import ReviewLoop from '../src/ai/ReviewLoop.js';
import SummaryGenerator from '../src/ai/SummaryGenerator.js';
import ImmediateContext from '../src/memory/ImmediateContext.js';
import SummaryMemory from '../src/memory/SummaryMemory.js';
import RAGRetriever from '../src/memory/RAGRetriever.js';
import { getAdapterClass } from '../src/ai/adapters/index.js';

import StoryEngine from '../src/core/StoryEngine.js';

/**
 * 创建阶段 1 Mock 测试环境
 * @returns {Object} 含所有 Mock Repository 和 AI 编排组件
 */
function createMockEnvironment() {
  const userRepo = new MockUserRepository();
  const diaryRepo = new MockDiaryRepository();
  const chapterRepo = new MockChapterRepository();
  const segmentRepo = new MockSegmentRepository();
  const worldRepo = new MockWorldRepository();

  const promptBuilder = new PromptBuilder();
  const reviewLoop = new ReviewLoop();

  const immediateContext = new ImmediateContext(segmentRepo);
  const summaryMemory = new SummaryMemory(chapterRepo);
  const ragRetriever = new RAGRetriever(worldRepo);

  return {
    userRepo, diaryRepo, chapterRepo, segmentRepo, worldRepo,
    promptBuilder, reviewLoop, adapterFactory: getAdapterClass,
    immediateContext, summaryMemory, ragRetriever,
  };
}

/**
 * 创建阶段 2 Mock StoryEngine（完整集成测试）
 *
 * @param {Object} options - 配置选项
 * @param {boolean} options.useMockAdapter - 为 true 时使用 Mock AI 适配器（不发真实请求）
 * @param {Object} options.mockAdapter - 自定义 Mock 适配器实例
 * @param {Object} options.userState - 覆盖用户初始状态
 * @returns {Object} { storyEngine, repos } — StoryEngine 实例和底层 Repository
 */
function createMockStoryEngine(options = {}) {
  const {
    useMockAdapter = true,
    mockAdapter = null,
    userState = {},
    persistedState = null,
  } = options;

  // 创建 Mock Repository
  const userRepo = new MockUserRepository();
  const diaryRepo = new MockDiaryRepository();
  const chapterRepo = new MockChapterRepository();
  const segmentRepo = new MockSegmentRepository();
  const worldRepo = new MockWorldRepository();

  // 模拟应用刷新后的重新初始化：只从可序列化快照恢复持久化数据，
  // 绝不复用旧 Repository 实例。
  if (persistedState) {
    userRepo.data = JSON.parse(JSON.stringify(persistedState.user));
    diaryRepo.data = JSON.parse(JSON.stringify(persistedState.diaries));
    diaryRepo.idCounter = persistedState.diaryIdCounter;
    chapterRepo.data = JSON.parse(JSON.stringify(persistedState.chapters));
    chapterRepo.idCounter = persistedState.chapterIdCounter;
    chapterRepo.setCurrentChapterNumber(persistedState.currentChapterNumber);
    segmentRepo.data = JSON.parse(JSON.stringify(persistedState.segments));
    segmentRepo.idCounter = persistedState.segmentIdCounter;
  }

  // 覆盖用户初始状态
  if (Object.keys(userState).length > 0) {
    userRepo.setState(userState);
  }

  // 同步 current_chapter 到 MockChapterRepository（模拟真实 JOIN 行为）
  const finalUserState = userRepo.data;
  if (finalUserState.current_chapter !== undefined) {
    chapterRepo.setCurrentChapterNumber(finalUserState.current_chapter);
  }

  // 如果使用 Mock 适配器，覆盖用户设置中的 AI 配置
  if (useMockAdapter) {
    userRepo.setState({
      api_key_encrypted: 'mock-key',
      ai_provider: 'deepseek',
    });
  }

  // 创建 StoryEngine（自动装配所有子组件）
  const storyEngine = new StoryEngine({
    userRepo, diaryRepo, chapterRepo, segmentRepo, worldRepo,
  });

  // 全链路测试使用内存 Repository；动态 RAG 不应绕过它去访问 SQLite 全局连接。
  storyEngine.storyRagRetriever.retrieve = async () => [];

  // 如果提供了 Mock 适配器，注入到 StoryEngine 的 _getAIContext 中
  // 跳过 Crypto.decrypt 解密（Mock 测试不使用真实 API Key）
  if (mockAdapter) {
    storyEngine._getAIContext = async function(user) {
      return {
        adapter: mockAdapter,
        apiKey: 'mock-key',
        baseUrl: null,
      };
    };
  }

  return {
    storyEngine,
    repos: { userRepo, diaryRepo, chapterRepo, segmentRepo, worldRepo },
    snapshot() {
      return JSON.parse(JSON.stringify({
        user: userRepo.data,
        diaries: diaryRepo.data,
        diaryIdCounter: diaryRepo.idCounter,
        chapters: chapterRepo.data,
        chapterIdCounter: chapterRepo.idCounter,
        currentChapterNumber: chapterRepo._currentChapterNumber,
        segments: segmentRepo.data,
        segmentIdCounter: segmentRepo.idCounter,
      }));
    },
  };
}

export { createMockEnvironment, createMockStoryEngine };
