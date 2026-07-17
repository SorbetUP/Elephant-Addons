import { extractZipJsonDocuments } from './zip.js'

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
    const root = node(documentRef, 'section', 'elephant-import-page')
    const selectedFiles = []
    let disposed = false
    let running = false

    const header = node(documentRef, 'header', 'elephant-import-header')
    const headerCopy = node(documentRef, 'div')
    headerCopy.append(
      node(documentRef, 'h2', '', 'Import'),
      node(documentRef, 'p', '', 'Bring Google Keep notes into your active Elephant vault without sending data anywhere.')
    )
    header.append(headerCopy)

    const card = node(documentRef, 'article', 'elephant-import-card')
    const cardHeader = node(documentRef, 'div', 'elephant-import-card-header')
    const provider = node(documentRef, 'div', 'elephant-import-provider')
    const providerIcon = node(documentRef, 'span', 'elephant-import-provider-icon', 'K')
    const providerCopy = node(documentRef, 'div')
    providerCopy.append(
      node(documentRef, 'h3', '', 'Google Keep'),
      node(documentRef, 'p', '', 'Select a Google Takeout ZIP, individual JSON notes, or the extracted Keep folder.')
    )
    provider.append(providerIcon, providerCopy)
    const destination = node(documentRef, 'code', 'elephant-import-destination', DESTINATION)
    cardHeader.append(provider, destination)

    const dropZone = node(documentRef, 'div', 'elephant-import-dropzone')
    dropZone.tabIndex = 0
    dropZone.setAttribute('role', 'button')
    dropZone.setAttribute('aria-label', 'Choose Google Keep export files')
    dropZone.append(
      node(documentRef, 'strong', '', 'Drop a Takeout archive here'),
      node(documentRef, 'span', '', 'or choose an archive, JSON files, or an extracted folder')
    )

    const archiveInput = node(documentRef, 'input', 'elephant-import-hidden-input')
    archiveInput.type = 'file'
    archiveInput.accept = '.zip,.json,application/zip,application/json'
    archiveInput.multiple = true
    const folderInput = node(documentRef, 'input', 'elephant-import-hidden-input')
    folderInput.type = 'file'
    folderInput.multiple = true
    folderInput.setAttribute('webkitdirectory', '')
    folderInput.setAttribute('directory', '')

    const actions = node(documentRef, 'div', 'elephant-import-actions')
    const chooseArchive = node(documentRef, 'button', 'elephant-import-secondary', 'Choose archive or JSON')
    const chooseFolder = node(documentRef, 'button', 'elephant-import-secondary', 'Choose extracted folder')
    const clear = node(documentRef, 'button', 'elephant-import-quiet', 'Clear')
    const importButton = node(documentRef, 'button', 'elephant-import-primary', 'Import notes')
    actions.append(chooseArchive, chooseFolder, clear, importButton)

    const selection = node(documentRef, 'div', 'elephant-import-selection', 'No files selected.')
    const option = node(documentRef, 'label', 'elephant-import-option')
    const includeTrashed = node(documentRef, 'input')
    includeTrashed.type = 'checkbox'
    option.append(includeTrashed, node(documentRef, 'span', '', 'Include notes that were in Google Keep trash'))

    const progress = node(documentRef, 'div', 'elephant-import-progress')
    const progressBar = node(documentRef, 'span', 'elephant-import-progress-bar')
    progress.append(progressBar)
    const status = node(documentRef, 'div', 'elephant-import-status', 'Ready to import.')
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    const resultArea = node(documentRef, 'div', 'elephant-import-results')

    const updateControls = () => {
      const hasFiles = selectedFiles.length > 0
      importButton.disabled = running || !hasFiles
      chooseArchive.disabled = running
      chooseFolder.disabled = running
      clear.disabled = running || !hasFiles
      includeTrashed.disabled = running
      selection.textContent = hasFiles
        ? `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected — ${selectedFiles.map(fileDisplayName).slice(0, 3).join(', ')}${selectedFiles.length > 3 ? '…' : ''}`
        : 'No files selected.'
    }

    const setFiles = (files) => {
      selectedFiles.splice(0, selectedFiles.length, ...Array.from(files || []).filter((file) => ['zip', 'json'].includes(extension(fileDisplayName(file)))))
      resultArea.replaceChildren()
      status.textContent = selectedFiles.length ? 'Selection ready.' : 'No supported ZIP or JSON files were selected.'
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
        const metric = node(documentRef, 'div', `elephant-import-metric elephant-import-metric-${label.toLowerCase()}`)
        metric.append(node(documentRef, 'strong', '', String(value)), node(documentRef, 'span', '', label))
        summary.append(metric)
      }
      resultArea.append(summary)
      const issues = result.results.filter((item) => item.error || item.skipped)
      if (issues.length) {
        const details = node(documentRef, 'details', 'elephant-import-details')
        const detailsSummary = node(documentRef, 'summary', '', `Show ${issues.length} skipped or failed item${issues.length === 1 ? '' : 's'}`)
        const list = node(documentRef, 'ul')
        for (const item of issues.slice(0, 200)) {
          list.append(node(documentRef, 'li', '', `${item.sourceName || 'Unknown file'} — ${item.error || item.reason}`))
        }
        details.append(detailsSummary, list)
        resultArea.append(details)
      }
    }

    const runImport = async() => {
      if (running || !selectedFiles.length) return
      running = true
      progressBar.style.width = '0%'
      resultArea.replaceChildren()
      updateControls()
      try {
        const result = await this.importFiles(selectedFiles, {
          includeTrashed: includeTrashed.checked,
          onProgress: updateProgress
        })
        progressBar.style.width = '100%'
        status.textContent = result.failed
          ? `Import completed with ${result.failed} failure${result.failed === 1 ? '' : 's'}.`
          : `Import completed. ${result.imported} note${result.imported === 1 ? '' : 's'} added to ${DESTINATION}.`
        renderResult(result)
      } catch (error) {
        progressBar.style.width = '0%'
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        running = false
        updateControls()
      }
    }

    chooseArchive.onclick = () => archiveInput.click()
    chooseFolder.onclick = () => folderInput.click()
    clear.onclick = () => setFiles([])
    importButton.onclick = () => void runImport()
    archiveInput.onchange = () => setFiles(archiveInput.files)
    folderInput.onchange = () => setFiles(folderInput.files)
    dropZone.onclick = () => archiveInput.click()
    dropZone.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        archiveInput.click()
      }
    }
    dropZone.ondragover = (event) => {
      event.preventDefault()
      dropZone.classList.add('is-dragging')
    }
    dropZone.ondragleave = () => dropZone.classList.remove('is-dragging')
    dropZone.ondrop = (event) => {
      event.preventDefault()
      dropZone.classList.remove('is-dragging')
      setFiles(event.dataTransfer?.files)
    }

    card.append(cardHeader, dropZone, archiveInput, folderInput, actions, selection, option, progress, status, resultArea)
    root.append(header, card)
    container.replaceChildren(root)
    updateControls()
    return () => {
      disposed = true
      root.remove()
    }
  }

  async onload(api) {
    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 2,
      owner: ADDON_ID,
      parse: (input, sourceName = '') => parseKeepDocument(input, sourceName),
      toMarkdown: (input, sourceName = '') => keepDocumentToMarkdown(parseKeepDocument(input, sourceName)),
      importDocuments: (documents, options = {}) => this.importDocuments(documents, options),
      importFiles: (files, options = {}) => this.importFiles(files, options),
      destination: DESTINATION
    }))

    api.commands.register({
      id: `${ADDON_ID}.import`,
      title: 'Import Google Keep Takeout',
      run: (documents = [], options = {}) => this.importDocuments(documents, options)
    })

    api.ui.registerStyle(`
      .elephant-import-page { height:100%; overflow:auto; box-sizing:border-box; display:grid; align-content:start; gap:20px; padding:22px; }
      .elephant-import-header h2,.elephant-import-header p,.elephant-import-card h3,.elephant-import-card p { margin:0; }
      .elephant-import-header p,.elephant-import-provider p,.elephant-import-selection,.elephant-import-status { color:var(--en-muted); }
      .elephant-import-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
      .elephant-import-card { display:grid; gap:16px; padding:18px; border:1px solid var(--en-border); border-radius:16px; background:var(--en-surface); box-shadow:0 10px 30px color-mix(in srgb, var(--en-text) 6%, transparent); }
      .elephant-import-card-header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
      .elephant-import-provider { display:flex; align-items:center; gap:12px; min-width:0; }
      .elephant-import-provider-icon { display:grid; place-items:center; width:38px; height:38px; flex:none; border-radius:11px; background:#f6c744; color:#342900; font-weight:800; }
      .elephant-import-destination { max-width:48%; overflow:hidden; text-overflow:ellipsis; padding:7px 9px; border-radius:8px; background:var(--en-soft); color:var(--en-muted); white-space:nowrap; }
      .elephant-import-dropzone { display:grid; place-items:center; gap:5px; min-height:150px; padding:22px; border:1px dashed var(--en-border); border-radius:14px; background:var(--en-soft); text-align:center; cursor:pointer; transition:border-color .15s ease,transform .15s ease,background .15s ease; }
      .elephant-import-dropzone:hover,.elephant-import-dropzone:focus-visible,.elephant-import-dropzone.is-dragging { border-color:var(--en-accent); background:color-mix(in srgb, var(--en-accent) 8%, var(--en-soft)); outline:none; transform:translateY(-1px); }
      .elephant-import-dropzone span { color:var(--en-muted); font-size:13px; }
      .elephant-import-hidden-input { display:none; }
      .elephant-import-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
      .elephant-import-actions button { min-height:36px; padding:0 13px; border:1px solid var(--en-border); border-radius:9px; color:var(--en-text); cursor:pointer; }
      .elephant-import-secondary { background:var(--en-surface); }
      .elephant-import-quiet { background:transparent; }
      .elephant-import-primary { margin-left:auto; border-color:var(--en-accent)!important; background:var(--en-accent); color:var(--en-accent-contrast,#fff)!important; font-weight:650; }
      .elephant-import-actions button:disabled { opacity:.5; cursor:default; }
      .elephant-import-selection { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
      .elephant-import-option { display:flex; align-items:center; gap:8px; color:var(--en-muted); font-size:13px; }
      .elephant-import-progress { height:5px; overflow:hidden; border-radius:999px; background:var(--en-soft); }
      .elephant-import-progress-bar { display:block; width:0; height:100%; border-radius:inherit; background:var(--en-accent); transition:width .12s ease; }
      .elephant-import-status { min-height:20px; font-size:13px; }
      .elephant-import-results { display:grid; gap:10px; }
      .elephant-import-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .elephant-import-metric { display:grid; gap:2px; padding:11px; border:1px solid var(--en-border); border-radius:11px; background:var(--en-soft); }
      .elephant-import-metric strong { font-size:20px; }
      .elephant-import-metric span { color:var(--en-muted); font-size:12px; }
      .elephant-import-details { border:1px solid var(--en-border); border-radius:11px; padding:10px 12px; }
      .elephant-import-details summary { cursor:pointer; }
      .elephant-import-details ul { max-height:220px; overflow:auto; margin:10px 0 0; padding-left:20px; color:var(--en-muted); font-size:12px; }
      @media (max-width:680px) { .elephant-import-page{padding:14px}.elephant-import-card-header{align-items:flex-start;flex-direction:column}.elephant-import-destination{max-width:100%}.elephant-import-primary{margin-left:0;width:100%}.elephant-import-summary{grid-template-columns:1fr}.elephant-import-dropzone{min-height:120px} }
    `, 'google-keep-import-package-v2')

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
