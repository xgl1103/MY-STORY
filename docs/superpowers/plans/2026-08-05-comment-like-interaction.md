# Comment Like Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chapter comments narrower and visually balanced, with animated, accessible likes that persist in SQLite and can be cancelled safely.

**Architecture:** Add migration version 9 and an idempotent repository write for `is_liked` plus `likes`. Keep view orchestration in `ChapterReader.vue`: optimistic state update, per-comment write locking, server-result calibration, rollback on failure, and short-lived animation classes. Tests cover real SQL.js persistence and view/style contracts.

**Tech Stack:** Vue 3 Composition API, sql.js/SQLite, Node.js built-in test runner, CSS keyframes, Vite.

## Global Constraints

- Comment cards use approximately `92%` width, a `680px` maximum, and horizontal centering.
- Likes and `is_liked` persist across refresh/restart in SQLite.
- Repeating the same target liked state never changes the count twice.
- Likes never fall below zero.
- Clicking a heart never turns a reading page.
- Like and unlike each have distinct motion; reduced-motion users receive no keyframe animation.
- A failed database write restores the previous UI state.
- Do not change comment generation, reveal timing, sorting,正文 layout, or reading-mode selection.

---

### Task 1: Persistent comment-like data

**Files:**
- Modify: `src/db/migrations/schema.js`
- Modify: `src/db/migrations/index.js`
- Modify: `src/db/repositories/CommentRepository.js`
- Create: `tests/comment-likes.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: database column `chapter_comments.is_liked INTEGER NOT NULL DEFAULT 0`.
- Produces: `CommentRepository.setLiked(commentId, liked): Promise<{ id, likes, is_liked } | null>`.

- [ ] **Step 1: Write the failing migration and repository tests**

Create `tests/comment-likes.test.mjs` with a SQL.js migration test starting from `db_version = 8`, plus a real repository test initialized through `Database.js`.

```js
test('migration 9 preserves likes and adds unliked state', async () => {
  const db = new SQL.Database()
  db.run('CREATE TABLE app_config (key TEXT UNIQUE, value TEXT, updated_at TEXT)')
  db.run(`CREATE TABLE chapter_comments (
    id INTEGER PRIMARY KEY, likes INTEGER DEFAULT 0
  )`)
  db.run("INSERT INTO app_config (key, value) VALUES ('db_version', '8')")
  db.run('INSERT INTO chapter_comments (id, likes) VALUES (1, 38)')

  await runMigrations(db)

  const columns = db.exec('PRAGMA table_info(chapter_comments)')[0].values.map(row => row[1])
  const row = db.exec('SELECT likes, is_liked FROM chapter_comments WHERE id = 1')[0].values[0]
  const version = db.exec("SELECT value FROM app_config WHERE key = 'db_version'")[0].values[0][0]
  assert.ok(columns.includes('is_liked'))
  assert.deepEqual(row, [38, 0])
  assert.equal(version, '9')
  db.close()
})

test('repository persists idempotent like and unlike transitions', async () => {
  const id = await CommentRepository.create({
    chapter_number: 99,
    paragraph_index: 0,
    persona: 'night_owl',
    persona_name: '夜莺',
    avatar_color: '#d78fa0',
    content: '测试评论',
    likes: 2,
    reveal_at: 0
  })

  assert.deepEqual(await CommentRepository.setLiked(id, true), { id, likes: 3, is_liked: 1 })
  assert.deepEqual(await CommentRepository.setLiked(id, true), { id, likes: 3, is_liked: 1 })
  assert.deepEqual(await CommentRepository.setLiked(id, false), { id, likes: 2, is_liked: 0 })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/comment-likes.test.mjs`

Expected: FAIL because migration 9, `is_liked`, and `setLiked` do not exist.

- [ ] **Step 3: Add schema and migration version 9**

Add the initial-schema column after `likes`:

```sql
is_liked         INTEGER NOT NULL DEFAULT 0,
```

Register migration 9:

```js
9: async (db) => {
  try {
    db.run(`ALTER TABLE chapter_comments ADD COLUMN is_liked INTEGER NOT NULL DEFAULT 0`)
  } catch (e) {
    if (!String(e.message).includes('duplicate column')) throw e
  }
}
```

- [ ] **Step 4: Implement the idempotent repository write**

Add `setLiked` to `CommentRepository`:

```js
async setLiked(commentId, liked) {
  const target = liked ? 1 : 0
  const changed = execute(
    `UPDATE chapter_comments
     SET likes = MAX(0, COALESCE(likes, 0) +
       CASE WHEN COALESCE(is_liked, 0) = ? THEN 0 WHEN ? = 1 THEN 1 ELSE -1 END),
         is_liked = ?
     WHERE id = ?`,
    [target, target, target, commentId]
  )
  if (changed === 0) return null
  await markWrite(true)
  return queryOne('SELECT id, likes, is_liked FROM chapter_comments WHERE id = ?', [commentId])
}
```

- [ ] **Step 5: Add the test to the project test chain**

Add `test:comment-likes` to `package.json` and invoke it from `npm test` before reader-view contracts.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm.cmd run test:comment-likes`

Expected: migration and repository tests PASS.

Run: `npm.cmd test`

Expected: the complete test chain exits 0.

Commit:

```bash
git add src/db/migrations/schema.js src/db/migrations/index.js src/db/repositories/CommentRepository.js tests/comment-likes.test.mjs package.json
git commit -m "feat(comments): persist reader likes"
```

### Task 2: Interactive like state and animations

**Files:**
- Modify: `src/views/ChapterReader.vue`
- Modify: `tests/reader-view-contracts.test.mjs`

**Interfaces:**
- Consumes: `CommentRepository.setLiked(commentId, liked)` from Task 1.
- Produces: `toggleCommentLike(comment)`, `clearCommentLikeAnimation(id)`, `pendingCommentLikeIds`, and `commentLikeAnimations` in the reader view.

- [ ] **Step 1: Write failing view and style contract tests**

Add tests that require:

```js
test('chapter comments expose persistent accessible like controls', async () => {
  const source = await read('../src/views/ChapterReader.vue')
  assert.match(source, /class="comment-like-button"/)
  assert.match(source, /:aria-pressed=/)
  assert.match(source, /data-no-page-turn/)
  assert.match(source, /@click="toggleCommentLike\(block\.data\)"/)
  assert.match(source, /CommentRepository\.setLiked/)
  assert.match(source, /pendingCommentLikeIds/)
  assert.match(source, /commentLikeAnimations/)
})

test('chapter comment styles narrow cards and animate like and unlike', async () => {
  const source = await read('../src/views/ChapterReader.vue')
  assert.match(source, /width:\s*min\(92%,\s*680px\)/)
  assert.match(source, /margin-left:\s*auto/)
  assert.match(source, /margin-right:\s*auto/)
  assert.match(source, /@keyframes\s+comment-heart-like/)
  assert.match(source, /@keyframes\s+comment-heart-unlike/)
  assert.match(source, /prefers-reduced-motion:\s*reduce/)
})
```

- [ ] **Step 2: Run the contract tests and verify RED**

Run: `node --test tests/reader-view-contracts.test.mjs`

Expected: the two new comment-like tests FAIL because the button, handler, and styles do not exist.

- [ ] **Step 3: Replace the static like display with an accessible button**

Use the existing comment id and state:

```vue
<button
  type="button"
  class="comment-like-button"
  :class="[
    { 'is-liked': Boolean(block.data.is_liked) },
    `is-${commentLikeAnimations[block.data.id] || 'idle'}`
  ]"
  :aria-pressed="Boolean(block.data.is_liked)"
  :aria-label="block.data.is_liked ? '取消点赞' : '点赞'"
  :disabled="pendingCommentLikeIds.has(block.data.id)"
  data-no-page-turn
  @click="toggleCommentLike(block.data)"
  @animationend="clearCommentLikeAnimation(block.data.id)"
>
  <svg class="comment-heart" viewBox="0 0 24 24" width="16" height="16" :fill="block.data.is_liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </svg>
  <span class="comment-like-count">{{ block.data.likes }}</span>
</button>
```

- [ ] **Step 4: Implement optimistic update, locking, calibration, and rollback**

Add immutable Set/object updates so Vue observes the changes:

```js
const pendingCommentLikeIds = ref(new Set())
const commentLikeAnimations = ref({})

function patchCommentLike(id, state) {
  comments.value = comments.value.map(comment => (
    comment.id === id ? { ...comment, ...state } : comment
  ))
}

async function toggleCommentLike(comment) {
  if (pendingCommentLikeIds.value.has(comment.id)) return
  const previous = { likes: Math.max(0, Number(comment.likes) || 0), is_liked: Number(comment.is_liked) ? 1 : 0 }
  const nextLiked = previous.is_liked ? 0 : 1
  const optimistic = {
    is_liked: nextLiked,
    likes: Math.max(0, previous.likes + (nextLiked ? 1 : -1))
  }

  pendingCommentLikeIds.value = new Set([...pendingCommentLikeIds.value, comment.id])
  commentLikeAnimations.value = { ...commentLikeAnimations.value, [comment.id]: nextLiked ? 'liking' : 'unliking' }
  patchCommentLike(comment.id, optimistic)

  try {
    const saved = await CommentRepository.setLiked(comment.id, Boolean(nextLiked))
    if (!saved) throw new Error('评论不存在')
    patchCommentLike(comment.id, saved)
  } catch (error) {
    patchCommentLike(comment.id, previous)
    console.warn('[Reader] 点赞保存失败:', error)
  } finally {
    const pending = new Set(pendingCommentLikeIds.value)
    pending.delete(comment.id)
    pendingCommentLikeIds.value = pending
  }
}
```

`clearCommentLikeAnimation(id)` removes only that id from the animation object.

- [ ] **Step 5: Add balanced card and motion styles**

Set `.comment-card` to `width: min(92%, 680px)`, `box-sizing: border-box`, and automatic horizontal margins while retaining vertical rhythm. Add distinct `comment-heart-like` and `comment-heart-unlike` keyframes, count motion, red liked color, focus-visible styling, disabled styling, and a reduced-motion override.

- [ ] **Step 6: Verify reader behavior and commit**

Run: `npm.cmd run test:reader-views`

Expected: all reader view/controller tests PASS.

Run: `npm.cmd test`

Expected: the complete project test chain exits 0.

Run: `npm.cmd run build`

Expected: Vite production build exits 0.

Manually verify at `#/reader/1`:

- card is narrower and centered;
- like turns red and increments once;
- unlike returns gray and decrements once;
- both animations play;
- refresh retains state;
- clicking the heart does not page the reader.

Commit:

```bash
git add src/views/ChapterReader.vue tests/reader-view-contracts.test.mjs
git commit -m "feat(reader): animate persistent comment likes"
```

### Task 3: Final verification and PR preparation

**Files:**
- No production files unless a verified defect is found.

**Interfaces:**
- Consumes the persisted repository and reader interaction from Tasks 1–2.
- Produces test/build/browser evidence and a clean feature branch ready for PR.

- [ ] **Step 1: Run fresh verification**

Run:

```text
npm.cmd test
npm.cmd run build
git diff --check main...HEAD
git status -sb
```

Expected: zero test failures, build exit 0, no diff errors, and a clean working tree.

- [ ] **Step 2: Review the complete branch**

Review `main...HEAD` for migration safety, idempotent count changes, UI rollback, accessibility, motion preferences, paging interception, and scope control. Fix every Critical or Important finding and repeat verification.

- [ ] **Step 3: Publish through team workflow**

Push `feat/comment-like-interaction`, create a PR targeting `main`, request `xgl1103` review, and merge only after a non-author approval. Delete the feature branch only after the merged `main` passes verification.
