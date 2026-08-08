// src/ai/ContentQualityGate.js
//
// 故事正文的确定性质量门槛：长度、句末完整性和当天日记关键词覆盖。
// 该类不调用模型，便于在写库前和单元测试中重复使用。

const MIN_CHARS = 800
const MAX_KEYWORDS = 6

const GENERIC_KEYWORDS = new Set([
  '今天', '昨天', '感觉', '觉得', '一个', '这个', '那个', '事情', '经历',
  '学习', '工作', '健身', '社交', '休息', '娱乐', '其他', '主角', '故事'
])

// 维多利亚/诡秘之主世界观中不应出现的现代用语
// 命中任意一项即判定质量不通过，触发修复
const MODERN_TERMS = [
  // 现代科技产品
  '手机', '电脑', '互联网', '电视', '微波炉', '冰箱', '空调', '电梯', '电灯泡',
  '电话', '收音机', '照相机', '摄像头', '显示器', '键盘', '鼠标', '路由器',
  'APP', 'app', '软件', '程序', '代码', '数据库', '服务器', '浏览器',
  // 现代交通
  '地铁', '高铁', '飞机', '公交', '公交车', '出租车', '网约车', '摩托车',
  // 现代职场
  'KPI', 'OKR', '打卡', '上班', '下班', '加班', '请假', '调休', '报销',
  '开会', '汇报', '述职', '绩效考核', '试用期', '入职', '离职',
  // 现代金融/社交
  '信用卡', '支付宝', '微信', '转账', '扫码', '二维码', '直播', '短视频',
  '朋友圈', '热搜', '粉丝', '点赞', '关注', '转发',
  // 现代教育
  '网课', '期末', '期中', '学分', '绩点', 'GPA', '考研', '公务员',
]

// 现代用语 → 诡秘之主世界观对应表达
// 用于指导 AI 将用户日记中的现代概念转化为世界观内表达
const MODERN_TERM_REPLACEMENTS = {
  // 现代科技产品 → 维多利亚/非凡者世界对应物
  '手机': '便携通讯器或传讯符文', '电脑': '计算器或算力装置', '互联网': '信息网络或占卜连线',
  '电视': '幻象投影仪', '冰箱': '冰窖或冷藏箱', '空调': '通风魔法或冷气装置',
  '电梯': '升降梯', '电灯泡': '煤气灯或魔法光源', '电话': '通讯器或传讯法阵',
  '显示器': '观察水晶或投影屏', '键盘': '操作面板或打字机', '鼠标': '操控杆',
  '软件': '法术序列或符文回路', '程序': '仪式流程或法术回路', '代码': '符文或咒文',
  '数据库': '档案库或信息索引', '服务器': '中枢装置或信息节点', '浏览器': '观测窗口',
  'APP': '法术应用或符文工具', 'app': '法术应用或符文工具',
  // 现代交通 → 维多利亚/世界观交通
  '地铁': '地下铁道或蒸汽列车', '高铁': '蒸汽快车', '飞机': '飞艇或飞行法器',
  '公交': '公共马车', '公交车': '公共马车', '出租车': '出租马车', '网约车': '雇用马车',
  '摩托车': '蒸汽单车或机动两轮车',
  // 现代职场 → 维多利亚/非凡者组织用语
  'KPI': '任务指标', 'OKR': '目标与关键成果', '打卡': '签到或登记',
  '上班': '当值或履职', '下班': '收工或散值', '加班': '延时当值',
  '请假': '告假', '调休': '调换轮值', '报销': '费用核销',
  '开会': '聚议或碰头', '汇报': '禀报或呈报', '述职': '述职报告',
  '绩效考核': '任务评核', '试用期': '考察期', '入职': '就任', '离职': '离任',
  // 现代金融/社交 → 世界观内对应
  '信用卡': '信用凭证', '支付宝': '结算所', '微信': '传讯网络', '转账': '汇兑',
  '扫码': '核验印记', '二维码': '识别符印', '直播': '现场幻象转播',
  '朋友圈': '交际圈', '点赞': '赞许', '关注': '留意或注视',
  // 现代教育 → 世界观内对应
  '网课': '函授课程', '期末': '学期末', '期中': '学期中',
  '学分': '学业积分', '绩点': '成绩等第', 'GPA': '学业总评',
  '考研': '进阶考试', '公务员': '文职官员',
}

export class ContentQualityGate {
  static get limits() {
    return { minChars: MIN_CHARS }
  }

  /**
   * 从日记解析结果中取适合做覆盖校验的具体关键词。
   * 只使用具体名词/专有词，避免要求模型原样复述“学习”等泛化行为标签。
   */
  static collectCoverageKeywords(parsed = {}, diaryText = '') {
    const candidates = []

    // 引号内常为人名、地点、物品或事件名，是稳定且有价值的覆盖目标。
    const quoted = String(diaryText).match(/[「」『』“”"']([^「」『』“"']{2,12})[「」『』“"']/g) || []
    for (const item of quoted) {
      const text = item.replace(/[「」『』“”"']/g, '').trim()
      if (text) candidates.push(text)
    }

    // 模型解析出的候选词仅用于补充，不能挤掉用户主动标注的实体。
    if (Array.isArray(parsed.keywords)) candidates.push(...parsed.keywords)

    // 过滤现代用语：日记关键词中的现代用语不应要求原样出现在正文中，
    // 因为 AI 应将其转化为世界观内表达（如"电脑"→"计算器"）。
    const modernSet = new Set(MODERN_TERMS)
    const seen = new Set()
    return candidates
      .map(item => String(item || '').trim())
      .filter(item => item.length >= 2 && item.length <= 12)
      .filter(item => !GENERIC_KEYWORDS.has(item))
      .filter(item => !modernSet.has(item))
      .filter(item => {
        if (seen.has(item)) return false
        seen.add(item)
        return true
      })
      .slice(0, MAX_KEYWORDS)
  }

  static assess(content, coverageKeywords = []) {
    const text = String(content || '').trim()
    const charCount = Array.from(text.replace(/\s/g, '')).length
    const normalizedKeywords = coverageKeywords
      .map(item => String(item || '').trim())
      .filter(Boolean)

    const matchedKeywords = normalizedKeywords.filter(keyword => text.includes(keyword))
    // 至少覆盖 2 个具体关键词；关键词不足时要求全部覆盖。
    const requiredMatches = Math.min(2, normalizedKeywords.length)
    const missingKeywords = normalizedKeywords.filter(keyword => !text.includes(keyword))
    const hasCompleteEnding = /[。！？…][”’」』）】]*$/.test(text)
    const reasons = []

    if (charCount < MIN_CHARS) reasons.push(`正文不足${MIN_CHARS}字（当前${charCount}字）`)
    if (!hasCompleteEnding) reasons.push('正文未在完整句末结束')
    if (matchedKeywords.length < requiredMatches) {
      reasons.push(`当天日记关键词覆盖不足（已覆盖${matchedKeywords.length}/${requiredMatches || 0}）`)
    }

    // 现代用语检测：命中任意现代词汇即判定不通过，触发修复
    const modernHits = MODERN_TERMS.filter(term => text.includes(term))
    let modernReplacementHints = []
    if (modernHits.length > 0) {
      // 为每个命中的现代用语提供世界观替换建议
      modernReplacementHints = modernHits.map(term =>
        `${term}→${MODERN_TERM_REPLACEMENTS[term] || '世界观内恰当表达'}`
      )
      const hintStr = modernReplacementHints.slice(0, 5).join('，')
      reasons.push(`正文包含不符合维多利亚/诡秘之主世界观的现代用语：${modernHits.slice(0, 5).join('、')}${modernHits.length > 5 ? '等' : ''}（替换建议：${hintStr}）`)
    }

    return {
      valid: reasons.length === 0,
      charCount,
      hasCompleteEnding,
      coverageKeywords: normalizedKeywords,
      matchedKeywords,
      missingKeywords,
      requiredMatches,
      modernTermHits: modernHits,
      modernReplacementHints,
      reasons,
    }
  }
  /**
   * 生成现代用语→世界观替换指南，供 Prompt 注入使用。
   * 只返回常见的高频术语，避免 Prompt 过长。
   */
  static getModernTermGuide() {
    const common = ['电脑', '手机', '电梯', '上班', '下班', '加班', '开会', '汇报',
      '入职', '代码', '程序', '软件', '显示器', '键盘', '鼠标', '地铁', '公交',
      '出租车', '打卡', '请假', '报销', '互联网', '数据库', '服务器', '浏览器']
    return common.map(term => `${term}→${MODERN_TERM_REPLACEMENTS[term] || '世界观内表达'}`).join('，')
  }

  /**
   * 从日记文本中提取现代用语，返回其替换建议。
   * 用于在生成 Prompt 中提醒 AI 注意转换特定术语。
   */
  static getDiaryModernHints(diaryText = '') {
    const text = String(diaryText)
    return MODERN_TERMS
      .filter(term => text.includes(term))
      .map(term => `${term}→${MODERN_TERM_REPLACEMENTS[term] || '世界观内恰当表达'}`)
  }
}

export default ContentQualityGate
