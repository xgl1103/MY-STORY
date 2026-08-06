import test from 'node:test'
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { runMigrations } from '../src/db/migrations/index.js'
import { persistDiaryDraft } from '../src/features/diary/diaryDraft.js'
import {
  MOOD_OPTIONS,
  WEATHER_OPTIONS,
  DEFAULT_MOOD_KEY,
  DEFAULT_WEATHER_KEY,
  resolveSelectionKey,
  getMoodOption,
  getWeatherOption,
  resolveStoredSelections,
  overlayTodaySelection
} from '../src/features/diary/moodWeatherOptions.js'

test('exposes the approved mood and weather labels', () => {
  assert.deepEqual(MOOD_OPTIONS.map(item => item.label), [
    '生气', '心动', '得意', '开心', '烦躁',
    '伤心', '平静', '丧', '孤独', '累了'
  ])
  assert.deepEqual(WEATHER_OPTIONS.map(item => item.label), [
    '晴', '阴', '多云', '雨', '雪', '风'
  ])
})

test('returns display data for new and legacy mood keys', () => {
  assert.equal(getMoodOption('angry').label, '生气')
  assert.equal(getMoodOption('good').key, 'happy')
  assert.equal(getMoodOption('missing').key, DEFAULT_MOOD_KEY)
})

test('returns display data for weather keys and missing weather', () => {
  assert.equal(getWeatherOption('rainy').label, '雨')
  assert.equal(getWeatherOption(undefined).key, DEFAULT_WEATHER_KEY)
})

test('prefers draft selections over persisted diary selections', () => {
  assert.deepEqual(resolveStoredSelections({
    draftMood: 'angry',
    draftWeather: 'rainy',
    diaryMood: 'happy',
    diaryWeather: 'sunny'
  }), { mood: 'angry', weather: 'rainy' })

  assert.deepEqual(resolveStoredSelections({
    diaryMood: 'good',
    diaryWeather: 'cloudy'
  }), { mood: 'happy', weather: 'cloudy' })
})

test('restores string keys and legacy numeric mood indexes', () => {
  assert.equal(resolveSelectionKey('happy', MOOD_OPTIONS, DEFAULT_MOOD_KEY), 'happy')
  assert.equal(resolveSelectionKey('good', MOOD_OPTIONS, DEFAULT_MOOD_KEY), 'happy')
  assert.equal(resolveSelectionKey('low', MOOD_OPTIONS, DEFAULT_MOOD_KEY), 'down')
  assert.equal(resolveSelectionKey(0, MOOD_OPTIONS, DEFAULT_MOOD_KEY), 'happy')
  assert.equal(resolveSelectionKey(3, MOOD_OPTIONS, DEFAULT_MOOD_KEY), 'down')
  assert.equal(resolveSelectionKey('missing', MOOD_OPTIONS, DEFAULT_MOOD_KEY), DEFAULT_MOOD_KEY)
  assert.equal(resolveSelectionKey(undefined, WEATHER_OPTIONS, DEFAULT_WEATHER_KEY), DEFAULT_WEATHER_KEY)
})

test('previews today selections in the calendar without mutating persisted diaries', () => {
  const persisted = new Map([
    ['2026-08-03', { id: 7, mood: 'happy', weather: 'sunny' }]
  ])

  const preview = overlayTodaySelection(persisted, '2026-08-03', 'angry', 'rainy')

  assert.deepEqual(preview.get('2026-08-03'), {
    id: 7,
    mood: 'angry',
    weather: 'rainy',
    isSelectionPreview: true
  })
  assert.deepEqual(persisted.get('2026-08-03'), {
    id: 7,
    mood: 'happy',
    weather: 'sunny'
  })
})

test('persists a selection draft immediately through the storage contract', () => {
  const values = new Map()
  const storage = { setItem: (key, value) => values.set(key, value) }
  const draft = { mood: 'angry', weather: 'rainy' }

  persistDiaryDraft(storage, 'diary_draft_1', draft)

  assert.deepEqual(JSON.parse(values.get('diary_draft_1')), draft)
})

test('migration chain from version 7 adds weather and records version 9', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('CREATE TABLE app_config (key TEXT UNIQUE, value TEXT, updated_at TEXT)')
  db.run('CREATE TABLE diary_entries (id INTEGER PRIMARY KEY, mood TEXT)')
  db.run('CREATE TABLE chapter_comments (id INTEGER PRIMARY KEY, likes INTEGER DEFAULT 0)')
  db.run("INSERT INTO app_config (key, value) VALUES ('db_version', '7')")

  await runMigrations(db)

  const columns = db.exec('PRAGMA table_info(diary_entries)')[0].values.map(row => row[1])
  const version = db.exec("SELECT value FROM app_config WHERE key = 'db_version'")[0].values[0][0]
  assert.ok(columns.includes('weather'))
  assert.equal(version, '9')
  db.close()
})
