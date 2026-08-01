// src/core/ProgressTracker.js
//
// 进度追踪器：管理故事天数递增、断更检测、完结判定。
// 对应功能规划 8.2 节天数追踪逻辑、8.4 节断更处理、8.6 节故事结局逻辑。
//
// 注意：天数递增在 finalize/saveEdit 中由 StoryEngine 直接调用 userRepo.update 完成，
// ProgressTracker 提供辅助方法用于判断断更和完结状态。

class ProgressTracker {
  /**
   * @param {Object} userRepo - UserRepository 实例（接口 B）
   * @param {Object} diaryRepo - DiaryRepository 实例（接口 B）
   */
  constructor(userRepo, diaryRepo) {
    this.userRepo = userRepo;
    this.diaryRepo = diaryRepo;
  }

  /**
   * 获取下一个待生成的天数
   * 即 current_day + 1（current_day 是已完成的最后一天）
   * @returns {Promise<number>}
   */
  async getNextDay() {
    const user = await this.userRepo.get();
    return (user.current_day || 0) + 1;
  }

  /**
   * 检测断更情况
   * 比较最后一条日记的天数与当前应生成的天数，计算断更天数
   * @param {number} targetDay - 即将生成的天数
   * @returns {Promise<{isBlankDay: boolean, gapDays: number, transitionHint: string}>}
   */
  async detectBlankDay(targetDay) {
    const user = await this.userRepo.get();

    // 获取最后一条日记
    const lastDiary = await this.diaryRepo.getByDay(user.current_day);

    // 计算断更天数：目标天数 - 上次完成天数 - 1
    const gapDays = targetDay - (user.current_day || 0) - 1;

    if (gapDays <= 0) {
      return { isBlankDay: false, gapDays: 0, transitionHint: '' };
    }

    // 断更处理提示（功能规划 8.4）
    let transitionHint = '';
    if (gapDays <= 3) {
      transitionHint = `主角在塔罗会度过了平静的${gapDays}天，自然衔接前后的剧情。`;
    } else {
      transitionHint = `主角在期间似乎错过了某些线索，度过了${gapDays}天的平静时光。`;
    }

    return {
      isBlankDay: true,
      gapDays,
      transitionHint,
    };
  }

  /**
   * 判断故事是否完结
   * @param {number} completedDay - 刚完成的天数
   * @returns {Promise<boolean>}
   */
  async isStoryEnded(completedDay) {
    const user = await this.userRepo.get();
    return completedDay >= (user.duration_days || 90);
  }

  /**
   * 标记故事完结
   * @returns {Promise<boolean>}
   */
  async markStoryEnded() {
    await this.userRepo.update({ story_started: false });
    return true;
  }

  /**
   * 更新当前进度天数
   * @param {number} completedDay - 刚完成的天数
   * @returns {Promise<boolean>}
   */
  async updateProgress(completedDay) {
    await this.userRepo.update({ current_day: completedDay });
    return true;
  }
}

export default ProgressTracker;
