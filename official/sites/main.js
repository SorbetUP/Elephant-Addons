import { createSitePlan, normalizeDirectory, slugify } from './site-builder'

const ADDON_ID = 'elephant.sites'
const PROVIDER_RESOURCE = 'sites.provider'
const DEFAULT_DIRECTORY = 'Sites'
const CONFIG_KEY = 'sites-config'
const LAST_BUILD_KEY = 'last-build'
const PREVIEW_ROOT = '.elephantnote/site-previews'
const BUILD_ROOT = '.elephantnote/site-builds'
const MAX_GENERATED_FILE_BYTES = 5 * 1024 * 1024

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const utf8Bytes = (value = '') => new TextEncoder().encode(String(value)).byteLength

const joinPath = (...parts) => parts
  .map((part) => String(part || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, ''))
  .filter(Boolean)
  .join('/')

const joinNative = (root, relativePath) => {
  const cleanRoot = String(root || '').replace(/[\\/]+$/g, '')
  const parts = String(relativePath || '').replaceAll('\\', '/').split('/').filter(Boolean)
  return `${cleanRoot}/${parts.join('/')}`
}

const normalizeError = (error, fallback = 'Sites operation failed') => (
  error instanceof Error ? error.message : String(error || fallback)
)

const pathDirectory = (value = '') => {
  const parts = String(value || '').replaceAll('\\', '/').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

const relativeSitePath = (fromRoute = '', targetPath = '') => {
  const from = pathDirectory(fromRoute).split('/').filter(Boolean)
  const target = String(targetPath || '').replaceAll('\\', '/').split('/').filter(Boolean)
  let common = 0
  while (common < from.length && common < target.length && from[common] === target[common]) common += 1
  return [...Array(from.length - common)].map(() => '..').concat(target.slice(common)).join('/') || './'
}

const generatedAssetPath = (sourceDirectory, vaultPath) => {
  const source = String(sourceDirectory || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  const target = String(vaultPath || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (target.startsWith(`${source}/`)) return joinPath('assets', 'content', target.slice(source.length + 1))
  return joinPath('assets', 'vault', target)
}

const missingPathError = (error) => /(?:no such file|not found|cannot find|os error 2)/i.test(normalizeError(error))

export default class ElephantSitesAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.sourceDirectory = DEFAULT_DIRECTORY
    this.site = null
    this.lastBuild = null
    this.status = 'idle'
    this.error = ''
    this.renderRoot = null
    this.disposed = false
  }

  get tauriCore() {
    return this.window?.__TAURI__?.core
  }

  invoke(command, payload = {}) {
    const invoke = this.tauriCore?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  broker(method, params = {}) {
    return this.invoke('tauri_addons_call', {
      addonId: ADDON_ID,
      method,
      params
    })
  }

  async loadConfig() {
    const stored = await this.api.storage.get(CONFIG_KEY).catch(() => null)
    const lastBuild = await this.api.storage.get(LAST_BUILD_KEY).catch(() => null)
    this.sourceDirectory = normalizeDirectory(stored?.sourceDirectory || DEFAULT_DIRECTORY)
    this.lastBuild = lastBuild && typeof lastBuild === 'object' ? lastBuild : null
    return { sourceDirectory: this.sourceDirectory, lastBuild: this.lastBuild }
  }

  async saveConfig() {
    await this.api.storage.set(CONFIG_KEY, { sourceDirectory: this.sourceDirectory })
  }

  async allowDirectory(relativePath) {
    return this.invoke('tauri_addons_assets_allow_directory', {
      addonId: ADDON_ID,
      relativePath
    })
  }

  async listNotes(prefix) {
    return this.invoke('tauri_addons_notes_list', {
      addonId: ADDON_ID,
      prefix
    })
  }

  async readNote(path) {
    return this.invoke('tauri_addons_notes_read', {
      addonId: ADDON_ID,
      path
    })
  }

  async writeGeneratedFile(path, content) {
    if (utf8Bytes(content) > MAX_GENERATED_FILE_BYTES) {
      throw new Error(`Generated site file exceeds the 5 MiB addon limit: ${path}`)
    }
    return this.broker('notes.write', { path, content })
  }

  async resetGeneratedDirectory(path) {
    try {
      await this.invoke('tauri_vault_remove_path', { pathname: path })
    } catch (error) {
      if (!missingPathError(error)) throw error
    }
    await this.invoke('tauri_vault_ensure_dir', { pathname: path })
  }

  async copyVaultAsset(sourcePath, destinationPath) {
    const payload = await this.invoke('tauri_vault_read_binary', { pathname: sourcePath })
    const dataBase64 = payload?.dataBase64
    if (typeof dataBase64 !== 'string') throw new Error(`Cannot read site asset: ${sourcePath}`)
    await this.invoke('tauri_vault_write_binary', {
      pathname: destinationPath,
      dataBase64
    })
  }

  async collectNotes(sourceDirectory) {
    const entries = await this.listNotes(sourceDirectory)
    if (!entries.length) throw new Error('The selected folder does not contain any Markdown note')
    return Promise.all(entries.map(async (entry) => {
      const document = await this.readNote(entry.path)
      return { path: document.path, markdown: document.markdown }
    }))
  }

  async generate({ sourceDirectory = this.sourceDirectory, mode = 'preview' } = {}) {
    const source = normalizeDirectory(sourceDirectory)
    const outputBase = mode === 'build' ? BUILD_ROOT : PREVIEW_ROOT
    const siteId = slugify(source)
    const outputDirectory = joinPath(outputBase, siteId)

    this.status = mode === 'build' ? 'building' : 'preparing'
    this.error = ''
    this.sourceDirectory = source
    this.renderSettingsState()

    try {
      await this.saveConfig()
      const [sourceInfo, notes] = await Promise.all([
        this.allowDirectory(source),
        this.collectNotes(source)
      ])
      const assets = new Map()
      const plan = createSitePlan({
        sourceDirectory: source,
        notes,
        resolveAssetUrl: (vaultPath, context = {}) => {
          if (context.wiki) return '#'
          const destination = generatedAssetPath(source, vaultPath)
          assets.set(vaultPath, destination)
          return relativeSitePath(context.pageRoute, destination)
        }
      })

      await this.resetGeneratedDirectory(outputDirectory)
      for (const [relativePath, content] of plan.files) {
        await this.writeGeneratedFile(joinPath(outputDirectory, relativePath), content)
      }
      for (const [sourcePath, relativeDestination] of assets) {
        await this.copyVaultAsset(sourcePath, joinPath(outputDirectory, relativeDestination))
      }

      const generated = await this.allowDirectory(outputDirectory)
      const indexPath = joinNative(generated.path, 'index.html')
      const convertFileSrc = this.tauriCore?.convertFileSrc
      if (typeof convertFileSrc !== 'function') throw new Error('Tauri asset URL conversion is unavailable')

      const result = {
        siteId: `${mode}:${siteId}`,
        name: plan.title,
        sourceDirectory: source,
        sourcePath: sourceInfo.path,
        relativePath: outputDirectory,
        outputPath: generated.path,
        indexPath,
        url: convertFileSrc(indexPath),
        runtime: 'tauri-asset-protocol',
        mode,
        pages: plan.pages.length,
        assets: assets.size,
        generatedAt: new Date().toISOString(),
        running: mode === 'preview'
      }

      if (mode === 'build') {
        this.lastBuild = result
        await this.api.storage.set(LAST_BUILD_KEY, result)
      } else {
        this.site = result
      }
      this.status = mode === 'build' ? 'ready' : 'serving'
      this.api.app.emit('elephantnote:sites-changed', { mode, result })
      this.renderSettingsState()
      return { ...result }
    } catch (error) {
      this.status = 'error'
      this.error = normalizeError(error)
      this.renderSettingsState()
      throw error
    }
  }

  openPreview(params = {}) {
    return this.generate({ ...params, sourceDirectory: params.relativePath || params.path || params.sourceDirectory || this.sourceDirectory, mode: 'preview' })
  }

  buildFolder(params = {}) {
    return this.generate({ ...params, sourceDirectory: params.relativePath || params.path || params.sourceDirectory || this.sourceDirectory, mode: 'build' })
  }

  statusFor(siteId = this.site?.siteId) {
    if (this.site && (!siteId || siteId === this.site.siteId)) return { ...this.site, status: this.status }
    if (this.lastBuild && (!siteId || siteId === this.lastBuild.siteId)) return { ...this.lastBuild, status: 'ready' }
    return null
  }

  async stopPreview(siteId = this.site?.siteId) {
    if (!this.site || (siteId && siteId !== this.site.siteId)) return { stopped: false }
    const stopped = this.site
    this.site = null
    this.status = 'idle'
    this.error = ''
    this.renderSettingsState()
    try {
      await this.invoke('tauri_vault_remove_path', { pathname: stopped.relativePath })
      return { stopped: true, cleaned: true, siteId: stopped.siteId }
    } catch (error) {
      if (missingPathError(error)) return { stopped: true, cleaned: true, siteId: stopped.siteId }
      this.error = `Preview closed, but its generated files could not be removed: ${normalizeError(error)}`
      this.renderSettingsState()
      return { stopped: true, cleaned: false, siteId: stopped.siteId, error: this.error }
    }
  }

  async openExternal(target = this.site || this.lastBuild) {
    if (!target) return null
    const info = typeof target === 'object'
      ? target
      : [this.site, this.lastBuild].find((candidate) => candidate?.url === target || candidate?.indexPath === target)
    const openPath = this.window?.__TAURI__?.opener?.openPath
    if (info?.indexPath && typeof openPath === 'function') {
      await openPath(info.indexPath)
      return { opened: true, path: info.indexPath }
    }
    const url = typeof target === 'string' ? target : target.url
    const openUrl = this.window?.__TAURI__?.opener?.openUrl
    if (!url || typeof openUrl !== 'function') throw new Error('Tauri opener API is unavailable')
    await openUrl(url)
    return { opened: true, url }
  }

  async revealBuild() {
    if (!this.lastBuild?.outputPath) return null
    const openPath = this.window?.__TAURI__?.opener?.openPath
    if (typeof openPath !== 'function') throw new Error('Tauri path opener is unavailable')
    await openPath(this.lastBuild.outputPath)
    return { opened: true, path: this.lastBuild.outputPath }
  }

  renderSettings(container) {
    const documentRef = container?.ownerDocument
    if (!container || !documentRef) return () => {}
    const root = node(documentRef, 'div', 'elephant-sites-settings')
    container.replaceChildren(root)
    this.renderRoot = root
    this.disposed = false
    this.renderSettingsState()
    return () => {
      this.disposed = true
      if (this.renderRoot === root) this.renderRoot = null
      root.remove()
    }
  }

  renderSettingsState() {
    const root = this.renderRoot
    if (!root?.isConnected || this.disposed) return
    const documentRef = root.ownerDocument
    root.replaceChildren()

    const sourceCard = node(documentRef, 'section', 'elephant-sites-card')
    const sourceHeader = node(documentRef, 'div', 'elephant-sites-card-header')
    const sourceCopy = node(documentRef, 'div')
    sourceCopy.append(
      node(documentRef, 'h4', '', 'Publish a folder'),
      node(documentRef, 'p', '', 'Generate a navigable static site from Markdown notes in the active vault.')
    )
    sourceHeader.append(sourceCopy)
    sourceCard.append(sourceHeader)

    const form = node(documentRef, 'div', 'elephant-sites-form')
    const label = node(documentRef, 'label')
    label.append(node(documentRef, 'span', '', 'Source folder'))
    const input = node(documentRef, 'input')
    input.type = 'text'
    input.value = this.sourceDirectory
    input.placeholder = 'Sites'
    input.autocomplete = 'off'
    input.addEventListener('change', () => {
      try {
        this.sourceDirectory = normalizeDirectory(input.value)
        input.value = this.sourceDirectory
        this.error = ''
        void this.saveConfig()
      } catch (error) {
        this.error = normalizeError(error)
        this.renderSettingsState()
      }
    })
    label.append(input)

    const actions = node(documentRef, 'div', 'elephant-sites-actions')
    const preview = node(documentRef, 'button', 'primary', this.status === 'preparing' ? 'Preparing…' : 'Preview site')
    preview.type = 'button'
    preview.disabled = ['preparing', 'building'].includes(this.status)
    preview.addEventListener('click', () => void this.generate({ sourceDirectory: input.value, mode: 'preview' }).catch(() => {}))
    const build = node(documentRef, 'button', '', this.status === 'building' ? 'Building…' : 'Build static site')
    build.type = 'button'
    build.disabled = ['preparing', 'building'].includes(this.status)
    build.addEventListener('click', () => void this.generate({ sourceDirectory: input.value, mode: 'build' }).catch(() => {}))
    actions.append(preview, build)
    form.append(label, actions)
    sourceCard.append(form)
    root.append(sourceCard)

    if (this.error) root.append(node(documentRef, 'p', 'elephant-sites-error', this.error))

    const statusCard = node(documentRef, 'section', 'elephant-sites-card')
    const statusHeader = node(documentRef, 'div', 'elephant-sites-card-header')
    const statusCopy = node(documentRef, 'div')
    const statusLabel = this.site ? `${this.site.pages} page${this.site.pages === 1 ? '' : 's'} ready` : 'No preview is running'
    statusCopy.append(node(documentRef, 'h4', '', 'Preview'), node(documentRef, 'p', '', statusLabel))
    const statusActions = node(documentRef, 'div', 'elephant-sites-actions')
    const open = node(documentRef, 'button', '', 'Open externally')
    open.type = 'button'
    open.disabled = !this.site?.url
    open.addEventListener('click', () => void this.openExternal(this.site).catch((error) => {
      this.error = normalizeError(error)
      this.renderSettingsState()
    }))
    const close = node(documentRef, 'button', '', 'Close preview')
    close.type = 'button'
    close.disabled = !this.site
    close.addEventListener('click', () => void this.stopPreview())
    statusActions.append(open, close)
    statusHeader.append(statusCopy, statusActions)
    statusCard.append(statusHeader)
    if (this.site?.url) {
      const frame = node(documentRef, 'iframe', 'elephant-sites-frame')
      frame.src = this.site.url
      frame.title = `${this.site.name} preview`
      frame.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-scripts allow-same-origin')
      statusCard.append(frame)
    }
    root.append(statusCard)

    const buildCard = node(documentRef, 'section', 'elephant-sites-card')
    const buildHeader = node(documentRef, 'div', 'elephant-sites-card-header')
    const buildCopy = node(documentRef, 'div')
    buildCopy.append(
      node(documentRef, 'h4', '', 'Latest build'),
      node(documentRef, 'p', '', this.lastBuild ? `${this.lastBuild.pages} pages · ${this.lastBuild.relativePath}` : 'No static build generated yet.')
    )
    const buildActions = node(documentRef, 'div', 'elephant-sites-actions')
    const openBuild = node(documentRef, 'button', '', 'Open build')
    openBuild.type = 'button'
    openBuild.disabled = !this.lastBuild?.url
    openBuild.addEventListener('click', () => void this.openExternal(this.lastBuild).catch(() => {}))
    const reveal = node(documentRef, 'button', '', 'Show files')
    reveal.type = 'button'
    reveal.disabled = !this.lastBuild?.outputPath
    reveal.addEventListener('click', () => void this.revealBuild().catch((error) => {
      this.error = normalizeError(error)
      this.renderSettingsState()
    }))
    buildActions.append(openBuild, reveal)
    buildHeader.append(buildCopy, buildActions)
    buildCard.append(buildHeader)
    root.append(buildCard)
  }

  async onload(api) {
    await this.loadConfig()
    api.ui.registerStyle(`
      .elephant-sites-settings{display:grid;gap:14px}.elephant-sites-card{overflow:hidden;border:1px solid var(--en-border);border-radius:14px;background:var(--en-surface)}.elephant-sites-card-header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 16px;border-bottom:1px solid var(--en-border)}.elephant-sites-card-header h4,.elephant-sites-card-header p{margin:0}.elephant-sites-card-header p{margin-top:4px;color:var(--en-muted);font-size:12px}.elephant-sites-form{display:grid;gap:12px;padding:16px}.elephant-sites-form label{display:grid;gap:6px;color:var(--en-muted);font-size:12px}.elephant-sites-form input{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--en-border);border-radius:9px;background:var(--en-surface);color:var(--en-text)}.elephant-sites-actions{display:flex;flex-wrap:wrap;gap:8px}.elephant-sites-actions button{min-height:34px;padding:0 12px;border:1px solid var(--en-border);border-radius:9px;background:var(--en-surface);color:var(--en-text);cursor:pointer}.elephant-sites-actions button.primary{border-color:var(--en-primary);background:var(--en-primary);color:white}.elephant-sites-actions button:disabled{cursor:not-allowed;opacity:.5}.elephant-sites-frame{display:block;width:100%;height:min(58vh,620px);min-height:360px;border:0;background:white}.elephant-sites-error{margin:0;padding:11px 13px;border:1px solid color-mix(in srgb,var(--en-danger,#b42318) 35%,var(--en-border));border-radius:10px;background:color-mix(in srgb,var(--en-danger,#b42318) 8%,transparent);color:var(--en-danger,#b42318)}@media(max-width:760px){.elephant-sites-card-header{align-items:flex-start;flex-direction:column}.elephant-sites-frame{min-height:300px;height:50vh}}
    `, 'physical-sites-settings')

    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 2,
      owner: ADDON_ID,
      previewFolder: (params = {}) => this.openPreview(params),
      buildFolder: (params = {}) => this.buildFolder(params),
      status: (siteId) => this.statusFor(siteId),
      stop: (siteId) => this.stopPreview(siteId),
      openExternal: (url) => this.openExternal(url),
      latestBuild: () => this.lastBuild ? { ...this.lastBuild } : null
    }))

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'sites',
      navigationLabel: 'Sites',
      navigationIcon: 'globe',
      standalone: true,
      chrome: false,
      title: 'Sites',
      description: 'Generate and preview static sites from Markdown folders.',
      order: 70,
      render: (container) => this.renderSettings(container)
    })

    api.commands.register({
      id: `${ADDON_ID}.open-settings`,
      title: 'Open Sites settings',
      run: () => api.app.openSettings('sites')
    })
  }

  onunload() {
    this.disposed = true
    void this.stopPreview()
    this.renderRoot = null
  }
}
