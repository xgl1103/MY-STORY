// src/core/index.js
// StoryEngine 环境切换器
// Vite 环境变量控制：VITE_USE_MOCK=true 用 Mock，false 用真实 StoryEngine
import MockStoryEngine from './MockStoryEngine.js'

const USE_MOCK = import.meta.env?.VITE_USE_MOCK === 'true'

let instance = null
let initPromise = null // 防止并发 initStoryEngine

// 获取 StoryEngine 实例（须在 initStoryEngine 完成后调用）
export function getStoryEngine() {
  if (instance) return instance
  // 未初始化时抛错，而非静默创建 Mock（避免污染 instance 导致状态不一致）
  throw new Error('StoryEngine 尚未初始化，请先调用 initStoryEngine()')
}

// 异步初始化 StoryEngine（在 main.js 中调用）
// 开发期使用 Mock；联调期动态加载 AI 工程师实现的真实 StoryEngine
export async function initStoryEngine() {
  if (instance) return instance
  if (initPromise) return initPromise // 并发调用复用同一个 Promise

  initPromise = (async () => {
    if (USE_MOCK) {
      instance = new MockStoryEngine()
      return instance
    }
    try {
      // 使用 /* @vite-ignore */ 避免 Vite 静态分析，同时保持模块作用域内的 import() 调用
      const module = await import(/* @vite-ignore */ '/src/core/StoryEngine.js')
      const RealEngine = module.default

      // 动态加载真实 Repository
      const [userRepoMod, diaryRepoMod, chapterRepoMod, segmentRepoMod, worldRepoMod, narrativeRepoMod, entityRepoMod, foreshadowRepoMod] = await Promise.all([
        import(/* @vite-ignore */ '/src/db/repositories/UserRepository.js'),
        import(/* @vite-ignore */ '/src/db/repositories/DiaryRepository.js'),
        import(/* @vite-ignore */ '/src/db/repositories/ChapterRepository.js'),
        import(/* @vite-ignore */ '/src/db/repositories/SegmentRepository.js'),
        import(/* @vite-ignore */ '/src/db/repositories/WorldRepository.js'),
        import(/* @vite-ignore */ '/src/db/repositories/NarrativeStateRepository.js'),
        import(/* @vite-ignore */ '/src/db/repositories/EntityRepository.js'),
        import(/* @vite-ignore */ '/src/db/repositories/ForeshadowingRepository.js'),
      ])

      instance = new RealEngine({
        userRepo: userRepoMod.UserRepository,
        diaryRepo: diaryRepoMod.DiaryRepository,
        chapterRepo: chapterRepoMod.ChapterRepository,
        segmentRepo: segmentRepoMod.SegmentRepository,
        worldRepo: worldRepoMod.WorldRepository,
        narrativeRepo: narrativeRepoMod.NarrativeStateRepository,
        entityRepo: entityRepoMod.EntityRepository,
        foreshadowRepo: foreshadowRepoMod.ForeshadowingRepository,
      })
    } catch (e) {
      console.error('无法加载真实 StoryEngine，回退到 Mock:', e)
      instance = new MockStoryEngine()
    }
    return instance
  })()

  try {
    return await initPromise
  } catch (e) {
    initPromise = null
    throw e
  }
}

export default { getStoryEngine, initStoryEngine }
