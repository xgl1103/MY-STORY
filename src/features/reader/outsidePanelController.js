export function createOutsidePanelController({
  eventTarget,
  isOpen,
  getTrigger,
  getPanel,
  close,
  setSuppressed,
  scheduleRelease = queueMicrotask
}) {
  let mounted = false
  let clickSuppressed = false
  let releaseGeneration = 0

  function contains(node, target) {
    return node?.contains?.(target) ?? false
  }

  function onPointerDown(event) {
    if (!isOpen()) return
    const target = event.target
    if (contains(getTrigger(), target) || contains(getPanel(), target)) return

    close()
    setSuppressed(true)
    clickSuppressed = true
  }

  function onClick() {
    if (!clickSuppressed) return

    clickSuppressed = false
    const generation = releaseGeneration
    scheduleRelease(() => {
      if (mounted && releaseGeneration === generation) setSuppressed(false)
    })
  }

  function mount() {
    if (mounted) return
    mounted = true
    eventTarget.addEventListener('pointerdown', onPointerDown, true)
    eventTarget.addEventListener('click', onClick, true)
  }

  function unmount() {
    if (!mounted) return
    mounted = false
    releaseGeneration += 1
    clickSuppressed = false
    eventTarget.removeEventListener('pointerdown', onPointerDown, true)
    eventTarget.removeEventListener('click', onClick, true)
    setSuppressed(false)
  }

  return { mount, unmount }
}
