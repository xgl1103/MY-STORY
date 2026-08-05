import test from 'node:test'
import assert from 'node:assert/strict'
import { createOutsidePanelController } from '../src/features/reader/outsidePanelController.js'

function createEventTarget() {
  const listeners = new Map()
  const addCalls = new Map()

  return {
    addEventListener(type, listener, options) {
      addCalls.set(type, (addCalls.get(type) ?? 0) + 1)
      listeners.set(type, { listener, options })
    },
    removeEventListener(type, listener, options) {
      const current = listeners.get(type)
      if (current?.listener === listener && current.options === options) listeners.delete(type)
    },
    dispatch(type, target) {
      listeners.get(type)?.listener({ target })
    },
    listener(type) {
      return listeners.get(type)
    },
    count() {
      return listeners.size
    },
    addCallCount(type) {
      return addCalls.get(type) ?? 0
    }
  }
}

function createNode(...containedTargets) {
  return {
    contains(target) {
      return target === this || containedTargets.includes(target)
    }
  }
}

test('mounts capture listeners once and ignores pointerdowns while closed or inside the trigger and panel', () => {
  const eventTarget = createEventTarget()
  const triggerChild = {}
  const panelChild = {}
  const trigger = createNode(triggerChild)
  const panel = createNode(panelChild)
  const closed = []
  const suppressed = []
  const controller = createOutsidePanelController({
    eventTarget,
    isOpen: () => false,
    getTrigger: () => trigger,
    getPanel: () => panel,
    close: () => closed.push('close'),
    setSuppressed: value => suppressed.push(value)
  })

  controller.mount()
  controller.mount()
  eventTarget.dispatch('pointerdown', {})
  eventTarget.dispatch('pointerdown', triggerChild)
  eventTarget.dispatch('pointerdown', panelChild)

  assert.equal(eventTarget.count(), 2)
  assert.equal(eventTarget.addCallCount('pointerdown'), 1)
  assert.equal(eventTarget.addCallCount('click'), 1)
  assert.equal(eventTarget.listener('pointerdown').options, true)
  assert.equal(eventTarget.listener('click').options, true)
  assert.deepEqual(closed, [])
  assert.deepEqual(suppressed, [])
})

test('does not close or suppress an open panel for pointerdowns inside its trigger or panel', () => {
  const eventTarget = createEventTarget()
  const triggerChild = {}
  const panelChild = {}
  const closed = []
  const suppressed = []
  const controller = createOutsidePanelController({
    eventTarget,
    isOpen: () => true,
    getTrigger: () => createNode(triggerChild),
    getPanel: () => createNode(panelChild),
    close: () => closed.push('close'),
    setSuppressed: value => suppressed.push(value)
  })

  controller.mount()
  eventTarget.dispatch('pointerdown', triggerChild)
  eventTarget.dispatch('pointerdown', panelChild)

  assert.deepEqual(closed, [])
  assert.deepEqual(suppressed, [])
})

test('closes and suppresses on an outside pointerdown, then releases suppression after its click', () => {
  const eventTarget = createEventTarget()
  const scheduled = []
  const closed = []
  const suppressed = []
  const controller = createOutsidePanelController({
    eventTarget,
    isOpen: () => true,
    getTrigger: () => createNode(),
    getPanel: () => createNode(),
    close: () => closed.push('close'),
    setSuppressed: value => suppressed.push(value),
    scheduleRelease: callback => scheduled.push(callback)
  })

  controller.mount()
  eventTarget.dispatch('pointerdown', {})
  eventTarget.dispatch('click', {})

  assert.deepEqual(closed, ['close'])
  assert.deepEqual(suppressed, [true])
  assert.equal(scheduled.length, 1)

  scheduled[0]()
  assert.deepEqual(suppressed, [true, false])

  eventTarget.dispatch('click', {})
  assert.equal(scheduled.length, 1)
})

test('unmount removes listeners, clears suppression, and remains idempotent', () => {
  const eventTarget = createEventTarget()
  const suppressed = []
  const controller = createOutsidePanelController({
    eventTarget,
    isOpen: () => true,
    getTrigger: () => createNode(),
    getPanel: () => createNode(),
    close: () => {},
    setSuppressed: value => suppressed.push(value)
  })

  controller.mount()
  controller.unmount()
  controller.unmount()

  assert.equal(eventTarget.count(), 0)
  assert.deepEqual(suppressed, [false])
})

test('does not let a release scheduled before unmount clear suppression after remount', () => {
  const eventTarget = createEventTarget()
  const scheduled = []
  const suppressed = []
  const controller = createOutsidePanelController({
    eventTarget,
    isOpen: () => true,
    getTrigger: () => createNode(),
    getPanel: () => createNode(),
    close: () => {},
    setSuppressed: value => suppressed.push(value),
    scheduleRelease: callback => scheduled.push(callback)
  })

  controller.mount()
  eventTarget.dispatch('pointerdown', {})
  eventTarget.dispatch('click', {})
  controller.unmount()
  controller.mount()
  scheduled[0]()

  assert.deepEqual(suppressed, [true, false])
})
