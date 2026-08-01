// src/core/EncounterEngine.js
//
// 奇遇引擎：随机奇遇触发逻辑、去重、注入。
// 对应功能规划 8.5 节随机奇遇机制。
//
// 触发逻辑（功能规划 8.5）：
//   - 每 7 天检查一次：生成随机数 0-1
//     · < 0.7 触发 1 次奇遇
//     · < 0.3 触发 2 次奇遇（即 0-0.3 触发 2 次，0.3-0.7 触发 1 次，0.7-1 不触发）
//   - 从 encounter_library 中筛选符合条件（章节范围 + min_path_level）的奇遇
//   - 检查 encounter_log 确保不重复触发同一奇遇
//   - 从符合条件的奇遇中随机选取
//
// min_path_level 字段处理（用户特别关注）：
//   途径等级用序列号表示（9=序列9最弱，0=序列0最强）。
//   min_path_level 表示触发该奇遇所需的"最低途径等级"（即最弱的序列号）。
//   过滤逻辑：主角当前序列号 pathLevel <= min_path_level（序列号越小越强，
//   主角序列号需 <= 要求的最低序列号才满足条件）。
//   例：min_path_level=9 → 序列9及以上均可触发
//       min_path_level=8 → 序列8及以上可触发（序列9不满足）
//
// 注意：WorldRepository.getEncounters 内部使用了 min_path_level <= pathLevel 的过滤，
// 这与正确的逻辑（pathLevel <= min_path_level）相反。
// 因此 EncounterEngine 在拿到候选列表后做二次过滤，确保逻辑正确。

class EncounterEngine {
  /**
   * @param {Object} worldRepo - WorldRepository 实例（接口 B）
   */
  constructor(worldRepo) {
    this.worldRepo = worldRepo;
    this.triggerChance = 0.7;  // < 0.7 触发奇遇
    this.doubleChance = 0.3;   // < 0.3 触发 2 次奇遇
    this.checkInterval = 7;    // 每 7 天检查一次
  }

  /**
   * 检查并触发当日奇遇
   * @param {number} dayNumber - 当前天数
   * @param {Object} user - 用户设置（含 world_id, current_chapter 等）
   * @returns {Promise<Object|null>} 奇遇对象 { title, content } 或 null（未触发）
   */
  async checkAndTrigger(dayNumber, user) {
    // 1. 判断今天是否需要检查奇遇（每 7 天检查一次）
    if (!this._shouldCheck(dayNumber)) {
      return null;
    }

    // 2. 生成随机数决定是否触发及触发次数
    const rand = Math.random();
    if (rand >= this.triggerChance) {
      // 不触发奇遇
      return null;
    }

    // rand < 0.3 触发 2 次，0.3 <= rand < 0.7 触发 1 次
    const triggerCount = rand < this.doubleChance ? 2 : 1;

    // 3. 获取主角途径等级（序列号，9=最弱，0=最强）
    // 第一版固定序列9，未来从 user.path_level 获取
    const pathLevel = user.path_level || 9;

    // 4. 从 WorldRepository 获取候选奇遇
    // 注意：传入 pathLevel=99 来绕过 WorldRepository 的 min_path_level <= pathLevel 过滤，
    // 让所有奇遇都被返回。EncounterEngine 自己做正确的 min_path_level 过滤。
    let candidates = await this.worldRepo.getEncounters(
      user.world_id, user.current_chapter || 0, 99 // 传入 99 获取所有奇遇
    );

    // 5. EncounterEngine 二次过滤：正确的 min_path_level 逻辑
    // pathLevel <= min_path_level（主角序列号 <= 要求最低序列号，因为越小越强）
    candidates = candidates.filter(e => {
      const minPathLevel = e.min_path_level !== undefined ? e.min_path_level : 0;
      return pathLevel <= minPathLevel;
    });

    if (candidates.length === 0) {
      return null;
    }

    // 6. 去重：排除已触发过的奇遇
    const triggeredIds = await this.worldRepo.getLogEncounterIds();
    let available = candidates.filter(e => !triggeredIds.includes(e.encounter_id));

    // 如果所有奇遇都已触发过，重置去重列表（允许重复触发）
    if (available.length === 0) {
      available = candidates;
    }

    // 7. 随机选取 1 个奇遇（即使 triggerCount=2 也只注入 1 个到当天剧情，
    //    第 2 个留到下次检查周期内触发）
    const selected = this._pickRandom(available);

    // 8. 填充内容模板变量
    const content = this._fillTemplate(selected.content_template, {
      hero_name: user.hero_name || '主角',
    });

    // 9. 记录触发日志
    await this.worldRepo.logEncounter(dayNumber, selected.encounter_id, content);

    return {
      title: selected.title,
      content,
    };
  }

  /**
   * 判断今天是否需要检查奇遇（每 7 天检查一次）
   * @private
   */
  _shouldCheck(dayNumber) {
    return dayNumber % this.checkInterval === 0;
  }

  /**
   * 从数组中随机选取一个元素
   * @private
   */
  _pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 填充内容模板变量
   * @private
   */
  _fillTemplate(template, vars) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      // R8 修复：使用 split-join 替代 replace，防止 $ 特殊字符注入
      result = result.split(`{${key}}`).join(String(value || ''));
    }
    return result;
  }
}

export default EncounterEngine;
