<template>
  <Teleport to="body">
    <transition name="sheet-fade">
      <div v-if="open" class="sheet-layer" @click.self="emit('close')">
        <section class="selection-sheet" role="dialog" aria-modal="true" :aria-label="title">
          <header class="sheet-header">
            <div>
              <p class="sheet-eyebrow">记录此刻</p>
              <h2>{{ title }}</h2>
            </div>
            <button type="button" class="sheet-close" aria-label="关闭" @click="emit('close')">×</button>
          </header>

          <div class="option-grid" :style="{ '--columns': columns }">
            <button
              v-for="option in options"
              :key="option.key"
              type="button"
              class="option-button"
              :class="[`tone-${option.tone}`, { selected: option.key === modelValue }]"
              :aria-pressed="option.key === modelValue"
              @click="select(option.key)"
            >
              <span class="option-icon" aria-hidden="true">{{ option.emoji }}</span>
              <span class="option-label">{{ option.label }}</span>
              <span v-if="option.key === modelValue" class="option-check" aria-hidden="true">✓</span>
            </button>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  options: { type: Array, required: true },
  modelValue: { type: String, required: true },
  columns: { type: Number, default: 5 }
})

const emit = defineEmits(['update:modelValue', 'close'])

function select(key) {
  emit('update:modelValue', key)
  emit('close')
}

function onKeydown(event) {
  if (props.open && event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  background: rgba(52, 39, 32, 0.36);
  backdrop-filter: blur(3px);
}

.selection-sheet {
  width: min(100%, 456px);
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  background: #fffdfb;
  border: 1px solid rgba(196, 92, 62, 0.12);
  border-radius: 24px;
  box-shadow: 0 18px 50px rgba(76, 47, 37, 0.2);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  padding: 0 4px;
}

.sheet-eyebrow {
  margin: 0 0 2px;
  color: #b98573;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.sheet-header h2 {
  margin: 0;
  color: #67483d;
  font-size: 19px;
  line-height: 1.35;
}

.sheet-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #f6eee9;
  color: #8b6659;
  font-size: 25px;
  line-height: 1;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  gap: 10px 7px;
}

.option-button {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 82px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 2px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: transparent;
  color: #75635c;
}

.option-button:focus-visible {
  outline: 3px solid rgba(196, 92, 62, 0.28);
  outline-offset: 2px;
}

.option-button.selected {
  border-color: rgba(196, 92, 62, 0.32);
  background: #fff5ef;
  color: #9b4d35;
}

.option-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 2px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px 18px 15px 19px;
  box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.75), 0 5px 12px rgba(92, 61, 47, 0.1);
  font-size: 27px;
  transform: rotate(-1.5deg);
}

.option-button:nth-child(even) .option-icon {
  transform: rotate(1.5deg);
}

.option-label {
  overflow: hidden;
  max-width: 100%;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-check {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #c45c3e;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
}

.tone-red .option-icon { background: linear-gradient(145deg, #ff9e8b, #ef5f51); }
.tone-coral .option-icon { background: linear-gradient(145deg, #ffd2bd, #ff8f70); }
.tone-orange .option-icon { background: linear-gradient(145deg, #ffd99a, #f5a749); }
.tone-yellow .option-icon { background: linear-gradient(145deg, #fff0a5, #f6c94b); }
.tone-brown .option-icon { background: linear-gradient(145deg, #d7a17e, #9b624e); }
.tone-blue .option-icon { background: linear-gradient(145deg, #b8cbff, #6f8df1); }
.tone-lime .option-icon { background: linear-gradient(145deg, #e2f98b, #a7d83d); }
.tone-sky .option-icon { background: linear-gradient(145deg, #c4e7ff, #67afea); }
.tone-cyan .option-icon { background: linear-gradient(145deg, #bff5f2, #55cfd1); }
.tone-green .option-icon { background: linear-gradient(145deg, #c4f3c6, #62c983); }
.tone-gray .option-icon { background: linear-gradient(145deg, #e9ecef, #b7c0c8); }

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.22s ease;
}

.sheet-fade-enter-active .selection-sheet,
.sheet-fade-leave-active .selection-sheet {
  transition: transform 0.25s ease, opacity 0.2s ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-fade-enter-from .selection-sheet,
.sheet-fade-leave-to .selection-sheet {
  opacity: 0;
  transform: translateY(24px);
}

@media (max-width: 360px) {
  .sheet-layer { padding: 8px; }
  .selection-sheet { padding-right: 10px; padding-left: 10px; }
  .option-grid { gap: 10px 4px; }
  .option-icon { width: 44px; height: 44px; font-size: 24px; }
}
</style>
