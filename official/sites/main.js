import { createSitePlan, normalizeDirectory, slugify } from './site-builder'

const ADDON_ID = 'elephant.sites'
const PROVIDER_RESOURCE = 'sites.provider'
const DEFAULT_DIRECTORY = 'Sites'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const normalizeRelativePath = (value = '') => String(value)
  .replaceAll('\\', '/')
  .split('/')
  .filter((part) => part && part !== '.' && part !== '..')
  .join('/')

const appendIndex = (directory = '') => `${String(directory).replaceAll('\\', '/').replace(/\/+$/g, '')}/index.html`
const joinPath = (...parts) => parts
  .flatMap((part) => String(part || '').replaceAll('\\', '/').split('/'))
  .filter((part) => part && part !== '.')
  .reduce((result, part) => {
    if (part === '..') result.pop()
    else result.push(part)
    return result
  }, [])
  .join('/')

export default class ElephantSitesAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.site = null
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async listNotes(sourceDirectory) {
    const entries = await this.invoke('tauri_addons_notes_list', { addonId: ADDON_ID, prefix: sourceDirectory })
    const notes = []
    for (const entry of Array.isArray(entries) ? entries : []) {
      const path = String(entry?.path || entry?.relativePath || '').trim()
      if (!/\.(?:md|markdown)$/i.test(path)) continue
      const result = await this.invoke('tauri_addons_notes_read', { addonId: ADDON_ID, path })
      notes.push({ ...entry, path, markdown: String(result?.markdown || result?.content || '') })
    }
    return notes
  }

  async generate({ sourceDirectory = DEFAULT_DIRECTORY, mode = 'preview' } = {}) {
    const source = normalizeDirectory(sourceDirectory)
    const notes = await this.listNotes(source)
    const outputRoot = joinPath('.elephantnote', mode === 'build' ? 'site-builds' : 'site-previews', slugify(source))
    const assets = new Map()
    const resolveAssetUrl = (assetPath) => {
      const normalized = String(assetPath || '').replaceAll('\\', '/').replace(/^\.\//, '')
      const isVaultAsset = normalized.startsWith('.assets/')
      const output = isVaultAsset
        ? joinPath('assets', 'vault', normalized)
        : joinPath('assets', 'content', normalized.replace(`${source}/`, ''))
      const input = isVaultAsset
        ? normalized
        : normalized.startsWith(`${source}/`) ? normalized : joinPath(source, normalized)
      assets.set(input, output)
      return `./${output}`
    }
    const plan = createSitePlan({ sourceDirectory: source, notes, resolveAssetUrl })
    await this.invoke('tauri_vault_remove_path', { pathname: outputRoot }).catch(() => {})
    for (const [relative, content] of plan.files.entries()) {
      await this.invoke('tauri_addons_call', {
        addonId: ADDON_ID,
        method: 'notes.write',
        params: { path: joinPath(outputRoot, relative), content, overwrite: true }
      })
    }
    for (const [input, output] of assets.entries()) {
      const binary = await this.invoke('tauri_vault_read_binary', { pathname: input })
      await this.invoke('tauri_vault_write_binary', {
        pathname: joinPath(outputRoot, output),
        dataBase64: binary.dataBase64
      })
    }
    const info = {
      siteId: `site:${outputRoot}`,
      relativePath: outputRoot,
      indexPath: joinPath(outputRoot, 'index.html'),
      sourceDirectory: source,
      pages: plan.pages.length,
      assets: assets.size,
      mode,
      running: mode === 'preview'
    }
    this.site = info
    this.api.logger?.info?.('[sites] generated site', { mode, sourceDirectory: source, pages: info.pages, assets: info.assets })
    return info
  }

  async openPreview(params = {}) {
    const relativePath = normalizeRelativePath(params.relativePath || params.path || DEFAULT_DIRECTORY)
    if (!relativePath) throw new Error('A site directory inside the active vault is required')

    const allowed = await this.invoke('tauri_addons_assets_allow_directory', {
      addonId: ADDON_ID,
      relativePath
    })
    const convertFileSrc = this.window?.__TAURI__?.core?.convertFileSrc
    if (typeof convertFileSrc !== 'function') throw new Error('Tauri asset URL conversion is unavailable')

    const indexPath = appendIndex(allowed.path)
    this.site = {
      siteId: `asset:${allowed.relativePath}`,
      name: allowed.relativePath.split('/').pop() || 'Static site',
      relativePath: allowed.relativePath,
      sourcePath: allowed.path,
      indexPath,
      url: convertFileSrc(indexPath),
      runtime: 'tauri-asset-protocol',
      running: true
    }
    return { ...this.site }
  }

  status(siteId = this.site?.siteId) {
    if (!this.site || (siteId && siteId !== this.site.siteId)) return null
    return { ...this.site }
  }

  async stopPreview(siteId = this.site?.siteId) {
    if (!this.site || (siteId && siteId !== this.site.siteId)) return { stopped: false, cleaned: false }
    const stopped = this.site.siteId
    await this.invoke('tauri_vault_remove_path', { pathname: this.site.relativePath }).catch(() => {})
    this.site = null
    this.api.logger?.info?.('[sites] preview stopped', { siteId: stopped })
    return { stopped: true, siteId: stopped, cleaned: true }
  }

  async openExternal(info = this.site) {
    const indexPath = typeof info === 'string' ? info : info?.indexPath
    if (!indexPath) return null
    const openPath = this.window?.__TAURI__?.opener?.openPath
    if (typeof openPath === 'function') {
      await openPath(info.indexPath)
      return { opened: true, path: indexPath }
    }
    const openUrl = this.window?.__TAURI__?.opener?.openUrl
    if (typeof openUrl !== 'function') throw new Error('Tauri opener API is unavailable')
    await openUrl(this.site?.url || indexPath)
    return { opened: true, path: indexPath }
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-sites-package')
    container.replaceChildren(root)
    let disposed = false

    const renderState = () => {
      if (disposed) return
      root.replaceChildren()
      const header = node(documentRef, 'header', 'elephant-sites-header')
      const copy = node(documentRef, 'div')
      copy.append(
        node(documentRef, 'h2', '', 'Sites'),
        node(documentRef, 'p', '', 'Preview index.html from a permission-scoped vault directory.')
      )
      header.append(copy)
      root.append(header)

      const form = node(documentRef, 'div', 'elephant-sites-actions')
      const input = node(documentRef, 'input')
      input.value = this.site?.relativePath || DEFAULT_DIRECTORY
      input.placeholder = 'Sites/my-site'
      const preview = node(documentRef, 'button', '', this.site ? 'Open another directory' : 'Preview directory')
      preview.onclick = async () => {
        preview.disabled = true
        try {
          await this.openPreview({ relativePath: input.value })
          renderState()
        } finally {
          preview.disabled = false
        }
      }
      form.append(input, preview)
      root.append(form)

      if (!this.site) {
        root.append(node(documentRef, 'p', 'elephant-sites-empty', 'No site preview is open.'))
        return
      }

      const card = node(documentRef, 'article', 'elephant-sites-card')
      card.append(
        node(documentRef, 'strong', '', this.site.name),
        node(documentRef, 'small', '', this.site.relativePath),
        node(documentRef, 'code', '', this.site.url)
      )
      const controls = node(documentRef, 'div', 'elephant-sites-actions')
      const open = node(documentRef, 'button', '', 'Open externally')
      open.onclick = () => void this.openExternal()
      const stop = node(documentRef, 'button', '', 'Close preview')
      stop.onclick = () => {
        this.stopPreview()
        renderState()
      }
      controls.append(open, stop)
      card.append(controls)
      root.append(card)

      const frame = node(documentRef, 'iframe', 'elephant-sites-frame')
      frame.src = this.site.url
      frame.title = `${this.site.name} preview`
      frame.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-scripts allow-same-origin')
      root.append(frame)
    }

    renderState()
    return () => {
      disposed = true
      root.remove()
    }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-sites-package { height:100%; overflow:auto; box-sizing:border-box; display:grid; grid-template-rows:auto auto auto minmax(320px,1fr); align-content:start; gap:14px; padding:18px; }
      .elephant-sites-header h2,.elephant-sites-header p { margin:0; }
      .elephant-sites-header p,.elephant-sites-empty { color:var(--en-muted); }
      .elephant-sites-actions { display:flex; flex-wrap:wrap; gap:8px; }
      .elephant-sites-actions input { flex:1; min-width:220px; min-height:34px; padding:0 10px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); }
      .elephant-sites-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-sites-card { display:grid; gap:9px; padding:14px; border:1px solid var(--en-border); border-radius:13px; background:var(--en-surface); }
      .elephant-sites-card small { color:var(--en-muted); }
      .elephant-sites-card code { overflow:auto; padding:8px; border-radius:8px; background:var(--en-soft); }
      .elephant-sites-frame { width:100%; min-height:420px; border:1px solid var(--en-border); border-radius:13px; background:white; }
    `, 'sites-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 1,
      owner: ADDON_ID,
      previewFolder: (params = {}) => this.openPreview(params),
      status: (siteId) => this.status(siteId),
      stop: (siteId) => this.stopPreview(siteId),
      openExternal: (url) => this.openExternal(url)
    }))

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'sites',
      standalone: true,
      navigationLabel: 'Sites',
      navigationIcon: 'globe',
      chrome: false,
      title: 'Sites',
      description: 'Preview a permission-scoped static vault directory.',
      order: 55,
      render: (container) => this.render(container)
    })
  }

  onunload() {
    this.stopPreview()
  }
}
