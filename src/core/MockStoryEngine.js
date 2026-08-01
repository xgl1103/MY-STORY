// src/core/MockStoryEngine.js
// 前端开发阶段使用，严格实现接口 A（角色分工 3.1 节）
// 联调阶段通过 src/core/index.js 的 getStoryEngine() 切换为真实实现

// 模拟内容池：每次生成/重生成随机选一条，体现"生成不同版本"
const MOCK_CONTENTS = [
  '{heroName}在占卜家小屋中翻开了那本泛黄的神秘学典籍，烛火在书页上投下摇曳的影子。窗外的雾气愈发浓重，仿佛整座城市都在低声呢喃着不为人知的秘密。序列9的非凡能力让{heroName}能隐约感知到空气中流动的灵性，这是一种难以言喻的第六感。',
  '清晨的钟声穿透浓雾，{heroName}从冥想中睁开双眼。经过一夜的灵性恢复，精神力已重新充盈。塔罗会的委托还压在案头，但今天似乎有什么不同寻常的气息在空气中蔓延——水晶球表面浮现出若有若无的纹路。',
  '{heroName}摊开塔罗牌，指尖轻触牌面。占卜的结果有些出人意料，命运的丝线似乎正在向某个未知的方向交织。雾之上的空间里，似乎有人在注视着这一切。序列9的灵视让{heroName}捕捉到了一闪而过的非凡波动。',
  '夜色渐深，{heroName}在灯下整理着今日的见闻。这具序列9的非凡之躯，正缓慢却坚定地适应着新的力量。城市的某处传来若有若无的钟声，那是非凡者世界的暗语，暗示着某个不为人知的聚会即将开始。'
]

// 模拟映射说明
const MOCK_MAPPINGS = [
  { behavior: '学习', worldBehavior: '研读神秘学典籍' },
  { behavior: '工作', worldBehavior: '完成塔罗会委托任务' },
  { behavior: '健身', worldBehavior: '体能与战斗训练' },
  { behavior: '社交', worldBehavior: '与塔罗会成员交流情报' },
  { behavior: '休息', worldBehavior: '冥想与灵性恢复' },
  { behavior: '娱乐', worldBehavior: '探索非凡现象' },
  { behavior: '其他', worldBehavior: '日常琐事' }
]

// 章节边界定义（功能规划 8.1 节），用于 mock finalize 判断章节是否完成
const CHAPTER_BOUNDS = [
  { number: 0, end_day: 5 },
  { number: 1, end_day: 25 },
  { number: 2, end_day: 45 },
  { number: 3, end_day: 65 },
  { number: 4, end_day: 85 },
  { number: 5, end_day: 90 }
]

class MockStoryEngine {
  constructor() {
    // 模拟内存中的段落存储（联调阶段会被真实 DB 替换）
    this.segments = new Map()
    this.idCounter = 1000
  }

  // 从数据库加载段落（Mock 模式也使用真实数据库存储）
  async _getSegmentFromDB(segmentId) {
    try {
      const { SegmentRepository } = await import('@/db/repositories/SegmentRepository')
      const all = await SegmentRepository.getAll()
      return all.find(s => s.id === segmentId) || null
    } catch (e) {
      return null
    }
  }

  // 主流程：生成故事段落
  // 签名严格遵循角色分工 3.1 节 GenerateResult
  async generateStory(params) {
    await this._delay(2000) // 模拟网络延迟 + AI 生成耗时

    // 随机选一条内容，替换 heroName 占位符
    const user = await this._getUser()
    const heroName = user.hero_name || '你'
    console.log('[MockStoryEngine] generateStory: heroName =', JSON.stringify(heroName))
    const content = this._pick(MOCK_CONTENTS).split('{heroName}').join(heroName)
    console.log('[MockStoryEngine] generateStory: content =', content.slice(0, 80))

    // 构造映射说明：根据传入的 behaviorTags 匹配，无标签则给默认映射
    const tags = params.behaviorTags || []
    const mappings = tags.length > 0
      ? MOCK_MAPPINGS.filter(m => tags.includes(m.behavior))
      : MOCK_MAPPINGS.slice(0, 2)

    // 写入真实数据库（Mock 模式也持久化，确保 Preview/Reader 能读取）
    let segmentId = this.idCounter++
    try {
      const { SegmentRepository } = await import('@/db/repositories/SegmentRepository')
      const { ChapterRepository } = await import('@/db/repositories/ChapterRepository')

      // 获取当前章节
      const chapters = await ChapterRepository.getAll()
      const currentChapter = chapters.find(c => c.status === 'ongoing') || chapters[chapters.length - 1]
      const chapterId = currentChapter ? currentChapter.id : 1
      console.log('[MockStoryEngine] generateStory: chapters =', chapters.map(c => ({ id: c.id, number: c.chapter_number, status: c.status })))
      console.log('[MockStoryEngine] generateStory: selected chapterId =', chapterId)

      segmentId = await SegmentRepository.create({
        day_number: params.dayNumber,
        chapter_id: chapterId,
        // diary_id 是可选外键；未传时必须显式写 null，不能把 undefined 交给 sql.js。
        diary_id: params.diaryId ?? null,
        content: content,
        mapping_desc: JSON.stringify(mappings),
        status: 'draft_ready',
        revision_count: 0
      })
      console.log('[MockStoryEngine] generateStory: created segmentId =', segmentId, ', chapter_id =', chapterId)
    } catch (e) {
      // 预览页和首页都依赖数据库。写入失败不能伪装成生成成功，否则页面
      // 跳转后必然读不到故事内容。
      const message = e instanceof Error ? e.message : String(e)
      console.error('[MockStoryEngine] 数据库写入失败:', message)
      return { success: false, error: `故事保存失败：${message}`, errorCode: 'E008' }
    }

    // 同时存入内存 Map（保持向后兼容）
    this.segments.set(segmentId, {
      id: segmentId,
      dayNumber: params.dayNumber,
      content,
      mappingDesc: JSON.stringify(mappings),
      status: 'draft_ready',
      revisionCount: 0
    })

    return {
      success: true,
      segmentId,
      content,
      mappingDesc: JSON.stringify(mappings)
    }
  }

  // 重新生成（角色分工 3.1 regenerate）
  async regenerate(segmentId) {
    await this._delay(1500)

    // 优先从内存查找，其次从数据库查找
    let seg = this.segments.get(segmentId)
    if (!seg) {
      seg = await this._getSegmentFromDB(segmentId)
    }
    if (!seg) {
      return { success: false, error: '段落不存在', errorCode: 'E007' }
    }

    // 选一条与上次不同的内容
    const user = await this._getUser()
    const heroName = user.hero_name || '你'
    let newContent = this._pick(MOCK_CONTENTS)
    let tries = 0
    while (newContent === seg.content && tries < 5) {
      newContent = this._pick(MOCK_CONTENTS)
      tries++
    }
    newContent = newContent.split('{heroName}').join(heroName)

    // 更新数据库
    try {
      const { SegmentRepository } = await import('@/db/repositories/SegmentRepository')
      await SegmentRepository.updateContent(segmentId, newContent)
      await SegmentRepository.incrementRevision(segmentId)
    } catch (e) {
      console.warn('[MockStoryEngine] 数据库更新失败:', e.message)
    }

    // 同步内存
    seg.content = newContent
    seg.revisionCount = (seg.revisionCount || 0) + 1

    return {
      success: true,
      segmentId,
      content: newContent,
      mappingDesc: seg.mapping_desc || seg.mappingDesc
    }
  }

  // 确认定稿（角色分工 3.1 finalize）
  // 返回 FinalizeResult，模拟章节边界检测（功能规划 8.3）与故事完结（8.6）
  async finalize(segmentId) {
    await this._delay(300)

    // 优先从内存查找，其次从数据库查找
    let seg = this.segments.get(segmentId)
    if (!seg) {
      seg = await this._getSegmentFromDB(segmentId)
    }
    if (!seg) {
      return { success: false, dayCompleted: 0, chapterCompleted: false, storyEnded: false, error: '段落不存在' }
    }

    const user = await this._getUser()
    const dayCompleted = seg.day_number || seg.dayNumber

    // 先更新进度，再以 markFinalized 的强制落盘持久化这一整次定稿。
    // 这与真实 StoryEngine 的顺序一致，避免刷新后 current_day 回退。
    try {
      const { UserRepository } = await import('@/db/repositories/UserRepository')
      await UserRepository.update({ current_day: dayCompleted })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, dayCompleted: 0, chapterCompleted: false, storyEnded: false, error: `进度保存失败：${message}`, errorCode: 'E008' }
    }

    try {
      const { SegmentRepository } = await import('@/db/repositories/SegmentRepository')
      await SegmentRepository.markFinalized(segmentId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, dayCompleted: 0, chapterCompleted: false, storyEnded: false, error: `故事定稿失败：${message}`, errorCode: 'E008' }
    }

    seg.status = 'finalized'

    // 模拟章节边界检测：当天数等于某章 end_day 则章节完成
    const bound = CHAPTER_BOUNDS.find(c => c.end_day === dayCompleted)
    const chapterCompleted = !!bound
    const storyEnded = dayCompleted >= (user.duration_days || 90)

    return {
      success: true,
      dayCompleted,
      chapterCompleted,
      chapterSummary: chapterCompleted
        ? `（Mock 摘要）第 ${bound.number} 章至此完结，{heroName}经历了关键转折...`.split('{heroName}').join(user.hero_name)
        : undefined,
      storyEnded
    }
  }

  // 保存手动编辑（角色分工 3.1 saveEdit）
  async saveEdit(segmentId, content) {
    await this._delay(200)

    // 优先从内存查找，其次从数据库查找
    let seg = this.segments.get(segmentId)
    if (!seg) {
      seg = await this._getSegmentFromDB(segmentId)
    }
    if (!seg) {
      return { success: false, dayCompleted: 0, chapterCompleted: false, storyEnded: false, error: '段落不存在' }
    }

    // 更新数据库
    try {
      const { SegmentRepository } = await import('@/db/repositories/SegmentRepository')
      await SegmentRepository.updateContent(segmentId, content)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, dayCompleted: 0, chapterCompleted: false, storyEnded: false, error: `故事保存失败：${message}`, errorCode: 'E008' }
    }

    seg.content = content
    seg.status = 'finalized'
    const dayCompleted = seg.day_number || seg.dayNumber

    // F4 修复：saveEdit 也递增 current_day（与真实 StoryEngine 行为对齐）
    try {
      const { UserRepository } = await import('@/db/repositories/UserRepository')
      await UserRepository.update({ current_day: dayCompleted })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, dayCompleted: 0, chapterCompleted: false, storyEnded: false, error: `进度保存失败：${message}`, errorCode: 'E008' }
    }

    try {
      const { SegmentRepository } = await import('@/db/repositories/SegmentRepository')
      // markFinalized 会强制落盘，确保内容、状态和进度可在刷新后一起恢复。
      await SegmentRepository.markFinalized(segmentId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false, dayCompleted: 0, chapterCompleted: false, storyEnded: false, error: `故事定稿失败：${message}`, errorCode: 'E008' }
    }

    return {
      success: true,
      dayCompleted,
      chapterCompleted: false,
      storyEnded: false
    }
  }

  // 获取生成状态（角色分工 3.1 getStatus）
  async getStatus(segmentId) {
    let seg = this.segments.get(segmentId)
    if (!seg) {
      seg = await this._getSegmentFromDB(segmentId)
    }
    return seg ? (seg.status || 'pending') : 'pending'
  }

  // ===== 内部辅助 =====
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  // Mock 读取用户设置（联调阶段由真实 UserRepository 提供）
  async _getUser() {
    // 优先尝试真实 UserRepository（若已初始化）
    try {
      const { UserRepository } = await import('@/db/repositories/UserRepository')
      return await UserRepository.get()
    } catch (e) {
      // 数据库未就绪时返回 mock 默认值
      return { hero_name: '你', duration_days: 90, current_day: 1 }
    }
  }
}

export default MockStoryEngine
