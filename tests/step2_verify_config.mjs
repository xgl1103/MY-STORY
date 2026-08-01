// 联调第2步：验证配置 JSON 数据可加载
// 运行: node tests/step2_verify_config.mjs

import fs from 'fs';
import path from 'path';

const workspace = 'e:\\Code\\手机mystory游戏';
const configDir = path.join(workspace, 'src', 'config', 'worlds', 'lord_of_mysteries');

console.log('=== 第2步：验证配置 JSON 数据 ===\n');

const files = ['world.json', 'paths.json', 'mappings.json', 'outline.json', 'encounters.json', 'settings.json'];
let passed = 0, failed = 0;

for (const file of files) {
  try {
    const filePath = path.join(configDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    
    let count = 0;
    let detail = '';
    
    switch (file) {
      case 'world.json':
        count = data.chapters?.length || 0;
        detail = `世界观=${data.world_name}, 章节数=${count}, 默认途径=${data.default_path}`;
        break;
      case 'paths.json':
        count = data.paths?.length || 0;
        const seer = data.paths?.find(p => p.path_id === 'seer');
        const seerLevels = seer?.levels?.length || 0;
        detail = `途径数=${count}, 占卜家序列数=${seerLevels}, available=${seer?.available}`;
        break;
      case 'mappings.json':
        count = data.mappings?.length || 0;
        const totalKeywords = data.mappings?.reduce((sum, m) => sum + m.keywords.length, 0) || 0;
        detail = `映射规则数=${count}, 关键词总数=${totalKeywords}`;
        break;
      case 'outline.json':
        count = data.outline?.length || 0;
        const types = {};
        data.outline?.forEach(n => { types[n.node_type] = (types[n.node_type] || 0) + 1; });
        detail = `节点数=${count}, 类型分布=${JSON.stringify(types)}`;
        break;
      case 'encounters.json':
        count = data.encounters?.length || 0;
        detail = `奇遇数=${count}`;
        break;
      case 'settings.json':
        count = data.settings?.length || 0;
        const cats = {};
        data.settings?.forEach(s => { cats[s.category] = (cats[s.category] || 0) + 1; });
        detail = `设定条目数=${count}, 分类分布=${JSON.stringify(cats)}`;
        break;
    }
    
    console.log(`  ✓ ${file} — ${detail}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${file} — ${error.message}`);
    failed++;
  }
}

console.log(`\n通过: ${passed}/${files.length}`);

if (failed > 0) {
  console.log('结论: 配置数据存在问题，需修复');
  process.exit(1);
} else {
  console.log('结论: 全部配置 JSON 有效且内容完整');
}
