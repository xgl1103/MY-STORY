# Reader Settings Click-Outside Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reading settings close when the user clicks anywhere outside the gear or panel, without closing on panel interactions or accidentally turning a page.

**Architecture:** Add a small DOM-independent controller that owns document listener registration, inside/outside detection, closing, and one-click page-turn suppression. Wire the same controller into `Preview.vue` and `ChapterReader.vue` with template refs and include its suppression state in `ReadingViewport.disabled`.

**Tech Stack:** Vue 3 Composition API, native Pointer Events, Node.js built-in test runner, Vite.

## Global Constraints

- Keep the gear's existing open/close toggle.
- Do not close for interactions inside the settings panel or on the gear.
- An outside click closes the panel but preserves the clicked control's normal action.
- The outside click that closes the panel must not turn a page.
- Apply identical behavior to preview and formal reader views.
- Do not change settings styling or reading preference data structures.

---

### Task 1: Outside-close controller

**Files:**
- Create: `src/features/reader/outsidePanelController.js`
- Create: `tests/outside-panel-controller.test.mjs`

**Interfaces:**
- Produces: `createOutsidePanelController(options)` returning `{ mount, unmount }`.
- `options` supplies `eventTarget`, `isOpen`, `getTrigger`, `getPanel`, `close`, `setSuppressed`, and optional `scheduleRelease`.

- [ ] **Step 1: Write failing controller tests**

```js
test('outside pointer closes and suppresses only its following click', () => {
  const harness = createHarness({ open: true })
  harness.document.dispatch('pointerdown', harness.outside)
  assert.equal(harness.closed, 1)
  assert.equal(harness.suppressed, true)
  harness.document.dispatch('click', harness.outside)
  harness.flushRelease()
  assert.equal(harness.suppressed, false)
})

test('gear and panel interactions stay open and unmount removes listeners', () => {
  const harness = createHarness({ open: true })
  harness.document.dispatch('pointerdown', harness.gearChild)
  harness.document.dispatch('pointerdown', harness.panelChild)
  assert.equal(harness.closed, 0)
  harness.controller.unmount()
  assert.equal(harness.document.listenerCount(), 0)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/outside-panel-controller.test.mjs`

Expected: FAIL because `outsidePanelController.js` does not exist.

- [ ] **Step 3: Implement the minimal controller**

```js
export function createOutsidePanelController({
  eventTarget,
  isOpen,
  getTrigger,
  getPanel,
  close,
  setSuppressed,
  scheduleRelease = queueMicrotask
}) {
  let suppressingClick = false

  const contains = (element, target) => Boolean(element?.contains?.(target))

  function onPointerDown(event) {
    if (!isOpen() || contains(getTrigger(), event.target) || contains(getPanel(), event.target)) return
    suppressingClick = true
    setSuppressed(true)
    close()
  }

  function onClickCapture() {
    if (!suppressingClick) return
    suppressingClick = false
    scheduleRelease(() => setSuppressed(false))
  }

  return {
    mount() {
      eventTarget.addEventListener('pointerdown', onPointerDown, true)
      eventTarget.addEventListener('click', onClickCapture, true)
    },
    unmount() {
      eventTarget.removeEventListener('pointerdown', onPointerDown, true)
      eventTarget.removeEventListener('click', onClickCapture, true)
      suppressingClick = false
      setSuppressed(false)
    }
  }
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test tests/outside-panel-controller.test.mjs`

Expected: both controller tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/outsidePanelController.js tests/outside-panel-controller.test.mjs
git commit -m "feat(reader): add outside settings controller"
```

### Task 2: Wire preview and reader settings

**Files:**
- Modify: `src/views/Preview.vue`
- Modify: `src/views/ChapterReader.vue`
- Modify: `tests/reader-view-contracts.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createOutsidePanelController(options)` from Task 1.
- Produces: `settingsTrigger`, `settingsPanel`, and `suppressSettingsPageTurn` refs in each view.

- [ ] **Step 1: Write failing view contract tests**

```js
test('preview closes reader settings outside without turning a page', async () => {
  const source = await read('../src/views/Preview.vue')
  assert.match(source, /createOutsidePanelController/)
  assert.match(source, /ref="settingsTrigger"/)
  assert.match(source, /ref="settingsPanel"/)
  assert.match(source, /showReaderSettings \|\| suppressSettingsPageTurn/)
})

test('chapter reader closes settings outside without turning a page', async () => {
  const source = await read('../src/views/ChapterReader.vue')
  assert.match(source, /createOutsidePanelController/)
  assert.match(source, /ref="settingsTrigger"/)
  assert.match(source, /ref="settingsPanel"/)
  assert.match(source, /showSettings \|\| showToc \|\| suppressSettingsPageTurn/)
})
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test tests/reader-view-contracts.test.mjs`

Expected: the two new click-outside contract tests FAIL because neither view is wired.

- [ ] **Step 3: Wire both views**

In each view, attach `ref="settingsTrigger"` to the gear and `ref="settingsPanel"` to the panel. Create the following state and lifecycle wiring, using the page's own open ref:

```js
const settingsTrigger = ref(null)
const settingsPanel = ref(null)
const suppressSettingsPageTurn = ref(false)

const settingsOutsideController = createOutsidePanelController({
  eventTarget: document,
  isOpen: () => showSettings.value,
  getTrigger: () => settingsTrigger.value,
  getPanel: () => settingsPanel.value,
  close: () => { showSettings.value = false },
  setSuppressed: value => { suppressSettingsPageTurn.value = value }
})

onMounted(settingsOutsideController.mount)
onBeforeUnmount(settingsOutsideController.unmount)
```

For Preview, substitute `showReaderSettings` for `showSettings`. Extend each viewport's disabled expression with `suppressSettingsPageTurn`.

- [ ] **Step 4: Add the controller test to the full test chain**

Update `test:reader-views` in `package.json` to include `tests/outside-panel-controller.test.mjs`.

- [ ] **Step 5: Run targeted and full verification**

Run: `npm.cmd run test:reader-views`

Expected: all reader view/controller tests PASS.

Run: `npm.cmd test`

Expected: all project tests PASS.

Run: `npm.cmd run build`

Expected: Vite production build exits 0.

- [ ] **Step 6: Commit and update PR**

```bash
git add src/views/Preview.vue src/views/ChapterReader.vue tests/reader-view-contracts.test.mjs package.json
git commit -m "fix(reader): close settings on outside click"
git push origin feat/reader-pagination-mode
```

Then verify PR `#3` remains open and mergeable against `main`.
