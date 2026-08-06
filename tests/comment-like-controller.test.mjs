import assert from 'node:assert/strict'
import test from 'node:test'

import { createCommentLikeController } from '../src/features/reader/commentLikeController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createHarness(initialComments, persistLike) {
  const comments = new Map(initialComments.map(comment => [comment.id, { ...comment }]))
  const pending = []
  const animations = []
  const cleared = []
  const warnings = []
  const controller = createCommentLikeController({
    getComment: id => comments.get(id),
    updateComment: (id, values) => comments.set(id, { ...comments.get(id), ...values }),
    persistLike,
    setAnimation: (id, animation) => animations.push({ id, animation }),
    clearAnimation: id => cleared.push(id),
    setPending: (id, isPending) => pending.push({ id, isPending }),
    warn: (...args) => warnings.push(args)
  })

  return { controller, comments, pending, animations, cleared, warnings }
}

test('optimistically likes a comment and calibrates from the saved row', async () => {
  let optimisticState
  const harness = createHarness(
    [{ id: 1, likes: 8, is_liked: 0 }],
    async (id, liked) => {
      optimisticState = { ...harness.comments.get(id), liked }
      return { id, likes: 12, is_liked: 1 }
    }
  )

  assert.equal(await harness.controller.toggle(1), true)

  assert.deepEqual(optimisticState, { id: 1, likes: 9, is_liked: 1, liked: true })
  assert.deepEqual(harness.comments.get(1), { id: 1, likes: 12, is_liked: 1 })
  assert.deepEqual(harness.animations, [{ id: 1, animation: 'liking' }])
  assert.deepEqual(harness.pending, [{ id: 1, isPending: true }, { id: 1, isPending: false }])
})

test('optimistically unlikes a comment and never decrements below zero', async () => {
  const harness = createHarness(
    [{ id: 1, likes: 0, is_liked: 1 }],
    async (id, liked) => ({ id, likes: 0, is_liked: liked ? 1 : 0 })
  )

  assert.equal(await harness.controller.toggle(1), true)

  assert.deepEqual(harness.comments.get(1), { id: 1, likes: 0, is_liked: 0 })
  assert.deepEqual(harness.animations, [{ id: 1, animation: 'unliking' }])
})

test('ignores duplicate toggles for the same pending comment', async () => {
  const gate = deferred()
  let persistCalls = 0
  const harness = createHarness(
    [{ id: 1, likes: 2, is_liked: 0 }],
    async id => {
      persistCalls += 1
      await gate.promise
      return { id, likes: 3, is_liked: 1 }
    }
  )

  const first = harness.controller.toggle(1)
  const second = await harness.controller.toggle(1)
  gate.resolve()

  assert.equal(second, false)
  assert.equal(await first, true)
  assert.equal(persistCalls, 1)
})

test('allows different comments to toggle independently while one is pending', async () => {
  const gate = deferred()
  const persisted = []
  const harness = createHarness(
    [
      { id: 1, likes: 2, is_liked: 0 },
      { id: 2, likes: 4, is_liked: 0 }
    ],
    async (id, liked) => {
      persisted.push({ id, liked })
      if (id === 1) await gate.promise
      return { id, likes: id === 1 ? 3 : 5, is_liked: 1 }
    }
  )

  const first = harness.controller.toggle(1)
  assert.equal(await harness.controller.toggle(2), true)
  gate.resolve()
  assert.equal(await first, true)

  assert.deepEqual(persisted, [{ id: 1, liked: true }, { id: 2, liked: true }])
  assert.deepEqual(harness.comments.get(1), { id: 1, likes: 3, is_liked: 1 })
  assert.deepEqual(harness.comments.get(2), { id: 2, likes: 5, is_liked: 1 })
})

test('rolls back and clears animation when persistence rejects', async () => {
  const harness = createHarness(
    [{ id: 1, likes: 8, is_liked: 1 }],
    async () => { throw new Error('storage full') }
  )

  assert.equal(await harness.controller.toggle(1), true)

  assert.deepEqual(harness.comments.get(1), { id: 1, likes: 8, is_liked: 1 })
  assert.deepEqual(harness.cleared, [1])
  assert.equal(harness.warnings.length, 1)
  assert.deepEqual(harness.pending, [{ id: 1, isPending: true }, { id: 1, isPending: false }])
})

test('returns false when a comment no longer exists', async () => {
  const harness = createHarness([], async () => {
    throw new Error('should not persist missing comments')
  })

  assert.equal(await harness.controller.toggle(404), false)
  assert.deepEqual(harness.pending, [])
})
