const ADDON_ID = 'elephant.dashboard'
const OPEN_ACTION_ID = `${ADDON_ID}.open`
const SIDEBAR_ITEM_ID = `${ADDON_ID}.sidebar`
const DASHBOARD_DIRECTORY = '.elephantnote'
const DASHBOARD_FILENAME = 'Dashboard.md'
const DASHBOARD_PATH = `${DASHBOARD_DIRECTORY}/${DASHBOARD_FILENAME}`

const normalizeDashboardNote = (result, activeVaultPath = '') => {
  const note = result?.note || result || {}
  return {
    ...note,
    path: note.path || DASHBOARD_PATH,
    fullPath: note.fullPath || (activeVaultPath ? `${activeVaultPath}/${DASHBOARD_PATH}` : ''),
    title: note.title || 'Dashboard',
    kind: 'note',
    type: 'note',
    updatedAt: note.updatedAt || new Date().toISOString()
  }
}

export default class ElephantDashboardAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.ensurePromise = null
  }

  vaultStore() {
    return this.api.app.pinia?._s?.get?.('elephantnoteVaults') || null
  }

  invoke(command, payload) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error('The Dashboard addon requires the Tauri note bridge')
    return invoke(command, payload)
  }

  async ensureDashboardNote() {
    if (this.ensurePromise) return this.ensurePromise

    this.ensurePromise = (async () => {
      const store = this.vaultStore()
      if (!store?.activeVault?.path) throw new Error('Open a vault before opening its Dashboard note')

      let result
      try {
        result = await this.invoke('tauri_notes_read', { relativePath: DASHBOARD_PATH })
      } catch {
        result = await this.invoke('tauri_notes_create', {
          relativePath: DASHBOARD_DIRECTORY,
          filename: DASHBOARD_FILENAME,
          title: 'Dashboard'
        })
      }

      return normalizeDashboardNote(result, store.activeVault.path)
    })()

    try {
      return await this.ensurePromise
    } finally {
      this.ensurePromise = null
    }
  }

  async openDashboardNote() {
    const store = this.vaultStore()
    if (!store?.activeVault?.path) throw new Error('Open a vault before opening its Dashboard note')

    const note = await this.ensureDashboardNote()
    await store.openNote(note, { record: false })
    return note
  }

  onload(api) {
    api.commands.register({
      id: OPEN_ACTION_ID,
      title: 'Open Dashboard',
      run: () => this.openDashboardNote()
    })

    api.workspace.registerSidebarItem({
      id: SIDEBAR_ITEM_ID,
      title: 'Dashboard',
      tooltip: 'Open Dashboard',
      icon: 'dashboard',
      actionId: OPEN_ACTION_ID,
      order: 10
    })

    if (this.vaultStore()?.activeVault?.path) {
      void this.ensureDashboardNote().catch((error) => {
        console.error('[dashboard] failed to prepare hidden Dashboard note', error)
      })
    }
  }
}
