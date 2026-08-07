import ElephantCodeExecutionAddon from './main.js'

const TOOLBAR_SELECTOR = '.elephant-physical-code-toolbar'

export default class ElephantCodeExecutionRuntimeAddon extends ElephantCodeExecutionAddon {
  async onload(api) {
    console.info('[elephant.code-execution] activation:start', {
      version: api.manifest?.version || null,
      entry: api.manifest?.runtime?.entry || null
    })
    await super.onload(api)
    console.info('[elephant.code-execution] activation:ready', {
      runtimeAvailable: Boolean(api.editor.active)
    })
  }

  queueRuntimeScan(runtime, reason) {
    const generation = this.runtimeScanGeneration
    if (this.runtimeScanQueued) return
    this.runtimeScanQueued = true
    const run = () => {
      this.runtimeScanQueued = false
      if (generation !== this.runtimeScanGeneration || this.activeRuntime !== runtime) return
      const root = runtime?.root
      const blocks = runtime?.queryBlocks?.({ kind: 'code_block' }) || []
      const before = root?.querySelectorAll?.(TOOLBAR_SELECTOR)?.length || 0
      this.scan(runtime)
      const after = root?.querySelectorAll?.(TOOLBAR_SELECTOR)?.length || 0
      if (reason !== 'dom-mutation' || before !== after) {
        console.info('[elephant.code-execution] runtime:scan', {
          reason,
          codeBlocks: blocks.length,
          toolbarsBefore: before,
          toolbarsAfter: after
        })
      }
    }

    if (typeof this.window?.queueMicrotask === 'function') this.window.queueMicrotask(run)
    else if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(run)
    else Promise.resolve().then(run)
  }

  attachEditorRuntime(runtime) {
    this.disposeRuntimeDomWatch?.()
    this.disposeRuntimeDomWatch = null
    this.runtimeScanGeneration = Number(this.runtimeScanGeneration || 0) + 1
    this.runtimeScanQueued = false

    super.attachEditorRuntime(runtime)
    const active = this.activeRuntime
    if (!active) {
      console.info('[elephant.code-execution] runtime:detached')
      return
    }

    const root = active.root
    const MutationObserverConstructor = root?.ownerDocument?.defaultView?.MutationObserver || this.window?.MutationObserver
    if (root?.querySelectorAll && typeof MutationObserverConstructor === 'function') {
      const observer = new MutationObserverConstructor(() => {
        // Rust can repaint the children of an existing semantic code block after
        // the shared runtime has published it. That repaint legitimately removes
        // addon-owned children without changing the semantic block identity, so
        // the addon must restore its idempotent toolbar on that same live block.
        this.queueRuntimeScan(active, 'dom-mutation')
      })
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-elephant-editor-kind', 'data-language']
      })
      this.disposeRuntimeDomWatch = () => observer.disconnect()
    }

    this.queueRuntimeScan(active, 'attached')
    console.info('[elephant.code-execution] runtime:attached', {
      engine: active.engine,
      hasRoot: Boolean(root),
      observerInstalled: Boolean(this.disposeRuntimeDomWatch)
    })
  }

  installEditorRuntime() {
    const attach = (event) => this.attachEditorRuntime(event?.value ?? event)

    // Attach the current generation exactly once, then follow every replacement.
    // The runtime-local observer above covers child repaints inside that generation.
    this.attachEditorRuntime(this.api.editor.active)
    this.disposeEditorWatch = this.api.editor.watch(attach, { immediate: false })
  }

  async onunload() {
    this.runtimeScanGeneration = Number(this.runtimeScanGeneration || 0) + 1
    this.runtimeScanQueued = false
    this.disposeRuntimeDomWatch?.()
    this.disposeRuntimeDomWatch = null
    await super.onunload()
  }
}
