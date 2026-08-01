# My Story — 前端工程师开发指南

> 版本：v1.0  
> 日期：2026-07-06  
> 依赖文档：`MyStory-功能规划文档.md`（以下简称"功能规划"）、`MyStory-角色分工总览.md`（以下简称"角色分工"）  
> 适用对象：前端工程师  
> 说明：本文档是前端工程师的完整开发手册，覆盖项目搭建、数据层、页面、组件、Mock、打包与开发计划。所有 SQL 建表语句、Repository 方法签名均与上游文档保持一致，工程师可照此直接编码。

---

## 目录

1. [角色职责边界](#一角色职责边界)
2. [技术栈说明](#二技术栈说明)
3. [项目搭建步骤](#三项目搭建步骤)
4. [数据层实现指南](#四数据层实现指南)
5. [页面开发指南](#五页面开发指南)
6. [通用组件](#六通用组件)
7. [StoryEngine Mock 实现](#七storyengine-mock-实现)
8. [打包指南](#八打包指南)
9. [开发计划](#九开发计划)

---

## 一、角色职责边界

### 1.1 前端工程师"主责"清单

依据角色分工 1.1 节，前端工程师对以下职责域负全责：

| 职责域 | 具体内容 |
|--------|---------|
| 页面 UI 与交互 | 9 个页面的视图、样式、交互逻辑、动画反馈 |
| 路由与导航 | vue-router 配置、导航守卫、首次使用跳引导页 |
| SQLite 数据层 | sql.js 初始化、9 张表建表、数据库迁移、6 个 Repository 实现、数据导出/导入 |
| 配置加载 | 从 `src/config/worlds/{world_id}/` 加载 6 个 JSON 配置文件并写入数据库 |
| Capacitor 打包 | Capacitor 初始化、Android/iOS 平台添加、构建配置、真机打包 |
| 通用组件 | LoadingSpinner、ChapterList、BehaviorTags、VoiceInput、ErrorToast |
| Mock 交付 | MockStoryEngine（供前端开发期独立使用）、真实 Repository 实现（供 AI 工程师联调） |

### 1.2 前端工程师"不做"清单

依据角色分工 1.2 节，以下内容**严禁越界**：

- **不写 Prompt 模板**：所有 Prompt 文本由 AI 工程师编写（功能规划第九章）
- **不实现 AI 调用逻辑**：AI 适配器、审查循环、三层记忆、故事引擎总调度均为 AI 工程师职责
- **不编写剧情内容**：剧情大纲、映射规则表、世界观资料、奇遇库由内容创作者产出
- **不直接调用 AI HTTP API**：前端只通过 `StoryEngine` 接口（接口 A）与 AI 层通信

### 1.3 与 AI 工程师的协作关系

前端与 AI 工程师通过两个接口解耦协作（角色分工第二章）：

```
┌────────────┐  接口A: StoryEngine API   ┌────────────┐
│ 前端工程师  │ ───────────────────────→ │ AI 工程师   │
│            │ ←─────────────────────── │            │
└────────────┘  接口B: Repository API    └────────────┘
       │                                    │
       │ 前端调用 AI 实现的 StoryEngine       │ AI 调用前端实现的 Repository
       │ (generateStory/regenerate/         │ (User/Diary/Chapter/Segment/
       │  finalize/saveEdit/getStatus)      │  World/AppConfig)
```

**协作要点**：

1. **接口 A（StoryEngine API）**：前端调用、AI 实现。方法签名见角色分工 3.1 节，前端**必须**严格按此签名调用，不得自行改动参数或返回值结构。开发期前端使用 `MockStoryEngine`（本文档第七章）独立开发。
2. **接口 B（Repository API）**：AI 调用、前端实现。6 个 Repository 的方法签名见角色分工 4.1 节，前端**必须**完全照此实现，本文档第四章给出实现规范。开发期 AI 工程师使用 `MockRepositories` 独立开发。
3. **接口变更**：任何一方修改接口须通知另一方，并在 `MyStory-角色分工总览.md` 变更日志登记（角色分工第七章）。
4. **联调阶段**：阶段 3 时，前端将 `MockStoryEngine` 替换为真实 `StoryEngine`，AI 将 `MockRepository` 替换为真实 `Repository`，双方都无需改动业务代码。

### 1.4 与内容创作者的协作关系

前端与内容创作者通过**接口 C（配置数据格式）**协作（角色分工第五章）：

- 内容创作者产出 6 个 JSON 配置文件，放入 `src/config/worlds/lord_of_mysteries/` 目录
- 前端负责编写**配置加载器**（本文档第 4.5 节），首次启动时将这些 JSON 读入数据库的 `world_settings`、`encounter_library`、`story_outline` 表
- 前端需按角色分工 5.2 节定义的 JSON Schema 校验文件格式，格式不符时抛出明确错误
- 配置文件的内容（剧情、映射、设定）由内容创作者维护，前端只负责加载与存储，不修改其内容语义

---

## 二、技术栈说明

### 2.1 核心技术栈

| 层级 | 技术 | 版本要求 | 用途 |
|------|------|---------|------|
| 框架 | Vue 3 | ^3.4.x（Composition API） | 组件化 UI、响应式状态 |
| 构建工具 | Vite | ^5.x | 开发服务器、生产构建 |
| 路由 | vue-router | ^4.x | SPA 路由、导航守卫 |
| 状态管理 | Pinia | ^2.x（可选） | 跨页面共享状态（用户设置、生成状态） |
| 本地数据库 | sql.js | ^1.10.x | 浏览器内 SQLite（WASM） |
| 持久化 | @capacitor/filesystem | ^6.x | sql.js 数据库文件读写 |
| 打包壳 | @capacitor/core + @capacitor/cli | ^6.x | Web → 原生 App |
| 平台 | @capacitor/android, @capacitor/ios | ^6.x | Android/iOS 平台 |
| 语音 | @capacitor-community/speech-recognition | ^6.x | 原生语音识别（Web Speech API 不支持时降级） |
| 加密 | Web Crypto API（内置） | — | AES-GCM 加密 API Key |

> 说明：Capacitor 6.x 要求 Node ≥ 18。vue-router 与 Pinia 主版本须与 Vue 3 对齐。

### 2.2 关键依赖清单（package.json 节选）

```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.0",
    "sql.js": "^1.10.0",
    "@capacitor/core": "^6.0.0",
    "@capacitor/filesystem": "^6.0.0",
    "@capacitor/app": "^6.0.0",
    "@capacitor/preferences": "^6.0.0",
    "@capacitor-community/speech-recognition": "^6.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.2.0",
    "@capacitor/cli": "^6.0.0"
  }
}
```

### 2.3 技术选型理由（摘要）

- **sql.js**：功能规划 10.1 节指定，全部数据本地化、无服务器，90 天数据 < 50MB，性能足够
- **Capacitor**：功能规划 3.3 节首选，原生插件生态优于 HBuilderX
- **Web Crypto API**：功能规划 10.3 节指定 AES-GCM 加密 API Key，浏览器内置无需额外依赖
- **Web Speech API / Capacitor 语音插件**：功能规划 10.5 节，优先 Web Speech API，App 内降级到原生插件

---

## 三、项目搭建步骤

### 3.1 Vite + Vue 3 项目初始化

```bash
# 1. 使用 Vite 脚手架创建项目（在项目根目录执行）
npm create vite@latest mystory -- --template vue

# 2. 进入项目目录
cd mystory

# 3. 安装基础依赖
npm install
```

### 3.2 依赖安装清单

```bash
# 路由与状态管理
npm install vue-router@^4 pinia@^2

# 本地数据库
npm install sql.js@^1.10

# Capacitor 核心
npm install @capacitor/core@^6 @capacitor/cli@^6 --save
npm install @capacitor/app@^6 @capacitor/filesystem@^6 @capacitor/preferences@^6

# 语音识别插件
npm install @capacitor-community/speech-recognition@^6

# 开发依赖（Vite Vue 插件通常脚手架已装）
npm install -D @vitejs/plugin-vue@^5 vite@^5
```

### 3.3 sql.js 集成

sql.js 需要加载 WASM 文件，必须配置 Vite 让 WASM 可被正确访问。

**步骤 1：复制 WASM 文件到 public 目录**

```bash
# 从 node_modules 复制 sql-wasm.wasm 到 public 目录
cp node_modules/sql.js/dist/sql-wasm.wasm public/
```

**步骤 2：vite.config.js 配置**

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // sql.js 的 WASM 通过 locateFile 指向 public 目录
  // 生产构建时 base 设为相对路径，便于 Capacitor 加载
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2018',
    // sql.js 较大，提高 chunk 警告阈值
    chunkSizeWarningLimit: 1500
  },
  optimizeDeps: {
    exclude: ['sql.js']
  }
})
```

**步骤 3：封装 Database.js 加载逻辑**（完整实现见第 4.1 节）

```javascript
// src/db/Database.js 核心加载逻辑骨架
import initSqlJS from 'sql.js'

let SQL = null
let db = null

export async function initDatabase() {
  if (!SQL) {
    // locateFile 告诉 sql.js 从哪里加载 wasm
    SQL = await initSqlJS({ locateFile: f => `./${f}` })
  }
  // 优先从持久化文件加载已有数据库，否则新建
  // 详见第 4.1 节完整实现
}
```

### 3.4 Capacitor 初始化和配置

```bash
# 1. 初始化 Capacitor
npx cap init "My Story" "com.mystory.app" --web-dir=dist

# 2. 构建前端产物
npm run build

# 3. 添加 Android 平台
npx cap add android

# 4. 添加 iOS 平台（需 macOS + Xcode）
npx cap add ios

# 5. 同步资源到原生项目
npx cap sync
```

**capacitor.config.json 配置**（打包章节详述）：

```json
{
  "appId": "com.mystory.app",
  "appName": "My Story",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  },
  "android": {
    "allowMixedContent": false
  },
  "ios": {
    "contentInset": "always"
  }
}
```

### 3.5 目录结构核对

搭建完成后，目录应与功能规划第十四章一致（前端工程师负责的部分）：

```
mystory/
├── index.html
├── capacitor.config.json
├── package.json
├── vite.config.js
├── public/
│   └── sql-wasm.wasm                 # sql.js WASM 文件
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/index.js
│   ├── views/                        # 9 个页面
│   ├── components/                   # 5 个通用组件
│   ├── core/                         # StoryEngine Mock（前端实现 Mock）
│   │   └── MockStoryEngine.js
│   ├── db/                           # 数据层（前端主责）
│   │   ├── Database.js
│   │   ├── migrations/
│   │   ├── repositories/
│   │   └── DataExporter.js
│   ├── config/worlds/lord_of_mysteries/  # 配置 JSON（内容创作者产出）
│   ├── utils/
│   └── assets/
└── android/                          # Capacitor 生成
└── ios/                              # Capacitor 生成
```

> 注意：`src/core/` 下的 `StoryEngine.js`、`src/ai/`、`src/memory/` 由 AI 工程师负责，前端不要创建这些文件的真实实现，只创建 `MockStoryEngine.js`。

---

## 四、数据层实现指南

数据层是前端工程师的核心交付物之一，是 AI 工程师通过接口 B 访问数据的唯一通道（角色分工第二章）。本节给出 sql.js 初始化、9 张表完整建表语句、迁移机制、6 个 Repository 的实现规范、配置文件加载器。

### 4.1 SQLite 数据库初始化（Database.js）

Database.js 负责：加载 sql.js WASM → 从持久化文件加载数据库（或新建）→ 执行建表与迁移 → 提供查询接口与写回机制。

**完整实现规范**：

```javascript
// src/db/Database.js
import initSqlJS from 'sql.js'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { SCHEMA_SQL } from './migrations/schema'
import { runMigrations } from './migrations/index'

const DB_FILE = 'mystory.db'
let SQL = null
let db = null
let writeCounter = 0

// 统一的 db 句柄获取入口（Repository 通过此函数拿到 db）
export function getDB() {
  if (!db) throw new Error('E008: 数据库未初始化，请先调用 initDatabase()')
  return db
}

// 应用启动时调用
export async function initDatabase() {
  if (db) return db

  // 1. 加载 sql.js WASM
  if (!SQL) {
    SQL = await initSqlJS({ locateFile: f => `./${f}` })
  }

  // 2. 尝试从持久化文件加载已有数据库
  const fileData = await readDbFile()
  if (fileData) {
    db = new SQL.Database(fileData)
  } else {
    db = new SQL.Database()
  }

  // 3. 执行建表（CREATE TABLE IF NOT EXISTS，可重复执行）
  db.run(SCHEMA_SQL)

  // 4. 执行迁移（见 4.3 节）
  await runMigrations(db)

  // 5. 写回一次，确保新库落盘
  await persist()
  return db
}

// 从 Capacitor Filesystem 读取数据库文件，返回 Uint8Array；不存在返回 null
async function readDbFile() {
  try {
    const res = await Filesystem.readFile({
      path: DB_FILE,
      directory: Directory.Data
    })
    // res.data 是 base64 字符串
    const base64 = res.data
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch (e) {
    // 文件不存在时返回 null，触发新建
    return null
  }
}

// 把内存数据库写回文件
export async function persist() {
  if (!db) return
  const data = db.export() // Uint8Array
  // 转 base64
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk))
  }
  const base64 = btoa(binary)
  await Filesystem.writeFile({
    path: DB_FILE,
    data: base64,
    directory: Directory.Data,
    recursive: true
  })
}

// 写回策略（功能规划 10.1 节）：
// - finalized 状态变更后立即写回
// - 其他操作每 5 次写回一次
// Repository 在写操作后调用 markWrite()，由调用方决定是否 force
export async function markWrite(force = false) {
  writeCounter++
  if (force || writeCounter >= 5) {
    await persist()
    writeCounter = 0
  }
}

// 执行查询，返回对象数组（自动按列名映射）
export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

// 执行单行查询，返回对象或 null
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params)
  return rows[0] || null
}

// 执行写操作（INSERT/UPDATE/DELETE），返回受影响行数
export function execute(sql, params = []) {
  db.run(sql, params)
  return db.getRowsModified()
}
```

**关键说明**：

- `getDB()` 是所有 Repository 拿到 db 句柄的唯一入口
- `queryAll / queryOne / execute` 是三个基础工具函数，Repository 内部统一调用，避免每个 Repository 重复处理 `prepare/bind/step/free`
- 写回策略严格遵循功能规划 10.1：`markWrite(true)` 在段落 finalized 后强制写回，其他写操作用 `markWrite()` 累计 5 次写回

### 4.2 完整建表 SQL（schema.js）

依据功能规划 7.1 节，9 张表的完整建表语句如下。所有语句使用 `IF NOT EXISTS`，可安全重复执行。

```javascript
// src/db/migrations/schema.js
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

-- 初始化单行用户设置（首次建表时插入默认行）
INSERT OR IGNORE INTO user_settings (id) VALUES (1);
`;
```

**字段与功能规划 7.1 节一一对应**，索引定义也已内联。`user_settings` 表通过 `INSERT OR IGNORE` 保证始终存在 id=1 的默认行。

### 4.3 数据库迁移机制实现

依据功能规划 10.2 节：`app_config` 中记录 `db_version`，每次启动检查版本号并执行迁移脚本。

```javascript
// src/db/migrations/index.js
import { AppConfigRepository } from '../repositories/AppConfigRepository'

// 迁移脚本注册表：key 为目标版本号，value 为迁移函数
// 每个迁移函数把数据库从 上一版本 升级到 当前版本
const migrations = {
  // 版本 1：初始版本（建表已由 SCHEMA_SQL 完成），此处仅写入版本号
  1: async (db) => {
    // 首次启动写入默认配置
    db.run(`INSERT OR IGNORE INTO app_config (key, value) VALUES ('db_version', '1')`)
    db.run(`INSERT OR IGNORE INTO app_config (key, value) VALUES ('onboarding_completed', '0')`)
  },
  // 示例：未来新增字段时的迁移
  // 2: async (db) => {
  //   db.run('ALTER TABLE user_settings ADD COLUMN new_field TEXT')
  // }
}

export async function runMigrations(db) {
  const repo = AppConfigRepository
  const currentVersionStr = await repo.get('db_version')
  let currentVersion = currentVersionStr ? parseInt(currentVersionStr, 10) : 0

  const targetVersions = Object.keys(migrations).map(Number).sort((a, b) => a - b)

  for (const v of targetVersions) {
    if (v > currentVersion) {
      await migrations[v](db)
      await repo.set('db_version', String(v))
      currentVersion = v
    }
  }
}
```

**迁移规范**：

1. 迁移脚本必须**幂等**（重复执行不报错），用 `IF NOT EXISTS` / `OR IGNORE` 保护
2. 迁移按版本号严格递增执行，不可跳过
3. 每完成一个版本迁移立即更新 `app_config.db_version`，防止中途失败导致版本混乱
4. 新增迁移脚本时，在 `migrations` 对象中追加新版本号即可，无需改动主流程

### 4.4 Repository 实现规范（6 个）

> 以下每个 Repository 的方法签名**严格遵循角色分工 4.1 节接口 B 定义**，前端工程师不得增删改方法签名。实现内部可自由组织。

所有 Repository 共享 4.1 节定义的 `queryAll / queryOne / execute / markWrite` 工具函数。下文给出每个 Repository 的接口签名（与角色分工完全一致）+ 关键实现说明。

#### 4.4.1 UserRepository

```typescript
// 接口签名（角色分工 4.1，须完全一致）
interface UserRepository {
  get(): Promise<UserSettings>;
  update(fields: Partial<UserSettings>): Promise<boolean>;
}

interface UserSettings {
  id: number;
  hero_name: string;
  world_id: string;
  path_id: string;
  duration_days: number;
  current_day: number;
  current_chapter: number;
  ai_provider: string;
  ai_base_url: string | null;
  api_key_encrypted: string;
  ai_temperature: number;
  ai_max_tokens: number;
  story_started: boolean;
}
```

```javascript
// src/db/repositories/UserRepository.js
import { queryOne, execute, markWrite } from '../Database'

export const UserRepository = {
  // 读取单行用户设置（id 固定为 1）
  async get() {
    const row = queryOne('SELECT * FROM user_settings WHERE id = 1')
    if (!row) throw new Error('E008: user_settings 默认行缺失')
    // sql.js 返回的 BOOLEAN 是 0/1，转成 JS boolean
    return {
      ...row,
      story_started: !!row.story_started
    }
  },

  // 部分字段更新，仅更新传入的字段
  async update(fields) {
    const allowed = [
      'hero_name', 'world_id', 'path_id', 'duration_days',
      'current_day', 'current_chapter', 'ai_provider', 'ai_base_url',
      'api_key_encrypted', 'ai_temperature', 'ai_max_tokens', 'story_started'
    ]
    const keys = Object.keys(fields).filter(k => allowed.includes(k))
    if (keys.length === 0) return false
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    const params = keys.map(k => fields[k])
    execute(`UPDATE user_settings SET ${setClause} WHERE id = 1`, params)
    await markWrite()
    return true
  }
}
```

**实现要点**：

- `get()` 永远返回 id=1 的行；建表时已用 `INSERT OR IGNORE` 保证该行存在
- `update()` 用白名单过滤字段，防止 SQL 注入和误更新 `id`、`created_at`
- `story_started` 在 DB 中存 0/1，出库时转 boolean；入库时 sql.js 自动处理

#### 4.4.2 DiaryRepository

```typescript
// 接口签名（角色分工 4.1，须完全一致）
interface DiaryRepository {
  create(data: {
    day_number: number;
    raw_text: string;
    behavior_tags: string[];
    is_blank_day?: boolean;
  }): Promise<number>;  // 返回 id

  getByDay(dayNumber: number): Promise<DiaryEntry | null>;
  getByRange(startDay: number, endDay: number): Promise<DiaryEntry[]>;
  update(id: number, fields: Partial<DiaryEntry>): Promise<boolean>;
}

interface DiaryEntry {
  id: number;
  day_number: number;
  raw_text: string;
  behavior_tags: string;  // JSON 字符串
  is_blank_day: boolean;
  created_at: string;
}
```

```javascript
// src/db/repositories/DiaryRepository.js
import { queryOne, queryAll, execute, markWrite } from '../Database'

export const DiaryRepository = {
  // behavior_tags 数组在入库时序列化为 JSON 字符串
  async create(data) {
    const tagsJson = JSON.stringify(data.behavior_tags || [])
    execute(
      `INSERT INTO diary_entries (day_number, raw_text, behavior_tags, is_blank_day)
       VALUES (?, ?, ?, ?)`,
      [data.day_number, data.raw_text, tagsJson, data.is_blank_day ? 1 : 0]
    )
    await markWrite()
    return db_lastInsertRowId()
  },

  async getByDay(dayNumber) {
    const row = queryOne('SELECT * FROM diary_entries WHERE day_number = ?', [dayNumber])
    return row ? normalize(row) : null
  },

  async getByRange(startDay, endDay) {
    const rows = queryAll(
      'SELECT * FROM diary_entries WHERE day_number BETWEEN ? AND ? ORDER BY day_number',
      [startDay, endDay]
    )
    return rows.map(normalize)
  },

  async update(id, fields) {
    const allowed = ['raw_text', 'behavior_tags', 'is_blank_day']
    const keys = Object.keys(fields).filter(k => allowed.includes(k))
    if (keys.length === 0) return false
    // behavior_tags 若为数组则序列化
    const params = keys.map(k =>
      k === 'behavior_tags' && Array.isArray(fields[k])
        ? JSON.stringify(fields[k])
        : (k === 'is_blank_day' ? (fields[k] ? 1 : 0) : fields[k])
    )
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    execute(`UPDATE diary_entries SET ${setClause} WHERE id = ?`, [...params, id])
    await markWrite()
    return true
  }
}

// 取最后插入的自增 ID
function db_lastInsertRowId() {
  const row = queryOne('SELECT last_insert_rowid() AS id')
  return row ? row.id : 0
}

// 出库时把 behavior_tags 解析回数组（接口要求返回 JSON 字符串，这里保持字符串，
// 由调用方按需 JSON.parse；is_blank_day 转 boolean）
function normalize(row) {
  return {
    ...row,
    is_blank_day: !!row.is_blank_day
  }
}
```

**实现要点**：

- `behavior_tags` 在数据库中存 JSON 字符串（与功能规划 7.1 一致）；接口返回类型 `DiaryEntry.behavior_tags` 也是字符串，调用方（AI 层）自行 parse
- `create()` 返回新插入记录的自增 ID，用 `last_insert_rowid()` 获取

#### 4.4.3 ChapterRepository

```typescript
// 接口签名（角色分工 4.1，须完全一致）
interface ChapterRepository {
  getByNumber(chapterNumber: number): Promise<Chapter | null>;
  getCurrent(): Promise<Chapter | null>;
  getAll(): Promise<Chapter[]>;
  create(data: Partial<Chapter>): Promise<number>;
  update(id: number, fields: Partial<Chapter>): Promise<boolean>;
  updateContent(chapterId: number, content: string): Promise<boolean>;
  updateSummary(chapterId: number, summary: string): Promise<boolean>;
}

interface Chapter {
  id: number;
  chapter_number: number;
  title: string;
  content: string;
  summary: string;
  start_day: number;
  end_day: number;
  status: 'ongoing' | 'completed';
  created_at: string;
  completed_at: string | null;
}
```

```javascript
// src/db/repositories/ChapterRepository.js
import { queryOne, queryAll, execute, markWrite } from '../Database'

export const ChapterRepository = {
  async getByNumber(chapterNumber) {
    return queryOne('SELECT * FROM chapters WHERE chapter_number = ?', [chapterNumber])
  },

  // 当前章节 = user_settings.current_chapter 对应的章节
  async getCurrent() {
    const row = queryOne(
      `SELECT c.* FROM chapters c
       JOIN user_settings u ON u.id = 1
       WHERE c.chapter_number = u.current_chapter`
    )
    return row || null
  },

  async getAll() {
    return queryAll('SELECT * FROM chapters ORDER BY chapter_number')
  },

  async create(data) {
    execute(
      `INSERT INTO chapters (chapter_number, title, content, summary,
        start_day, end_day, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.chapter_number, data.title, data.content, data.summary,
        data.start_day, data.end_day, data.status || 'ongoing'
      ]
    )
    await markWrite()
    const row = queryOne('SELECT last_insert_rowid() AS id')
    return row ? row.id : 0
  },

  async update(id, fields) {
    const allowed = ['title', 'content', 'summary', 'start_day', 'end_day',
                     'status', 'completed_at']
    const keys = Object.keys(fields).filter(k => allowed.includes(k))
    if (keys.length === 0) return false
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    const params = keys.map(k => fields[k])
    execute(`UPDATE chapters SET ${setClause} WHERE id = ?`, [...params, id])
    await markWrite()
    return true
  },

  // 追加段落内容到章节（每段定稿后拼接），用 COALESCE 处理 NULL
  async updateContent(chapterId, content) {
    execute(
      `UPDATE chapters SET content = COALESCE(content, '') || ? WHERE id = ?`,
      [content, chapterId]
    )
    await markWrite()
    return true
  },

  async updateSummary(chapterId, summary) {
    execute(`UPDATE chapters SET summary = ?, completed_at = CURRENT_TIMESTAMP,
             status = 'completed' WHERE id = ?`, [summary, chapterId])
    await markWrite(true) // 章节完成，强制写回
    return true
  }
}
```

**实现要点**：

- `updateContent()` 采用**追加拼接**策略：每段故事定稿后把段落内容追加到 `chapters.content`，最终形成完整章节正文（功能规划 7.1：content 为"所有段落拼接"）
- `updateSummary()` 同时把 `status` 置为 `completed`、写入 `completed_at`，对应章节边界检测流程（功能规划 8.3 节），因此强制写回

#### 4.4.4 SegmentRepository

```typescript
// 接口签名（角色分工 4.1，须完全一致）
interface SegmentRepository {
  create(data: {
    day_number: number;
    chapter_id: number;
    diary_id: number;
    status?: string;
  }): Promise<number>;

  getById(id: number): Promise<Segment | null>;
  getByDay(dayNumber: number): Promise<Segment | null>;
  getRecent(days: number): Promise<Segment[]>;  // 最近 N 天已定稿段落
  getByChapter(chapterId: number): Promise<Segment[]>;

  updateContent(id: number, content: string): Promise<boolean>;
  updateStatus(id: number, status: string): Promise<boolean>;
  updateMapping(id: number, mappingDesc: string): Promise<boolean>;
  incrementRevision(id: number): Promise<boolean>;
  markEdited(id: number): Promise<boolean>;
  markFinalized(id: number): Promise<boolean>;
}

interface Segment {
  id: number;
  day_number: number;
  chapter_id: number;
  diary_id: number;
  content: string;
  mapping_desc: string;
  revision_count: number;
  internal_review_count: number;
  is_edited: boolean;
  status: string;
  created_at: string;
  finalized_at: string | null;
}
```

```javascript
// src/db/repositories/SegmentRepository.js
import { queryOne, queryAll, execute, markWrite } from '../Database'

// 段落状态机（功能规划 5.2 节）合法值
const VALID_STATUS = [
  'pending', 'parsing', 'generating', 'draft_ready',
  'regenerating', 'editing', 'finalized', 'generate_failed'
]

export const SegmentRepository = {
  async create(data) {
    execute(
      `INSERT INTO story_segments (day_number, chapter_id, diary_id, status)
       VALUES (?, ?, ?, ?)`,
      [data.day_number, data.chapter_id, data.diary_id, data.status || 'pending']
    )
    await markWrite()
    const row = queryOne('SELECT last_insert_rowid() AS id')
    return row ? row.id : 0
  },

  async getById(id) {
    const row = queryOne('SELECT * FROM story_segments WHERE id = ?', [id])
    return row ? normalize(row) : null
  },

  async getByDay(dayNumber) {
    const row = queryOne(
      `SELECT * FROM story_segments WHERE day_number = ?
       ORDER BY id DESC LIMIT 1`, [dayNumber]
    )
    return row ? normalize(row) : null
  },

  // 最近 N 天已定稿段落（即时上下文用，功能规划 5.5 第一层）
  // 取最近 N 条 finalized，按 day_number 正序返回
  async getRecent(days) {
    const rows = queryAll(
      `SELECT * FROM story_segments
       WHERE status = 'finalized'
       ORDER BY id DESC LIMIT ?`,
      [days]
    )
    return rows.reverse().map(normalize)
  },

  async getByChapter(chapterId) {
    const rows = queryAll(
      `SELECT * FROM story_segments WHERE chapter_id = ? ORDER BY day_number`,
      [chapterId]
    )
    return rows.map(normalize)
  },

  async updateContent(id, content) {
    execute(`UPDATE story_segments SET content = ? WHERE id = ?`, [content, id])
    await markWrite()
    return true
  },

  async updateStatus(id, status) {
    if (!VALID_STATUS.includes(status)) {
      throw new Error(`无效段落状态: ${status}`)
    }
    execute(`UPDATE story_segments SET status = ? WHERE id = ?`, [status, id])
    await markWrite()
    return true
  },

  async updateMapping(id, mappingDesc) {
    execute(`UPDATE story_segments SET mapping_desc = ? WHERE id = ?`, [mappingDesc, id])
    await markWrite()
    return true
  },

  // 用户重生成次数 +1（功能规划 5.3 节，最多 3 次）
  async incrementRevision(id) {
    execute(
      `UPDATE story_segments SET revision_count = revision_count + 1 WHERE id = ?`,
      [id]
    )
    await markWrite()
    return true
  },

  async markEdited(id) {
    execute(`UPDATE story_segments SET is_edited = 1 WHERE id = ?`, [id])
    await markWrite()
    return true
  },

  // 定稿：状态置 finalized + 写入 finalized_at，强制落盘（功能规划 10.1）
  async markFinalized(id) {
    execute(
      `UPDATE story_segments SET status = 'finalized', finalized_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [id]
    )
    await markWrite(true)
    return true
  }
}

function normalize(row) {
  return { ...row, is_edited: !!row.is_edited }
}
```

**实现要点**：

- `updateStatus()` 内置状态机校验，防止写入非法状态（功能规划 5.2 节 8 个状态）
- `getRecent()` 返回最近 N 条 `finalized` 段落，是 AI 层即时上下文提供器的数据源（功能规划 5.5 第一层，近 3 天原文）
- `markFinalized()` 强制写回，满足"finalized 状态变更后立即写回"的策略

#### 4.4.5 WorldRepository

```typescript
// 接口签名（角色分工 4.1，须完全一致）
interface WorldRepository {
  getSettings(worldId: string, category?: string): Promise<WorldSetting[]>;
  searchByKeywords(worldId: string, keywords: string[], limit?: number): Promise<WorldSetting[]>;
  getEncounters(worldId: string, chapterNumber: number, pathLevel: number): Promise<Encounter[]>;
  getLogEncounterIds(): Promise<string[]>;  // 已触发的奇遇 ID
  logEncounter(dayNumber: number, encounterId: string, content: string): Promise<boolean>;
  getOutlineNodes(worldId: string, chapterNumber: number): Promise<OutlineNode[]>;
  getMappings(worldId: string): Promise<MappingRule[]>;
}

interface WorldSetting {
  id: number; world_id: string; category: string; key: string;
  value: string; keywords: string; priority: number;
}

interface Encounter {
  encounter_id: string; title: string; content_template: string;
  min_chapter: number; max_chapter: number; tags: string;
}

interface OutlineNode {
  node_id: string; node_type: string; trigger_day: number | null;
  content: string; prerequisites: string; branch_options: string;
}

interface MappingRule {
  behavior: string; world_behavior: string;
  keywords: string[]; description: string;
}
```

```javascript
// src/db/repositories/WorldRepository.js
import { queryAll, queryOne, execute, markWrite } from '../Database'

export const WorldRepository = {
  // 按 world_id（+可选 category）查询设定档案
  async getSettings(worldId, category) {
    const sql = category
      ? `SELECT * FROM world_settings WHERE world_id = ? AND category = ? ORDER BY priority DESC`
      : `SELECT * FROM world_settings WHERE world_id = ? ORDER BY priority DESC`
    return queryAll(sql, category ? [worldId, category] : [worldId])
  },

  // 关键词检索（RAG 第三层档案记忆，功能规划 5.5）
  // keywords 数组在 keywords 字段（空格分隔）上做 LIKE 匹配，按 priority 加权排序
  async searchByKeywords(worldId, keywords, limit = 5) {
    if (!keywords || keywords.length === 0) return []
    // 构造 OR 条件：每个关键词 LIKE '%kw%'
    const conditions = keywords.map(() => `keywords LIKE ?`).join(' OR ')
    const params = keywords.map(k => `%${k}%`)
    const sql = `
      SELECT * FROM world_settings
      WHERE world_id = ? AND (${conditions})
      ORDER BY priority DESC
      LIMIT ?`
    return queryAll(sql, [worldId, ...params, limit])
  },

  // 取符合章节/途径等级条件的奇遇（功能规划 8.5 节触发逻辑）
  async getEncounters(worldId, chapterNumber, pathLevel) {
    return queryAll(
      `SELECT encounter_id, title, content_template, min_chapter, max_chapter, tags
       FROM encounter_library
       WHERE world_id = ? AND min_chapter <= ? AND max_chapter >= ?
         AND min_path_level <= ?`,
      [worldId, chapterNumber, chapterNumber, pathLevel]
    )
  },

  // 已触发过的奇遇 ID 列表（用于去重，功能规划 8.5）
  async getLogEncounterIds() {
    const rows = queryAll(
      `SELECT DISTINCT encounter_id FROM encounter_log WHERE encounter_id IS NOT NULL`
    )
    return rows.map(r => r.encounter_id)
  },

  async logEncounter(dayNumber, encounterId, content) {
    execute(
      `INSERT INTO encounter_log (day_number, encounter_id, content) VALUES (?, ?, ?)`,
      [dayNumber, encounterId, content]
    )
    await markWrite()
    return true
  },

  async getOutlineNodes(worldId, chapterNumber) {
    return queryAll(
      `SELECT node_id, node_type, trigger_day, content, prerequisites, branch_options
       FROM story_outline
       WHERE world_id = ? AND chapter_number = ?
       ORDER BY trigger_day`,
      [worldId, chapterNumber]
    )
  },

  // 映射规则：从 world_settings 表的 category='mapping' 读取？否。
  // 注意：mappings.json 是独立配置文件，加载时存入 world_settings
  // （category='mapping'），这里统一从 world_settings 读取并还原为数组结构
  async getMappings(worldId) {
    const rows = queryAll(
      `SELECT key, value, keywords FROM world_settings
       WHERE world_id = ? AND category = 'mapping'`
      , [worldId])
    // key=behavior, value=world_behavior, keywords=空格分隔
    return rows.map(r => ({
      behavior: r.key,
      world_behavior: r.value,
      keywords: r.keywords ? r.keywords.split(' ').filter(Boolean) : [],
      description: '' // description 在配置加载时并入 value 或单独存
    }))
  }
}
```

**实现要点**：

- `searchByKeywords()` 是 RAG 检索器的数据源（功能规划 5.5 第三层），用 `keywords` 字段空格分隔关键词 + LIKE 匹配 + `priority` 加权排序，取 Top N
- `getEncounters()` 严格按功能规划 8.5 节的筛选条件：`min_chapter <= 当前章节 AND max_chapter >= 当前章节 AND min_path_level <= 当前等级`
- `getMappings()` 从 `world_settings` 表读取映射规则；映射规则在配置加载时（4.5 节）以 `category='mapping'` 写入，`key` 存 behavior、`value` 存 world_behavior、`keywords` 存关键词空格串

> **关于 description 字段**：若需保留 mappings.json 的 description，可在配置加载时把 description 拼接到 value 末尾，或扩展 world_settings 增加 remark 列（需同步迁移脚本）。第一版建议把 description 存入 keywords 之外的备注方式，由前端与 AI 工程师协商一致。

#### 4.4.6 AppConfigRepository

```typescript
// 接口签名（角色分工 4.1，须完全一致）
interface AppConfigRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  getAll(): Promise<Record<string, string>>;
}
```

```javascript
// src/db/repositories/AppConfigRepository.js
import { queryOne, queryAll, execute, markWrite } from '../Database'

export const AppConfigRepository = {
  async get(key) {
    const row = queryOne('SELECT value FROM app_config WHERE key = ?', [key])
    return row ? row.value : null
  },

  async set(key, value) {
    execute(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
        updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    )
    await markWrite()
    return true
  },

  async getAll() {
    const rows = queryAll('SELECT key, value FROM app_config')
    const result = {}
    for (const r of rows) result[r.key] = r.value
    return result
  }
}
```

**实现要点**：

- `set()` 使用 `ON CONFLICT(key) DO UPDATE` 实现 upsert（SQLite 3.24+，sql.js 支持）
- 已知 key：`onboarding_completed`（是否完成引导）、`db_version`（数据库版本号）

### 4.5 配置文件加载器

依据角色分工第五章，前端负责把内容创作者产出的 6 个 JSON 配置文件加载到数据库。加载器在**首次启动**（`app_config` 中无 `config_loaded` 标记或值为 0）时执行一次。

```javascript
// src/db/ConfigLoader.js
import { execute, markWrite, queryOne } from './Database'
import { AppConfigRepository } from './repositories/AppConfigRepository'

// 配置 JSON 通过 Vite 的 import 直接打包（静态导入）
import worldJson from '@/config/worlds/lord_of_mysteries/world.json'
import pathsJson from '@/config/worlds/lord_of_mysteries/paths.json'
import mappingsJson from '@/config/worlds/lord_of_mysteries/mappings.json'
import outlineJson from '@/config/worlds/lord_of_mysteries/outline.json'
import encountersJson from '@/config/worlds/lord_of_mysteries/encounters.json'
import settingsJson from '@/config/worlds/lord_of_mysteries/settings.json'

const WORLD_ID = 'lord_of_mysteries'

// 入口：首次启动加载配置，已加载则跳过
export async function loadConfigIfNeeded() {
  const loaded = await AppConfigRepository.get('config_loaded')
  if (loaded === '1') return

  await loadAllConfigs()
  await AppConfigRepository.set('config_loaded', '1')
  await markWrite(true) // 配置加载完成，强制写回
}

async function loadAllConfigs() {
  validateWorld(worldJson)
  validatePaths(pathsJson)
  validateMappings(mappingsJson)
  validateOutline(outlineJson)
  validateEncounters(encountersJson)
  validateSettings(settingsJson)

  // 1. world_settings 表：写入 settings.json 的设定档案
  for (const s of settingsJson.settings) {
    execute(
      `INSERT INTO world_settings (world_id, category, key, value, keywords, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [WORLD_ID, s.category, s.key, s.value, s.keywords || '', s.priority || 0]
    )
  }

  // 2. world_settings 表：写入 mappings.json 的映射规则（category='mapping'）
  for (const m of mappingsJson.mappings) {
    execute(
      `INSERT INTO world_settings (world_id, category, key, value, keywords, priority)
       VALUES (?, 'mapping', ?, ?, ?, 5)`,
      [WORLD_ID, m.behavior, m.world_behavior, (m.keywords || []).join(' ')]
    )
  }

  // 3. encounter_library 表：写入奇遇库
  for (const e of encountersJson.encounters) {
    execute(
      `INSERT INTO encounter_library
       (world_id, encounter_id, title, content_template, min_chapter,
        max_chapter, min_path_level, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [WORLD_ID, e.encounter_id, e.title, e.content_template,
       e.min_chapter || 0, e.max_chapter || 99,
       e.min_path_level || 0, JSON.stringify(e.tags || [])]
    )
  }

  // 4. story_outline 表：写入剧情大纲节点
  for (const n of outlineJson.outline) {
    execute(
      `INSERT INTO story_outline
       (world_id, chapter_number, node_id, node_type, trigger_day,
        content, prerequisites, branch_options)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [WORLD_ID, n.chapter_number, n.node_id, n.node_type, n.trigger_day || null,
       n.content, JSON.stringify(n.prerequisites || []),
       JSON.stringify(n.branch_options || [])]
    )
  }

  // 注：world.json 和 paths.json 供 UI 直接使用（不需入表），
  // 但 paths.json 的途径能力也可写入 world_settings（category='path'）供 AI 检索
  for (const p of pathsJson.paths) {
    if (!p.available) continue
    for (const lvl of p.levels) {
      execute(
        `INSERT INTO world_settings (world_id, category, key, value, keywords, priority)
         VALUES (?, 'path', ?, ?, ?, 10)`,
        [WORLD_ID, `${p.path_id}_lv${lvl.level}`,
         `${lvl.name}：能力[${lvl.abilities.join(',')}]；${lvl.description}`,
         `${p.path_name} 序列${lvl.level} ${lvl.abilities.join(' ')}`]
      )
    }
  }
}

// ===== 格式校验（对应角色分工 5.2 节 Schema）=====
function validateWorld(j) {
  if (!j.world_id || !j.world_name || !j.chapters) {
    throw new Error('E014: world.json 格式不正确')
  }
}
function validatePaths(j) {
  if (!j.world_id || !Array.isArray(j.paths)) {
    throw new Error('E014: paths.json 格式不正确')
  }
}
function validateMappings(j) {
  if (!j.world_id || !Array.isArray(j.mappings)) {
    throw new Error('E014: mappings.json 格式不正确')
  }
  for (const m of j.mappings) {
    if (!m.behavior || !m.world_behavior || !Array.isArray(m.keywords)) {
      throw new Error('E014: mappings.json 映射项缺字段')
    }
  }
}
function validateOutline(j) {
  if (!j.world_id || !Array.isArray(j.outline)) {
    throw new Error('E014: outline.json 格式不正确')
  }
}
function validateEncounters(j) {
  if (!j.world_id || !Array.isArray(j.encounters)) {
    throw new Error('E014: encounters.json 格式不正确')
  }
}
function validateSettings(j) {
  if (!j.world_id || !Array.isArray(j.settings)) {
    throw new Error('E014: settings.json 格式不正确')
  }
}
```

**加载器规范**：

1. **幂等**：用 `config_loaded` 标记保证只执行一次；重置数据时需清除该标记
2. **校验前置**：每个 JSON 先校验格式，任一不合法抛 `E014`（功能规划 11.1）并中止加载
3. **映射规则存储约定**：mappings.json 的每条映射以 `category='mapping'`、`key=behavior`、`value=world_behavior`、`keywords=关键词空格串` 存入 `world_settings`，供 `WorldRepository.getMappings()` 与 `searchByKeywords()` 统一检索
4. **途径能力存储**：paths.json 中 `available=true` 的途径各级能力以 `category='path'` 存入 `world_settings`，供 AI 层 RAG 检索
5. **world.json 与 paths.json 的 UI 用途**：这两份配置主要供前端页面直接渲染（如世界观介绍、途径选择列表），通过 Vite 静态 import 在前端模块内直接使用，无需入表

### 4.6 数据导出/导入（DataExporter.js）

依据功能规划 7.3 节，导出 JSON 不含 `world_settings`、`encounter_library`、`story_outline`（预置配置，导入时从配置文件恢复）。

```javascript
// src/db/DataExporter.js
import { queryAll } from './Database'
import { AppConfigRepository } from './repositories/AppConfigRepository'

// 导出全部用户数据为 JSON 对象
export async function exportData() {
  const user_settings = queryOne('SELECT * FROM user_settings WHERE id = 1')
  // 导出时不包含 api_key_encrypted（功能规划 10.3：不导出 API Key）
  delete user_settings.api_key_encrypted

  return {
    version: '1.0',
    export_date: new Date().toISOString(),
    user_settings,
    diary_entries: queryAll('SELECT * FROM diary_entries ORDER BY day_number'),
    chapters: queryAll('SELECT * FROM chapters ORDER BY chapter_number'),
    story_segments: queryAll('SELECT * FROM story_segments ORDER BY day_number'),
    encounter_log: queryAll('SELECT * FROM encounter_log ORDER BY day_number')
  }
}

// 从 JSON 对象导入（覆盖式）
export async function importData(data) {
  if (!data.version || !data.user_settings) {
    throw new Error('E014: 文件格式不正确，请选择有效的备份文件')
  }
  // 清空用户数据表（保留预置配置表 world_settings/encounter_library/story_outline）
  execute('DELETE FROM story_segments')
  execute('DELETE FROM chapters')
  execute('DELETE FROM diary_entries')
  execute('DELETE FROM encounter_log')
  execute('DELETE FROM user_settings')

  // 重新插入 user_settings（导入数据不含 api_key_encrypted，保留原 Key）
  const u = data.user_settings
  execute(
    `INSERT INTO user_settings (id, hero_name, world_id, path_id, duration_days,
      current_day, current_chapter, ai_provider, ai_base_url,
      ai_temperature, ai_max_tokens, story_started)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [u.hero_name, u.world_id, u.path_id, u.duration_days, u.current_day,
     u.current_chapter, u.ai_provider, u.ai_base_url,
     u.ai_temperature, u.ai_max_tokens, u.story_started ? 1 : 0]
  )
  // 逐表插入其余数据（略，按字段顺序 INSERT）
  // ...
  await markWrite(true)
}
```

> 导入时若 `app_config.config_loaded` 为 0，应先调用 `loadConfigIfNeeded()` 恢复预置配置。

---

## 五、页面开发指南

本节覆盖 9 个页面的组件结构、props、events、状态管理、关键交互逻辑，以及路由配置（含首次使用跳引导页的导航守卫）。页面路由对应功能规划 4.3 节。

### 5.1 路由配置与导航守卫

```javascript
// src/router/index.js
import { createRouter, createWebHashHistory } from 'vue-router'
import { AppConfigRepository } from '@/db/repositories/AppConfigRepository'

const routes = [
  { path: '/onboarding', name: 'onboarding', component: () => import('@/views/Onboarding.vue') },
  { path: '/', name: 'home', component: () => import('@/views/Home.vue'), meta: { requireOnboarded: true } },
  { path: '/diary', name: 'diary', component: () => import('@/views/DiaryInput.vue'), meta: { requireOnboarded: true } },
  { path: '/preview', name: 'preview', component: () => import('@/views/Preview.vue'), meta: { requireOnboarded: true } },
  { path: '/reader/:chapterId', name: 'reader', component: () => import('@/views/ChapterReader.vue'), meta: { requireOnboarded: true } },
  { path: '/settings', name: 'settings', component: () => import('@/views/Settings.vue'), meta: { requireOnboarded: true } },
  { path: '/settings/world', name: 'settings-world', component: () => import('@/views/SettingsWorld.vue'), meta: { requireOnboarded: true } },
  { path: '/settings/api', name: 'settings-api', component: () => import('@/views/SettingsApi.vue'), meta: { requireOnboarded: true } },
  { path: '/settings/data', name: 'settings-data', component: () => import('@/views/SettingsData.vue'), meta: { requireOnboarded: true } }
]

const router = createRouter({
  history: createWebHashHistory(), // Capacitor 内用 hash 路由，避免 file:// 协议刷新 404
  routes
})

// 导航守卫：首次使用跳引导页（功能规划 4.2 节）
router.beforeEach(async (to) => {
  if (to.path === '/onboarding') return true
  const completed = await AppConfigRepository.get('onboarding_completed')
  if (completed !== '1') {
    // 未完成引导，强制跳引导页（无论目标路由）
    return { path: '/onboarding' }
  }
  // 已完成引导，放行
  return true
})

export default router
```

**导航守卫规范**：

1. 使用 `createWebHashHistory`：Capacitor 打包后以 `file://` 加载，hash 路由可避免刷新 404
2. 守卫逻辑：`onboarding_completed !== '1'` 时，除 `/onboarding` 外所有路由都重定向到引导页
3. 引导页完成后写入 `onboarding_completed = '1'`，再 `router.replace('/')`
4. 路由懒加载（`() => import(...)`）减小首屏体积，满足冷启动 < 3s（功能规划第十二章）

### 5.2 页面一览

| 路由 | 页面组件 | 职责 | 详见 |
|------|---------|------|------|
| `/onboarding` | Onboarding.vue | 首次引导 5 步 | 5.3 |
| `/` | Home.vue | 首页/阅读器，展示最新章节 | 5.4 |
| `/diary` | DiaryInput.vue | 日记输入 | 5.5 |
| `/preview` | Preview.vue | AI 生成预览与审核 | 5.6 |
| `/reader/:chapterId` | ChapterReader.vue | 章节阅读 | 5.7 |
| `/settings` | Settings.vue | 设置首页 | 5.8 |
| `/settings/world` | SettingsWorld.vue | 世界观设置 | 5.9 |
| `/settings/api` | SettingsApi.vue | API Key 设置 | 5.10 |
| `/settings/data` | SettingsData.vue | 数据管理 | 5.11 |

### 5.3 Onboarding.vue — 引导页

依据功能规划 6.2 节，引导页 5 步流程。

**组件结构**：

```vue
<template>
  <div class="onboarding">
    <!-- 顶部进度指示器（5 个圆点） -->
    <div class="steps-indicator">
      <span v-for="i in 5" :key="i" :class="{ active: i === step }" />
    </div>

    <!-- 步骤内容（用 v-show 保留各步状态，避免切换丢失输入） -->
    <OnboardingStep1 v-show="step === 1" />
    <OnboardingStep2 v-show="step === 2" @tested="onApiTested" />
    <OnboardingStep3 v-show="step === 3" v-model:heroName="form.heroName" />
    <OnboardingStep4 v-show="step === 4" />
    <OnboardingStep5 v-show="step === 5" />

    <!-- 底部按钮 -->
    <div class="actions">
      <button v-if="step > 1" @click="step--">上一步</button>
      <button v-if="step < 5" :disabled="!canNext" @click="next">下一步</button>
      <button v-if="step === 5" @click="finish">开启第一天</button>
    </div>
  </div>
</template>
```

**状态管理（setup）**：

```javascript
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { UserRepository } from '@/db/repositories/UserRepository'
import { AppConfigRepository } from '@/db/repositories/AppConfigRepository'
import Crypto from '@/utils/Crypto'

const step = ref(1)
const form = ref({
  aiProvider: 'deepseek',
  apiKey: '',
  baseUrl: '',
  heroName: '你',
  apiTested: false
})

// 各步"下一步"前置条件
const canNext = computed(() => {
  if (step.value === 2) return form.value.apiTested   // Step2 需测试连接通过
  if (step.value === 3) return form.value.heroName.trim().length > 0
  return true
})

async function next() {
  if (step.value === 2) {
    // 保存 API Key（AES-GCM 加密，功能规划 10.3）
    const encrypted = await Crypto.encrypt(form.value.apiKey)
    await UserRepository.update({
      ai_provider: form.value.aiProvider,
      ai_base_url: form.value.baseUrl || null,
      api_key_encrypted: encrypted
    })
  }
  if (step.value === 3) {
    await UserRepository.update({ hero_name: form.value.heroName })
  }
  step.value++
}

async function finish() {
  await AppConfigRepository.set('onboarding_completed', '1')
  await UserRepository.update({ story_started: 1, current_day: 0 })
  router.replace('/diary') // 引导完成 → 记第一天日记（功能规划 6.2 Step5）
}
```

**关键交互**：

- Step2"测试连接"：调用 AI 适配器的 `testConnection`（接口 A 暂未对接时，可用简单 HTTP 探测）。测试通过才允许下一步（功能规划 6.2）
- Step3 主角名：实时校验非空，默认"你"
- Step4 世界观介绍：从 `world.json` 静态 import 渲染描述、途径简介、映射规则示例
- 完成后写入 `onboarding_completed = '1'`，导航守卫放行后续路由

### 5.4 Home.vue — 首页/阅读器

依据功能规划 6.3 节。

**组件结构**：

```vue
<template>
  <div class="home">
    <!-- 顶部栏 -->
    <header class="top-bar">
      <span class="hero-name">{{ user.hero_name }}</span>
      <span class="progress">第 {{ user.current_chapter }} 章 / 共 6 章 · 第 {{ user.current_day }} 天 / 共 {{ user.duration_days }} 天</span>
    </header>

    <!-- 中部正文（空状态 / 加载中 / 正文） -->
    <main class="content">
      <LoadingSpinner v-if="loading" tip="加载中..." />
      <div v-else-if="!latestSegment" class="empty-state">
        <p>记录你的第一天，开启你的传奇</p>
        <button class="big-btn" @click="goDiary">记日记</button>
      </div>
      <article v-else class="story-text" v-html="renderedContent" />
    </main>

    <!-- 底部栏 -->
    <footer class="bottom-bar">
      <button @click="prevChapter">上一章</button>
      <button @click="showChapterList = true">目录</button>
      <button @click="nextChapter">下一章</button>
      <button class="fab" :disabled="todayDone" @click="goDiary">
        {{ todayDone ? '今日已更新' : '记日记' }}
      </button>
    </footer>

    <!-- 章节目录弹层 -->
    <ChapterList v-if="showChapterList" :chapters="chapters" @select="jumpChapter" @close="showChapterList = false" />
  </div>
</template>
```

**状态管理**：

```javascript
import { ref, computed, onMounted } from 'vue'
import { UserRepository } from '@/db/repositories/UserRepository'
import { ChapterRepository } from '@/db/repositories/ChapterRepository'
import { SegmentRepository } from '@/db/repositories/SegmentRepository'

const user = ref({})
const chapters = ref([])
const latestSegment = ref(null)
const currentChapterId = ref(null)
const loading = ref(true)
const showChapterList = ref(false)

// 今日是否已记录 = 最新段落 day_number === current_day（或 current_day 已有 finalized 段落）
const todayDone = computed(() => {
  return latestSegment.value && latestSegment.value.day_number === user.value.current_day
    && latestSegment.value.status === 'finalized'
})

onMounted(async () => {
  user.value = await UserRepository.get()
  chapters.value = await ChapterRepository.getAll()
  // 默认展示最新章节最新段落
  const cur = await ChapterRepository.getCurrent()
  if (cur) {
    currentChapterId.value = cur.id
    const segs = await SegmentRepository.getByChapter(cur.id)
    latestSegment.value = segs[segs.length - 1] || null
  }
  loading.value = false
})
```

**关键交互逻辑**：

- **空状态**：`current_day === 0` 且无段落时，显示引导语 + 大号"记日记"按钮（功能规划 6.3 状态处理）
- **今日已记录**：`todayDone` 为真时，"记日记"按钮置灰显示"今日已更新"
- **目录**：点击弹出 `ChapterList` 组件，选择章节跳转 `/reader/:chapterId`
- **上下章**：在已生成章节间切换，边界章禁用对应按钮
- **断网**：首页可离线展示已生成内容（功能规划 10.6）

### 5.5 DiaryInput.vue — 日记输入页

依据功能规划 6.4 节。

**组件结构**：

```vue
<template>
  <div class="diary-input">
    <header>
      <button @click="back">返回</button>
      <span>第 {{ dayNumber }} 天</span>
    </header>

    <textarea
      v-model="text"
      :maxlength="5000"
      placeholder="今天做了什么？随意写写..."
      @input="onInput"
    />
    <div class="char-count">{{ text.length }} / 5000</div>

    <!-- 行为标签 -->
    <BehaviorTags v-model="tags" />

    <!-- 语音输入 -->
    <VoiceInput @result="onVoiceResult" @error="onVoiceError" />

    <button class="primary" :disabled="!canGenerate" @click="generate">生成故事</button>
  </div>
</template>
```

**状态与交互**：

```javascript
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { DiaryRepository } from '@/db/repositories/DiaryRepository'
import { UserRepository } from '@/db/repositories/UserRepository'

const dayNumber = ref(0)
const text = ref('')
const tags = ref([])
const canGenerate = computed(() => text.value.trim().length > 0)

onMounted(async () => {
  const user = await UserRepository.get()
  dayNumber.value = user.current_day + 1 // 下一日记天数（功能规划 8.2）
  // 恢复草稿（功能规划 6.4：草稿存 localStorage）
  const draft = localStorage.getItem(`diary_draft_${dayNumber.value}`)
  if (draft) text.value = draft

  // 今日已记录提示（功能规划 6.4 边界处理）
  const exist = await DiaryRepository.getByDay(dayNumber.value)
  if (exist) {
    if (!confirm('今日已记录，是否重新记录？（将覆盖当天内容）')) {
      router.back(); return
    }
  }
})

// 实时保存草稿（防意外退出丢失）
let saveTimer = null
function onInput() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(`diary_draft_${dayNumber.value}`, text.value)
  }, 500)
}
onBeforeUnmount(() => clearTimeout(saveTimer))

// 语音识别结果填入文本框
function onVoiceResult(transcript) {
  text.value += transcript
}

// 生成故事：保存日记 → 跳预览页（携带日记数据）
async function generate() {
  const diaryId = await DiaryRepository.create({
    day_number: dayNumber.value,
    raw_text: text.value,
    behavior_tags: tags.value
  })
  localStorage.removeItem(`diary_draft_${dayNumber.value}`)
  // 通过路由 query 或 Pinia 传递 diaryId 给预览页
  router.push({ path: '/preview', query: { day: dayNumber.value, diary: diaryId } })
}
```

**关键交互**：

- **草稿自动保存**：输入防抖 500ms 写入 `localStorage`（功能规划 6.4）
- **字数限制**：5000 字截断并提示（功能规划 6.4 边界处理）
- **行为标签**：`BehaviorTags` 组件多选，不选不影响使用
- **今日已记录**：进入时弹确认框（功能规划 6.4 边界处理）
- **断网提示**：点击"生成故事"时若断网，提示"需要网络连接才能生成故事"（功能规划 10.6）

### 5.6 Preview.vue — AI 生成预览页

依据功能规划 6.5 节。这是前端调用接口 A（StoryEngine）的核心页面。

**组件结构**：

```vue
<template>
  <div class="preview">
    <header>
      <button @click="back">返回</button>
      <span>{{ statusLabel }}</span>
    </header>

    <!-- 生成中 -->
    <div v-if="generating" class="loading-area">
      <LoadingSpinner :tip="tip" />
      <p class="hint">{{ rotatingTip }}</p>
    </div>

    <!-- 错误 -->
    <ErrorToast v-else-if="error" :code="errorCode" :message="error" @retry="onRetry" />

    <!-- 预览 -->
    <template v-else-if="result">
      <article class="story-text">{{ result.content }}</article>
      <section class="mapping">
        <h4>今日事件映射</h4>
        <ul>
          <li v-for="(m, i) in mappingList" :key="i">{{ m.behavior }} → {{ m.worldBehavior }}</li>
        </ul>
      </section>

      <footer class="actions">
        <button @click="regenerate" :disabled="revisionCount >= 3">
          重新生成 <span v-if="revisionCount">({{ revisionCount }}/3)</span>
        </button>
        <button @click="toggleEdit">{{ editing ? '取消' : '编辑' }}</button>
        <button class="primary" @click="confirm">{{ editing ? '保存' : '确认通过' }}</button>
      </footer>
    </template>
  </div>
</template>
```

**状态与交互（核心）**：

```javascript
import { ref, computed, onMounted } from 'vue'
import { getStoryEngine } from '@/core' // 开发期返回 MockStoryEngine，联调期返回真实 StoryEngine
import { SegmentRepository } from '@/db/repositories/SegmentRepository'

const storyEngine = getStoryEngine()
const generating = ref(true)
const result = ref(null)
const segmentId = ref(null)
const error = ref('')
const errorCode = ref('')
const editing = ref(false)
const revisionCount = ref(0)

// 趣味提示语轮播（功能规划 6.5）
const tips = ['正在编织你的命运...', '占卜师正在凝视水晶球...', '命运的丝线正在交织...']
const rotatingTip = ref(tips[0])
let tipTimer = setInterval(() => {
  rotatingTip.value = tips[(tips.indexOf(rotatingTip.value) + 1) % tips.length]
}, 2500)

onMounted(async () => {
  const day = Number(route.query.day)
  const diaryId = Number(route.query.diary)
  await doGenerate(day, diaryId)
})

async function doGenerate(day, diaryId) {
  generating.value = true; error.value = ''
  const diary = await DiaryRepository.getByDay(day)
  const res = await storyEngine.generateStory({
    diaryText: diary.raw_text,
    behaviorTags: JSON.parse(diary.behavior_tags || '[]'),
    dayNumber: day
  })
  generating.value = false; clearInterval(tipTimer)
  if (res.success) {
    result.value = res
    segmentId.value = res.segmentId
  } else {
    error.value = res.error
    errorCode.value = res.errorCode
  }
}

// 重新生成（功能规划 5.3，最多 3 次）
async function regenerate() {
  if (revisionCount.value >= 3) return
  revisionCount.value++
  generating.value = true
  const res = await storyEngine.regenerate(segmentId.value)
  if (res.success) result.value = res
  else { error.value = res.error; errorCode.value = res.errorCode }
  generating.value = false
}

// 确认通过 → 定稿（功能规划 5.3）
async function confirm() {
  if (editing.value) {
    // 编辑模式保存
    await storyEngine.saveEdit(segmentId.value, editedText.value)
  }
  const res = await storyEngine.finalize(segmentId.value)
  if (res.success) {
    if (res.storyEnded) router.replace('/?ended=1')
    else router.replace('/')
  }
}

// 重试（错误时不消耗重生成次数，功能规划 6.5）
function onRetry() { error.value = ''; doGenerate(...) }
```

**状态处理**：

- **生成中**：Loading 动画 + 趣味提示语 2.5s 轮播（功能规划 6.5）
- **生成失败**：显示 `ErrorToast`，"重试"按钮不消耗重生成次数（功能规划 6.5、11.2）
- **重生成上限**：`revisionCount >= 3` 时按钮禁用，提示"已达重生成上限，可手动编辑"（功能规划 5.3、6.5）
- **编辑模式**：点"编辑"文本变可编辑，按钮变"保存/取消"，保存后标记 `is_edited`（功能规划 5.3）
- **超时**：AI 调用 > 60s 自动中断，提示"生成超时"（功能规划 6.5、错误码 E005）

### 5.7 ChapterReader.vue — 章节阅读页

依据功能规划 6.3 阅读体验。

**组件结构**：

```vue
<template>
  <div class="chapter-reader">
    <header>
      <button @click="back">返回</button>
      <h3>{{ chapter.title }}</h3>
      <span>第 {{ chapter.start_day }}-{{ chapter.end_day }} 天</span>
    </header>
    <LoadingSpinner v-if="loading" />
    <article v-else class="story-text" v-html="renderedContent" />
  </div>
</template>
```

**关键交互**：

- 从路由参数 `:chapterId` 获取章节，`ChapterRepository.getByNumber` 或直接查 id
- `chapter.content` 为完整章节正文（所有段落拼接，见 4.4.3）
- 阅读历史章节 < 200ms（功能规划第十二章）
- 左右滑动可切换上一章/下一章（与首页一致）

### 5.8 Settings.vue — 设置首页

**组件结构**：纯导航入口列表。

```vue
<template>
  <div class="settings">
    <header><button @click="back">返回</button><h3>设置</h3></header>
    <ul>
      <li @click="router.push('/settings/world')">世界观设置</li>
      <li @click="router.push('/settings/api')">API Key 设置</li>
      <li @click="router.push('/settings/data')">数据管理</li>
    </ul>
  </div>
</template>
```

### 5.9 SettingsWorld.vue — 世界观设置页

依据功能规划 6.6 节。

```vue
<template>
  <div class="settings-world">
    <header><button @click="back">返回</button><h3>世界观设置</h3></header>

    <section>
      <h4>世界观</h4>
      <ul>
        <li :class="{ active: true }">诡秘之主</li>
        <li class="disabled">其他世界观（敬请期待）</li>
      </ul>
    </section>

    <section>
      <h4>途径</h4>
      <ul>
        <li v-for="p in paths" :key="p.path_id" :class="{ disabled: !p.available }">
          {{ p.path_name }}{{ p.available ? '' : '（敬请期待）' }}
        </li>
      </ul>
    </section>

    <section>
      <h4>故事时长</h4>
      <p>90 天（6 个章节，固定）</p>
    </section>

    <section>
      <h4>主角名</h4>
      <input v-model="heroName" @blur="saveHeroName" />
    </section>

    <section>
      <h4>映射规则预览</h4>
      <table>
        <tr v-for="m in mappings" :key="m.behavior">
          <td>{{ m.behavior }}</td><td>→</td><td>{{ m.world_behavior }}</td>
        </tr>
      </table>
    </section>
  </div>
</template>
```

**关键交互**：

- 世界观/途径列表第一版仅"诡秘之主/占卜家"可选，其余灰色"敬请期待"（功能规划 6.6）
- 主角名修改后 `@blur` 保存，从下一段故事生效（功能规划 6.6）
- 映射规则从 `mappings.json` 静态 import 或 `WorldRepository.getMappings()` 读取只读展示

### 5.10 SettingsApi.vue — API Key 设置页

依据功能规划 6.7 节。

```vue
<template>
  <div class="settings-api">
    <header><button @click="back">返回</button><h3>API Key 设置</h3></header>

    <label>模型选择
      <select v-model="form.aiProvider">
        <option value="deepseek">DeepSeek</option>
        <option value="openai">OpenAI</option>
        <option value="kimi">Kimi</option>
        <option value="qwen">通义千问</option>
      </select>
    </label>

    <label>API Base URL（可选）
      <input v-model="form.baseUrl" placeholder="默认自动填充" />
    </label>

    <label>API Key
      <input :type="showKey ? 'text' : 'password'" v-model="form.apiKey" />
      <button @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
    </label>

    <button @click="testConnection" :disabled="testing">{{ testing ? '测试中...' : '测试连接' }}</button>
    <p v-if="testResult">{{ testResult }}</p>

    <details>
      <summary>高级参数</summary>
      <label>温度 <input type="range" min="0" max="2" step="0.1" v-model.number="form.temperature" /></label>
      <label>最大输出 tokens <input type="number" v-model.number="form.maxTokens" /></label>
    </details>

    <button class="primary" @click="save">保存</button>
  </div>
</template>
```

**关键交互**：

- 测试连接调用 AI 适配器 `testConnection`，返回"连接成功"或错误原因（功能规划 6.7）
- 保存时 API Key 经 AES-GCM 加密后存 `user_settings.api_key_encrypted`（功能规划 10.3）
- 高级参数可折叠，温度默认 0.8、max_tokens 默认 2000（功能规划 6.7）

### 5.11 SettingsData.vue — 数据管理页

依据功能规划 6.8 节。

```vue
<template>
  <div class="settings-data">
    <header><button @click="back">返回</button><h3>数据管理</h3></header>

    <section>
      <h4>数据概览</h4>
      <p>已记录天数：{{ stats.days }} / {{ user.duration_days }}</p>
      <p>已生成章节数：{{ stats.chapters }} / 6</p>
      <p>本地存储占用：{{ stats.size }}</p>
    </section>

    <button @click="exportBackup">备份导出</button>
    <button @click="triggerImport">数据导入</button>
    <input ref="fileInput" type="file" accept=".json" @change="onFile" hidden />

    <button class="danger" @click="confirmReset">重置故事</button>
  </div>
</template>
```

**关键交互**：

- **备份导出**：调用 `exportData()`（4.6 节）生成 JSON，通过 Capacitor Filesystem/Share 触发保存（功能规划 6.8）
- **数据导入**：选 JSON 文件，`importData()` 覆盖导入，需二次确认（功能规划 6.8）
- **重置故事**：弹二次确认，需输入"重置"二字确认（功能规划 6.8）。重置后清空数据 + 清除 `config_loaded` + `onboarding_completed`，重新加载配置，跳引导页

### 5.12 通用状态处理规范

所有页面统一遵循三态处理：

| 状态 | 触发条件 | UI 表现 | 实现 |
|------|---------|---------|------|
| 空状态 | 无数据（首次进入/无章节） | 引导文案 + 主操作按钮 | `v-if="!data"` 渲染 empty-state |
| 加载状态 | 异步请求中 | 骨架屏或 `LoadingSpinner` | `loading` ref 控制 |
| 错误状态 | 请求失败/异常 | `ErrorToast` + 重试按钮 | `error`/`errorCode` ref 控制 |

**统一错误处理**（功能规划第十一章）：

- AI 类错误（E001-E007）：在 Preview 页通过 `ErrorToast` 展示，提供重试
- 数据库错误（E008-E010）：全局拦截，提示重启或从备份恢复
- 语音错误（E011-E012）：在 DiaryInput 页提示降级为文字输入
- 导入导出错误（E013-E014）：在数据管理页提示

---

## 六、通用组件

5 个通用组件的设计规范，放在 `src/components/`。

### 6.1 LoadingSpinner.vue

**职责**：统一加载动画，支持自定义提示文案与旋转提示语。

```vue
<template>
  <div class="loading-spinner">
    <div class="spinner" />
    <p class="tip">{{ tip }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  tip: { type: String, default: '加载中...' }
})
</script>
```

**Props**：`tip: string`（提示文案，默认"加载中..."）  
**Slots**：默认插槽（用于附加内容，如趣味提示语轮播）  
**设计要点**：纯 CSS 旋转动画，无依赖；尺寸固定 48px，移动端居中

### 6.2 ChapterList.vue

**职责**：章节目录弹层，展示所有章节供用户跳转。

```vue
<template>
  <div class="chapter-list-mask" @click.self="$emit('close')">
    <div class="chapter-list">
      <h3>目录</h3>
      <ul>
        <li v-for="ch in chapters" :key="ch.id" @click="$emit('select', ch)">
          <span class="num">第 {{ ch.chapter_number }} 章</span>
          <span class="title">{{ ch.title }}</span>
          <span class="range">{{ ch.start_day }}-{{ ch.end_day }} 天</span>
          <span class="status">{{ ch.status === 'completed' ? '已完结' : '连载中' }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
defineProps({
  chapters: { type: Array, required: true } // Chapter[]
})
defineEmits(['select', 'close'])
</script>
```

**Props**：`chapters: Chapter[]`（章节列表）  
**Events**：`select(chapter)`（选择章节）、`close()`（关闭弹层）  
**设计要点**：每项显示章节号 + 标题 + 天数范围 + 状态；点遮罩关闭；功能规划 6.3 要求

### 6.3 BehaviorTags.vue

**职责**：行为大类标签多选器（功能规划 6.4）。

```vue
<template>
  <div class="behavior-tags">
    <span class="label">行为标签（可选）</span>
    <div class="tags">
      <button
        v-for="t in options"
        :key="t"
        :class="{ selected: modelValue.includes(t) }"
        @click="toggle(t)"
      >{{ t }}</button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Array, default: () => [] } // string[]
})
const emit = defineEmits(['update:modelValue'])
const options = ['学习', '工作', '健身', '社交', '休息', '娱乐', '其他']

function toggle(tag) {
  const next = props.modelValue.includes(tag)
    ? props.modelValue.filter(t => t !== tag)
    : [...props.modelValue, tag]
  emit('update:modelValue', next)
}
</script>
```

**Props**：`modelValue: string[]`（v-model 双向绑定选中标签数组）  
**Events**：`update:modelValue(tags)`  
**设计要点**：7 个固定标签（功能规划 6.4）；多选；选中高亮；不选不影响使用

### 6.4 VoiceInput.vue

**职责**：语音输入按钮，按住录音、松开转文字（功能规划 6.4、10.5）。

```vue
<template>
  <button
    class="voice-input"
    :class="{ recording }"
    @touchstart.prevent="start"
    @touchend.prevent="stop"
    @mousedown.prevent="start"
    @mouseup.prevent="stop"
  >
    <MicIcon />
    <span v-if="recording">松开结束</span>
    <span v-else-if="recognizing">识别中...</span>
    <span v-else>按住说话</span>
  </button>
</template>

<script setup>
import { ref } from 'vue'
const emit = defineEmits(['result', 'error'])
const recording = ref(false)
const recognizing = ref(false)

// 优先 Web Speech API，降级 Capacitor 插件
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
let recognition = null

async function start() {
  recording.value = true
  try {
    if (SpeechRecognition) {
      recognition = new SpeechRecognition()
      recognition.lang = 'zh-CN'
      recognition.continuous = false
      recognition.onresult = (e) => {
        const text = e.results[0][0].transcript
        emit('result', text)
      }
      recognition.onerror = () => emit('error', 'E012')
      recognition.start()
    } else {
      // 降级 @capacitor-community/speech-recognition
      const { SpeechRecognition: CapSR } = await import('@capacitor-community/speech-recognition')
      await CapSR.start({ language: 'zh-CN', maxResults: 1 })
      // 监听结果事件...
    }
  } catch (e) {
    emit('error', 'E011')
  }
}

function stop() {
  recording.value = false; recognizing.value = true
  if (recognition) recognition.stop()
  setTimeout(() => recognizing.value = false, 1000)
}
</script>
```

**Props**：无  
**Events**：`result(text)`（识别结果文本）、`error(code)`（错误码 E011/E012）  
**设计要点**：按住（touchstart/mousedown）开始，松开（touchend/mouseup）结束；识别中显示"识别中..."；失败提示"语音识别失败，请重试或手动输入"（功能规划 6.4、11.1）

### 6.5 ErrorToast.vue

**职责**：统一错误提示，展示错误码、信息与重试按钮。

```vue
<template>
  <div class="error-toast">
    <div class="icon">!</div>
    <p class="message">{{ message }}</p>
    <p class="code" v-if="code">错误码：{{ code }}</p>
    <button v-if="retryable" @click="$emit('retry')">重试</button>
    <button @click="$emit('dismiss')">关闭</button>
  </div>
</template>

<script setup>
const props = defineProps({
  code: { type: String, default: '' },     // E001-E014
  message: { type: String, required: true },
  retryable: { type: Boolean, default: true }
})
defineEmits(['retry', 'dismiss'])
</script>
```

**Props**：`code: string`（错误码）、`message: string`（错误信息）、`retryable: boolean`（是否可重试）  
**Events**：`retry()`、`dismiss()`  
**设计要点**：错误码与文案映射遵循功能规划 11.1 节错误码体系；可重试的错误显示"重试"按钮；Key 类错误（E001/E002）额外提供"去设置"跳转

---

## 七、StoryEngine Mock 实现

依据角色分工 3.3 节，AI 工程师完成真实 `StoryEngine` 实现前，前端工程师使用 `MockStoryEngine` 独立开发全部页面与交互逻辑。Mock 实现**必须严格符合接口 A 签名**（角色分工 3.1 节），以便联调阶段无缝替换。

### 7.1 MockStoryEngine 完整代码

```javascript
// src/core/MockStoryEngine.js
// 前端开发阶段使用，严格实现接口 A（角色分工 3.1 节）
// 联调阶段通过 src/core/index.js 的 getStoryEngine() 切换为真实实现

// 模拟内容池：每次生成/重生成随机选一条，体现"生成不同版本"
const MOCK_CONTENTS = [
  '{heroName}在占卜家小屋中翻开了那本泛黄的神秘学典籍，烛火在书页上投下摇曳的影子。窗外的雾气愈发浓重，仿佛整座城市都在低声呢喃着不为人知的秘密。序列9的非凡能力让{heroName}能隐约感知到空气中流动的灵性，这是一种难以言喻的第六感。',
  '清晨的钟声穿透浓雾，{heroName}从冥想中睁开双眼。经过一夜的灵性恢复，精神力已重新充盈。塔罗会的委托还压在案头，但今天似乎有什么不同寻常的气息在空气中蔓延——水晶球表面浮现出若有若无的纹路。',
  '{heroName}摊开塔罗牌，指尖轻触牌面。占卜的结果有些出人意料，命运的丝线似乎正在向某个未知的方向交织。雾之上的空间里，似乎有人在注视着这一切。序列9的灵视让{heroName}捕捉到了一闪而过的非凡波动。',
  '夜色渐深，{heroName}在灯下整理着今日的见闻。这具序列9的非凡之躯，正缓慢却坚定地适应着新的力量。城市的某处传来若有若无的钟声，那是非凡者世界的暗语，暗示着某个不为人知的聚会即将开始。'
]

// 模拟映射说明
const MOCK_MAPPINGS = [
  { behavior: '学习', worldBehavior: '研读神秘学典籍' },
  { behavior: '工作', worldBehavior: '完成塔罗会委托任务' },
  { behavior: '健身', worldBehavior: '体能与战斗训练' },
  { behavior: '社交', worldBehavior: '与塔罗会成员交流情报' },
  { behavior: '休息', worldBehavior: '冥想与灵性恢复' },
  { behavior: '娱乐', worldBehavior: '探索非凡现象' },
  { behavior: '其他', worldBehavior: '日常琐事' }
]

// 章节边界定义（功能规划 8.1 节），用于 mock finalize 判断章节是否完成
const CHAPTER_BOUNDS = [
  { number: 0, end_day: 5 },
  { number: 1, end_day: 25 },
  { number: 2, end_day: 45 },
  { number: 3, end_day: 65 },
  { number: 4, end_day: 85 },
  { number: 5, end_day: 90 }
]

class MockStoryEngine {
  constructor() {
    // 模拟内存中的段落存储（联调阶段会被真实 DB 替换）
    this.segments = new Map()
    this.idCounter = 1000
  }

  // 主流程：生成故事段落
  // 签名严格遵循角色分工 3.1 节 GenerateResult
  async generateStory(params) {
    await this._delay(2000) // 模拟网络延迟 + AI 生成耗时

    // 随机选一条内容，替换 heroName 占位符
    const user = await this._getUser()
    const heroName = user.hero_name || '你'
    const content = this._pick(MOCK_CONTENTS).replace(/\{heroName\}/g, heroName)

    // 构造映射说明：根据传入的 behaviorTags 匹配，无标签则给默认映射
    const tags = params.behaviorTags || []
    const mappings = tags.length > 0
      ? MOCK_MAPPINGS.filter(m => tags.includes(m.behavior))
      : MOCK_MAPPINGS.slice(0, 2)

    const segmentId = this.idCounter++
    this.segments.set(segmentId, {
      id: segmentId,
      dayNumber: params.dayNumber,
      content,
      mappingDesc: JSON.stringify(mappings),
      status: 'draft_ready',
      revisionCount: 0
    })

    return {
      success: true,
      segmentId,
      content,
      mappingDesc: JSON.stringify(mappings)
    }
  }

  // 重新生成（角色分工 3.1 regenerate）
  async regenerate(segmentId) {
    await this._delay(1500)
    const seg = this.segments.get(segmentId)
    if (!seg) {
      return { success: false, error: '段落不存在', errorCode: 'E007' }
    }
    // 选一条与上次不同的内容
    const user = await this._getUser()
    const heroName = user.hero_name || '你'
    let newContent = this._pick(MOCK_CONTENTS)
    let tries = 0
    while (newContent === seg.content && tries < 5) {
      newContent = this._pick(MOCK_CONTENTS)
      tries++
    }
    newContent = newContent.replace(/\{heroName\}/g, heroName)
    seg.content = newContent
    seg.revisionCount = (seg.revisionCount || 0) + 1

    return {
      success: true,
      segmentId,
      content: newContent,
      mappingDesc: seg.mappingDesc
    }
  }

  // 确认定稿（角色分工 3.1 finalize）
  // 返回 FinalizeResult，模拟章节边界检测（功能规划 8.3）与故事完结（8.6）
  async finalize(segmentId) {
    await this._delay(300)
    const seg = this.segments.get(segmentId)
    if (!seg) {
      return { success: false, error: '段落不存在', errorCode: 'E007' }
    }
    seg.status = 'finalized'

    const user = await this._getUser()
    const dayCompleted = seg.dayNumber
    // 模拟章节边界检测：当天数等于某章 end_day 则章节完成
    const bound = CHAPTER_BOUNDS.find(c => c.end_day === dayCompleted)
    const chapterCompleted = !!bound
    const storyEnded = dayCompleted >= (user.duration_days || 90)

    return {
      success: true,
      dayCompleted,
      chapterCompleted,
      chapterSummary: chapterCompleted
        ? `（Mock 摘要）第 ${bound.number} 章至此完结，{heroName}经历了关键转折...`.replace(/\{heroName\}/g, user.hero_name)
        : undefined,
      storyEnded
    }
  }

  // 保存手动编辑（角色分工 3.1 saveEdit）
  async saveEdit(segmentId, content) {
    await this._delay(200)
    const seg = this.segments.get(segmentId)
    if (!seg) {
      return { success: false, error: '段落不存在', errorCode: 'E007' }
    }
    seg.content = content
    seg.status = 'finalized'
    return {
      success: true,
      dayCompleted: seg.dayNumber,
      chapterCompleted: false,
      storyEnded: false
    }
  }

  // 获取生成状态（角色分工 3.1 getStatus）
  async getStatus(segmentId) {
    const seg = this.segments.get(segmentId)
    return seg ? seg.status : 'pending'
  }

  // ===== 内部辅助 =====
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  // Mock 读取用户设置（联调阶段由真实 UserRepository 提供）
  async _getUser() {
    // 优先尝试真实 UserRepository（若已初始化）
    try {
      const { UserRepository } = await import('@/db/repositories/UserRepository')
      return await UserRepository.get()
    } catch (e) {
      // 数据库未就绪时返回 mock 默认值
      return { hero_name: '你', duration_days: 90, current_day: 1 }
    }
  }
}

export default MockStoryEngine
```

### 7.2 StoryEngine 切换器

前端通过一个切换器在 Mock 与真实实现间无缝切换，联调阶段只改一行环境变量。

```javascript
// src/core/index.js
import MockStoryEngine from './MockStoryEngine'

// Vite 环境变量控制：VITE_USE_MOCK=true 用 Mock，false 用真实 StoryEngine
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

let instance = null

// 统一获取 StoryEngine 实例（单例）
export function getStoryEngine() {
  if (instance) return instance

  if (USE_MOCK) {
    instance = new MockStoryEngine()
  } else {
    // 联调阶段：动态导入 AI 工程师实现的真实 StoryEngine
    // AI 工程师会在 src/core/StoryEngine.js 提供默认导出
    const RealEngine = require('./StoryEngine').default
    instance = new RealEngine()
  }
  return instance
}
```

**环境变量配置**（`.env` 文件）：

```bash
# .env.development（开发期，默认 Mock）
VITE_USE_MOCK=true

# .env.production（联调/生产期，用真实 StoryEngine）
VITE_USE_MOCK=false
```

**Mock 规范要点**：

1. **签名严格一致**：`generateStory / regenerate / finalize / saveEdit / getStatus` 的参数与返回值结构与角色分工 3.1 节完全一致
2. **返回值完整性**：`GenerateResult` 含 `success / segmentId / content / mappingDesc / error / errorCode`；`FinalizeResult` 含 `success / dayCompleted / chapterCompleted / chapterSummary / storyEnded / error`
3. **模拟真实耗时**：`generateStory` 延迟 2s，`regenerate` 延迟 1.5s，让加载状态与提示语轮播有展示机会
4. **模拟业务逻辑**：`finalize` 内置章节边界检测（功能规划 8.3）与故事完结判断（8.6），让前端能完整测试章节完成与结局流程
5. **内容多样性**：4 条 mock 内容随机选取，重生成时避免与上次重复，模拟"生成不同版本"
6. **占位符替换**：`{heroName}` 占位符按用户设置的主角名替换，让前端能验证主角名修改后的生效效果

---

## 八、打包指南

### 8.1 Capacitor 配置

完整的 `capacitor.config.json`（功能规划 3.3 节技术选型）：

```json
{
  "appId": "com.mystory.app",
  "appName": "My Story",
  "webDir": "dist",
  "server": {
    "androidScheme": "https",
    "iosScheme": "capacitor"
  },
  "android": {
    "allowMixedContent": false,
    "webContentsDebuggingEnabled": false
  },
  "ios": {
    "contentInset": "always",
    "limitsNavigationsToAppBoundDomains": true
  },
  "plugins": {
    "SpeechRecognition": {
      "permissions": ["record"]
    }
  }
}
```

**权限配置**：

- **Android** `android/app/src/main/AndroidManifest.xml` 需添加：
  - `<uses-permission android:name="android.permission.INTERNET" />`（AI 调用）
  - `<uses-permission android:name="android.permission.RECORD_AUDIO" />`（语音输入）
  - `<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />`（数据导出，可选）
- **iOS** `ios/App/App/Info.plist` 需添加：
  - `NSMicrophoneUsageDescription`：用于语音输入日记（功能规划 10.5）
  - `NSAppTransportSecurity` 允许 AI API 的 HTTPS 请求

### 8.2 Android 打包步骤

```bash
# 1. 构建前端产物
npm run build

# 2. 同步到 Android 项目
npx cap sync android

# 3. 用 Android Studio 打开（首次需配置 Android SDK）
npx cap open android

# === 以下在 Android Studio 中操作 ===

# 4. 生成签名 keystore（仅首次）
#    Build > Generate Signed Bundle / APK > APK > Create new...
#    填写 keystore 路径、密码、别名、有效期（建议 25 年）

# 5. 生成发布 APK
#    Build > Generate Signed Bundle / APK > APK
#    选择 release、选择 keystore → 选 release variant → Finish
#    产物：android/app/build/outputs/apk/release/app-release.apk

# 6. 生成 AAB（上架 Google Play 用）
#    Build > Generate Signed Bundle / APK > Android App Bundle
#    产物：android/app/build/outputs/bundle/release/app-release.aab
```

**命令行打包（可选，CI/CD 用）**：

```bash
# 配置签名（android/gradle.properties 或 ~/.gradle/gradle.properties）
# MYSTORY_UPLOAD_STORE_FILE=/path/to/keystore.jks
# MYSTORY_UPLOAD_KEY_ALIAS=mystory
# MYSTORY_UPLOAD_STORE_PASSWORD=***
# MYSTORY_UPLOAD_KEY_PASSWORD=***

cd android
./gradlew assembleRelease    # 生成 APK
./gradlew bundleRelease      # 生成 AAB
```

### 8.3 iOS 打包步骤（简要）

> iOS 打包需 macOS + Xcode + Apple Developer 账号。

```bash
# 1. 构建前端产物
npm run build

# 2. 同步到 iOS 项目
npx cap sync ios

# 3. 用 Xcode 打开
npx cap open ios

# === 以下在 Xcode 中操作 ===

# 4. 配置签名
#    TARGETS > App > Signing & Capabilities
#    选择 Team（Apple Developer 账号），Bundle Identifier 改为 com.mystory.app

# 5. 配置 Info.plist 权限描述
#    Privacy - Microphone Usage Description: "用于语音输入日记"

# 6. 真机调试
#    连接 iPhone，选择设备，Product > Run

# 7. 打包上架
#    Product > Archive → Distribute App → App Store Connect / Ad Hoc / Development
#    产物：.ipa 文件
```

**注意事项**：

- iOS 首次运行需在"设置 > 通用 > VPN与设备管理"信任开发者证书
- App Store 上架需通过 Apple 审核，API Key 直连第三方 AI 服务的 App 需说明用途
- Web Speech API 在 iOS WKWebView 中支持不稳定，务必使用 `@capacitor-community/speech-recognition` 降级（功能规划 10.5）

### 8.4 打包前检查清单

| 检查项 | 标准 |
|--------|------|
| `npm run build` 无错误 | 产物在 dist/ 完整生成 |
| `sql-wasm.wasm` 在 dist/ 中 | sql.js 能加载 WASM |
| 路由用 hash 模式 | Capacitor file:// 下刷新不 404 |
| `base: './'` | 资源相对路径加载正常 |
| API Key 不写日志 | 功能规划 10.3 安全要求 |
| 离线可读已生成章节 | 功能规划 10.6 |
| 权限描述文案完整 | 麦克风权限说明清晰 |

---

## 九、开发计划

依据角色分工 6.1 节阶段划分与 6.3 节交付时间线，前端工程师在阶段 1（第 1-3 天）和阶段 2（第 4-5 天）的任务按天拆分如下。阶段 1 完全并行无依赖，阶段 2 前端用 MockStoryEngine 独立完成全部页面。

### 9.1 阶段 1：框架 + 数据层 + Mock（第 1-3 天）

#### 第 1 天 — 项目框架搭建

| 时段 | 任务 | 交付物 |
|------|------|--------|
| 上午 | Vite + Vue 3 脚手架初始化、依赖安装（vue-router、pinia、sql.js、Capacitor） | `package.json`、`vite.config.js` |
| 上午 | sql.js 集成：复制 WASM 到 public、配置 locateFile | sql.js 能在浏览器加载 |
| 下午 | 项目目录结构搭建（views/components/db/core/utils/config） | 完整目录骨架 |
| 下午 | 路由配置 + 导航守卫（5.1 节）、main.js 入口、App.vue 根组件 | 路由可跑通，引导页守卫生效 |
| 下午 | Capacitor 初始化（`cap init`、`cap add android`） | capacitor.config.json、android/ 目录 |

**第 1 天验收标准**：`npm run dev` 启动无报错，访问任意路由时未完成引导则跳转 `/onboarding`。

#### 第 2 天 — 数据层开发（上）

| 时段 | 任务 | 交付物 |
|------|------|--------|
| 上午 | Database.js 完整实现（4.1 节）：WASM 加载、文件读写、queryAll/queryOne/execute | `src/db/Database.js` |
| 上午 | schema.js 完整建表 SQL（4.2 节，9 张表） | `src/db/migrations/schema.js` |
| 下午 | 迁移机制（4.3 节）：migrations/index.js + 版本号管理 | 迁移可执行，db_version 写入 |
| 下午 | AppConfigRepository、UserRepository 实现（4.4.6、4.4.1） | 2 个 Repository 可用 |
| 下午 | 配置文件加载器骨架（4.5 节）：JSON 静态 import + 校验函数 | ConfigLoader.js（待配置 JSON 交付后填充写入逻辑） |

**第 2 天验收标准**：应用启动后数据库初始化成功，`UserRepository.get()` 返回默认行，`AppConfigRepository.set/get` 可读写。

#### 第 3 天 — 数据层开发（下）+ Mock StoryEngine

| 时段 | 任务 | 交付物 |
|------|------|--------|
| 上午 | DiaryRepository、ChapterRepository 实现（4.4.2、4.4.3） | 2 个 Repository 可用 |
| 上午 | SegmentRepository、WorldRepository 实现（4.4.4、4.4.5） | 2 个 Repository 可用 |
| 下午 | MockStoryEngine 完整实现（第七章）+ 切换器（7.2 节） | `src/core/MockStoryEngine.js`、`src/core/index.js` |
| 下午 | 数据导出/导入 DataExporter.js（4.6 节） | exportData/importData 可用 |
| 下午 | 6 个 Repository + Database 单元自测（用 Mock 数据走通建表→增删改查→导出导入） | 数据层整体跑通 |

**第 3 天验收标准**：6 个 Repository 全部实现且方法签名与角色分工 4.1 节完全一致；MockStoryEngine 的 5 个方法可被调用并返回正确结构；数据层可交付给 AI 工程师联调（接口 B 就绪）。

### 9.2 阶段 2：全部页面 UI（第 4-5 天，用 Mock StoryEngine）

#### 第 4 天 — 核心页面开发

| 时段 | 任务 | 交付物 |
|------|------|--------|
| 上午 | 5 个通用组件（第六章）：LoadingSpinner、ChapterList、BehaviorTags、VoiceInput、ErrorToast | `src/components/` 5 个组件 |
| 上午 | Onboarding.vue 引导页 5 步（5.3 节）+ 加密工具 Crypto.js | 引导流程可走通 |
| 下午 | Home.vue 首页/阅读器（5.4 节）：空状态、加载状态、目录、记日记入口 | 首页可展示 mock 段落 |
| 下午 | DiaryInput.vue 日记输入页（5.5 节）：文字输入、草稿保存、标签、语音 | 可输入并跳预览页 |
| 下午 | Preview.vue 生成预览页（5.6 节）：调用 MockStoryEngine、生成中/错误/预览三态、重生成/编辑/通过 | 完整生成→审核→定稿流程跑通 |

**第 4 天验收标准**：用 MockStoryEngine 可走通"引导 → 记日记 → 生成预览 → 通过 → 回首页"完整主流程。

#### 第 5 天 — 设置页与阅读页 + 收尾

| 时段 | 任务 | 交付物 |
|------|------|--------|
| 上午 | ChapterReader.vue 章节阅读页（5.7 节） | 可阅读历史章节 |
| 上午 | Settings.vue + SettingsWorld.vue（5.8、5.9 节） | 设置首页 + 世界观设置 |
| 下午 | SettingsApi.vue API Key 设置页（5.10 节）：含测试连接、加密保存 | API Key 可配置 |
| 下午 | SettingsData.vue 数据管理页（5.11 节）：导出、导入、重置 | 数据管理功能可用 |
| 下午 | 全页面三态处理统一（5.12 节）、样式打磨、移动端适配 | 9 个页面全部完成 |

**第 5 天验收标准**：9 个页面全部完成，所有交互逻辑用 MockStoryEngine 跑通；前端代码就绪，等待 AI 工程师交付真实 StoryEngine 进入阶段 3 联调。

### 9.3 前端交付里程碑对照

| 里程碑（功能规划 15.1） | 对应天数 | 前端交付物 |
|------------------------|---------|-----------|
| M2 项目框架搭建 | 第 1 天 | Vite + Vue 3 + 路由 + sql.js + Capacitor 初始化 |
| M3 数据层开发 | 第 2-3 天 | 9 张表 + 迁移 + 6 Repository + 导出导入 + 配置加载 |
| MockStoryEngine | 第 3 天 | 接口 A 的 Mock 实现（供前端独立开发） |
| M7 前端页面开发 | 第 4-5 天 | 9 页面 + 5 通用组件，用 Mock 跑通全流程 |

### 9.4 阶段 3-4 前端任务预告（联调与打包，第 6-10 天）

供前端工程师预知后续工作（详见功能规划 15.1 M8-M10）：

- **第 6-7 天（阶段 3 联调）**：将 `VITE_USE_MOCK` 切为 false，替换为真实 StoryEngine；与 AI 工程师联调全流程；替换 AI 端 MockRepository 为真实 Repository
- **第 8-9 天（阶段 4 打包）**：Capacitor 打包 Android/iOS、真机测试、权限验证、离线场景测试
- **第 10 天（交付）**：Bug 修复、最终 App 安装包交付

---

## 附录：文档一致性说明

| 内容 | 来源 | 一致性保证 |
|------|------|-----------|
| 9 张表建表 SQL | 功能规划 7.1 节 | 字段、类型、约束、索引一一对应 |
| 6 个 Repository 方法签名 | 角色分工 4.1 节接口 B | 方法名、参数、返回类型完全一致 |
| StoryEngine 方法签名 | 角色分工 3.1 节接口 A | generateStory/regenerate/finalize/saveEdit/getStatus 完全一致 |
| 9 个页面路由 | 功能规划 4.3 节 | 路径与页面对应 |
| 错误码体系 | 功能规划 11.1 节 | E001-E014 含义与提示文案一致 |
| 章节划分 | 功能规划 8.1 节 | 6 段（序章 5 + 4×20 + 终章 5） |
| 配置 JSON 格式 | 角色分工 5.2 节 | 6 个文件的 Schema 校验对应 |
| 开发计划 | 角色分工 6.1/6.3 节 | 阶段 1-2 按天拆分，对应里程碑 M2/M3/M7 |

> 若上游文档（功能规划、角色分工）发生接口变更，本指南须同步更新，并在角色分工第七章变更日志登记。
