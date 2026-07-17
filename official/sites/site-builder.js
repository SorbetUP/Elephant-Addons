const DEFAULT_SOURCE_DIRECTORY = 'Sites'

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const toPosix = (value = '') => String(value).replaceAll('\\', '/')

const splitSuffix = (href = '') => {
  const match = String(href).match(/^([^?#]*)(.*)$/)
  return { target: match?.[1] || '', suffix: match?.[2] || '' }
}

const normalizeSegments = (value = '') => {
  const parts = []
  for (const rawPart of toPosix(value).split('/')) {
    const part = rawPart.trim()
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) throw new Error(`Path escapes the selected site folder: ${value}`)
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

export const normalizeDirectory = (value = DEFAULT_SOURCE_DIRECTORY) => {
  const input = String(value || DEFAULT_SOURCE_DIRECTORY).trim()
  if (!input || input === '.') return DEFAULT_SOURCE_DIRECTORY
  if (/^(?:[a-z]+:|\/|\\)/i.test(input)) {
    throw new Error('Sites expects a directory relative to the active vault')
  }
  return normalizeSegments(input)
}

export const slugify = (value = '') => String(value || 'site')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64) || 'site'

export const routeForMarkdown = (relativePath = '') => {
  const withoutExtension = normalizeSegments(relativePath).replace(/\.(md|markdown)$/i, '')
  if (!withoutExtension || withoutExtension.toLowerCase() === 'index') return 'index.html'
  if (withoutExtension.toLowerCase().endsWith('/index')) {
    return `${withoutExtension.slice(0, -'/index'.length)}/index.html`
  }
  return `${withoutExtension}/index.html`
}

const outputDirectoryForRoute = (route = '') => {
  const parts = normalizeSegments(route).split('/')
  parts.pop()
  return parts.join('/')
}

const relativePath = (fromDirectory = '', toPath = '') => {
  const from = normalizeSegments(fromDirectory).split('/').filter(Boolean)
  const to = normalizeSegments(toPath).split('/').filter(Boolean)
  let common = 0
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1
  const steps = [...Array(from.length - common)].map(() => '..')
  return [...steps, ...to.slice(common)].join('/') || '.'
}

const resolveRelativePath = (baseDirectory = '', target = '') => normalizeSegments(
  [baseDirectory, target].filter(Boolean).join('/')
)

const sourceRelativePath = (vaultPath, sourceDirectory) => {
  const path = normalizeSegments(vaultPath)
  const source = normalizeSegments(sourceDirectory)
  if (path === source) return ''
  if (!path.startsWith(`${source}/`)) {
    throw new Error(`Note is outside the selected site folder: ${vaultPath}`)
  }
  return path.slice(source.length + 1)
}

const readTitle = (markdown, fallback) => {
  const heading = String(markdown || '').split(/\r?\n/).find((line) => /^#\s+/.test(line))
  return heading?.replace(/^#\s+/, '').trim() || fallback
}

const stripExtension = (value = '') => String(value).replace(/\.(md|markdown)$/i, '')

const normalizeWikiTarget = (value = '') => {
  const [target] = String(value).split('|')
  return target.trim().replace(/^\/+/, '')
}

const createHrefResolver = ({ sourceDirectory, routeMap, pagePath, resolveAssetUrl }) => {
  const sourceRoot = normalizeSegments(sourceDirectory)
  const pageDirectory = normalizeSegments(pagePath).split('/').slice(0, -1).join('/')
  const pageVaultDirectory = resolveRelativePath(sourceRoot, pageDirectory)
  const pageRoute = routeMap.get(normalizeSegments(pagePath)) || routeForMarkdown(pagePath)
  const outputDirectory = outputDirectoryForRoute(pageRoute)

  return (rawHref, { wiki = false } = {}) => {
    const href = String(rawHref || '').trim()
    if (!href) return ''
    if (/^(?:[a-z]+:|#|\/\/)/i.test(href)) return href

    const { target, suffix } = splitSuffix(wiki ? normalizeWikiTarget(href) : href)
    let decodedTarget = target || ''
    try { decodedTarget = decodeURIComponent(decodedTarget) } catch { /* Keep malformed URLs literal. */ }
    const rootRelative = decodedTarget.startsWith('/')
    decodedTarget = decodedTarget.replace(/^\.?\//, '')
    const vaultTarget = resolveRelativePath(rootRelative ? sourceRoot : pageVaultDirectory, decodedTarget)
    const sourceTarget = vaultTarget === sourceRoot
      ? ''
      : vaultTarget.startsWith(`${sourceRoot}/`)
        ? vaultTarget.slice(sourceRoot.length + 1)
        : null
    const markdownCandidates = sourceTarget == null
      ? []
      : /\.(md|markdown)$/i.test(sourceTarget)
        ? [sourceTarget]
        : [`${sourceTarget}.md`, `${sourceTarget}.markdown`, `${sourceTarget}/index.md`]
    const markdownTarget = markdownCandidates.find((candidate) => routeMap.has(candidate))

    if (markdownTarget) {
      const targetRoute = routeMap.get(markdownTarget)
      let result = relativePath(outputDirectory, targetRoute)
      if (result.endsWith('/index.html')) result = result.slice(0, -'index.html'.length)
      if (result === 'index.html') result = './'
      return `${result || './'}${suffix}`
    }

    return `${resolveAssetUrl(vaultTarget, { pagePath, pageRoute })}${suffix}`
  }
}

const inlineMarkdown = (source, resolveHref) => {
  const tokens = []
  const hold = (html) => {
    const token = `\u0000${tokens.length}\u0000`
    tokens.push(html)
    return token
  }

  let value = String(source || '')
  value = value.replace(/`([^`]+)`/g, (_match, code) => hold(`<code>${escapeHtml(code)}</code>`))
  value = value.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, href) => (
    hold(`<img src="${escapeHtml(resolveHref(href))}" alt="${escapeHtml(alt)}" loading="lazy">`)
  ))
  value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => (
    hold(`<a href="${escapeHtml(resolveHref(href))}">${escapeHtml(label)}</a>`)
  ))
  value = value.replace(/\[\[([^\]]+)\]\]/g, (_match, target) => {
    const [rawTarget, rawLabel] = String(target).split('|')
    const label = (rawLabel || rawTarget).trim()
    return hold(`<a href="${escapeHtml(resolveHref(rawTarget, { wiki: true }))}">${escapeHtml(label)}</a>`)
  })
  value = escapeHtml(value)
  value = value
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
  return value.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || '')
}

const isTableSeparator = (line = '') => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
const splitTableRow = (line = '') => String(line).trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())

export const renderMarkdown = ({ markdown, relativePath: pagePath, sourceDirectory, routeMap, resolveAssetUrl }) => {
  const resolveHref = createHrefResolver({ sourceDirectory, routeMap, pagePath, resolveAssetUrl })
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let paragraph = []
  let list = []
  let listType = 'ul'
  let quote = []
  let code = []
  let codeLanguage = ''
  let inCode = false
  let start = 0

  if (lines[0]?.trim() === '---') {
    const frontmatterEnd = lines.slice(1).findIndex((line) => line.trim() === '---')
    if (frontmatterEnd >= 0) start = frontmatterEnd + 2
  }

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(`<p>${inlineMarkdown(paragraph.join(' '), resolveHref)}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!list.length) return
    blocks.push(`<${listType}>${list.map((item) => `<li>${inlineMarkdown(item, resolveHref)}</li>`).join('')}</${listType}>`)
    list = []
  }
  const flushQuote = () => {
    if (!quote.length) return
    blocks.push(`<blockquote>${inlineMarkdown(quote.join(' '), resolveHref)}</blockquote>`)
    quote = []
  }
  const flushAll = () => { flushParagraph(); flushList(); flushQuote() }

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = /^```\s*([^\s]*)/.exec(line)
    if (fence) {
      if (inCode) {
        blocks.push(`<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = []
        codeLanguage = ''
        inCode = false
      } else {
        flushAll()
        inCode = true
        codeLanguage = fence[1] || ''
      }
      continue
    }
    if (inCode) { code.push(line); continue }
    if (!line.trim()) { flushAll(); continue }

    if (line.includes('|') && isTableSeparator(lines[index + 1] || '')) {
      flushAll()
      const headers = splitTableRow(line)
      index += 1
      const rows = []
      while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim()) {
        rows.push(splitTableRow(lines[index + 1]))
        index += 1
      }
      blocks.push(`<div class="site-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell, resolveHref)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_header, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] || '', resolveHref)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      flushAll()
      const level = heading[1].length
      const text = heading[2].replace(/\s+#+\s*$/, '')
      const id = slugify(text)
      blocks.push(`<h${level} id="${id}">${inlineMarkdown(text, resolveHref)}</h${level}>`)
      continue
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { flushAll(); blocks.push('<hr>'); continue }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (unordered || ordered) {
      flushParagraph(); flushQuote()
      const nextType = ordered ? 'ol' : 'ul'
      if (list.length && listType !== nextType) flushList()
      listType = nextType
      let item = (unordered || ordered)[1]
      item = item.replace(/^\[ \]\s+/, '☐ ')
        .replace(/^\[[xX]\]\s+/, '☑ ')
      list.push(item)
      continue
    }

    const quoteMatch = /^\s*>\s?(.*)$/.exec(line)
    if (quoteMatch) { flushParagraph(); flushList(); quote.push(quoteMatch[1]); continue }

    paragraph.push(line.trim())
  }

  if (inCode) blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  flushAll()
  return blocks.join('\n')
}

export const SITE_CSS = `:root{color-scheme:light dark;--bg:#f6f7f9;--paper:#fff;--text:#17181b;--muted:#6d7179;--line:#dde0e6;--accent:#4f6bed;--code:#f0f2f6} @media(prefers-color-scheme:dark){:root{--bg:#121316;--paper:#1b1c20;--text:#f2f3f5;--muted:#a1a5ad;--line:#32343b;--accent:#8ea2ff;--code:#24262c}} *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);display:grid;grid-template-columns:minmax(210px,280px) minmax(0,1fr);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.site-nav{position:sticky;top:0;height:100vh;overflow:auto;padding:30px 22px;border-right:1px solid var(--line);background:color-mix(in srgb,var(--paper) 92%,transparent)}.site-brand{display:block;margin-bottom:22px;color:var(--text);font-size:18px;font-weight:800;text-decoration:none}.site-nav nav{display:grid;gap:5px}.site-nav nav a{padding:7px 9px;border-radius:8px;color:var(--muted);text-decoration:none}.site-nav nav a:hover,.site-nav nav a.active{background:var(--code);color:var(--text)}.site-main{width:min(900px,100%);padding:52px 42px 90px}.site-main>h1:first-child{margin-top:0}h1,h2,h3,h4{line-height:1.2;scroll-margin-top:20px}h1{font-size:2.35rem}h2{margin-top:2.2em;padding-bottom:.25em;border-bottom:1px solid var(--line)}a{color:var(--accent)}img{max-width:100%;height:auto;border-radius:10px}code{padding:.12em .35em;border-radius:5px;background:var(--code)}pre{overflow:auto;padding:17px;border:1px solid var(--line);border-radius:11px;background:var(--code)}pre code{padding:0;background:transparent}.site-table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:9px 11px;border:1px solid var(--line);text-align:left}blockquote{margin-left:0;padding:2px 0 2px 18px;border-left:3px solid var(--accent);color:var(--muted)}hr{margin:30px 0;border:0;border-top:1px solid var(--line)}.task-box{display:inline-grid;width:17px;height:17px;margin-right:7px;border:1px solid var(--line);border-radius:4px;place-items:center;font-size:12px}.task-box.checked{background:var(--accent);color:white}@media(max-width:760px){body{display:block}.site-nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}.site-main{padding:34px 20px 64px}}`

const renderPage = ({ title, siteTitle = title, body, cssHref, homeHref, navigation, activeRoute }) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="${escapeHtml(cssHref)}"></head>
<body><aside class="site-nav"><a class="site-brand" href="${escapeHtml(homeHref)}">${escapeHtml(siteTitle)}</a><nav>${navigation.map((item) => `<a${item.route === activeRoute ? ' class="active"' : ''} href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>`).join('')}</nav></aside><main class="site-main">${body}</main></body>
</html>`

export const createSitePlan = ({ sourceDirectory, notes, resolveAssetUrl, generatedAt = new Date().toISOString() }) => {
  const source = normalizeDirectory(sourceDirectory)
  const normalizedNotes = notes.map((note) => {
    const relativePath = sourceRelativePath(note.path, source)
    return {
      ...note,
      relativePath,
      route: routeForMarkdown(relativePath),
      title: readTitle(note.markdown, stripExtension(relativePath.split('/').pop() || 'Untitled'))
    }
  }).sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  if (!normalizedNotes.length) throw new Error('The selected folder does not contain any Markdown note')

  const routeMap = new Map(normalizedNotes.map((note) => [normalizeSegments(note.relativePath), note.route]))
  const routeOwners = new Map()
  for (const note of normalizedNotes) {
    const previous = routeOwners.get(note.route)
    if (previous) throw new Error(`Two notes generate the same site route: ${previous} and ${note.relativePath}`)
    routeOwners.set(note.route, note.relativePath)
  }
  const siteTitle = source.split('/').pop() || 'Elephant site'
  const files = new Map([['assets/elephant-site.css', SITE_CSS]])
  const navigationBase = normalizedNotes.map((note) => ({ title: note.title, route: note.route }))

  for (const note of normalizedNotes) {
    const outputDirectory = outputDirectoryForRoute(note.route)
    const navigation = navigationBase.map((item) => ({
      ...item,
      href: relativePath(outputDirectory, item.route) || 'index.html'
    }))
    const cssHref = relativePath(outputDirectory, 'assets/elephant-site.css')
    const homeHref = relativePath(outputDirectory, 'index.html')
    const body = renderMarkdown({
      markdown: note.markdown,
      relativePath: note.relativePath,
      sourceDirectory: source,
      routeMap,
      resolveAssetUrl
    })
    files.set(note.route, renderPage({
      title: note.title,
      siteTitle,
      body,
      cssHref,
      homeHref,
      navigation,
      activeRoute: note.route
    }))
  }

  if (!files.has('index.html')) {
    const title = siteTitle
    const links = normalizedNotes.map((note) => `<li><a href="./${escapeHtml(note.route)}">${escapeHtml(note.title)}</a></li>`).join('')
    files.set('index.html', renderPage({
      title,
      body: `<h1>${escapeHtml(title)}</h1><p>${normalizedNotes.length} published note${normalizedNotes.length === 1 ? '' : 's'}.</p><ul>${links}</ul>`,
      cssHref: './assets/elephant-site.css',
      homeHref: './index.html',
      navigation: navigationBase.map((item) => ({ ...item, href: `./${item.route}` })),
      activeRoute: 'index.html'
    }))
  }

  files.set('elephant-site.json', JSON.stringify({
    format: 'elephant-static-site',
    version: 1,
    sourceDirectory: source,
    generatedAt,
    pages: normalizedNotes.map(({ title, relativePath, route }) => ({ title, source: relativePath, route }))
  }, null, 2))

  return {
    sourceDirectory: source,
    title: source.split('/').pop() || 'Elephant site',
    pages: normalizedNotes.map(({ title, relativePath, route }) => ({ title, relativePath, route })),
    files
  }
}
