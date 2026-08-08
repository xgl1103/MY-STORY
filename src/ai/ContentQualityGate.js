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

    const seen = new Set()
    return candidates
      .map(item => String(item || '').trim())
      .filter(item => item.length >= 2 && item.length <= 12)
      .filter(item => !GENERIC_KEYWORDS.has(item))
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

    // 现代用语检测：命中任意现代词汇即判定不通过
    const modernHits = MODERN_TERMS.filter(term => text.includes(term))
    if (modernHits.length > 0) {
      reasons.push(`正文包含不符合维多利亚/诡秘之主世界观的现代用语：${modernHits.slice(0, 5).join('、')}${modernHits.length > 5 ? '等' : ''}`)
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
      reasons,
    }
  }
}

export default ContentQualityGate
