// src/db/migrations/index.js
// 数据库迁移机制，依据功能规划 10.2 节
// 注意：为避免与 AppConfigRepository 的循环依赖，此处直接使用 db 实例操作

// 迁移脚本注册表：key 为目标版本号，value 为迁移函数
// 每个迁移函数把数据库从 上一版本 升级到 当前版本
const migrations = {
  // 版本 1：初始版本（建表已由 SCHEMA_SQL 完成），此处仅写入版本号与初始配置
  1: async (db) => {
    db.run(`INSERT OR IGNORE INTO app_config (key, value) VALUES ('db_version', '1')`)
    db.run(`INSERT OR IGNORE INTO app_config (key, value) VALUES ('onboarding_completed', '0')`)
  },
  // 版本 2：添加 diary_references 字段（日记→故事引用标注）
  2: async (db) => {
    // ALTER TABLE ADD COLUMN 是幂等的（SQLite 不支持 IF NOT EXISTS，用 try-catch 容错）
    try {
      db.run(`ALTER TABLE story_segments ADD COLUMN diary_references TEXT`)
    } catch (e) {
      // 字段已存在则忽略
      if (!String(e.message).includes('duplicate column')) throw e
    }
  },
  // 版本 3：添加 mood 列到 diary_entries（心情数据持久化）
  3: async (db) => {
    try {
      db.run(`ALTER TABLE diary_entries ADD COLUMN mood TEXT DEFAULT NULL`)
    } catch (e) {
      if (!String(e.message).includes('duplicate column')) throw e
    }
  }
  ,
  // 版本 4：剧情图运行时状态与用户命运选择
  4: async (db) => {
    db.run(`CREATE TABLE IF NOT EXISTS narrative_node_state (
      node_id TEXT PRIMARY KEY, world_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      selected_option_id TEXT, selected_option_desc TEXT, selected_effect TEXT,
      selected_day INTEGER, completed_day INTEGER, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_narrative_status ON narrative_node_state(status)`)
  }
}

export async function runMigrations(db) {
  // 直接从 app_config 读取 db_version（避免循环依赖，不经过 AppConfigRepository）
  let currentVersion = 0
  try {
    const stmt = db.prepare('SELECT value FROM app_config WHERE key = ?')
    try {
      stmt.bind(['db_version'])
      if (stmt.step()) {
        const row = stmt.getAsObject()
        currentVersion = row.value ? parseInt(row.value, 10) : 0
      }
    } finally {
      stmt.free()
    }
  } catch (e) {
    // 仅当 app_config 表不存在时才视为新库（currentVersion=0）
    // 其它错误上抛，避免误判导致重复迁移
    if (!String(e.message).includes('no such table')) {
      throw e
    }
    currentVersion = 0
  }

  const targetVersions = Object.keys(migrations).map(Number).sort((a, b) => a - b)

  for (const v of targetVersions) {
    if (v > currentVersion) {
      // 每个迁移用事务包裹，确保多步 DDL 的原子性
      db.run('BEGIN')
      try {
        await migrations[v](db)
        // 直接写入版本号（避免循环依赖）
        db.run(
          `INSERT INTO app_config (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
          ['db_version', String(v)]
        )
        db.run('COMMIT')
        currentVersion = v
      } catch (e) {
        db.run('ROLLBACK')
        throw new Error(`迁移到版本 ${v} 失败: ${e.message}`)
      }
    }
  }
}
