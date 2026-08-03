<template>
  <Teleport to="body">
    <transition name="calendar-sheet-fade">
      <div v-if="open" class="calendar-sheet-layer" @click.self="emit('close')">
        <section class="calendar-sheet" role="dialog" aria-modal="true" aria-label="月度心情与天气总览">
          <header class="calendar-sheet-header">
            <div>
              <p>只读月历</p>
              <h2>回看每一天的心情与天气</h2>
            </div>
            <button type="button" aria-label="关闭月历" @click="emit('close')">×</button>
          </header>

          <MonthlyOverview
            :year="viewYear"
            :month="viewMonth"
            :diaries-by-date="diariesByDate"
            :selected-date="selectedDate"
            @change-month="changeMonth"
            @select-day="selectDay"
          />

          <div class="selected-summary">
            <div class="summary-date-row">
              <strong>{{ selectedDateLabel }}</strong>
              <span v-if="selectedDiary" class="summary-icons">
                {{ selectedDiary.mood ? getMoodOption(selectedDiary.mood).emoji : '＋' }}
                {{ selectedDiary.weather ? getWeatherOption(selectedDiary.weather).emoji : '＋' }}
              </span>
            </div>
            <p v-if="selectedDiary">{{ diarySummary }}</p>
            <p v-else class="empty-summary">当天暂无记录</p>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MonthlyOverview from '@/components/MonthlyOverview.vue'
import { shiftCalendarMonth } from '@/features/diary/monthCalendar.js'
import { getMoodOption, getWeatherOption } from '@/features/diary/moodWeatherOptions.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  diariesByDate: { type: Map, default: () => new Map() },
  initialDate: { type: String, required: true }
})

const emit = defineEmits(['close'])
const viewYear = ref(new Date().getFullYear())
const viewMonth = ref(new Date().getMonth())
const selectedDate = ref(props.initialDate)

const selectedDiary = computed(() => props.diariesByDate.get(selectedDate.value) || null)
const selectedDateLabel = computed(() => {
  const [year, month, day] = selectedDate.value.split('-').map(Number)
  return `${year}年${month}月${day}日`
})
const diarySummary = computed(() => {
  const text = selectedDiary.value?.raw_text || ''
  return text.replace(/\n/g, ' ').slice(0, 100) + (text.length > 100 ? '…' : '')
})

watch(() => props.open, (open) => {
  if (!open) return
  const [year, month] = props.initialDate.split('-').map(Number)
  viewYear.value = year
  viewMonth.value = month - 1
  selectedDate.value = props.initialDate
})

function changeMonth(delta) {
  const shifted = shiftCalendarMonth(viewYear.value, viewMonth.value, delta)
  viewYear.value = shifted.year
  viewMonth.value = shifted.month
}

function selectDay(day) {
  selectedDate.value = day.dateStr
  if (!day.currentMonth) {
    const [year, month] = day.dateStr.split('-').map(Number)
    viewYear.value = year
    viewMonth.value = month - 1
  }
}

function onKeydown(event) {
  if (props.open && event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.calendar-sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  background: rgba(52, 39, 32, 0.38);
  backdrop-filter: blur(3px);
}

.calendar-sheet {
  width: min(100%, 456px);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 18px 14px calc(18px + env(safe-area-inset-bottom, 0px));
  border: 1px solid rgba(196, 92, 62, 0.12);
  border-radius: 26px;
  background: #fffdfb;
  box-shadow: 0 18px 50px rgba(76, 47, 37, 0.22);
}

.calendar-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 0 4px;
}

.calendar-sheet-header p {
  margin: 0 0 2px;
  color: #b98573;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

.calendar-sheet-header h2 {
  margin: 0;
  color: #65483d;
  font-size: 17px;
}

.calendar-sheet-header button {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 50%;
  background: #f6eee9;
  color: #8b6659;
  font-size: 25px;
  line-height: 1;
}

.selected-summary {
  min-height: 74px;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid #eee2dc;
  border-radius: 16px;
  background: #fff8f4;
}

.summary-date-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 5px;
  color: #6c5046;
  font-size: 13px;
}

.summary-icons {
  letter-spacing: 4px;
}

.selected-summary p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.selected-summary .empty-summary {
  color: var(--color-text-tertiary);
}

.calendar-sheet-fade-enter-active,
.calendar-sheet-fade-leave-active { transition: opacity 0.22s ease; }
.calendar-sheet-fade-enter-active .calendar-sheet,
.calendar-sheet-fade-leave-active .calendar-sheet { transition: transform 0.25s ease, opacity 0.2s ease; }
.calendar-sheet-fade-enter-from,
.calendar-sheet-fade-leave-to { opacity: 0; }
.calendar-sheet-fade-enter-from .calendar-sheet,
.calendar-sheet-fade-leave-to .calendar-sheet { opacity: 0; transform: translateY(24px); }

@media (max-width: 360px) {
  .calendar-sheet-layer { padding: 8px; }
  .calendar-sheet { max-height: calc(100vh - 16px); padding-right: 9px; padding-left: 9px; }
  .calendar-sheet-header h2 { font-size: 15px; }
}
</style>
