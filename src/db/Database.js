// src/db/Database.js
// sql.js 初始化 + 写回机制 + Web/Capacitor 双模式持久化
// sql-wasm-browser.js 通过 index.html 的 <script> 标签预加载，全局可用 window.initSqlJs
import { SCHEMA_SQL } from './migrations/schema.js'
import { runMigrations } from './migrations/index.js'

const DB_FILE = 'mystory.db'
const LS_KEY = 'mystory_db_base64' // Web 开发模式下的 localStorage 键名

let SQL = null
let db = null
let writeCounter = 0
let initPromise = null   // 防止并发 initDatabase
let persistPromise = null // 串行化 persist，防止并发写回竞争

// 检测是否在 Capacitor 原生环境中运行
function isNative() {
  return typeof window !== 'undefined' &&
    window.Capacitor &&
    window.Capacitor.isNative &&
    window.Capacitor.isNative()
}

// 等待 window.initSqlJs 可用（index.html 中 script 标签可能尚未加载完毕）
function waitForInitSqlJs(maxWait = 5000) {
  return new Promise((resolve, reject) => {
    if (window.initSqlJs) {
      resolve(window.initSqlJs)
      return
    }
    const start = Date.now()
    const timer = setInterval(() => {
      if (window.initSqlJs) {
        clearInterval(timer)
        resolve(window.initSqlJs)
      } else if (Date.now() - start > maxWait) {
        clearInterval(timer)
        reject(new Error('等待 initSqlJs 超时，请确保 sql-wasm-browser.js 已正确加载'))
      }
    }, 100)
  })
}

// 统一的 db 句柄获取入口（Repository 通过此函数拿到 db）
export function getDB() {
  if (!db) throw new Error('E008: 数据库未初始化，请先调用 initDatabase()')
  return db
}

/**
 * 智能分割 SQL 语句：尊重 BEGIN...END 块边界
 * 解决 split(';') 会截断触发器体（trigger body）的问题
 * 触发器形如：CREATE TRIGGER ... BEGIN ... END; 内部含分号
 */
function splitSqlStatements(sql) {
  // 7.2 修复：移除单行注释时避免破坏含 -- 的字符串字面量
  // 只移除行首或空白后的 -- 注释（SQL 标准：-- 后需有空格）
  const cleaned = sql.replace(/(^|\s)--[^\n]*/g, '$1')
  const upper = cleaned.toUpperCase()
  const statements = []
  let current = ''
  let depth = 0 // BEGIN...END 嵌套深度
  let caseDepth = 0 // CASE...END 嵌套深度（7.2 修复）

  for (let i = 0; i < cleaned.length; i++) {
    current += cleaned[i]

    // 检测 BEGIN 关键字（需词边界：前后为空白或字符串首尾）
    if (upper.substr(i, 5) === 'BEGIN') {
      const prev = i > 0 ? cleaned[i - 1] : '\n'
      const next = cleaned[i + 5] || '\n'
      if (/[\s\n]/.test(prev) && /[\s\n]/.test(next)) {
        depth++
      }
    }

    // 7.2 修复：检测 CASE 关键字（增加 caseDepth）
    if (upper.substr(i, 4) === 'CASE') {
      const prev = i > 0 ? cleaned[i - 1] : '\n'
      const next = cleaned[i + 4] || '\n'
      if (/[\s\n]/.test(prev) && /[\s\n(]/.test(next)) {
        caseDepth++
      }
    }

    // 检测 END 关键字（需词边界）
    if (upper.substr(i, 3) === 'END') {
      const prev = i > 0 ? cleaned[i - 1] : '\n'
      const next = cleaned[i + 3] || '\n'
      if (/[\s\n]/.test(prev) && /[\s\n;]/.test(next)) {
        // 7.2 修复：优先消耗 CASE...END
        if (caseDepth > 0) {
          caseDepth--
        } else {
          depth = Math.max(0, depth - 1)
        }
      }
    }

    // 只在 BEGIN...END 块外（depth=0）按分号分割
    if (cleaned[i] === ';' && depth === 0) {
      const stmt = current.trim()
      if (stmt && stmt !== ';') statements.push(stmt)
      current = ''
    }
  }
  if (current.trim()) statements.push(current.trim())
  return statements
}

// 应用启动时调用
export async function initDatabase() {
  if (db) return db
  if (initPromise) return initPromise // 并发调用复用同一个 Promise

  initPromise = (async () => {
    // 1. 加载 sql.js WASM
    if (!SQL) {
      const initSqlJs = await waitForInitSqlJs()
      // sql-wasm-browser.js 期望 WASM 文件名为 sql-wasm-browser.wasm
      // 该文件已复制到 public/ 目录，通过 locateFile 指定加载路径
      SQL = await initSqlJs({ locateFile: f => './' + f })
    }

    // 2. 尝试从持久化文件加载已有数据库
    const fileData = await readDbFile()
    if (fileData) {
      db = new SQL.Database(fileData)
    } else {
      db = new SQL.Database()
    }

    // 3. 执行建表（CREATE TABLE IF NOT EXISTS，可重复执行）
    // 优先使用 db.exec() 整体执行——它能正确处理 BEGIN...END 触发器体
    // 若整体失败（如 FTS5 不支持），降级为智能分割逐条执行
    try {
      db.exec(SCHEMA_SQL)
    } catch (e) {
      console.warn('[DB] 整体执行 schema 失败，降级为逐条执行:', e.message)
      const statements = splitSqlStatements(SCHEMA_SQL)
      for (const stmt of statements) {
        try {
          db.run(stmt)
        } catch (e2) {
          // FTS5 虚拟表 / 触发器等可能不支持，跳过不中断
          console.warn('[DB] 跳过不支持的SQL语句:', stmt.substring(0, 60), e2.message)
        }
      }
    }

    // 4. 条件创建 FTS5 同步触发器
    // 仅当 story_fts 表实际存在时才创建触发器
    // 避免在无 FTS5 模块的环境中创建引用不存在表的触发器（会导致 INSERT 故障）
    try {
      const ftsCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='story_fts'")
      try {
        const hasFts = ftsCheck.step()
        if (hasFts) {
          db.run(`CREATE TRIGGER IF NOT EXISTS trg_story_fts_insert
            AFTER INSERT ON story_segments
            WHEN new.content IS NOT NULL AND LENGTH(new.content) > 50
            BEGIN
              INSERT INTO story_fts (segment_id, story_day, chapter_id, content)
              VALUES (new.id, new.day_number, new.chapter_id, new.content);
            END`)
          db.run(`CREATE TRIGGER IF NOT EXISTS trg_story_fts_update
            AFTER UPDATE OF content ON story_segments
            WHEN new.content IS NOT NULL AND LENGTH(new.content) > 50
            BEGIN
              DELETE FROM story_fts WHERE segment_id = old.id;
              INSERT INTO story_fts (segment_id, story_day, chapter_id, content)
              VALUES (new.id, new.day_number, new.chapter_id, new.content);
            END`)
          console.log('[DB] FTS5 可用，已创建同步触发器')
        } else {
          // 清理可能残留的旧触发器（从之前版本升级时可能存在）
          db.run('DROP TRIGGER IF EXISTS trg_story_fts_insert')
          db.run('DROP TRIGGER IF EXISTS trg_story_fts_update')
          console.log('[DB] FTS5 不可用，已跳过同步触发器')
        }
      } catch (e) {
        console.warn('[DB] FTS5 触发器创建失败:', e.message)
      } finally {
        // R10 修复：free 移到 finally，确保所有路径只释放一次
        try { ftsCheck.free() } catch (_) { /* already freed */ }
      }
    } catch (e) {
      console.warn('[DB] FTS5 检测失败:', e.message)
    }

    // 5. 执行迁移（见 migrations/index.js）
    await runMigrations(db)

    // 6. 写回一次，确保新库落盘
    await persist()
    return db
  })()

  try {
    return await initPromise
  } catch (e) {
    // 初始化失败时重置 promise，允许重试
    initPromise = null
    throw e
  }
}

// 从持久化存储读取数据库文件，返回 Uint8Array；不存在返回 null
async function readDbFile() {
  if (isNative()) {
    // Capacitor 原生环境：使用 Filesystem 插件
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const res = await Filesystem.readFile({
        path: DB_FILE,
        directory: Directory.Data
      })
      // res.data 是 base64 字符串
      return base64ToUint8Array(res.data)
    } catch (e) {
      // 文件不存在时返回 null，触发新建
      return null
    }
  } else {
    // Web 开发环境：使用 localStorage
    try {
      const base64 = localStorage.getItem(LS_KEY)
      if (!base64) return null
      return base64ToUint8Array(base64)
    } catch (e) {
      return null
    }
  }
}

// 把内存数据库写回持久化存储
export async function persist() {
  if (!db) return
  // 串行化：如果已有 persist 在进行中，复用其 Promise
  if (persistPromise) return persistPromise

  persistPromise = doPersist()
  try {
    await persistPromise
  } finally {
    persistPromise = null
  }
}

async function doPersist() {
  const data = db.export() // Uint8Array
  const base64 = uint8ArrayToBase64(data)

  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path: DB_FILE,
      data: base64,
      directory: Directory.Data,
      recursive: true
    })
  } else {
    // Web 开发环境：使用 localStorage（不吞掉异常，由 markWrite 统一处理）
    localStorage.setItem(LS_KEY, base64)
  }
}

// 写回策略（功能规划 10.1 节）：
// - finalized 状态变更后立即写回
// - 其他操作每 5 次写回一次
// Repository 在写操作后调用 markWrite()，由调用方决定是否 force
export async function markWrite(force = false) {
  writeCounter++
  if (force || writeCounter >= 5) {
    try {
      await persist()
      writeCounter = 0 // 仅在成功时重置计数器
    } catch (e) {
      // 写回失败时不重置 writeCounter，下次写入会再次尝试持久化
      console.error('[MyStory] 数据库写回失败，将在下次写入时重试:', e)
    }
  }
}

// 执行查询，返回对象数组（自动按列名映射）
export function queryAll(sql, params = []) {
  const database = getDB()
  const stmt = database.prepare(sql)
  try {
    stmt.bind(params)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    return rows
  } finally {
    stmt.free() // 确保无论是否异常都释放 prepared statement
  }
}

// 执行单行查询，返回对象或 null
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params)
  return rows[0] || null
}

// 执行写操作（INSERT/UPDATE/DELETE），返回受影响行数
export function execute(sql, params = []) {
  const database = getDB()
  database.run(sql, params)
  return database.getRowsModified()
}

// 事务包裹器：确保一组同步 SQL 操作的原子性
// fn 内部使用 execute/queryAll 等同步函数，不可包含 await
export function runTransaction(fn) {
  const database = getDB()
  database.run('BEGIN')
  try {
    fn()
    database.run('COMMIT')
  } catch (e) {
    database.run('ROLLBACK')
    throw e
  }
}

// ===== Base64 工具函数 =====

function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function uint8ArrayToBase64(data) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk))
  }
  return btoa(binary)
}
