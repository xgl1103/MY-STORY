// src/core/StoryEngine.js
//
// 故事引擎：接口 A 的实现，AI 生成流程的核心编排器。
// 对应 AI 开发指南 2.2 节 10 步流程、3.1 节接口定义。
//
// 公开方法（与前端 MockStoryEngine 接口保持一致）：
//   generateStory(params) → Promise<{ success, segmentId, content, mappingDesc }>
//   regenerate(segmentId) → Promise<{ success, segmentId, content, mappingDesc }>
//   finalize(segmentId) → Promise<{ success, dayCompleted, chapterCompleted, chapterSummary?, storyEnded }>
//   saveEdit(segmentId, content) → Promise<{ success, dayCompleted, chapterCompleted, storyEnded }>
//   getStatus(segmentId) → Promise<string>
//
// 8 状态状态机（AI 开发指南 3.8 节）：
//   pending → parsing → generating → draft_ready / generate_failed
//   draft_ready → editing / regenerating → finalized
//
// 关键设计决策：
//   - 天数递增在 finalize 中执行（不是 generateStory）
//   - generateStory 创建日记记录并关联到段落
//   - regenerate 通过 diary_id 恢复原始日记上下文
//   - 段落创建后立即设置 parsing 状态，失败时设为 generate_failed
//   - 并发锁用 try-finally 保证释放

import DiaryParser from './DiaryParser.js';
import MappingEngine from './MappingEngine.js';
import EncounterEngine from './EncounterEngine.js';
import ProgressTracker from './ProgressTracker.js';
import ChapterManager from './ChapterManager.js';

import PromptBuilder from '../ai/PromptBuilder.js';
import ReviewLoop from '../ai/ReviewLoop.js';
import SummaryGenerator from '../ai/SummaryGenerator.js';
import ContentQualityGate from '../ai/ContentQualityGate.js';
import ErrorHandler from '../utils/ErrorHandler.js';

import { getAdapterClass } from '../ai/adapters/index.js';
import ImmediateContext from '../memory/ImmediateContext.js';
import SummaryMemory from '../memory/SummaryMemory.js';
import RAGRetriever from '../memory/RAGRetriever.js';
import { StoryRAGRetriever } from '../memory/StoryRAGRetriever.js';
import { MemoExtractor } from '../ai/MemoExtractor.js';
import StoryPlanner from '../ai/StoryPlanner.js';
import StoryRewriter from '../ai/StoryRewriter.js';
import NarrativeGraph from './NarrativeGraph.js';
import { EntityRepository } from '../db/repositories/EntityRepository.js';
import { ForeshadowingRepository } from '../db/repositories/ForeshadowingRepository.js';
import { DayHandoffRepository } from '../db/repositories/DayHandoffRepository.js';
import { StoryPlanRepository } from '../db/repositories/StoryPlanRepository.js';
import Crypto from '../utils/Crypto.js';

const USE_SERVERLESS_AI = import.meta.env?.VITE_USE_SERVERLESS_AI === 'true';

class StoryEngine {
  /**
   * @param {Object} repos - 5 个 Repository 实例
   *   { userRepo, diaryRepo, chapterRepo, segmentRepo, worldRepo }
   */
  constructor(repos) {
    this.userRepo = repos.userRepo;
    this.diaryRepo = repos.diaryRepo;
    this.chapterRepo = repos.chapterRepo;
    this.segmentRepo = repos.segmentRepo;
    this.worldRepo = repos.worldRepo;
    this.entityRepo = repos.entityRepo || EntityRepository;
    this.foreshadowRepo = repos.foreshadowRepo || ForeshadowingRepository;
    this.handoffRepo = repos.handoffRepo || DayHandoffRepository;
    this.storyPlanRepo = repos.storyPlanRepo || StoryPlanRepository;

    // 子组件
    this.diaryParser = new DiaryParser();
    this.mappingEngine = new MappingEngine();
    this.encounterEngine = new EncounterEngine(this.worldRepo);
    this.summaryGenerator = new SummaryGenerator();
    this.progressTracker = new ProgressTracker(this.userRepo, this.diaryRepo);
    this.chapterManager = new ChapterManager(
      this.chapterRepo, this.segmentRepo, this.summaryGenerator, this.userRepo
    );

    // AI 编排组件
    this.promptBuilder = new PromptBuilder();
    this.reviewLoop = new ReviewLoop();

    // 五层记忆
    this.immediateContext = new ImmediateContext(this.segmentRepo);
    this.summaryMemory = new SummaryMemory(this.chapterRepo);
    this.ragRetriever = new RAGRetriever(this.worldRepo);
    this.storyRagRetriever = new StoryRAGRetriever(this.segmentRepo);
    this.memoExtractor = new MemoExtractor({
      entityRepo: this.entityRepo,
      foreshadowRepo: this.foreshadowRepo,
      handoffRepo: this.handoffRepo,
    });
    this.storyPlanner = new StoryPlanner();
    this.storyRewriter = new StoryRewriter();
    this.narrativeGraph = new NarrativeGraph(this.worldRepo, repos.narrativeRepo);

    // 并发控制
    this._generatingLock = false;
    this._currentSegmentId = null;
  }

  // ===== 方法 1：生成故事 =====

  /**
   * 生成今日故事段落（步骤 1-8）
   * 天数递增不在此方法执行，在 finalize 中执行。
   *
   * @param {Object} params - { diaryText, behaviorTags, dayNumber, diaryId? }
   * @returns {Promise<{ success, segmentId?, content?, mappingDesc?, error?, errorCode? }>}
   */
  async generateStory(params = {}) {
    const { diaryText = '', behaviorTags = [], dayNumber, diaryId: suppliedDiaryId = null } = params;

    // 参数校验
    if (!dayNumber || typeof dayNumber !== 'number' || dayNumber < 1) {
      return {
        success: false,
        error: 'dayNumber 参数无效，必须为正整数',
        errorCode: null,
      };
    }

    // 0. 并发检查
    if (this._generatingLock) {
      return {
        success: false,
        error: '已有生成任务进行中，请等待完成',
        errorCode: null,
      };
    }
    this._generatingLock = true;

    try {
      const user = await this.userRepo.get();

      // 校验 dayNumber 必须大于 current_day（不能生成过去的天数）
      if (dayNumber <= (user.current_day || 0)) {
        return {
          success: false,
          error: `dayNumber ${dayNumber} 无效，必须大于当前已完成天数 ${user.current_day || 0}`,
          errorCode: null,
        };
      }

      // 关键分支日必须先由用户在上一日结尾作出选择，避免绕过剧情图直接生成。
      const pendingChoice = await this.narrativeGraph.getPendingChoiceForNextDay(user)
      if (pendingChoice && pendingChoice.triggerDay === dayNumber) {
        return {
          success: false,
          error: '请先阅读上一天故事结尾，并作出下一步命运选择',
          errorCode: 'E007',
        }
      }

      const chapter = await this.chapterRepo.getCurrent();
      if (!chapter) {
        return {
          success: false,
          error: '未找到当前章节，请检查故事是否已开始',
          errorCode: null,
        };
      }
      const aiContext = await this._getAIContext(user);

      // 1. 使用输入页已保存的日记；仅保留给直接调用引擎的兜底创建路径。
      // 这样 story_segments.diary_id 始终指向用户实际填写的那条日记。
      let diaryId = suppliedDiaryId;
      if (diaryId !== null && diaryId !== undefined) {
        const existingDiary = await this.diaryRepo.getById(diaryId);
        if (!existingDiary || existingDiary.day_number !== dayNumber) {
          return {
            success: false,
            error: '日记不存在或与当前生成天数不一致',
            errorCode: 'E007',
          };
        }
      } else {
        diaryId = await this.diaryRepo.create({
          day_number: dayNumber,
          raw_text: diaryText,
          behavior_tags: behaviorTags,
          is_blank_day: false,
        });
      }

      // 2. 创建段落记录，状态置为 parsing（S-1 状态机）
      const segmentId = await this.segmentRepo.create({
        day_number: dayNumber,
        chapter_id: chapter.id,
        diary_id: diaryId,
        status: 'parsing',
      });
      this._currentSegmentId = segmentId;

      // 3. 步骤1：日记解析
      const parsed = await this.diaryParser.parse(diaryText, behaviorTags, aiContext);
      const coverageKeywords = ContentQualityGate.collectCoverageKeywords(parsed, diaryText);
      const narrativeContext = await this.narrativeGraph.getGenerationContext({
        user, dayNumber, chapterNumber: chapter.chapter_number,
      });

      // 4. 步骤2：映射匹配
      const mappingRules = await this.worldRepo.getMappings(user.world_id);
      const mappingDesc = await this.mappingEngine.map(parsed.detectedBehaviors, mappingRules);
      await this.segmentRepo.updateMapping(segmentId, mappingDesc);

      // 5. 步骤3：上下文组装（五层记忆）
      const encounter = await this.encounterEngine.checkAndTrigger(dayNumber, user);
      const summaries = await this.summaryMemory.getAll();
      const ragResults = await this.ragRetriever.retrieve(
        parsed.keywords, user.world_id, user.path_id
      );
      const immediateSegments = await this.immediateContext.get(dayNumber);

      // 新增：动态 RAG 检索过去故事事件
      // 4.5 修复：JSON.parse 添加 try-catch
      let mappedBehaviorsForRag = null
      try {
        mappedBehaviorsForRag = mappingDesc ? JSON.parse(mappingDesc) : null
      } catch (e) {
        console.warn('[StoryEngine] mappingDesc JSON 解析失败:', e.message)
      }
      const storyRagKeywords = this.storyRagRetriever.extractQueryKeywords(parsed, mappedBehaviorsForRag)
      const excludeDays = immediateSegments.map(s => s.day_number)
      const storyRagResults = await this.storyRagRetriever.retrieve(storyRagKeywords, excludeDays)

      // 新增：实体记忆 + 伏笔池
      let entityMemory = ''
      let foreshadowing = ''
      try {
        entityMemory = this.entityRepo.formatForPrompt()
        foreshadowing = this.foreshadowRepo.formatForPrompt(dayNumber)
      } catch (e) { /* 首次运行表可能未创建 */ }

      const outlineContent = narrativeContext.activeNode?.content || '（根据用户日记与已发生剧情自然推进。）';
      const branchGuidance = narrativeContext.choices.length
        ? narrativeContext.choices.map(item => item.effect || item.description).join('；')
        : '（尚无已选择的分支。）';

      // 5.5：在 Writer 之前将多层记忆收束为一份可审计的当天因果计划。
      const storyPlanRecord = await this._getOrCreateStoryPlan({
        segmentId,
        dayNumber,
        aiContext,
        parsed,
        mappingDesc,
        narrativeContext,
        entityMemory,
        foreshadowing,
        chapterPurpose: this._getChapterPurpose(chapter.chapter_number),
        encounter,
      })

      // 6. 状态置为 generating（S-1 状态机）
      await this.segmentRepo.updateStatus(segmentId, 'generating');

      // 7. 步骤4：Prompt 拼装（含五层记忆）
      const prompt = this.promptBuilder.build({
        heroName: user.hero_name,
        currentDay: dayNumber,
        chapterNumber: chapter.chapter_number,
        chapterTitle: chapter.title,
        chapterPurpose: this._getChapterPurpose(chapter.chapter_number),
        outlineContent,
        branchGuidance,
        isNewChapter: dayNumber === chapter.start_day,
        summaries,
        ragResults,
        storyRagResults,
        entityMemory,
        foreshadowing,
        immediateContext: immediateSegments,
        rawText: diaryText,
        dailyEvents: parsed.events,
        coverageKeywords,
        narrativeContext,
        storyPlan: storyPlanRecord.plan,
        mappingDesc,
        encounterTitle: encounter ? encounter.title : null,
        encounterContent: encounter ? encounter.content : null,
        isRegenerate: false,
      });

      // 8. 步骤5：初稿生成
      const draftResult = await ErrorHandler.callWithRetry(async () => {
        return aiContext.adapter.chat({
          apiKey: aiContext.apiKey,
          baseUrl: aiContext.baseUrl,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          temperature: user.ai_temperature || 0.8,
          maxTokens: user.ai_max_tokens || 2000,
        });
      }, '初稿生成');

      if (!draftResult.success) {
        await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
        return {
          success: false,
          segmentId,
          error: ErrorHandler.getUserMessage(draftResult.errorCode, draftResult.error),
          errorCode: draftResult.errorCode,
        };
      }

      // 解析 AI 输出：分离故事正文和日记引用标注
      const parsed1 = this._parseStoryAndReferences(draftResult.content);

      // 9. 场景合同审查：Critical 只返回分级证据，唯一 Rewriter 负责修复。
      const contractResult = await this._runSceneContractPipeline(parsed1.content, prompt, aiContext)
      await this.segmentRepo.updateReviewCount(segmentId, contractResult.reviewCount)
      if (!contractResult.success) {
        await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
        return {
          success: false,
          segmentId,
          error: contractResult.error,
          errorCode: 'E007',
        };
      }

      // 10. 润色是可回退的低风险步骤；若破坏 P0 硬事实，保留已通过合同的版本。
      let finalContent = await this._polishWithRollback(contractResult.content, prompt, aiContext, user)

      const qualityResult = await this._enforceContentQuality(finalContent, {
        systemPrompt: prompt.systemPrompt,
        aiContext,
        user,
        dailyEvents: parsed.events,
        coverageKeywords,
        continuityContext: prompt.continuityContext,
        storyPlanContext: prompt.storyPlanContext,
        requireSemanticDiaryAudit: ['ai_retry', 'fallback'].includes(storyPlanRecord.source),
      });
      if (!qualityResult.success) {
        await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
        return {
          success: false,
          segmentId,
          error: qualityResult.error,
          errorCode: 'E007',
        };
      }
      finalContent = qualityResult.content;

      const causalResult = await this._enforceDiaryCausalImpact(finalContent, {
        systemPrompt: prompt.systemPrompt,
        aiContext,
        user,
        dailyEvents: parsed.events,
        coverageKeywords,
        continuityContext: prompt.continuityContext,
        storyPlanContext: prompt.storyPlanContext,
        requireSemanticDiaryAudit: ['ai_retry', 'fallback'].includes(storyPlanRecord.source),
      });
      if (!causalResult.success) {
        await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
        return { success: false, segmentId, error: causalResult.error, errorCode: 'E007' };
      }
      finalContent = causalResult.content;

      // 11. 步骤8：正文、引用和状态原子提交；Repository 负责持久化细节。
      await this.segmentRepo.commitDraft(segmentId, {
        content: finalContent,
        references: parsed1.references,
        reviewCount: contractResult.reviewCount,
      })
      await this.storyPlanRepo.markUsed(storyPlanRecord.id)

      // 注意：天数递增不在此方法执行，在 finalize 中执行（S-2 修复）

      return {
        success: true,
        segmentId,
        content: finalContent,
        mappingDesc,
        references: parsed1.references,
      };

    } catch (error) {
      // 未知异常处理：将段落状态设为 generate_failed
      console.error('生成故事失败:', error);
      if (this._currentSegmentId) {
        try {
          await this.segmentRepo.updateStatus(this._currentSegmentId, 'generate_failed');
        } catch (_) { /* 忽略二次错误 */ }
      }
      return {
        success: false,
        error: error.message || '生成过程中发生未知错误',
        errorCode: 'E007',
      };
    } finally {
      // S-6 修复：并发锁在 finally 中释放
      this._generatingLock = false;
      this._currentSegmentId = null;
    }
  }

  // ===== 方法 2：重新生成 =====

  /**
   * 重新生成指定段落
   * 通过 diary_id 恢复原始日记上下文（S-5 修复）
   *
   * @param {number} segmentId
   * @returns {Promise<{ success, segmentId?, content?, mappingDesc?, error?, errorCode? }>}
   */
  async regenerate(segmentId) {
    if (this._generatingLock) {
      return {
        success: false,
        error: '已有生成任务进行中，请等待完成',
        errorCode: null,
      };
    }
    this._generatingLock = true;

    try {
      const segment = await this.segmentRepo.getById(segmentId);
      if (!segment) {
        return { success: false, error: '段落不存在', errorCode: 'E007' };
      }

      // 状态检查：只有 draft_ready 或 generate_failed 才能重新生成
      if (segment.status !== 'draft_ready' && segment.status !== 'generate_failed') {
        return {
          success: false,
          error: `当前状态 ${segment.status} 不允许重新生成`,
          errorCode: 'E007',
        };
      }

      // 重生成次数检查：功能规划 5.3 节，用户最多重生成 3 次
      const maxRevisions = 3;
      if ((segment.revision_count || 0) >= maxRevisions) {
        return {
          success: false,
          error: `已达重生成上限（${maxRevisions}次），可手动编辑`,
          errorCode: null,
        };
      }

      // 状态置为 regenerating（S-1 状态机）
      await this.segmentRepo.updateStatus(segmentId, 'regenerating');
      this._currentSegmentId = segmentId;

      const user = await this.userRepo.get();
      const aiContext = await this._getAIContext(user);
      const chapterNumber = this.chapterManager.getChapterNumberByDay(segment.day_number);
      const chapter = await this.chapterRepo.getByNumber(chapterNumber);

      // S-5 修复：通过 diary_id 精确恢复原始日记上下文
      let diaryText = '';
      let behaviorTags = [];
      if (segment.diary_id) {
        const diary = await this.diaryRepo.getById(segment.diary_id);
        if (diary) {
          diaryText = diary.raw_text || '';
          try {
            behaviorTags = JSON.parse(diary.behavior_tags || '[]');
          } catch (_) { behaviorTags = []; }
        }
      }

      // 重新解析和映射
      const parsed = await this.diaryParser.parse(diaryText, behaviorTags, aiContext);
      const coverageKeywords = ContentQualityGate.collectCoverageKeywords(parsed, diaryText);
      const narrativeContext = await this.narrativeGraph.getGenerationContext({
        user, dayNumber: segment.day_number, chapterNumber: chapter ? chapter.chapter_number : 0,
      });
      const mappingRules = await this.worldRepo.getMappings(user.world_id);
      const mappingDesc = await this.mappingEngine.map(parsed.detectedBehaviors, mappingRules);
      await this.segmentRepo.updateMapping(segmentId, mappingDesc);

      // 上下文组装（排除当前段落）
      const summaries = await this.summaryMemory.getAll();
      const ragResults = await this.ragRetriever.retrieve(
        parsed.keywords, user.world_id, user.path_id
      );
      const allRecent = await this.segmentRepo.getRecent(3);
      const immediateSegments = allRecent.filter(s => s.day_number !== segment.day_number);

      // 4.4 修复：regenerate 也需要三层记忆（动态 RAG + 实体 + 伏笔）
      let storyRagResults = []
      let entityMemory = ''
      let foreshadowing = ''
      try {
        // 4.5 修复：JSON.parse 添加 try-catch
        let mappedBehaviors = null
        try {
          mappedBehaviors = mappingDesc ? JSON.parse(mappingDesc) : null
        } catch (e) {
          console.warn('[StoryEngine] mappingDesc JSON 解析失败:', e.message)
        }
        const storyRagKeywords = this.storyRagRetriever.extractQueryKeywords(parsed, mappedBehaviors)
        const excludeDays = immediateSegments.map(s => s.day_number)
        excludeDays.push(segment.day_number) // 排除当前段落
        storyRagResults = await this.storyRagRetriever.retrieve(storyRagKeywords, excludeDays)
      } catch (e) {
        console.warn('[StoryEngine] 动态 RAG 检索失败:', e.message)
      }
      try {
        entityMemory = this.entityRepo.formatForPrompt()
        foreshadowing = this.foreshadowRepo.formatForPrompt(segment.day_number)
      } catch (e) { /* ignore */ }

      const outlineContent = narrativeContext.activeNode?.content || '（根据用户日记与已发生剧情自然推进。）';
      const storyPlanRecord = await this._getOrCreateStoryPlan({
        segmentId,
        dayNumber: segment.day_number,
        aiContext,
        parsed,
        mappingDesc,
        narrativeContext,
        entityMemory,
        foreshadowing,
        chapterPurpose: this._getChapterPurpose(chapter ? chapter.chapter_number : 0),
        encounter: null,
        reuseExisting: true,
      })

      // Prompt 拼装（isRegenerate=true，含五层记忆）
      const prompt = this.promptBuilder.build({
        heroName: user.hero_name,
        currentDay: segment.day_number,
        chapterNumber: chapter ? chapter.chapter_number : 0,
        chapterTitle: chapter ? chapter.title : '',
        chapterPurpose: this._getChapterPurpose(chapter ? chapter.chapter_number : 0),
        outlineContent,
        branchGuidance: narrativeContext.choices.length
          ? narrativeContext.choices.map(item => item.effect || item.description).join('；')
          : '（尚无已选择的分支。）',
        isNewChapter: false,
        summaries,
        ragResults,
        storyRagResults,
        entityMemory,
        foreshadowing,
        immediateContext: immediateSegments,
        rawText: diaryText,
        dailyEvents: parsed.events,
        coverageKeywords,
        narrativeContext,
        storyPlan: storyPlanRecord.plan,
        mappingDesc,
        encounterTitle: null,
        encounterContent: null,
        isRegenerate: true,
      });

      // 初稿生成（温度略高）
      const draftResult = await ErrorHandler.callWithRetry(async () => {
        return aiContext.adapter.chat({
          apiKey: aiContext.apiKey,
          baseUrl: aiContext.baseUrl,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          temperature: (user.ai_temperature || 0.8) + 0.2,
          maxTokens: user.ai_max_tokens || 2000,
        });
      }, '重新生成');

      if (!draftResult.success) {
        await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
        return {
          success: false,
          segmentId,
          error: ErrorHandler.getUserMessage(draftResult.errorCode, draftResult.error),
          errorCode: draftResult.errorCode,
        };
      }

      // 解析 AI 输出：分离故事正文和日记引用标注
      const parsed2 = this._parseStoryAndReferences(draftResult.content);

      const contractResult = await this._runSceneContractPipeline(parsed2.content, prompt, aiContext)
      if (!contractResult.success) {
        await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
        return {
          success: false,
          segmentId,
          error: contractResult.error,
          errorCode: 'E007',
        };
      }

      let finalContent = await this._polishWithRollback(contractResult.content, prompt, aiContext, user)

      const qualityResult = await this._enforceContentQuality(finalContent, {
        systemPrompt: prompt.systemPrompt,
        aiContext,
        user,
        dailyEvents: parsed.events,
        coverageKeywords,
        continuityContext: prompt.continuityContext,
        storyPlanContext: prompt.storyPlanContext,
        requireSemanticDiaryAudit: ['ai_retry', 'fallback'].includes(storyPlanRecord.source),
      });
      if (!qualityResult.success) {
        await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
        return {
          success: false,
          segmentId,
          error: qualityResult.error,
          errorCode: 'E007',
        };
      }
      finalContent = qualityResult.content;

      const causalResult = await this._enforceDiaryCausalImpact(finalContent, {
        systemPrompt: prompt.systemPrompt,
        aiContext,
        user,
        dailyEvents: parsed.events,
        coverageKeywords,
        continuityContext: prompt.continuityContext,
        storyPlanContext: prompt.storyPlanContext,
        requireSemanticDiaryAudit: ['ai_retry', 'fallback'].includes(storyPlanRecord.source),
      });
      if (!causalResult.success) {
        await this.segmentRepo.updateStatus(segmentId, 'generate_failed');
        return { success: false, segmentId, error: causalResult.error, errorCode: 'E007' };
      }
      finalContent = causalResult.content;

      // 更新段落：映射先更新，正文、引用、审查轮次与状态再原子提交。
      await this.segmentRepo.updateMapping(segmentId, mappingDesc)
      await this.segmentRepo.commitDraft(segmentId, {
        content: finalContent,
        references: parsed2.references,
        reviewCount: contractResult.reviewCount,
        incrementRevision: true,
      })
      await this.storyPlanRepo.markUsed(storyPlanRecord.id)

      return {
        success: true,
        segmentId,
        content: finalContent,
        mappingDesc,
        references: parsed2.references,
      };

    } catch (error) {
      console.error('重新生成失败:', error);
      if (this._currentSegmentId) {
        try {
          await this.segmentRepo.updateStatus(this._currentSegmentId, 'generate_failed');
        } catch (_) { /* 忽略二次错误 */ }
      }
      return {
        success: false,
        error: error.message || '重新生成失败',
        errorCode: 'E007',
      };
    } finally {
      this._generatingLock = false;
      this._currentSegmentId = null;
    }
  }

  // ===== 方法 3：定稿 =====

  /**
   * 确认定稿用户已查看的段落
   * 天数递增在此方法执行（S-2 修复）
   * 章节边界检查在此方法执行
   * 故事完结判定在此方法执行
   *
   * @param {number} segmentId
   * @returns {Promise<{ success, dayCompleted, chapterCompleted, chapterSummary?, storyEnded }>}
   */
  async finalize(segmentId) {
    try {
      const segment = await this.segmentRepo.getById(segmentId);
      if (!segment) {
        return {
          success: false,
          dayCompleted: 0,
          chapterCompleted: false,
          storyEnded: false,
          error: '段落不存在',
          errorCode: 'E007',
        };
      }

      // 状态检查：只有 draft_ready 才能定稿
      if (segment.status !== 'draft_ready') {
        return {
          success: false,
          dayCompleted: 0,
          chapterCompleted: false,
          storyEnded: false,
          error: `当前状态 ${segment.status} 不允许定稿`,
          errorCode: 'E007',
        };
      }

      const dayCompleted = segment.day_number;

      // 定稿后统一刷新实体、伏笔、日终交接单与剧情图。saveEdit 复用同一路径。
      await this._refreshFinalizedMemory(segment, segment.content)

      // S-2 修复：天数递增在此执行
      await this.progressTracker.updateProgress(dayCompleted);

      // 章节边界检测（AI 上下文获取失败时降级：仍完成定稿，仅跳过摘要生成）
      let boundaryResult = { chapterCompleted: false };
      try {
        const aiContext = await this._getAIContext(await this.userRepo.get());
        boundaryResult = await this.chapterManager.checkBoundary(dayCompleted, aiContext);
      } catch (aiError) {
        console.warn('定稿时章节摘要生成跳过（AI 上下文获取失败）:', aiError.message);
        // 仍需检测章节边界（不生成摘要）
        boundaryResult = await this.chapterManager.checkBoundary(dayCompleted, null);
      }

      // 故事完结判定
      const storyEnded = await this.progressTracker.isStoryEnded(dayCompleted);
      if (storyEnded) {
        await this.progressTracker.markStoryEnded();
      }

      // 4.2 修复：markFinalized 移到所有操作成功之后
      // 确保记忆提取、天数递增、章节边界检测全部完成后才标记为 finalized
      await this.segmentRepo.markFinalized(segmentId);

      return {
        success: true,
        dayCompleted,
        chapterCompleted: boundaryResult.chapterCompleted,
        chapterSummary: boundaryResult.chapterSummary,
        storyEnded,
      };
    } catch (error) {
      console.error('定稿失败:', error);
      return {
        success: false,
        dayCompleted: 0,
        chapterCompleted: false,
        storyEnded: false,
        error: `定稿失败: ${error.message}`,
        errorCode: 'E007',
      };
    }
  }

  // ===== 方法 4：保存编辑 =====

  /**
   * 用户手动编辑后保存
   * S-4 修复：调用进度更新+章节边界检查
   *
   * @param {number} segmentId
   * @param {string} content
   * @returns {Promise<{ success, dayCompleted, chapterCompleted, storyEnded }>}
   */
  async saveEdit(segmentId, content) {
    try {
      const segment = await this.segmentRepo.getById(segmentId);
      if (!segment) {
        return {
          success: false,
          dayCompleted: 0,
          chapterCompleted: false,
          storyEnded: false,
          error: '段落不存在',
          errorCode: 'E007',
        };
      }

      // 状态检查：只有 draft_ready 才能编辑
      if (segment.status !== 'draft_ready') {
        return {
          success: false,
          dayCompleted: 0,
          chapterCompleted: false,
          storyEnded: false,
          error: `当前状态 ${segment.status} 不允许编辑`,
          errorCode: 'E007',
        };
      }

      // 状态置为 editing（S-1 状态机）
      await this.segmentRepo.updateStatus(segmentId, 'editing');
      await this.segmentRepo.updateContent(segmentId, content);
      await this.segmentRepo.markEdited(segmentId);
      // R3 修复：markFinalized 移到所有操作之后（同 finalize 修复逻辑）
      const dayCompleted = segment.day_number;

      // 用户编辑后的正文是新的事实来源，必须覆盖旧记忆和交接单。
      await this._refreshFinalizedMemory({ ...segment, content }, content)

      // S-4 修复：调用进度更新+章节边界检查
      await this.progressTracker.updateProgress(dayCompleted);

      // 章节边界检测（AI 上下文获取失败时降级）
      let boundaryResult = { chapterCompleted: false };
      try {
        const aiContext = await this._getAIContext(await this.userRepo.get());
        boundaryResult = await this.chapterManager.checkBoundary(dayCompleted, aiContext);
      } catch (aiError) {
        console.warn('保存编辑时章节摘要生成跳过:', aiError.message);
        boundaryResult = await this.chapterManager.checkBoundary(dayCompleted, null);
      }

      const storyEnded = await this.progressTracker.isStoryEnded(dayCompleted);
      if (storyEnded) {
        await this.progressTracker.markStoryEnded();
      }

      // R3 修复：所有操作成功后才标记为 finalized
      await this.segmentRepo.markFinalized(segmentId);

      return {
        success: true,
        dayCompleted,
        chapterCompleted: boundaryResult.chapterCompleted,
        storyEnded,
      };
    } catch (error) {
      console.error('保存编辑失败:', error);
      return {
        success: false,
        dayCompleted: 0,
        chapterCompleted: false,
        storyEnded: false,
        error: `保存失败: ${error.message}`,
        errorCode: 'E007',
      };
    }
  }

  // ===== 方法 5：获取状态 =====

  /**
   * 获取段落状态
   * @param {number} segmentId
   * @returns {Promise<string>} 8 种状态之一
   */
  async getStatus(segmentId) {
    if (!segmentId) return 'pending';
    const segment = await this.segmentRepo.getById(segmentId);
    return segment ? segment.status : 'pending';
  }

  async getPendingChoiceForNextDay() {
    return this.narrativeGraph.getPendingChoiceForNextDay(await this.userRepo.get())
  }

  async chooseNextDestiny(nodeId, optionId) {
    return this.narrativeGraph.choose(nodeId, optionId, await this.userRepo.get())
  }

  // ===== 私有辅助方法 =====

  async _getOrCreateStoryPlan({ segmentId, dayNumber, aiContext, parsed, mappingDesc, narrativeContext, entityMemory, foreshadowing, chapterPurpose, encounter, reuseExisting = false }) {
    if (reuseExisting) {
      const existing = await this.storyPlanRepo.getLatestForSegment(segmentId)
      if (existing?.plan) return existing
    }
    const previousHandoff = await this.handoffRepo.getLatestBefore(dayNumber)
    const choices = narrativeContext?.choices || []
    const inputFingerprint = this._fingerprint({
      dayNumber,
      previousHandoffHash: previousHandoff?.source_content_hash || '',
      events: parsed?.events || [],
      mappingDesc: mappingDesc || '',
      choices,
      node: narrativeContext?.activeNode?.node_id || '',
      encounter: encounter?.title || '',
    })
    const reusable = await this.storyPlanRepo.getReusable(segmentId, inputFingerprint)
    if (reusable?.plan) return reusable

    const plannerResult = await this.storyPlanner.plan({
      dayNumber,
      previousHandoff,
      dailyEvents: parsed?.events || [],
      mappingDesc,
      narrativeText: narrativeContext?.text || '',
      choices,
      entityMemory,
      foreshadowing,
      chapterPurpose,
      encounter,
    }, aiContext)
    return this.storyPlanRepo.upsert({
      dayNumber,
      segmentId,
      previousHandoffDay: previousHandoff?.day_number ?? null,
      plan: plannerResult.plan,
      schemaVersion: plannerResult.plan?.schemaVersion || 1,
      source: plannerResult.source,
      inputFingerprint,
      validationErrors: plannerResult.validationErrors,
    })
  }

  async _refreshFinalizedMemory(segment, content) {
    const dayCompleted = segment.day_number
    let user = null
    try { user = await this.userRepo.get() } catch (_) { /* keep fallback */ }
    try {
      let aiContext = null
      if (user?.ai_provider && (USE_SERVERLESS_AI || user?.api_key_encrypted)) {
        try { aiContext = await this._getAIContext(user) } catch (_) { /* fallback extraction */ }
      }
      let chapterNumber = 0
      if (segment.chapter_id) {
        try { chapterNumber = (await this.chapterRepo.getById(segment.chapter_id))?.chapter_number || 0 } catch (_) { /* no chapter */ }
      }
      let choiceContext = null
      try {
        const state = await this.narrativeGraph.getGenerationContext({ user, dayNumber: dayCompleted })
        choiceContext = state.choices?.slice(-1)[0] || null
      } catch (_) { /* no choice available */ }
      await this.memoExtractor.extract(content, dayCompleted, chapterNumber, aiContext, {
        segmentId: segment.id,
        choiceContext,
      })
    } catch (error) {
      // 记忆提取有自身 fallback；这里最后兜底，不能丢弃用户已确认的正文。
      console.warn('[StoryEngine] 定稿记忆刷新失败:', error.message)
    }
    try {
      if (user) await this.narrativeGraph.completeNodesForDay(dayCompleted, user)
    } catch (error) {
      console.warn('[StoryEngine] 剧情图状态更新失败:', error.message)
    }
  }

  _fingerprint(value) {
    const source = JSON.stringify(value)
    let hash = 2166136261
    for (let index = 0; index < source.length; index++) {
      hash ^= source.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return `plan-${(hash >>> 0).toString(16)}-${source.length}`
  }

  /**
   * 构建 AI 调用上下文
   * 解密 API Key（api_key_encrypted 是 AES-GCM 加密的 base64 密文）
   * @private
   */
  async _getAIContext(user) {
    const AdapterClass = getAdapterClass(USE_SERVERLESS_AI ? 'deepseek' : user.ai_provider);
    if (!AdapterClass) {
      throw new Error(`不支持的 AI 提供商: ${user.ai_provider}`);
    }
    const adapter = new AdapterClass();
    if (USE_SERVERLESS_AI) {
      return { adapter, apiKey: null, baseUrl: '/api/ai' };
    }
    const apiKey = await Crypto.decrypt(user.api_key_encrypted);
    // 7.3 修复：解密失败防御——apiKey 为 null 时抛异常，触发降级
    if (!apiKey) {
      throw new Error('API Key 解密失败，请重新设置 API Key');
    }
    return {
      adapter,
      apiKey,
      baseUrl: user.ai_base_url,
    };
  }

  /**
   * 在内容写库前执行硬性质量验收，并按失败类型请求模型修复。
   * 不合格内容在最多三次修复后仍未达标时会返回失败，避免污染后续记忆。
   * @private
   */
  async _enforceContentQuality(content, context) {
    let currentContent = String(content || '').trim();
    const maxRepairs = 3;

    for (let attempt = 0; attempt <= maxRepairs; attempt++) {
      const assessment = ContentQualityGate.assess(currentContent, context.coverageKeywords);
      if (assessment.valid) {
        return { success: true, content: currentContent, assessment };
      }

      // 关键词是确定性兜底，但小说会把“线索笔记”自然改写成“记录页”等表达。
      // 当唯一问题只是字面未命中时，交给低温审计确认日记是否真正改变了场景、行动或后果，
      // 避免为了通过规则而把用户日记机械塞进正文。
      if (this._hasOnlyCoverageGap(assessment)) {
        const semanticAudit = await this._verifySemanticDiaryInfluence(currentContent, context);
        if (semanticAudit.passed) {
          assessment.semanticDiaryInfluenceVerified = true;
          assessment.semanticDiaryEvidence = semanticAudit.evidence;
          return { success: true, content: currentContent, assessment };
        }
      }

      if (attempt === maxRepairs) {
        return {
          success: false,
          error: `生成内容未达到质量要求：${assessment.reasons.join('；')}`,
          assessment,
        };
      }

      const repairPrompt = PromptBuilder.buildContentRepairPrompt({
        action: this._getQualityRepairAction(assessment),
        assessment,
        dailyEvents: context.dailyEvents,
        coverageKeywords: context.coverageKeywords,
        content: currentContent,
      });

      const repairResult = await ErrorHandler.callWithRetry(async () => {
        return context.aiContext.adapter.chat({
          apiKey: context.aiContext.apiKey,
          baseUrl: context.aiContext.baseUrl,
          systemPrompt: context.systemPrompt,
          userPrompt: `${repairPrompt}\n\n【不得违反的既有叙事事实】\n${context.continuityContext || ''}`,
          temperature: 0.2,
          // 使用用户的模型输出预算；质量闸门不再因正文过长而拒绝写入。
          maxTokens: context.user.ai_max_tokens || 2000,
        });
      }, `内容质量修复（第${attempt + 1}次）`);

      if (!repairResult.success || !repairResult.content) {
        return {
          success: false,
          error: ErrorHandler.getUserMessage(
            repairResult.errorCode,
            repairResult.error || '内容质量修复失败，请重新生成'
          ),
          assessment,
        };
      }

      // 修复调用若意外附带引用标注，只保留正文，避免把 JSON 写入故事内容。
      currentContent = this._parseStoryAndReferences(repairResult.content).content;
    }

    return { success: false, error: '内容质量修复失败，请重新生成' };
  }

  _hasOnlyCoverageGap(assessment) {
    return assessment?.reasons?.length === 1
      && assessment.reasons[0].startsWith('当天日记关键词覆盖不足');
  }

  async _verifySemanticDiaryInfluence(content, context) {
    const prompt = `你是严格的日记影响审计员。判断下列小说正文是否把当天日记的核心事件实质转化为剧情中的场景、行动、关系变化或后果。允许文学化改写和同义表达；仅仅提到模糊概念不算。

【当天日记事件】
${(context.dailyEvents || []).map((item, index) => `${index + 1}. ${item}`).join('\n') || '无'}

【用户明确标注的实体】
${(context.coverageKeywords || []).join('、') || '无'}

【小说正文】
${content}

只输出 JSON：{"passed":true或false,"issues":["未体现的事件或实体"],"evidence":"正文中的具体证据"}`;
    try {
      const result = await ErrorHandler.callWithRetry(async () => context.aiContext.adapter.chat({
        apiKey: context.aiContext.apiKey,
        baseUrl: context.aiContext.baseUrl,
        systemPrompt: '你只做事实核对。输出必须是严格 JSON，不要添加任何解释。',
        userPrompt: prompt,
        temperature: 0,
        maxTokens: 700,
      }), '日记影响语义审计');
      if (!result.success || !result.content) return { passed: false, evidence: '' };
      const parsed = this.reviewLoop._parseReviewJson(result.content);
      return {
        passed: parsed.passed === true,
        evidence: String(parsed.evidence || parsed.suggestions || ''),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch (_) {
      // 审计不可用时保持保守策略，继续原有的修复流程。
      return { passed: false, evidence: '' };
    }
  }

  /**
   * 对无法由字面覆盖规则证明的回退计划，验证日记是否真正改变了剧情。
   * 只有审计失败时才额外调用 Rewriter；避免把“提到日记关键词”误当作因果影响。
   * @private
   */
  async _enforceDiaryCausalImpact(content, context) {
    if (!context.requireSemanticDiaryAudit || !(context.dailyEvents || []).length) {
      return { success: true, content };
    }

    const firstAudit = await this._verifySemanticDiaryInfluence(content, context);
    if (firstAudit.passed) return { success: true, content, semanticAudit: firstAudit };

    const rewritten = await this.storyRewriter.rewrite({
      content,
      findings: [{
        code: 'C102', severity: 'P0', contractId: 'diary-causality',
        issue: `当天日记没有形成可观察的行动、状态变化或后果：${(firstAudit.issues || []).join('；') || '语义审计未确认因果影响'}`,
        evidence: firstAudit.evidence || '日记影响语义审计未找到可验证证据',
        repairInstruction: '逐项补足当天日记事件的实际行动、可观察状态变化及其后续后果；仅提到关键词不算完成。',
      }],
      systemPrompt: context.systemPrompt,
      aiContext: context.aiContext,
      storyPlanContext: context.storyPlanContext,
      continuityContext: context.continuityContext,
    });
    if (!rewritten.success) {
      return { success: false, content, error: rewritten.error || '日记因果修复失败' };
    }

    const contractVerification = await this.reviewLoop.audit(
      rewritten.content, context.systemPrompt, context.aiContext.adapter,
      context.aiContext.apiKey, context.aiContext.baseUrl,
      { continuityContext: context.continuityContext, storyPlanContext: context.storyPlanContext, hardOnly: true }
    );
    if (!contractVerification.passed) {
      return { success: false, content: rewritten.content, error: this._formatCriticalError(contractVerification.findings) };
    }

    const secondAudit = await this._verifySemanticDiaryInfluence(rewritten.content, context);
    if (!secondAudit.passed) {
      return {
        success: false,
        content: rewritten.content,
        error: `日记因果验收未通过：${(secondAudit.issues || []).join('；') || '未找到行动—状态变化—后果链'}`,
      };
    }
    return { success: true, content: rewritten.content, semanticAudit: secondAudit, rewritten: true };
  }

  // V2：Critical 只给分级证据，Rewriter 是唯一修改正文的角色。
  async _runSceneContractPipeline(content, prompt, aiContext) {
    const first = await this.reviewLoop.audit(
      content, prompt.systemPrompt, aiContext.adapter, aiContext.apiKey, aiContext.baseUrl,
      { continuityContext: prompt.continuityContext, storyPlanContext: prompt.storyPlanContext }
    )
    if (first.systemError) {
      return { success: false, content, reviewCount: 1, error: this._formatCriticalError(first.findings) }
    }
    const actionable = first.findings.filter(item => ['P0', 'P1'].includes(item.severity))
    if (!actionable.length) return { success: true, content, reviewCount: 1, findings: first.findings }

    const rewritten = await this.storyRewriter.rewrite({
      content, findings: actionable, systemPrompt: prompt.systemPrompt, aiContext,
      storyPlanContext: prompt.storyPlanContext, continuityContext: prompt.continuityContext,
    })
    if (!rewritten.success) {
      return { success: false, content, reviewCount: 1, error: `剧情合同修复失败：${rewritten.error || '未返回正文'}` }
    }

    // 修复后只复核 P0。P1 可记录为建议，不能再次开启无穷改稿循环。
    const verified = await this.reviewLoop.audit(
      rewritten.content, prompt.systemPrompt, aiContext.adapter, aiContext.apiKey, aiContext.baseUrl,
      { continuityContext: prompt.continuityContext, storyPlanContext: prompt.storyPlanContext, hardOnly: true }
    )
    if (!verified.passed) {
      return { success: false, content: rewritten.content, reviewCount: 2, error: this._formatCriticalError(verified.findings) }
    }
    return { success: true, content: rewritten.content, reviewCount: 2, findings: [...first.findings, ...verified.findings] }
  }

  _formatCriticalError(findings) {
    const messages = (findings || []).filter(item => item.severity === 'P0').map(item => `[${item.code}] ${item.issue}`)
    return `内容审查未通过：${messages.join('；') || 'Critical 未能确认正文符合剧情合同'}`
  }

  async _polishWithRollback(content, prompt, aiContext, user) {
    const polished = await this._polish(content, prompt.systemPrompt, aiContext, user, prompt.continuityContext, prompt.storyPlanContext)
    if (!polished.success || !polished.content) return content
    const verification = await this.reviewLoop.audit(
      polished.content, prompt.systemPrompt, aiContext.adapter, aiContext.apiKey, aiContext.baseUrl,
      { continuityContext: prompt.continuityContext, storyPlanContext: prompt.storyPlanContext, hardOnly: true, maxTokens: 1000 }
    )
    if (!verification.passed) {
      console.warn('[StoryEngine] 润色破坏 P0 剧情合同，回退到润色前版本:', this._formatCriticalError(verification.findings))
      return content
    }
    return polished.content
  }

  _getQualityRepairAction(assessment) {
    if (assessment.charCount < ContentQualityGate.limits.minChars || !assessment.hasCompleteEnding) {
      return '续写并补足：在不改变已有剧情的前提下补齐必要场景、行动和收束句，形成完整段落。';
    }
    return '覆盖修复：重写或补充正文，使当天日记中的核心事件和缺失关键词在剧情中得到自然体现。';
  }

  /**
   * 润色步骤（步骤 7）
   * @private
   */
  async _polish(content, systemPrompt, aiContext, user, continuityContext = '', storyPlanContext = '') {
    try {
      const polishResult = await ErrorHandler.callWithRetry(async () => {
        return aiContext.adapter.chat({
          apiKey: aiContext.apiKey,
          baseUrl: aiContext.baseUrl,
          systemPrompt,
          // 使用 split-join 替换防止 $ 注入
          userPrompt: `${PromptBuilder.POLISH_PROMPT.split('{content}').join(content)}\n\n【不得违反的既有叙事事实】\n${continuityContext}\n\n【不得破坏的当天剧情计划】\n${storyPlanContext}`,
          // 润色只做低风险表达优化，禁止用高温度重新编排剧情。
          temperature: Math.min(Number(user.ai_temperature || 0.5), 0.4),
          maxTokens: user.ai_max_tokens || 2000,
        });
      }, '润色');

      // 润色失败时降级：返回原始内容而非失败结果
      if (!polishResult.success) {
        console.warn('[StoryEngine] 润色失败，使用审查后内容:', polishResult.error);
        return { success: true, content: content };
      }

      return polishResult;
    } catch (e) {
      // callWithRetry 异常时降级为原始内容
      console.warn('[StoryEngine] 润色异常，使用审查后内容:', e.message);
      return { success: true, content: content };
    }
  }

  // 当 Critical 能定位计划违例但没有提供可用 revised_content 时，使用一次
  // 定向终稿修复把“发现问题”真正转化为“修复问题”。修复后仍须重新审查。
  async _repairPlanCompliance(content, issues, systemPrompt, aiContext, storyPlanContext) {
    const issueList = (issues || []).map(item => `- ${item}`).join('\n') || '- 未通过当天剧情计划复核'
    const prompt = `你是连载小说的终稿修复编辑。请只输出修复后的完整小说正文，不要标题、说明、JSON 或引用标注。

【Critical 发现的必须修复问题】
${issueList}

【当天剧情计划（不可违反）】
${storyPlanContext}

【修复规则】
1. 原文只是素材，不是必须保留的结构；若无法逐项满足验收，请从开场起重写完整一天，不能只在原文上补一两句。
2. 必须逐项修复上方每一个问题；尤其要把“上一日尚未完成的状态 → 今天的首个行动 → 行动带来的代价/新信息 → 结尾钩子”写成一条可读的因果链。
3. 每项日记事件必须让角色实际行动，并明确改变风险、资源、关系、信息、时间成本或下一步目标；只提到词语不算完成。
4. 用户选择必须带来可观察的风险、损失、暴露或新义务，不能以安全退走、无代价获得线索来替代。
5. 不得为修复而删除既有世界观、角色、物品、有效情节或用户选择后果；不得用未经交代的时间跳跃掩盖衔接。
6. 结尾必须直接承接当天的调查目标，并留下下一天可执行的未完成行动。
7. 正文不少于 800 字，完整结束。

【待修复正文】
${content}`
    const result = await ErrorHandler.callWithRetry(async () => aiContext.adapter.chat({
      apiKey: aiContext.apiKey,
      baseUrl: aiContext.baseUrl,
      systemPrompt,
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: 3200,
    }), '剧情计划合规修复')
    return result.success && result.content ? { success: true, content: result.content.trim() } : { success: false, content: content }
  }

  /**
   * 解析 AI 输出，分离故事正文和日记引用标注
   * AI 按新 Prompt 格式输出：正文 + ---DIARY_REFS--- + JSON引用数组
   * 解析失败时降级为纯正文（references 为 null），不影响主流程
   * @private
   */
  _parseStoryAndReferences(rawContent) {
    // R9 修复：null/undefined 输入防护
    if (!rawContent || typeof rawContent !== 'string') {
      return { content: '', references: null };
    }
    const SEPARATOR = '---DIARY_REFS---';
    const separatorIndex = rawContent.indexOf(SEPARATOR);

    if (separatorIndex === -1) {
      // AI 未按格式输出引用，降级为纯正文
      return { content: rawContent.trim(), references: null };
    }

    const content = rawContent.substring(0, separatorIndex).trim();
    const refSection = rawContent.substring(separatorIndex + SEPARATOR.length).trim();

    let references = null;
    try {
      // 尝试提取 JSON 数组（AI 可能输出多余文字，取第一个 [ 到最后一个 ]）
      const jsonStart = refSection.indexOf('[');
      const jsonEnd = refSection.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const jsonStr = refSection.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          references = JSON.stringify(parsed);
        }
      }
    } catch (e) {
      console.warn('[StoryEngine] 引用标注解析失败，降级为纯正文:', e.message);
    }

    return { content, references };
  }

  /**
   * 获取章节定位描述
   * @private
   */
  _getChapterPurpose(chapterNumber) {
    const purposes = {
      0: '引出故事背景，主角觉醒非凡能力',
      1: '主角初步探索非凡世界，结识同伴',
      2: '剧情推进，面临挑战和选择',
      3: '故事高潮，重大转折',
      4: '冲突升级，接近真相',
      5: '故事结局，收束伏笔',
    };
    return purposes[chapterNumber] || '推进剧情';
  }

  /**
   * 获取分支引导文本
   * @private
   */
  _getBranchGuidance(outlineNodes) {
    const branchNodes = outlineNodes.filter(n =>
      n.branch_options && n.branch_options !== '[]'
    );
    if (branchNodes.length === 0) return '';
    try {
      const options = JSON.parse(branchNodes[0].branch_options);
      return options.map(o => o.desc).join('；');
    } catch (_) {
      return '';
    }
  }
}

export default StoryEngine;
