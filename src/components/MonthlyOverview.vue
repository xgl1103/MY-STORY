<template>
  <section
    class="month-overview"
    tabindex="0"
    aria-label="月度日记总览"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
    @keydown.left.prevent="emit('change-month', -1)"
    @keydown.right.prevent="emit('change-month', 1)"
  >
    <header class="month-toolbar">
      <button type="button" class="month-button" aria-label="查看上一个月" @click="emit('change-month', -1)">‹</button>
      <div class="month-title">
        <span class="month-kicker">MONTHLY MOMENTS</span>
        <h2>{{ year }}年{{ month + 1 }}月</h2>
      </div>
      <button type="button" class="month-button" aria-label="查看下一个月" @click="emit('change-month', 1)">›</button>
    </header>

    <div class="weekdays" aria-hidden="true">
      <span v-for="label in weekdays" :key="label">{{ label }}</span>
    </div>

    <div class="month-grid">
      <button
        v-for="day in days"
        :key="day.dateStr"
        type="button"
        class="month-day"
        :class="{
          outside: !day.currentMonth,
          today: day.isToday,
          selected: day.dateStr === selectedDate,
          dimmed: isDimmed(day)
        }"
        :aria-label="dayAriaLabel(day)"
        :aria-pressed="day.dateStr === selectedDate"
        @click="emit('select-day', day)"
      >
        <span class="day-number">{{ day.day }}</span>
        <span class="day-statuses" aria-hidden="true">
          <span class="day-status mood-status" :class="{ empty: !day.diary?.mood }">
            {{ day.diary?.mood ? getMoodOption(day.diary.mood).emoji : '＋' }}
          </span>
          <span class="day-status weather-status" :class="{ empty: !day.diary?.weather }">
            {{ day.diary?.weather ? getWeatherOption(day.diary.weather).emoji : '＋' }}
          </span>
        </span>
      </button>
    </div>

    <div class="calendar-legend" aria-hidden="true">
      <span><i class="legend-dot mood-dot" />心情</span>
      <span><i class="legend-dot weather-dot" />天气</span>
      <span class="swipe-tip">左滑上月 · 右滑下月</span>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { buildMonthGrid, getSwipeMonthDelta } from '@/features/diary/monthCalendar.js'
import { getMoodOption, getWeatherOption } from '@/features/diary/moodWeatherOptions.js'

const props = defineProps({
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  diariesByDate: { type: Map, default: () => new Map() },
  selectedDate: { type: String, default: '' },
  dimDate: { type: Function, default: null }
})

const emit = defineEmits(['change-month', 'select-day'])
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const touchStart = ref(null)

const days = computed(() => buildMonthGrid(props.year, props.month, props.diariesByDate))

function isDimmed(day) {
  return props.dimDate ? props.dimDate(day) : false
}

function dayAriaLabel(day) {
  const mood = day.diary?.mood ? getMoodOption(day.diary.mood).label : '未记录心情'
  const weather = day.diary?.weather ? getWeatherOption(day.diary.weather).label : '未记录天气'
  return `${day.dateStr}，${mood}，${weather}${day.isToday ? '，今天' : ''}`
}

function onTouchStart(event) {
  const touch = event.changedTouches?.[0]
  if (!touch) return
  touchStart.value = { x: touch.clientX, y: touch.clientY }
}

function onTouchEnd(event) {
  const start = touchStart.value
  const touch = event.changedTouches?.[0]
  touchStart.value = null
  if (!start || !touch) return
  const delta = getSwipeMonthDelta(start.x, start.y, touch.clientX, touch.clientY)
  if (delta) emit('change-month', delta)
}
</script>

<style scoped>
.month-overview {
  width: 100%;
  outline: none;
  color: var(--color-text);
  touch-action: pan-y;
}

.month-overview:focus-visible {
  border-radius: 18px;
  box-shadow: 0 0 0 3px rgba(196, 92, 62, 0.16);
}

.month-toolbar {
  display: grid;
  grid-template-columns: 42px 1fr 42px;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.month-button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid rgba(196, 92, 62, 0.2);
  border-radius: 50%;
  background: #fff6ef;
  color: var(--color-primary);
  font-size: 27px;
  line-height: 1;
}

.month-button:focus-visible {
  outline: 3px solid rgba(196, 92, 62, 0.25);
  outline-offset: 2px;
}

.month-title {
  min-width: 0;
  text-align: center;
}

.month-kicker {
  display: block;
  margin-bottom: 1px;
  color: #b98977;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.month-title h2 {
  margin: 0;
  color: #64483e;
  font-size: 19px;
  line-height: 1.3;
}

.weekdays,
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.weekdays {
  margin-bottom: 6px;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 650;
  text-align: center;
}

.month-day {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 68px;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  padding: 7px 2px 5px;
  border: 1px solid transparent;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.76);
  color: var(--color-text-secondary);
}

.month-day:hover {
  background: #fff9f5;
}

.month-day:focus-visible {
  outline: 2px solid rgba(196, 92, 62, 0.35);
  outline-offset: 1px;
}

.month-day.today {
  border-color: var(--color-primary);
  box-shadow: inset 0 0 0 1px rgba(196, 92, 62, 0.12);
}

.month-day.selected {
  background: #fff0e7;
  color: var(--color-primary-dark);
}

.month-day.outside {
  opacity: 0.38;
}

.month-day.dimmed {
  opacity: 0.34;
}

.day-number {
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
}

.month-day.today .day-number {
  color: var(--color-primary);
}

.day-statuses {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
}

.day-status {
  display: grid;
  width: 21px;
  height: 21px;
  place-items: center;
  border-radius: 50%;
  font-size: 13px;
  line-height: 1;
}

.mood-status { background: #fff0e7; }
.weather-status { background: #eef7ff; }

.day-status.empty {
  border: 1px dashed #d9cfc9;
  background: transparent;
  color: #c5b7af;
  font-size: 13px;
  font-weight: 400;
}

.calendar-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.calendar-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mood-dot { background: #f7c3ad; }
.weather-dot { background: #b8dcf5; }
.calendar-legend .swipe-tip { margin-left: auto; }

@media (max-width: 360px) {
  .weekdays,
  .month-grid { gap: 4px; }
  .month-day { min-height: 62px; gap: 6px; padding-right: 1px; padding-left: 1px; border-radius: 12px; }
  .day-statuses { gap: 2px; }
  .day-status { width: 18px; height: 18px; font-size: 11px; }
  .calendar-legend { gap: 8px; }
  .calendar-legend .swipe-tip { display: none; }
}
</style>
