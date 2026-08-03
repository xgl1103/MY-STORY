export const MOOD_OPTIONS = [
  { key: 'angry', emoji: '😤', label: '生气', tone: 'red' },
  { key: 'excited', emoji: '🥰', label: '心动', tone: 'coral' },
  { key: 'proud', emoji: '😎', label: '得意', tone: 'orange' },
  { key: 'happy', emoji: '😄', label: '开心', tone: 'yellow' },
  { key: 'annoyed', emoji: '😣', label: '烦躁', tone: 'brown' },
  { key: 'sad', emoji: '😢', label: '伤心', tone: 'blue' },
  { key: 'calm', emoji: '😌', label: '平静', tone: 'lime' },
  { key: 'down', emoji: '😞', label: '丧', tone: 'sky' },
  { key: 'lonely', emoji: '🥺', label: '孤独', tone: 'cyan' },
  { key: 'tired', emoji: '😴', label: '累了', tone: 'green' }
]

export const WEATHER_OPTIONS = [
  { key: 'sunny', emoji: '☀️', label: '晴', tone: 'yellow' },
  { key: 'overcast', emoji: '☁️', label: '阴', tone: 'gray' },
  { key: 'cloudy', emoji: '⛅', label: '多云', tone: 'sky' },
  { key: 'rainy', emoji: '🌧️', label: '雨', tone: 'blue' },
  { key: 'snowy', emoji: '🌨️', label: '雪', tone: 'cyan' },
  { key: 'windy', emoji: '🌬️', label: '风', tone: 'green' }
]

export const DEFAULT_MOOD_KEY = 'happy'
export const DEFAULT_WEATHER_KEY = 'sunny'

const LEGACY_MOOD_KEYS = {
  good: 'happy',
  ok: 'calm',
  low: 'down'
}

const LEGACY_MOOD_INDEX_KEYS = ['happy', 'calm', 'calm', 'down', 'tired']

export function resolveSelectionKey(value, options, fallbackKey) {
  if (options === MOOD_OPTIONS && Number.isInteger(value)) {
    return LEGACY_MOOD_INDEX_KEYS[value] || fallbackKey
  }
  if (Number.isInteger(value) && options[value]) return options[value].key
  const legacyKey = LEGACY_MOOD_KEYS[value]
  if (legacyKey && options.some(item => item.key === legacyKey)) return legacyKey
  return options.some(item => item.key === value) ? value : fallbackKey
}

export function getMoodOption(value) {
  const key = resolveSelectionKey(value, MOOD_OPTIONS, DEFAULT_MOOD_KEY)
  return MOOD_OPTIONS.find(item => item.key === key) || MOOD_OPTIONS[0]
}

export function getWeatherOption(value) {
  const key = resolveSelectionKey(value, WEATHER_OPTIONS, DEFAULT_WEATHER_KEY)
  return WEATHER_OPTIONS.find(item => item.key === key) || WEATHER_OPTIONS[0]
}

export function resolveStoredSelections({
  draftMood,
  draftWeather,
  diaryMood,
  diaryWeather
} = {}) {
  return {
    mood: resolveSelectionKey(
      draftMood !== undefined ? draftMood : diaryMood,
      MOOD_OPTIONS,
      DEFAULT_MOOD_KEY
    ),
    weather: resolveSelectionKey(
      draftWeather !== undefined ? draftWeather : diaryWeather,
      WEATHER_OPTIONS,
      DEFAULT_WEATHER_KEY
    )
  }
}

export function overlayTodaySelection(diariesByDate, todayDate, mood, weather) {
  const preview = new Map(diariesByDate || [])
  preview.set(todayDate, {
    ...(preview.get(todayDate) || {}),
    mood,
    weather,
    isSelectionPreview: true
  })
  return preview
}
