import { extractZipJsonDocuments } from './zip.js'
import { createSourceImporter } from './sources.js'

const ADDON_ID = 'elephant.google-keep-import'
const PROVIDER_RESOURCE = 'import.google-keep'
const DESTINATION = 'Imported/Google Keep'
const COLLISION_ERROR = /already exists|overwrite was not requested/i

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const asString = (value) => typeof value === 'string' ? value : value == null ? '' : String(value)
const basename = (value = '') => asString(value).replaceAll('\\', '/').split('/').pop() || ''
const withoutExtension = (value = '') => basename(value).replace(/\.json$/i, '')
const normalizeInlineText = (value = '') => asString(value).replace(/\r\n?/g, '\n').trim()
const normalizeListText = (value = '') => normalizeInlineText(value).replace(/\s*\n\s*/g, ' ')

const timestampToIso = (value) => {
  if (value == null || value === '') return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  const milliseconds = numeric > 10_000_000_000_000 ? numeric / 1000 : numeric
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

const yamlString = (value) => JSON.stringify(asString(value))
const isUnsafeFilenameCharacter = (character) => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 31 || '<>:"/\\|?*'.includes(character)
}

export const safeNoteStem = (value = '') => {
  const normalized = [...asString(value).normalize('NFKC')]
    .map((character) => isUnsafeFilenameCharacter(character) ? '-' : character)
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  return (normalized || 'Untitled Keep note').slice(0, 120)
}

const normalizeLabels = (value) => (Array.isArray(value) ? value : [])
  .map((label) => asString(label?.name ?? label).trim())
  .filter(Boolean)

const normalizeList = (value) => (Array.isArray(value) ? value : [])
  .map((item) => ({
    text: normalizeListText(item?.text ?? item?.textContent),
    checked: item?.isChecked === true || item?.checked === true
  }))
  .filter((item) => item.text)

const normalizeAttachments = (value) => (Array.isArray(value) ? value : [])
  .map((attachment) => ({
    path: asString(attachment?.filePath || attachment?.fileName || attachment?.name).trim(),
    mimeType: asString(attachment?.mimetype || attachment?.mimeType).trim()
  }))
  .filter((attachment) => attachment.path || attachment.mimeType)

const normalizeLinks = (value) => (Array.isArray(value) ? value : [])
  .map((annotation) => annotation?.webLink || annotation?.link || annotation)
  .map((link) => ({
    title: asString(link?.title).trim(),
    url: asString(link?.url || link?.uri).trim(),
    description: asString(link?.description).trim()
  }))
  .filter((link) => /^https?:\/\//i.test(link.url))

const looksLikeKeepNote = (value) => [
  'title', 'textContent', 'text', 'listContent', 'listItems', 'labels', 'attachments',
  'createdTimestampUsec', 'userEditedTimestampUsec', 'isPinned', 'isArchived', 'isTrashed',
  'color', 'annotations'
].some((key) => Object.hasOwn(value, key))

export const parseKeepDocument = (input, sourceName = '') => {
  const value = typeof input === 'string' ? JSON.parse(input) : input
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('A Google Keep note must be a JSON object')
  }
  if (!looksLikeKeepNote(value)) throw new TypeError('The JSON file is not a Google Keep note')

  const sourceStem = withoutExtension(sourceName)
  const title = normalizeInlineText(value.title) || sourceStem || 'Untitled Keep note'
  const createdAt = timestampToIso(value.createdTimestampUsec ?? value.createdAt ?? value.created)
  const updatedAt = timestampToIso(value.userEditedTimestampUsec ?? value.updatedAt ?? value.updated)

  return {
    title,
    text: normalizeInlineText(value.textContent ?? value.text),
    list: normalizeList(value.listContent ?? value.listItems),
    labels: normalizeLabels(value.labels),
    attachments: normalizeAttachments(value.attachments),
    links: normalizeLinks(value.annotations),
    createdAt,
    updatedAt,
    pinned: value.isPinned === true,
    archived: value.isArchived === true,
    trashed: value.isTrashed === true,
    color: asString(value.color).trim(),
    sourceName: basename(sourceName),
    sourceStem
  }
}

const attachmentLabel = (attachment) => {
  const name = basename(attachment.path) || attachment.path || 'Attachment'
  return attachment.mimeType ? `${name} (${attachment.mimeType})` : name
}

export const keepDocumentToMarkdown = (note) => {
  const type = note.list.length ? 'task' : 'note'
  const createdAt = note.createdAt || note.updatedAt
  const updatedAt = note.updatedAt || note.createdAt
  const frontmatter = [
    '---',
    'source: google-keep',
    `title: ${yamlString(note.title)}`,
    `type: ${yamlString(type)}`,
    `tags: [${note.labels.map(yamlString).join(', ')}]`,
    `pinned: ${Boolean(note.pinned)}`,
    `archived: ${Boolean(note.archived)}`,
    `trashed: ${Boolean(note.trashed)}`
  ]
  if (createdAt) frontmatter.push(`createdAt: ${yamlString(createdAt)}`)
  if (updatedAt) frontmatter.push(`updatedAt: ${yamlString(updatedAt)}`)
  if (note.color) frontmatter.push(`googleKeepColor: ${yamlString(note.color)}`)
  if (note.sourceName) frontmatter.push(`sourceFile: ${yamlString(note.sourceName)}`)
  frontmatter.push('---')

  const body = [`# ${note.title}`]
  if (note.text) body.push(note.text)
  if (note.list.length) {
    body.push(note.list.map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n'))
  }
  if (note.attachments.length) {
    body.push('## Attachments', note.attachments.map((attachment) => `- ${attachmentLabel(attachment)}`).join('\n'))
  }
  if (note.links.length) {
    body.push(
      '## Links',
      note.links.map((link) => `- [${link.title || link.url}](${link.url})${link.description ? ` — ${link.description}` : ''}`).join('\n')
    )
  }
  return `${frontmatter.join('\n')}\n\n${body.join('\n\n')}\n`
}

const fileDisplayName = (file) => asString(file?.webkitRelativePath || file?.name).trim()
const extension = (value) => basename(value).toLowerCase().split('.').pop() || ''

export const readKeepImportFiles = async(files, onProgress = () => {}) => {
  const selected = Array.from(files || [])
  const documents = []
  let processed = 0
  for (const file of selected) {
    const name = fileDisplayName(file)
    const type = extension(name)
    onProgress({ phase: 'reading', processed, total: selected.length, name })
    if (type === 'json') {
      try {
        documents.push({ name, content: await file.text() })
      } catch (error) {
        documents.push({ name, error: error instanceof Error ? error.message : String(error) })
      }
    } else if (type === 'zip') {
      try {
        const archiveDocuments = await extractZipJsonDocuments(file)
        documents.push(...archiveDocuments)
      } catch (error) {
        documents.push({ name, error: error instanceof Error ? error.message : String(error) })
      }
    }
    processed += 1
  }
  onProgress({ phase: 'reading', processed, total: selected.length, name: '' })
  return documents
}

const candidatePath = (stem, index) => `${DESTINATION}/${stem}${index === 1 ? '' : ` ${index}`}.md`

export default class ElephantGoogleKeepImportAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.sourceImporter = createSourceImporter({
      addonId: ADDON_ID,
      windowRef: this.window,
      invoke: (command, payload) => this.invoke(command, payload),
      writeNote: (notePath, markdown, overwrite = false) => this.writeNote(notePath, markdown, overwrite),
      safeStem: safeNoteStem
    })
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  writeNote(path, markdown, overwrite = false) {
    return this.invoke('tauri_addons_notes_write', {
      addonId: ADDON_ID,
      path,
      markdown,
      overwrite
    })
  }

  async writeUniqueNote(note, markdown, reservedPaths) {
    const stem = safeNoteStem(note.title || note.sourceStem)
    for (let index = 1; index <= 10_000; index += 1) {
      const path = candidatePath(stem, index)
      const key = path.toLowerCase()
      if (reservedPaths.has(key)) continue
      try {
        const result = await this.writeNote(path, markdown, false)
        reservedPaths.add(key)
        return { path, created: result?.created !== false }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (COLLISION_ERROR.test(message)) continue
        throw error
      }
    }
    throw new Error(`Too many notes already use the title “${note.title}”`)
  }

  async importDocuments(documents, options = {}) {
    if (!Array.isArray(documents)) throw new TypeError('Google Keep import expects an array of JSON documents')
    const reservedPaths = new Set()
    const results = []
    const total = documents.length
    for (let index = 0; index < documents.length; index += 1) {
      const item = documents[index]
      const sourceName = asString(item?.name ?? item?.sourceName)
      options.onProgress?.({ phase: 'importing', processed: index, total, name: sourceName })
      if (item?.error) {
        results.push({ sourceName, error: asString(item.error) })
        continue
      }
      try {
        const raw = item?.content ?? item?.json ?? item
        const note = parseKeepDocument(raw, sourceName)
        if (note.trashed && options.includeTrashed !== true) {
          results.push({ sourceName, skipped: true, reason: 'trashed' })
          continue
        }
        const written = await this.writeUniqueNote(note, keepDocumentToMarkdown(note), reservedPaths)
        results.push({ sourceName, ...written })
      } catch (error) {
        results.push({
          sourceName,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    options.onProgress?.({ phase: 'importing', processed: total, total, name: '' })
    return {
      total,
      imported: results.filter((result) => result.path).length,
      skipped: results.filter((result) => result.skipped).length,
      failed: results.filter((result) => result.error).length,
      destination: DESTINATION,
      results
    }
  }

  async importFiles(files, options = {}) {
    const documents = await readKeepImportFiles(files, options.onProgress)
    return this.importDocuments(documents, options)
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'en-settings-group elephant-import-settings')
    const selectedFiles = []
    let disposed = false
    let running = false

    const archiveInput = node(documentRef, 'input', 'elephant-import-hidden-input')
    archiveInput.type = 'file'
    archiveInput.accept = '.zip,.json,application/zip,application/json'
    archiveInput.multiple = true
    const folderInput = node(documentRef, 'input', 'elephant-import-hidden-input')
    folderInput.type = 'file'
    folderInput.multiple = true
    folderInput.setAttribute('webkitdirectory', '')
    folderInput.setAttribute('directory', '')

    const keepRow = node(documentRef, 'div', 'en-settings-row')
    const keepCopy = node(documentRef, 'div', 'en-settings-row-copy')
    keepCopy.append(
      node(documentRef, 'strong', '', 'Google Keep archive'),
      node(documentRef, 'span', '', 'Convert a Google Takeout ZIP, JSON notes or an extracted Keep folder into local Markdown notes.')
    )
    const importButton = node(documentRef, 'button', 'en-primary-button', 'Import Google Keep')
    importButton.type = 'button'
    keepRow.append(keepCopy, importButton)

    const keepActions = node(documentRef, 'div', 'en-settings-inline-actions elephant-import-keep-actions')
    const folderButton = node(documentRef, 'button', '', 'Import extracted folder')
    folderButton.type = 'button'
    const selection = node(documentRef, 'span', 'elephant-import-selection', '')
    keepActions.append(folderButton, selection)

    const option = node(documentRef, 'label', 'elephant-import-option')
    const includeTrashed = node(documentRef, 'input')
    includeTrashed.type = 'checkbox'
    option.append(includeTrashed, node(documentRef, 'span', '', 'Include notes that were in Google Keep trash'))

    const progress = node(documentRef, 'div', 'elephant-import-progress')
    const progressBar = node(documentRef, 'span', 'elephant-import-progress-bar')
    progress.append(progressBar)
    const status = node(documentRef, 'div', 'elephant-import-status', '')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    const resultArea = node(documentRef, 'div', 'elephant-import-results')

    const updateControls = () => {
      importButton.disabled = running
      folderButton.disabled = running
      includeTrashed.disabled = running
      importButton.textContent = running ? 'Importing…' : 'Import Google Keep'
      selection.textContent = selectedFiles.length
        ? `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected`
        : ''
    }

    const setFiles = (files) => {
      selectedFiles.splice(
        0,
        selectedFiles.length,
        ...Array.from(files || []).filter((file) => ['zip', 'json'].includes(extension(fileDisplayName(file))))
      )
      updateControls()
    }

    const updateProgress = ({ phase, processed = 0, total = 0, name = '' }) => {
      if (disposed) return
      const ratio = total > 0 ? Math.min(1, processed / total) : 0
      progressBar.style.width = `${Math.round(ratio * 100)}%`
      status.textContent = phase === 'reading'
        ? `Reading export ${Math.min(processed + (name ? 1 : 0), total)}/${total}${name ? ` — ${name}` : ''}`
        : `Importing note ${Math.min(processed + (name ? 1 : 0), total)}/${total}${name ? ` — ${basename(name)}` : ''}`
    }

    const renderResult = (result) => {
      resultArea.replaceChildren()
      const summary = node(documentRef, 'div', 'elephant-import-summary')
      for (const [label, value] of [['Imported', result.imported], ['Skipped', result.skipped], ['Failed', result.failed]]) {
        const metric = node(documentRef, 'span', `elephant-import-metric elephant-import-metric-${label.toLowerCase()}`)
        metric.append(node(documentRef, 'strong', '', String(value)), documentRef.createTextNode(` ${label.toLowerCase()}`))
        summary.append(metric)
      }
      resultArea.append(summary)
      const issues = result.results.filter((item) => item.error || item.skipped)
      if (issues.length) {
        const details = node(documentRef, 'details', 'elephant-import-details')
        details.append(node(documentRef, 'summary', '', `Show ${issues.length} skipped or failed item${issues.length === 1 ? '' : 's'}`))
        const list = node(documentRef, 'ul')
        for (const item of issues.slice(0, 200)) {
          list.append(node(documentRef, 'li', '', `${item.sourceName || 'Unknown file'} — ${item.error || item.reason}`))
        }
        details.append(list)
        resultArea.append(details)
      }
    }

    const runImport = async() => {
      if (running || !selectedFiles.length) return
      running = true
      progressBar.style.width = '0%'
      resultArea.replaceChildren()
      status.textContent = 'Preparing import…'
      updateControls()
      try {
        const result = await this.importFiles(selectedFiles, {
          includeTrashed: includeTrashed.checked,
          onProgress: updateProgress
        })
        progressBar.style.width = '100%'
        status.textContent = result.failed
          ? `Imported ${result.imported} note${result.imported === 1 ? '' : 's'} with ${result.failed} failure${result.failed === 1 ? '' : 's'}.`
          : `Imported ${result.imported} note${result.imported === 1 ? '' : 's'} into ${DESTINATION}.`
        renderResult(result)
      } catch (error) {
        progressBar.style.width = '0%'
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        running = false
        selectedFiles.splice(0)
        archiveInput.value = ''
        folderInput.value = ''
        updateControls()
      }
    }

    importButton.onclick = () => archiveInput.click()
    folderButton.onclick = () => folderInput.click()
    archiveInput.onchange = () => {
      setFiles(archiveInput.files)
      void runImport()
    }
    folderInput.onchange = () => {
      setFiles(folderInput.files)
      void runImport()
    }

    root.append(
      keepRow,
      archiveInput,
      folderInput,
      keepActions,
      option,
      progress,
      status,
      resultArea,
      this.sourceImporter.render(documentRef, node)
    )
    container.replaceChildren(root)
    updateControls()
    return () => {
      disposed = true
      root.remove()
    }
  }

  async onload(api) {
    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 1,
      owner: ADDON_ID,
      parse: (input, sourceName = '') => parseKeepDocument(input, sourceName),
      toMarkdown: (input, sourceName = '') => keepDocumentToMarkdown(parseKeepDocument(input, sourceName)),
      importDocuments: (documents, options = {}) => this.importDocuments(documents, options),
      importFiles: (files, options = {}) => this.importFiles(files, options),
      importPage: (url, destination = 'Sources') => this.sourceImporter.importPage(url, destination),
      importRss: (url, destination = 'Sources', limit = 20) => this.sourceImporter.importRss(url, destination, limit),
      destination: DESTINATION
    }))

    api.commands.register({
      id: `${ADDON_ID}.import`,
      title: 'Import Google Keep Takeout',
      run: (documents = [], options = {}) => this.importDocuments(documents, options)
    })

    api.ui.registerStyle(`
      .elephant-import-settings { display:grid; gap:14px; }
      .elephant-import-hidden-input { display:none; }
      .elephant-import-keep-actions { min-height:28px; }
      .elephant-import-selection,.elephant-import-status,.elephant-source-import-status { color:var(--en-muted); font-size:13px; }
      .elephant-import-option { display:flex; align-items:center; gap:8px; color:var(--en-muted); font-size:13px; }
      .elephant-import-progress { height:4px; overflow:hidden; border-radius:999px; background:var(--en-soft); }
      .elephant-import-progress-bar { display:block; width:0; height:100%; border-radius:inherit; background:var(--en-accent); transition:width .12s ease; }
      .elephant-import-results { display:grid; gap:8px; }
      .elephant-import-summary { display:flex; flex-wrap:wrap; gap:8px 14px; font-size:13px; }
      .elephant-import-metric { color:var(--en-muted); }
      .elephant-import-metric strong { color:var(--en-text); }
      .elephant-import-details { border:1px solid var(--en-border); border-radius:9px; padding:9px 11px; }
      .elephant-import-details summary { cursor:pointer; }
      .elephant-import-details ul { max-height:220px; overflow:auto; margin:8px 0 0; padding-left:20px; color:var(--en-muted); font-size:12px; }
    `, 'google-keep-import-package-v3')

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'import',
      navigationLabel: 'Import',
      navigationIcon: 'download',
      standalone: true,
      chrome: false,
      title: 'Import',
      description: 'Import notes from external applications.',
      order: 40,
      render: (container) => this.render(container)
    })
  }
}
