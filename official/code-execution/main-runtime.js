import ElephantCodeExecutionAddon from './main.js'

export default class ElephantCodeExecutionRuntimeAddon extends ElephantCodeExecutionAddon {
  installEditorRuntime() {
    const attach = (event) => this.attachEditorRuntime(event?.value ?? event)

    // Activation can happen before or after the editor runtime is published.
    // Bind the current resource immediately, then keep following replacements.
    this.attachEditorRuntime(this.api.editor.active)
    this.disposeEditorWatch = this.api.editor.watch(attach, { immediate: true })
  }
}
