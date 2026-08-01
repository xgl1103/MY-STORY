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
    if (Array.isArray(parsed.keywords)) candidates.push(...parsed.keywords)

    // 引号内常为人名、地点、物品或事件名，是稳定且有价值的覆盖目标。
    const quoted = String(diaryText).match(/[「」『』“”"']([^「」『』“"']{2,12})[「」『』“"']/g) || []
    for (const item of quoted) {
      const text = item.replace(/[「」『』“”"']/g, '').trim()
      if (text) candidates.push(text)
    }

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

    return {
      valid: reasons.length === 0,
      charCount,
      hasCompleteEnding,
      coverageKeywords: normalizedKeywords,
      matchedKeywords,
      missingKeywords,
      requiredMatches,
      reasons,
    }
  }
}

export default ContentQualityGate
