import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { SCHEMA_SQL } from '../src/db/migrations/schema.js'
import { runMigrations } from '../src/db/migrations/index.js'

const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
const wasmPath = fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))

test('SCHEMA_SQL creates chapter comments with an unliked default state', () => {
  assert.match(
    SCHEMA_SQL,
    /likes\s+INTEGER\s+DEFAULT\s+0,\s*\n\s*is_liked\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0,/i
  )
})

test('migration from version 8 preserves likes and initializes is_liked to zero', async () => {
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const db = new SQL.Database()
  db.run('CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP)')
  db.run(`CREATE TABLE chapter_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_number INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    persona TEXT NOT NULL,
    persona_name TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    content TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    reveal_at INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  db.run("INSERT INTO app_config (key, value) VALUES ('db_version', '8')")
  db.run("INSERT INTO chapter_comments (chapter_number, paragraph_index, persona, persona_name, avatar_color, content, likes) VALUES (1, 0, 'reader', 'Reader', '#000', 'nice', 7)")

  await runMigrations(db)

  const comment = db.exec('SELECT likes, is_liked FROM chapter_comments')[0].values[0]
  const version = db.exec("SELECT value FROM app_config WHERE key = 'db_version'")[0].values[0][0]
  assert.deepEqual(comment, [7, 0])
  assert.equal(version, '9')
})

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
}
globalThis.window = { initSqlJs: options => initSqlJs({ ...options, locateFile: () => wasmPath }) }

const [{ initDatabase, execute, queryOne }, { CommentRepository }] = await Promise.all([
  import('../src/db/Database.js'),
  import('../src/db/repositories/CommentRepository.js'),
])

await initDatabase()

function insertComment(likes = 0) {
  execute(
    `INSERT INTO chapter_comments
      (chapter_number, paragraph_index, persona, persona_name, avatar_color, content, likes, reveal_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, 0, 'reader', 'Reader', '#000', 'nice', likes, 0]
  )
  return queryOne('SELECT last_insert_rowid() AS id').id
}

test('setLiked transitions a persisted comment without repeat changes', async () => {
  const id = insertComment(3)

  assert.deepEqual(await CommentRepository.setLiked(id, 1), { id, likes: 4, is_liked: 1 })
  assert.deepEqual(await CommentRepository.setLiked(id, true), { id, likes: 4, is_liked: 1 })
  assert.deepEqual(await CommentRepository.setLiked(id, 0), { id, likes: 3, is_liked: 0 })
  assert.deepEqual(await CommentRepository.setLiked(id, false), { id, likes: 3, is_liked: 0 })
})

test('setLiked never decrements a zero-like comment below zero', async () => {
  const id = insertComment(0)

  assert.deepEqual(await CommentRepository.setLiked(id, 0), { id, likes: 0, is_liked: 0 })
})

test('setLiked returns null when the comment does not exist', async () => {
  assert.equal(await CommentRepository.setLiked(999999, 1), null)
})
