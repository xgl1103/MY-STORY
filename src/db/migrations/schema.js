// src/db/migrations/schema.js
// 9 张表完整建表语句，依据功能规划 7.1 节
// 所有语句使用 IF NOT EXISTS，可安全重复执行

export const SCHEMA_SQL = `
-- 1. app_config（应用配置）
CREATE TABLE IF NOT EXISTS app_config (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  value       TEXT,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. user_settings（用户设置，单行表 id 固定为 1）
CREATE TABLE IF NOT EXISTS user_settings (
  id                  INTEGER PRIMARY KEY,
  hero_name           TEXT DEFAULT '你',
  world_id            TEXT DEFAULT 'lord_of_mysteries',
  path_id             TEXT DEFAULT 'seer',
  duration_days       INTEGER DEFAULT 90,
  current_day         INTEGER DEFAULT 0,
  current_chapter     INTEGER DEFAULT 0,
  ai_provider         TEXT DEFAULT 'deepseek',
  ai_base_url         TEXT,
  api_key_encrypted   TEXT,
  ai_temperature      REAL DEFAULT 0.8,
  ai_max_tokens       INTEGER DEFAULT 2000,
  story_started       BOOLEAN DEFAULT 0,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. diary_entries（日记记录）
CREATE TABLE IF NOT EXISTS diary_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day_number    INTEGER NOT NULL,
  raw_text      TEXT NOT NULL,
  behavior_tags TEXT,
  is_blank_day  BOOLEAN DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_diary_day ON diary_entries(day_number);

-- 4. chapters（章节）
CREATE TABLE IF NOT EXISTS chapters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_number INTEGER NOT NULL UNIQUE,
  title         TEXT,
  content       TEXT,
  summary       TEXT,
  start_day     INTEGER NOT NULL,
  end_day       INTEGER NOT NULL,
  status        TEXT DEFAULT 'ongoing',
  heat_level    INTEGER DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at  TIMESTAMP
);

-- 5. story_segments（每日故事段落）
CREATE TABLE IF NOT EXISTS story_segments (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  day_number            INTEGER NOT NULL,
  chapter_id            INTEGER,
  diary_id              INTEGER,
  content               TEXT,
  mapping_desc          TEXT,
  diary_references      TEXT,
  revision_count        INTEGER DEFAULT 0,
  internal_review_count INTEGER DEFAULT 0,
  is_edited             BOOLEAN DEFAULT 0,
  status                TEXT DEFAULT 'pending',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finalized_at          TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id),
  FOREIGN KEY (diary_id) REFERENCES diary_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_segment_day ON story_segments(day_number);
CREATE INDEX IF NOT EXISTS idx_segment_chapter ON story_segments(chapter_id);

-- 6. world_settings（世界观设定档案）
CREATE TABLE IF NOT EXISTS world_settings (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id  TEXT NOT NULL,
  category  TEXT NOT NULL,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  keywords  TEXT,
  priority  INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_world_cat ON world_settings(world_id, category);
CREATE INDEX IF NOT EXISTS idx_world_kw ON world_settings(keywords);

-- 7. encounter_library（随机奇遇库）
CREATE TABLE IF NOT EXISTS encounter_library (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id         TEXT NOT NULL,
  encounter_id     TEXT NOT NULL,
  title            TEXT NOT NULL,
  content_template TEXT NOT NULL,
  min_chapter      INTEGER DEFAULT 0,
  max_chapter      INTEGER DEFAULT 99,
  min_path_level   INTEGER DEFAULT 0,
  tags             TEXT
);

-- 8. encounter_log（奇遇触发记录）
CREATE TABLE IF NOT EXISTS encounter_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day_number    INTEGER NOT NULL,
  encounter_id  TEXT,
  content       TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (encounter_id) REFERENCES encounter_library(encounter_id)
);

-- 9. story_outline（剧情大纲节点）
CREATE TABLE IF NOT EXISTS story_outline (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id        TEXT NOT NULL,
  chapter_number  INTEGER NOT NULL,
  node_id         TEXT NOT NULL,
  node_type       TEXT NOT NULL,
  trigger_day     INTEGER,
  content         TEXT NOT NULL,
  prerequisites   TEXT,
  branch_options  TEXT
);

-- 10. chapter_comments（AI 读者评论，预生成）
CREATE TABLE IF NOT EXISTS chapter_comments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_number   INTEGER NOT NULL,
  paragraph_index  INTEGER NOT NULL,
  persona          TEXT NOT NULL,
  persona_name     TEXT NOT NULL,
  avatar_color     TEXT NOT NULL,
  content          TEXT NOT NULL,
  likes            INTEGER DEFAULT 0,
  reveal_at        INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comment_chapter ON chapter_comments(chapter_number);

-- 11. entity_state（实体记忆：角色/物品/地点状态追踪）
CREATE TABLE IF NOT EXISTS entity_state (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL,           -- character / item / location
  entity_name  TEXT NOT NULL,
  description  TEXT,                    -- 外貌、能力、用途等
  status       TEXT DEFAULT 'active',   -- active / mentioned / resolved / lost
  first_day    INTEGER,                 -- 首次出现的天数
  last_day     INTEGER,                 -- 最近出现的天数
  relations    TEXT,                    -- JSON: 与其他实体的关系
  notes        TEXT,                    -- 额外备注
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_name)
);

-- 12. foreshadowing（伏笔池：未解伏笔追踪）
CREATE TABLE IF NOT EXISTS foreshadowing (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  planted_day    INTEGER NOT NULL,       -- 埋设伏笔的天数
  planted_chapter INTEGER,               -- 埋设章节号
  description    TEXT NOT NULL,           -- 伏笔内容描述
  priority       TEXT DEFAULT 'normal',   -- high / normal / low
  status         TEXT DEFAULT 'unresolved', -- unresolved / resolved / abandoned
  resolved_day   INTEGER,                -- 回收伏笔的天数
  resolved_chapter INTEGER,
  resolution     TEXT,                   -- 回收方式描述
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_foreshadow_status ON foreshadowing(status);

-- 13. story_fts（FTS5 全文索引虚拟表，用于动态 RAG 检索）
-- 使用 trigram tokenizer 支持中文（3-gram 分词，无需外部分词器）
-- 如果 sql.js 不支持 FTS5，创建会失败但不影响其他表
CREATE VIRTUAL TABLE IF NOT EXISTS story_fts USING fts5(
  segment_id UNINDEXED,
  story_day UNINDEXED,
  chapter_id UNINDEXED,
  content,
  tokenize = 'trigram'
);

-- 同步触发器：story_segments 插入/更新时自动同步到 FTS 索引
-- 注意：触发器在 Database.js 中条件创建——仅当 FTS5 表实际存在时才创建
-- 避免在 sql.js（无 FTS5 模块）中创建引用不存在表的触发器

-- 初始化单行用户设置（首次建表时插入默认行）
INSERT OR IGNORE INTO user_settings (id) VALUES (1);
`
