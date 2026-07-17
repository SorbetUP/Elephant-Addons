const MAX_RSS_ITEMS = 50
const DEFAULT_RSS_ITEMS = 20
const COLLISION_ERROR = /already exists|overwrite was not requested/i

const asString = (value) => typeof value === 'string' ? value : value == null ? '' : String(value)
const normalizeWhitespace = (value = '') => asString(value).replace(/\r\n?/g, '\n').replace(/[\t\f\v]+/g, ' ')
const yamlString = (value) => JSON.stringify(asString(value))

const normalizeRelativePath = (value = 'Sources') => {
  const parts = asString(value || 'Sources')
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.')
  if (!parts.length) return 'Sources'
  if (parts.some((part) => part === '..' || part.startsWith('.'))) {
    throw new Error('The source destination cannot contain hidden or parent directories.')
  }
  const normalized = parts.join('/')
  if (normalized !== 'Sources' && !normalized.startsWith('Sources/')) {
    throw new Error('Imported web sources must be stored inside Sources/.')
  }
  return normalized
}

const validateHttpsUrl = (value) => {
  let url
  try {
    url = new URL(asString(value).trim())
  } catch {
    throw new Error('Enter a valid HTTPS URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Only HTTPS source URLs are supported.')
  url.hash = ''
  return url.toString()
}

const localName = (element) => asString(element?.localName || element?.nodeName).toLowerCase()
const compactText = (value = '') => normalizeWhitespace(value).replace(/\s+/g, ' ').trim()

const childMarkdown = (element, context) => Array.from(element.childNodes || [])
  .map((child) => nodeToMarkdown(child, context))
  .join('')

const listMarkdown = (element, context) => {
  const ordered = localName(element) === 'ol'
  const lines = []
  let index = 0
  for (const item of Array.from(element.children || [])) {
    if (localName(item) !== 'li') continue
    index += 1
    const prefix = ordered ? `${index}. ` : '- '
    const body = Array.from(item.childNodes || [])
      .filter((child) => !['ul', 'ol'].includes(localName(child)))
      .map((child) => nodeToMarkdown(child, { ...context, inList: true }))
      .join('')
      .replace(/\n{2,}/g, '\n')
      .trim()
    lines.push(`${'  '.repeat(context.depth || 0)}${prefix}${body}`)
    for (const nested of Array.from(item.children || []).filter((child) => ['ul', 'ol'].includes(localName(child)))) {
      lines.push(listMarkdown(nested, { ...context, depth: (context.depth || 0) + 1 }).trimEnd())
    }
  }
  return `${lines.filter(Boolean).join('\n')}\n\n`
}

const nodeToMarkdown = (node, context = {}) => {
  if (!node) return ''
  if (node.nodeType === 3) return normalizeWhitespace(node.nodeValue || '')
  if (node.nodeType !== 1) return ''
  const tag = localName(node)
  if (['script', 'style', 'noscript', 'template', 'svg', 'canvas'].includes(tag)) return ''
  if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${compactText(node.textContent)}\n\n`
  if (tag === 'br') return '\n'
  if (tag === 'hr') return '\n\n---\n\n'
  if (tag === 'p') return `\n\n${childMarkdown(node, context).trim()}\n\n`
  if (tag === 'blockquote') {
    const body = childMarkdown(node, context).trim().split('\n').map((line) => `> ${line}`).join('\n')
    return `\n\n${body}\n\n`
  }
  if (tag === 'pre') {
    const body = normalizeWhitespace(node.textContent || '').replace(/\n+$/g, '')
    return `\n\n\`\`\`\n${body}\n\`\`\`\n\n`
  }
  if (tag === 'code') {
    const body = compactText(node.textContent)
    const fence = body.includes('`') ? '``' : '`'
    return `${fence}${body}${fence}`
  }
  if (['strong', 'b'].includes(tag)) return `**${childMarkdown(node, context).trim()}**`
  if (['em', 'i'].includes(tag)) return `*${childMarkdown(node, context).trim()}*`
  if (tag === 'del' || tag === 's') return `~~${childMarkdown(node, context).trim()}~~`
  if (tag === 'a') {
    const label = compactText(node.textContent) || compactText(node.getAttribute('href'))
    const href = asString(node.getAttribute('href')).trim()
    return href ? `[${label}](${href})` : label
  }
  if (tag === 'img') {
    const src = asString(node.getAttribute('src')).trim()
    const alt = compactText(node.getAttribute('alt'))
    return /^https?:\/\//i.test(src) ? `![${alt}](${src})` : ''
  }
  if (tag === 'ul' || tag === 'ol') return listMarkdown(node, context)
  if (tag === 'li') return childMarkdown(node, context)
  if (tag === 'table') {
    const rows = Array.from(node.querySelectorAll('tr')).map((row) =>
      Array.from(row.querySelectorAll('th,td')).map((cell) => compactText(cell.textContent))
    ).filter((row) => row.length)
    if (!rows.length) return ''
    const width = Math.max(...rows.map((row) => row.length))
    const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')])
    const header = normalized[0]
    return `\n\n| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n${normalized.slice(1).map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n`
  }
  const body = childMarkdown(node, context)
  return ['div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'figure', 'figcaption'].includes(tag)
    ? `\n${body}\n`
    : body
}

const cleanupMarkdown = (value = '') => normalizeWhitespace(value)
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n[ \t]+/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const parserFor = (windowRef) => {
  const Parser = windowRef?.DOMParser || globalThis.DOMParser
  if (typeof Parser !== 'function') throw new Error('The document parser is unavailable in this runtime.')
  return new Parser()
}

const parseHtml = (windowRef, html) => parserFor(windowRef).parseFromString(asString(html), 'text/html')
const parseXml = (windowRef, xml) => {
  const documentRef = parserFor(windowRef).parseFromString(asString(xml), 'application/xml')
  if (documentRef.querySelector('parsererror')) throw new Error('The RSS or Atom response is not valid XML.')
  return documentRef
}

const preferredPageRoot = (documentRef) => documentRef.querySelector('article, main, [role="main"]') || documentRef.body
const pageTitle = (documentRef, url) => compactText(
  documentRef.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
  documentRef.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
  documentRef.title ||
  documentRef.querySelector('h1')?.textContent ||
  new URL(url).hostname
)

export const webPageToSource = (windowRef, html, url) => {
  const documentRef = parseHtml(windowRef, html)
  for (const element of documentRef.querySelectorAll('script,style,noscript,template,svg,canvas')) element.remove()
  const title = pageTitle(documentRef, url) || 'Imported web page'
  const markdown = cleanupMarkdown(nodeToMarkdown(preferredPageRoot(documentRef)))
  return { title, url, markdown }
}

const firstChildByName = (element, names) => Array.from(element?.children || [])
  .find((child) => names.includes(localName(child)))

const firstText = (element, names) => compactText(firstChildByName(element, names)?.textContent)
const firstHtml = (element, names) => asString(firstChildByName(element, names)?.textContent).trim()
const entryLink = (element) => {
  const link = Array.from(element?.children || []).find((child) => localName(child) === 'link')
  return asString(link?.getAttribute('href') || link?.textContent).trim()
}

export const rssToSources = (windowRef, xml, feedUrl, limit = DEFAULT_RSS_ITEMS) => {
  const documentRef = parseXml(windowRef, xml)
  const feedTitle = firstText(documentRef.documentElement, ['title']) || new URL(feedUrl).hostname
  const entries = Array.from(documentRef.getElementsByTagName('*'))
    .filter((element) => ['item', 'entry'].includes(localName(element)))
    .slice(0, Math.min(MAX_RSS_ITEMS, Math.max(1, Number(limit) || DEFAULT_RSS_ITEMS)))

  return entries.map((entry, index) => {
    const title = firstText(entry, ['title']) || `Feed item ${index + 1}`
    const url = entryLink(entry) || feedUrl
    const publishedAt = firstText(entry, ['pubdate', 'published', 'updated', 'date'])
    const author = firstText(entry, ['author', 'creator'])
    const html = firstHtml(entry, ['encoded', 'content', 'description', 'summary'])
    const markdown = html ? webPageToSource(windowRef, `<article>${html}</article>`, url).markdown : ''
    return { title, url, feedUrl, feedTitle, publishedAt, author, markdown }
  })
}

const sourceMarkdown = (source, kind) => {
  const importedAt = new Date().toISOString()
  const frontmatter = [
    '---',
    `source: ${kind}`,
    `title: ${yamlString(source.title)}`,
    `url: ${yamlString(source.url)}`,
    `importedAt: ${yamlString(importedAt)}`
  ]
  if (source.feedUrl) frontmatter.push(`feedUrl: ${yamlString(source.feedUrl)}`)
  if (source.feedTitle) frontmatter.push(`feedTitle: ${yamlString(source.feedTitle)}`)
  if (source.publishedAt) frontmatter.push(`publishedAt: ${yamlString(source.publishedAt)}`)
  if (source.author) frontmatter.push(`author: ${yamlString(source.author)}`)
  frontmatter.push('---')
  return `${frontmatter.join('\n')}\n\n# ${source.title}\n\n${source.markdown || `[Open the original source](${source.url})`}\n`
}

const candidatePath = (destination, stem, index) => `${destination}/${stem}${index === 1 ? '' : ` ${index}`}.md`

export const createSourceImporter = ({ addonId, windowRef, invoke, writeNote, safeStem }) => {
  const request = async(url, accept) => {
    const response = await invoke('tauri_addons_http_request', {
      addonId,
      params: {
        url: validateHttpsUrl(url),
        method: 'GET',
        headers: { accept }
      }
    })
    if (!response?.ok) throw new Error(`Source request failed with HTTP ${response?.status || 'error'}.`)
    return asString(response.body)
  }

  const writeUnique = async(destination, title, markdown) => {
    const stem = safeStem(title)
    for (let index = 1; index <= 10_000; index += 1) {
      const notePath = candidatePath(destination, stem, index)
      try {
        await writeNote(notePath, markdown, false)
        return notePath
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (COLLISION_ERROR.test(message)) continue
        throw error
      }
    }
    throw new Error(`Too many imported sources already use the title “${title}”.`)
  }

  const importPage = async(url, destination = 'Sources') => {
    const resolvedUrl = validateHttpsUrl(url)
    const resolvedDestination = normalizeRelativePath(destination)
    const source = webPageToSource(windowRef, await request(resolvedUrl, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'), resolvedUrl)
    const notePath = await writeUnique(resolvedDestination, source.title, sourceMarkdown(source, 'web'))
    return { imported: 1, source, path: notePath }
  }

  const importRss = async(url, destination = 'Sources', limit = DEFAULT_RSS_ITEMS) => {
    const resolvedUrl = validateHttpsUrl(url)
    const resolvedDestination = normalizeRelativePath(destination)
    const sources = rssToSources(windowRef, await request(resolvedUrl, 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5'), resolvedUrl, limit)
    if (!sources.length) throw new Error('No RSS or Atom entries were found at this URL.')
    const results = []
    for (const source of sources) {
      try {
        results.push({ source, path: await writeUnique(resolvedDestination, source.title, sourceMarkdown(source, 'rss')) })
      } catch (error) {
        results.push({ source, error: error instanceof Error ? error.message : String(error) })
      }
    }
    return {
      imported: results.filter((result) => result.path).length,
      failed: results.filter((result) => result.error).length,
      results
    }
  }

  const render = (documentRef, node) => {
    const fragment = documentRef.createDocumentFragment()
    const form = node(documentRef, 'div', 'en-form-grid')
    const urlLabel = node(documentRef, 'label')
    const urlLabelText = node(documentRef, 'span', '', 'Source URL')
    const urlInput = node(documentRef, 'input')
    urlInput.type = 'url'
    urlInput.placeholder = 'https://example.com/article'
    urlLabel.append(urlLabelText, urlInput)
    const destinationLabel = node(documentRef, 'label')
    const destinationLabelText = node(documentRef, 'span', '', 'Destination folder')
    const destinationInput = node(documentRef, 'input')
    destinationInput.type = 'text'
    destinationInput.value = 'Sources'
    destinationInput.placeholder = 'Sources'
    destinationLabel.append(destinationLabelText, destinationInput)
    form.append(urlLabel, destinationLabel)

    const actions = node(documentRef, 'div', 'en-settings-inline-actions')
    const pageButton = node(documentRef, 'button', '', 'Import page')
    pageButton.type = 'button'
    const rssButton = node(documentRef, 'button', '', 'Import RSS')
    rssButton.type = 'button'
    const status = node(documentRef, 'span', 'elephant-source-import-status', '')
    actions.append(pageButton, rssButton, status)

    const run = async(kind) => {
      pageButton.disabled = true
      rssButton.disabled = true
      status.textContent = kind === 'page' ? 'Importing page…' : 'Importing feed…'
      try {
        const result = kind === 'page'
          ? await importPage(urlInput.value, destinationInput.value)
          : await importRss(urlInput.value, destinationInput.value)
        status.textContent = kind === 'page'
          ? `Imported ${result.source?.title || 'page'}.`
          : `Imported ${result.imported || 0} feed item${result.imported === 1 ? '' : 's'}${result.failed ? `; ${result.failed} failed` : ''}.`
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        pageButton.disabled = false
        rssButton.disabled = false
      }
    }

    pageButton.onclick = () => void run('page')
    rssButton.onclick = () => void run('rss')
    fragment.append(form, actions)
    return fragment
  }

  return { importPage, importRss, render }
}
