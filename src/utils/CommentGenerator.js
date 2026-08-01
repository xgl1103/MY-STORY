// src/utils/CommentGenerator.js
// AI 读者评论预生成器
// 流程：章节定稿后 → 后台触发 → 热度分级 → 批量生成 → 渐进展示
//
// 生产环境替换点：
//   assessHeatLevel() → 调用大模型判定剧情吸引力
//   generateCommentsWithAI() → 调用大模型生成评论
//   当前 Mock 阶段用模板 + 关键词提取模拟

// ===== 热度档位定义 =====
export const HEAT_LEVELS = {
  1: { name: '平淡', commentCount: 10, label: '日常铺垫' },
  2: { name: '精彩', commentCount: 20, label: '情节推进' },
  3: { name: '高潮', commentCount: 30, label: '关键转折' }
}

// ===== 五种读者 Persona =====
const PERSONAS = [
  {
    id: 'detective',
    name: '侦探K',
    avatarColor: '#6B8E9F',
    templates: [
      '等等，这里提到{keyword}是不是之前出现过的伏笔？细思极恐！',
      '{keyword}这个细节我反复看了三遍，作者肯定在暗示什么...',
      '注意到{keyword}了吗？和第二章的描述完全对应上了！',
      '这段关于{keyword}的描写，我总觉得后面会反转',
      '有人在关注{keyword}吗？这绝对是个关键线索',
      '{keyword}的出现太突兀了，不像是随意写的',
      '我赌五毛，{keyword}后面一定会回收',
      '这里{keyword}的描写角度很特别，是在埋线吧'
    ]
  },
  {
    id: 'empath',
    name: '夜莺',
    avatarColor: '#C47A8A',
    templates: [
      '看到主角面对{keyword}这里的选择，我真的心疼了...',
      '这段写得太戳了，{keyword}让人心里一紧',
      '主角在{keyword}时的犹豫，写得太真实了，谁不是这样呢',
      '读到这里眼眶有点湿，{keyword}这段太共情了',
      '能体会到主角面对{keyword}时的无力感，写得好细腻',
      '{keyword}让我想起了自己的经历，这种代入感太强了',
      '每次看到{keyword}都想替主角哭一场',
      '{keyword}这段的情感层次太丰富了，回味无穷'
    ]
  },
  {
    id: 'scholar',
    name: '学者M',
    avatarColor: '#7A9E6B',
    templates: [
      '按照原作设定，{keyword}的出现时间点其实很有讲究',
      '{keyword}这段和原作第三卷呼应了，处理得很巧妙',
      '从设定角度来看，{keyword}的描写完全贴合世界观',
      '这里关于{keyword}的细节，原著党表示很满意',
      '{keyword}的设定还原度很高，能看出作者下了功夫',
      '注意到{keyword}的描写方式了吗？和原作风格一脉相承',
      '补充一下，{keyword}在原作中其实有更深的含义',
      '{keyword}这段的世界观扩展做得不错，没有违和感'
    ]
  },
  {
    id: 'troll',
    name: '毒舌君',
    avatarColor: '#B88A4A',
    templates: [
      '主角你倒是快一点啊！{keyword}这都能忍？我急死了！',
      '哈哈哈哈哈{keyword}这段我真的笑出声，太真实了',
      '不是，{keyword}这里主角是不是有点过于冷静了？',
      '{keyword}这种情况换我早跑了，主角心理素质可以的',
      '每次读到{keyword}我都想钻进书里替主角做选择',
      '{keyword}这段我反复读了两遍，越看越有意思',
      '救命，{keyword}这里主角的反应也太真实了吧',
      '我看{keyword}这段的时候血压都上来了'
    ]
  },
  {
    id: 'newbie',
    name: '好奇宝宝',
    avatarColor: '#8B7CB8',
    templates: [
      '这也太强了吧！{keyword}这就是非凡者的世界吗！',
      '萌新想问，{keyword}这种情况在设定里常见吗？',
      '世界观太宏大了，{keyword}这段看得我起鸡皮疙瘩',
      '刚入坑不久，{keyword}这段直接把我震撼到了',
      '{keyword}的描写让我对这个世界的理解又深了一层',
      '读到{keyword}这里，终于明白为什么这么多人推荐这本书了',
      '天哪，{keyword}这段也太刺激了吧！',
      '新手表示{keyword}这段信息量好大，要消化一下'
    ]
  },
  {
    id: 'fanboy',
    name: '追更狂魔',
    avatarColor: '#D4845A',
    templates: [
      '追到现在，{keyword}这段绝对是目前最精彩的！',
      '每天等更的日子太难熬了，{keyword}这段没白等！',
      '{keyword}这里直接封神！作者太会写了！',
      '看到{keyword}我直接从床上坐起来了！',
      '这章的{keyword}部分我已经读了三遍，根本停不下来',
      '{keyword}这段必须加精！太绝了！',
      '追更这么久，{keyword}这段让我觉得一切都值得',
      '就冲{keyword}这段，这书我可以吹一年'
    ]
  }
]

// ===== 关键词提取 =====
function extractKeywords(paragraph) {
  const words = paragraph.match(/[\u4e00-\u9fa5]{2,8}/g) || []
  const candidates = words.filter(w => w.length >= 3 && w.length <= 8)
  if (candidates.length === 0) return words.slice(0, 3)
  return candidates
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ===== 热度判定（Mock 版本，生产环境替换为 AI 调用）=====
// 返回 1/2/3 三个档位
// Mock 逻辑：基于内容长度、关键词密度、情绪词出现频率判定
export function assessHeatLevel(content) {
  if (!content || content.trim().length < 50) return 1

  const text = content.trim()
  const length = text.length

  // 情绪/冲突关键词
  const intenseWords = ['震惊', '惊恐', '愤怒', '崩溃', '绝望', '狂喜', '颤抖', '嘶吼', '爆炸', '死亡', '鲜血', '战斗', '危机', '转折', '真相', '秘密', '背叛', '牺牲', '觉醒', '突破']
  const calmWords = ['日常', '闲聊', '散步', '早餐', '整理', '冥想', '休息', '阅读', '思考', '等待']

  let intenseCount = 0
  let calmCount = 0
  for (const w of intenseWords) {
    const matches = text.match(new RegExp(w, 'g'))
    if (matches) intenseCount += matches.length
  }
  for (const w of calmWords) {
    const matches = text.match(new RegExp(w, 'g'))
    if (matches) calmCount += matches.length
  }

  // 感叹号和问号密度
  const exclaimCount = (text.match(/[！!]/g) || []).length
  const questionCount = (text.match(/[？?]/g) || []).length

  // 评分逻辑
  let score = 0
  if (length > 800) score += 2
  else if (length > 400) score += 1

  score += intenseCount * 2
  score -= calmCount
  score += Math.floor((exclaimCount + questionCount) / 3)

  if (score >= 8) return 3   // 高潮
  if (score >= 3) return 2   // 精彩
  return 1                    // 平淡
}

// ===== 批量生成评论 =====
// chapterNumber: 章节号
// content: 章节正文
// heatLevel: 1/2/3
// 返回评论数组，每条带有 reveal_at 时间戳（渐进展示）
export function generateComments(chapterNumber, content, heatLevel = 1) {
  if (!content || content.trim().length < 20) return []

  const targetCount = HEAT_LEVELS[heatLevel]?.commentCount || 10
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 10)
  if (paragraphs.length === 0) return []

  const comments = []
  const now = Date.now()
  // 评论在 0-120 分钟内陆续"出现"，模拟真实社区
  const maxSpreadMs = 120 * 60 * 1000

  // 为每个评论分配段落位置和 persona
  const usedPersonasInParagraph = new Map() // paragraphIndex -> Set(personaId)

  for (let i = 0; i < targetCount; i++) {
    // 轮询段落位置，评论均匀分布
    const paraIndex = Math.floor((i / targetCount) * paragraphs.length)
    const para = paragraphs[Math.min(paraIndex, paragraphs.length - 1)]
    const keywords = extractKeywords(para)
    if (keywords.length === 0) continue

    // 选 persona：同一段落尽量不重复
    if (!usedPersonasInParagraph.has(paraIndex)) {
      usedPersonasInParagraph.set(paraIndex, new Set())
    }
    const used = usedPersonasInParagraph.get(paraIndex)
    let available = PERSONAS.filter(p => !used.has(p.id))
    if (available.length === 0) {
      available = PERSONAS
      used.clear()
    }
    const persona = pick(available)
    used.add(persona.id)

    const keyword = pick(keywords)
    const template = pick(persona.templates)
    const text = template.split('{keyword}').join(keyword)

    // 渐进展示：越后面的评论 reveal_at 越晚
    // 前面 30% 立即可见，后面按对数曲线延迟
    let revealDelay
    if (i < targetCount * 0.3) {
      revealDelay = Math.random() * 5000 // 0-5秒，几乎立即可见
    } else {
      const progress = (i - targetCount * 0.3) / (targetCount * 0.7)
      revealDelay = Math.pow(progress, 0.7) * maxSpreadMs
    }

    comments.push({
      chapter_number: chapterNumber,
      paragraph_index: paraIndex,
      persona: persona.id,
      persona_name: persona.name,
      avatar_color: persona.avatarColor,
      content: text,
      likes: Math.floor(Math.random() * 120) + 2,
      reveal_at: now + revealDelay
    })
  }

  return comments
}

// ===== 后台触发评论生成（Preview.vue finalize 后调用）=====
// 异步执行，不阻塞用户操作
export async function triggerCommentGeneration(chapterNumber, content) {
  try {
    const { CommentRepository } = await import('@/db/repositories/CommentRepository')

    // 检查是否已生成
    const existing = CommentRepository.getByChapter(chapterNumber)
    if (existing.length > 0) return { skipped: true, reason: 'already_exists' }

    // 第一步：热度判定
    const heatLevel = assessHeatLevel(content)

    // 第二步：批量生成评论
    const comments = generateComments(chapterNumber, content, heatLevel)
    CommentRepository.batchCreate(comments)

    // 第三步：更新章节热度标记
    try {
      const { ChapterRepository } = await import('@/db/repositories/ChapterRepository')
      ChapterRepository.updateHeatLevel(chapterNumber, heatLevel)
    } catch (e) { /* ignore */ }

    return { success: true, heatLevel, commentCount: comments.length }
  } catch (e) {
    console.error('[CommentGenerator] 评论生成失败:', e)
    return { success: false, error: e.message }
  }
}

// 预生成所有章节的评论（用于数据迁移）
export async function pregenerateAllComments(chapters) {
  for (const ch of chapters) {
    if (!ch.content) continue
    const { CommentRepository } = await import('@/db/repositories/CommentRepository')
    const existing = CommentRepository.getByChapter(ch.chapter_number)
    if (existing.length > 0) continue
    const heatLevel = assessHeatLevel(ch.content)
    const comments = generateComments(ch.chapter_number, ch.content, heatLevel)
    CommentRepository.batchCreate(comments)
  }
}
