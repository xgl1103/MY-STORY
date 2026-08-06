# Reader Completion and Like Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reader comment likes reliably persistent and add an inline "complete today's story, return home" button on the final chapter.

**Architecture:** Queue every forced database persist so concurrent writes export the latest state. Move the reader comment-like flow into a pure controller that the Vue page wires to its existing reactive state. Render the final-chapter completion CTA as part of the reading content so it works in both scroll and page mode.

**Tech Stack:** Vue 3, vue-router, sql.js, Node's built-in `node:test`, existing Vite build.

## Global Constraints

- Do not add a new database field for story completion.
- The completion button only appears when the current chapter has no next chapter.
- The button navigates to `/` and must carry `data-no-page-turn`.
- Preserve existing scroll and page reading modes.
- Keep comment-like SQL idempotent and keep likes at or above zero.
- Keep existing `markWrite()` callers tolerant by default; only callers that opt in should receive persist failures.
- Follow RED-GREEN-REFACTOR for every production change.

---

## File Structure

- Modify `src/db/Database.js`: queue `persist()` calls and add optional error propagation to `markWrite(force, options)`.
- Modify `src/db/repositories/CommentRepository.js`: snapshot prior comment state, call `markWrite(true, { throwOnError: true })`, and restore in-memory state if persistence fails.
- Create `src/features/reader/commentLikeController.js`: pure controller for optimistic likes, pending locks, calibration, rollback, and animation cleanup.
- Modify `src/views/ChapterReader.vue`: use the controller and render the final-chapter completion CTA.
- Modify `tests/comment-likes.test.mjs`: add persistence failure, rollback, reload, queue, and zero-floor tests.
- Create `tests/comment-like-controller.test.mjs`: executable behavior tests for comment-like UI flow.
- Modify `tests/reader-view-contracts.test.mjs`: source-level contract tests for the final CTA and controller wiring.
- Modify `package.json`: add the controller test to `test:comment-likes`.

## Task 1: Reliable Comment Persistence

**Files:**
- Modify: `src/db/Database.js`
- Modify: `src/db/repositories/CommentRepository.js`
- Modify: `tests/comment-likes.test.mjs`

**Interfaces:**
- Consumes: `markWrite(force = false, options = {})`
- Produces: `markWrite(true, { throwOnError: true })`, which throws persistence errors only for opted-in callers.
- Produces: `CommentRepository.setLiked(commentId, liked)`, which returns `{ id, likes, is_liked }`, returns `null` for missing rows, and throws on failed persistence after restoring the prior row.

- [ ] **Step 1: Write the failing persistence tests**

Add tests that replace `localStorage.setItem` with a throwing function, assert `setLiked()` rejects, and assert the in-memory row is restored. Add a real zero-floor test that starts from `likes = 0, is_liked = 1`, then unlikes. Add a reload test that likes two comments concurrently and verifies both states survive after reloading from `localStorage`.

```js
test('setLiked restores the prior in-memory row when forced persistence fails', async () => {
  const id = insertComment(3)
  await CommentRepository.setLiked(id, 1)
  const originalSetItem = localStorage.setItem
  localStorage.setItem = () => { throw new Error('storage full') }

  await assert.rejects(() => CommentRepository.setLiked(id, 0), /storage full/)
  assert.deepEqual(queryOne('SELECT id, likes, is_liked FROM chapter_comments WHERE id = ?', [id]), {
    id,
    likes: 4,
    is_liked: 1
  })

  localStorage.setItem = originalSetItem
})
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd run test:comment-likes`

Expected: fail because `setLiked()` swallows forced persistence errors and the queue/reload expectations are not met.

- [ ] **Step 3: Implement queued persistence and opt-in throwing**

Change `persist()` so each caller queues a fresh `doPersist()` after any in-flight persist settles. Change `markWrite()` to accept `{ throwOnError = false }` and rethrow only when opted in.

```js
export async function persist() {
  if (!db) return
  const previous = persistPromise
  const current = (previous ? previous.catch(() => {}) : Promise.resolve())
    .then(() => doPersist())
  persistPromise = current
  try {
    await current
  } finally {
    if (persistPromise === current) persistPromise = null
  }
}

export async function markWrite(force = false, options = {}) {
  const { throwOnError = false } = options
  writeCounter++
  if (force || writeCounter >= 5) {
    try {
      await persist()
      writeCounter = 0
    } catch (e) {
      console.error('[MyStory] 数据库写回失败，将在下次写入时重试:', e)
      if (throwOnError) throw e
    }
  }
}
```

- [ ] **Step 4: Implement repository rollback**

Read the prior row first. If persistence fails, restore the prior `likes` and `is_liked`, then throw the original error.

```js
async setLiked(commentId, liked) {
  const previous = queryOne('SELECT id, likes, is_liked FROM chapter_comments WHERE id = ?', [commentId])
  if (!previous) return null

  const isLiked = Number(liked) ? 1 : 0
  execute(/* existing idempotent SQL */, [isLiked, isLiked, isLiked, commentId])

  try {
    await markWrite(true, { throwOnError: true })
  } catch (e) {
    execute('UPDATE chapter_comments SET likes = ?, is_liked = ? WHERE id = ?', [
      Math.max(0, Number(previous.likes) || 0),
      Number(previous.is_liked) ? 1 : 0,
      commentId
    ])
    throw e
  }

  return queryOne('SELECT id, likes, is_liked FROM chapter_comments WHERE id = ?', [commentId])
}
```

- [ ] **Step 5: Run tests to verify GREEN and commit**

Run: `npm.cmd run test:comment-likes`

Expected: pass.

Commit: `git add src/db/Database.js src/db/repositories/CommentRepository.js tests/comment-likes.test.mjs && git commit -m "fix(comments): make like persistence reliable"`

## Task 2: Executable Comment-Like UI Behavior

**Files:**
- Create: `src/features/reader/commentLikeController.js`
- Create: `tests/comment-like-controller.test.mjs`
- Modify: `src/views/ChapterReader.vue`
- Modify: `package.json`

**Interfaces:**
- Produces: `createCommentLikeController({ getComment, updateComment, persistLike, setAnimation, clearAnimation, setPending, warn })`
- Produces: `controller.toggle(commentOrId)` and `controller.isPending(commentId)`.

- [ ] **Step 1: Write failing controller tests**

Test optimistic increment, duplicate click lock for the same ID, independent IDs, successful calibration from the saved row, rejection rollback, and immediate animation clearing on rejection.

```js
import { createCommentLikeController } from '../src/features/reader/commentLikeController.js'

test('rolls back and clears animation when persistence rejects', async () => {
  const comments = new Map([[1, { id: 1, likes: 8, is_liked: 1 }]])
  const cleared = []
  const controller = createCommentLikeController({
    getComment: id => comments.get(id),
    updateComment: (id, values) => comments.set(id, { ...comments.get(id), ...values }),
    persistLike: async () => { throw new Error('storage full') },
    setAnimation: () => {},
    clearAnimation: id => cleared.push(id),
    setPending: () => {},
    warn: () => {}
  })

  await controller.toggle(1)

  assert.deepEqual(comments.get(1), { id: 1, likes: 8, is_liked: 1 })
  assert.deepEqual(cleared, [1])
})
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd run test:comment-likes`

Expected: fail because `commentLikeController.js` does not exist or is not wired into the package script.

- [ ] **Step 3: Implement the controller**

Create a pure controller that stores only the pending ID set internally and delegates all UI state updates through callbacks. Return `false` for missing or locked comments; return `true` after a handled attempt.

- [ ] **Step 4: Wire ChapterReader to the controller**

Import `createCommentLikeController`, instantiate it after helper functions are declared, and change `toggleCommentLike(comment)` to delegate to the controller. The page should keep using the existing `comments`, `pendingCommentLikeIds`, `commentLikeAnimations`, and animation timer helpers.

- [ ] **Step 5: Run tests to verify GREEN and commit**

Run: `npm.cmd run test:comment-likes`

Expected: pass.

Commit: `git add package.json src/features/reader/commentLikeController.js src/views/ChapterReader.vue tests/comment-like-controller.test.mjs && git commit -m "test(reader): cover comment like interactions"`

## Task 3: Final Chapter Completion CTA

**Files:**
- Modify: `src/views/ChapterReader.vue`
- Modify: `tests/reader-view-contracts.test.mjs`

**Interfaces:**
- Consumes: `hasNext`
- Produces: `goHomeAfterStory()` which calls `router.replace('/')`.

- [ ] **Step 1: Write failing reader contract tests**

Assert that `ChapterReader.vue` contains a final-story CTA guarded by `!hasNext`, has `data-no-page-turn`, invokes `goHomeAfterStory`, displays `完成今日故事，返回首页`, and includes `completionCta: !hasNext.value` in `readerLayoutKey`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd run test:reader-views`

Expected: fail because the final-story CTA does not exist yet.

- [ ] **Step 3: Implement the CTA**

Render the section after destiny sections and before `</ReadingViewport>`.

```vue
<section v-if="!hasNext" class="story-completion" data-no-page-turn>
  <button type="button" class="completion-btn" data-no-page-turn @click="goHomeAfterStory">
    完成今日故事，返回首页
  </button>
</section>
```

Add `goHomeAfterStory()`:

```js
function goHomeAfterStory() {
  router.replace('/')
}
```

Add compact styles using existing theme variables and bottom spacing that keeps the CTA above the progress bar.

- [ ] **Step 4: Run tests to verify GREEN and commit**

Run: `npm.cmd run test:reader-views`

Expected: pass.

Commit: `git add src/views/ChapterReader.vue tests/reader-view-contracts.test.mjs && git commit -m "feat(reader): add final story completion action"`

## Task 4: Full Verification and PR

**Files:**
- No code files unless verification finds a regression.

**Interfaces:**
- Produces: pushed branch and PR update against `main`.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
git diff --check main...HEAD
git status -sb
```

Expected: all tests pass, build succeeds, diff check is clean, and only intended files are modified.

- [ ] **Step 2: Push the feature branch**

Run: `git push -u origin feat/comment-like-interaction`

Expected: remote branch updates successfully.

- [ ] **Step 3: Create or update the PR**

Run: `gh pr view --json number,url,state,baseRefName,headRefName` and create the PR if absent. The base must be `main`; the head must be `feat/comment-like-interaction`.

- [ ] **Step 4: Open local preview and PR**

Open `http://127.0.0.1:5173/?v=<HEAD7>#/reader/1` for visual checking and open the PR URL for review.
