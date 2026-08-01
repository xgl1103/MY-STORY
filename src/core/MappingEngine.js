// src/core/MappingEngine.js
//
// 映射规则引擎：将行为大类匹配到世界观行为。
// 对应 10 步生成流程的步骤 2。
//
// 纯本地逻辑，不调用 AI。通过关键词匹配 mappings.json 中的规则。
// 异常处理：无匹配规则 → 使用"其他"分类的默认映射。
//
// 输入：detectedBehaviors（步骤1输出的行为大类数组）、mappingRules（从 WorldRepository 获取）
// 输出：mappingDesc（JSON 字符串，记录每个行为→世界观行为的映射）

class MappingEngine {
  /**
   * 将行为大类映射为世界观行为
   * @param {string[]} behaviors - 行为大类数组（如 ['学习', '健身']）
   * @param {Array<{behavior: string, world_behavior: string, keywords: string[], description: string}>} mappingRules
   * @returns {Promise<string>} JSON 字符串格式的映射结果
   */
  async map(behaviors, mappingRules) {
    const mappings = [];
    const rules = mappingRules || [];

    // 确保行为数组有效
    const behaviorList = Array.isArray(behaviors) ? behaviors : [];

    for (const behavior of behaviorList) {
      // 精确匹配行为大类
      let rule = rules.find(r => r.behavior === behavior);

      // 无匹配 → 使用"其他"分类的默认映射
      if (!rule) {
        rule = rules.find(r => r.behavior === '其他');
      }

      if (rule) {
        mappings.push({
          behavior: rule.behavior,
          worldBehavior: rule.world_behavior || rule.worldBehavior,
          description: rule.description || '',
        });
      }
    }

    // 如果没有任何映射结果（极端情况：行为列表和规则都为空），给一个默认映射
    if (mappings.length === 0) {
      const defaultRule = rules.find(r => r.behavior === '其他') || {
        behavior: '其他',
        world_behavior: '日常琐事',
        description: '将其他日常行为映射为世界观内的日常琐事',
      };
      mappings.push({
        behavior: defaultRule.behavior,
        worldBehavior: defaultRule.world_behavior || defaultRule.worldBehavior,
        description: defaultRule.description || '',
      });
    }

    return JSON.stringify(mappings);
  }
}

export default MappingEngine;
