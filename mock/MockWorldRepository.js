// mock/MockWorldRepository.js
//
// WorldRepository 的 Mock 实现（接口 B）。
// 严格遵循角色分工总览 4.1 节 WorldRepository 接口签名。
// 预置世界观设定、奇遇库、剧情大纲节点、映射规则，数据来源与
// 角色分工总览 5.2 节配置文件格式一致。

class MockWorldRepository {
  constructor() {
    this.settings = [];
    this.encounters = [];
    this.encounterLogs = [];
    this.outlineNodes = [];
    this.mappings = [];
    this._seedTestData();
  }

  _seedTestData() {
    // ===== 世界观设定（对应 settings.json）=====
    this.settings = [
      { id: 1, world_id: 'lord_of_mysteries', category: 'power_system', key: 'sequence_system', value: '22条神之途径，每条途径从序列9到序列0共10个等级。序列9最弱，序列0相当于真神。服用对应魔药可晋升。', keywords: '序列 途径 魔药 晋升 等级', priority: 10 },
      { id: 2, world_id: 'lord_of_mysteries', category: 'power_system', key: 'non_extraordinary', value: '普通人无法感知非凡现象，世界大多数人不了解非凡者的存在。', keywords: '普通人 非凡者 隐藏', priority: 10 },
      { id: 3, world_id: 'lord_of_mysteries', category: 'path', key: 'seer_abilities', value: '占卜家途径序列9能力：灵视（看见灵体和非凡特性）、基础占卜（使用星象、塔罗牌等进行简单预测）、星象观测。', keywords: '占卜家 灵视 占卜 星象 序列9', priority: 10 },
      { id: 4, world_id: 'lord_of_mysteries', category: 'location', key: 'tarot_club', value: '塔罗会是一个秘密的非凡者组织，成员以塔罗牌代号相称，定期举行雾之上的聚会。', keywords: '塔罗会 组织 聚会 秘密', priority: 8 },
      { id: 5, world_id: 'lord_of_mysteries', category: 'character', key: 'mentor_figure', value: '引导主角觉醒的神秘人，身份不明，似乎与塔罗会有某种联系。', keywords: '导师 神秘人 引导 觉醒', priority: 6 },
      { id: 6, world_id: 'lord_of_mysteries', category: 'lore', key: 'above_the_fog', value: '雾之上的空间，非凡者可以通过冥想进入，在其中可以更清晰地感知灵性和进行交流。', keywords: '雾之上 冥想 灵性 空间', priority: 7 },
      { id: 7, world_id: 'lord_of_mysteries', category: 'power_system', key: 'potion_side_effect', value: '服用魔药可能带来精神污染和失控风险，需要通过消化和理解来稳定。', keywords: '魔药 副作用 失控 精神污染', priority: 8 },
    ];

    // ===== 奇遇库（对应 encounters.json）=====
    this.encounters = [
      { encounter_id: 'enc_strange_letter', title: '神秘信件', content_template: '主角在住所发现一封没有署名的信件，信中用隐晦的语言提及了一个与{hero_name}近期占卜相关的预言。信封上印着一个不认识的纹章。', min_chapter: 0, max_chapter: 3, min_path_level: 9, tags: '["悬疑","线索"]' },
      { encounter_id: 'enc_stray_cat', title: '流浪猫的低语', content_template: '一只黑猫突然出现在主角面前，用异常聪慧的眼神注视着{hero_name}。在灵视中，这只猫散发着微弱的非凡气息。', min_chapter: 0, max_chapter: 5, min_path_level: 9, tags: '["日常","灵异"]' },
      { encounter_id: 'enc_old_bookshop', title: '旧书店奇遇', content_template: '主角路过一家从未注意过的旧书店，店内一本古书自行翻开，页面上的文字似乎是某种古代语言的占卜记录。', min_chapter: 1, max_chapter: 4, min_path_level: 9, tags: '["探索","线索"]' },
    ];

    // ===== 剧情大纲节点（对应 outline.json）=====
    // 注意：节点需带 chapter_number 字段，getOutlineNodes 据此过滤
    this.outlineNodes = [
      { node_id: 'ch0_awakening', chapter_number: 0, node_type: 'mainline', trigger_day: 1, content: '主角在日常生活中偶然接触到非凡现象，被一位神秘人引导觉醒为占卜家途径序列9。', prerequisites: '[]', branch_options: '[]' },
      { node_id: 'ch0_first_divination', chapter_number: 0, node_type: 'mainline', trigger_day: 3, content: '主角第一次成功进行占卜，获得关于自身命运的第一条线索。', prerequisites: '["ch0_awakening"]', branch_options: '[]' },
      { node_id: 'ch1_tarot_club', chapter_number: 1, node_type: 'mainline', trigger_day: 8, content: '主角被邀请加入一个秘密的塔罗会组织，结识其他非凡者。', prerequisites: '["ch0_first_divination"]', branch_options: '[{"id":"ch1_join_mage","desc":"选择与法师成员合作","effect":"获得魔法知识线索"},{"id":"ch1_join_spy","desc":"选择与间谍成员合作","effect":"获得情报网络线索"}]' },
    ];

    // ===== 映射规则（对应 mappings.json）=====
    this.mappings = [
      { behavior: '学习', world_behavior: '研读神秘学典籍', keywords: ['学习', '看书', '上课', '读书', '复习', '写作业', '听课', '研究'], description: '将学习行为映射为研读神秘学相关书籍或向导师求教' },
      { behavior: '工作', world_behavior: '完成塔罗会委托任务', keywords: ['工作', '上班', '加班', '开会', '写报告', '项目'], description: '将工作行为映射为完成塔罗会或非凡者组织的委托' },
      { behavior: '健身', world_behavior: '体能与战斗训练', keywords: ['健身', '运动', '跑步', '锻炼', '游泳', '打球'], description: '将健身行为映射为保持非凡者身体素质的体能训练' },
      { behavior: '社交', world_behavior: '与塔罗会成员交流情报', keywords: ['社交', '聚会', '聊天', '朋友', '聚餐', '见面'], description: '将社交行为映射为与塔罗会成员或其他非凡者交流情报' },
      { behavior: '休息', world_behavior: '冥想与灵性恢复', keywords: ['休息', '睡觉', '午休', '放松', '发呆'], description: '将休息行为映射为冥想恢复灵性和精神力' },
      { behavior: '娱乐', world_behavior: '探索非凡现象', keywords: ['娱乐', '游戏', '电影', '音乐', '逛街', '旅游'], description: '将娱乐行为映射为探索城市中的神秘事件或非凡现象' },
      { behavior: '其他', world_behavior: '日常琐事', keywords: ['其他', '购物', '做饭', '打扫', '通勤'], description: '将其他日常行为映射为世界观内的日常琐事' },
    ];
  }

  async getSettings(worldId, category) {
    let results = this.settings.filter(s => s.world_id === worldId);
    if (category) {
      results = results.filter(s => s.category === category);
    }
    return results.map(s => JSON.parse(JSON.stringify(s)));
  }

  async searchByKeywords(worldId, keywords, limit = 5) {
    let results = this.settings.filter(s => s.world_id === worldId);

    // 关键词匹配：检查 settings 的 keywords 字段是否包含任一搜索关键词
    results = results.filter(s => {
      if (!s.keywords) return false;
      const settingKeywords = s.keywords.split(' ');
      return keywords.some(kw =>
        settingKeywords.some(sk => sk.includes(kw) || kw.includes(sk))
      );
    });

    // 按 priority 降序排序
    results.sort((a, b) => b.priority - a.priority);

    if (limit) {
      results = results.slice(0, limit);
    }
    return results.map(s => JSON.parse(JSON.stringify(s)));
  }

  async getEncounters(worldId, chapterNumber, pathLevel) {
    const results = this.encounters.filter(e =>
      e.min_chapter <= chapterNumber &&
      e.max_chapter >= chapterNumber &&
      e.min_path_level <= pathLevel
    );
    return results.map(e => JSON.parse(JSON.stringify(e)));
  }

  async getLogEncounterIds() {
    return this.encounterLogs.map(log => log.encounter_id);
  }

  async logEncounter(dayNumber, encounterId, content) {
    this.encounterLogs.push({
      id: this.encounterLogs.length + 1,
      day_number: dayNumber,
      encounter_id: encounterId,
      content,
      created_at: new Date().toISOString(),
    });
    return true;
  }

  async getOutlineNodes(worldId, chapterNumber) {
    // 返回指定章节的大纲节点（按 chapter_number 匹配）
    const results = this.outlineNodes.filter(n =>
      n.chapter_number === chapterNumber
    );
    return results.map(n => JSON.parse(JSON.stringify(n)));
  }

  async getMappings(worldId) {
    return this.mappings.map(m => JSON.parse(JSON.stringify(m)));
  }

  // ===== 测试辅助方法 =====
  clear() {
    this.settings = [];
    this.encounters = [];
    this.encounterLogs = [];
    this.outlineNodes = [];
    this.mappings = [];
  }
}

export default MockWorldRepository;
