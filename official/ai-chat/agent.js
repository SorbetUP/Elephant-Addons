const ACTION_TYPES = Object.freeze([
  'search_notes',
  'create_note',
  'append_to_note',
  'replace_note',
  'add_wiki_suggestion',
  'create_wiki',
  'reject_wiki_suggestion'
])

const WRITE_ACTIONS = new Set(ACTION_TYPES.filter((value) => value !== 'search_notes'))
const text = (value = '') => String(value || '').trim()
const clone = (value) => JSON.parse(JSON.stringify(value ?? null))
const compact = (value, limit) => text(value).slice(0, limit)

const citationPath = (citation = {}) => text(citation.path || citation.relativePath || citation.relative_path || citation.document_path || citation.id)
const citationTitle = (citation = {}) => text(citation.title || citation.document_title || citation.heading || citationPath(citation))
const citationExcerpt = (citation = {}) => compact(citation.excerpt || citation.text || citation.content || citation.summary || '', 1800)

export const safeRelativePath = (value = '') => {
  const normalized = text(value).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('\0')) return ''
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return ''
  const joined = parts.join('/')
  return /\.md$/i.test(joined) ? joined : `${joined}.md`
}

const uniquePaths = (values, citations) => {
  const available = new Map(citations.map((citation) => [citationPath(citation), citationPath(citation)]).filter(([path]) => path))
  const output = []
  for (const value of Array.isArray(values) ? values : []) {
    const path = safeRelativePath(value)
    if (!path || output.includes(path)) continue
    if (!available.size || available.has(path)) output.push(path)
  }
  return output.slice(0, 24)
}

const jsonCandidate = (value) => {
  if (value && typeof value === 'object') return value
  const raw = String(value || '').trim()
  if (!raw) return null
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(unfenced) } catch {}
  const first = unfenced.indexOf('{')
  const last = unfenced.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try { return JSON.parse(unfenced.slice(first, last + 1)) } catch {}
  }
  return null
}

const previewFor = (action) => {
  if (action.action === 'search_notes') return { kind: 'search', query: action.query, limit: action.limit }
  if (action.action === 'create_note') return { kind: 'create_note', relative_path: action.path, title: action.title }
  if (action.action === 'append_to_note' || action.action === 'replace_note') return { kind: 'modify_note', relative_path: action.path }
  if (action.action === 'add_wiki_suggestion') return { kind: 'wiki_suggestion', title: action.title, topic: action.topic, source_paths: action.sourcePaths }
  if (action.action === 'create_wiki') return { kind: 'create_wiki', title: action.title, topic: action.topic, source_paths: action.sourcePaths }
  if (action.action === 'reject_wiki_suggestion') return { kind: 'wiki_decision', proposal_id: action.proposalId, topic: action.topic }
  return { kind: action.action }
}

const normalizeAction = (raw, citations, idFactory) => {
  if (!raw || typeof raw !== 'object') return null
  const type = text(raw.type || raw.action).toLowerCase()
  if (!ACTION_TYPES.includes(type)) return null
  const action = { action: type }

  if (type === 'search_notes') {
    action.query = compact(raw.query, 500)
    action.limit = Math.min(30, Math.max(1, Number(raw.limit) || 12))
    if (!action.query) return null
  }

  if (['create_note', 'append_to_note', 'replace_note'].includes(type)) {
    action.path = safeRelativePath(raw.path || raw.relativePath || raw.relative_path)
    action.markdown = String(raw.markdown || raw.content || '').slice(0, 250_000)
    action.title = compact(raw.title, 200)
    if (!action.path || !action.markdown.trim()) return null
  }

  if (['add_wiki_suggestion', 'create_wiki'].includes(type)) {
    action.topic = compact(raw.topic || raw.title, 300)
    action.title = compact(raw.title || raw.topic, 300)
    action.summary = compact(raw.summary, 2000)
    action.markdown = String(raw.markdown || raw.content || '').slice(0, 300_000)
    action.sourcePaths = uniquePaths(raw.sourcePaths || raw.source_paths, citations)
    if (!action.topic || !action.title) return null
    if (type === 'create_wiki' && !action.markdown.trim()) return null
  }

  if (type === 'reject_wiki_suggestion') {
    action.proposalId = compact(raw.proposalId || raw.proposal_id || raw.id, 300)
    action.topic = compact(raw.topic || raw.title, 300)
    if (!action.proposalId && !action.topic) return null
  }

  const rationale = compact(raw.rationale || raw.reason, 1000)
  return {
    proposal: {
      id: idFactory('proposal'),
      status: type === 'search_notes' ? 'approved' : 'proposed',
      action,
      preview: previewFor(action),
      rationale,
      requiresApproval: WRITE_ACTIONS.has(type),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    execution: null,
    busy: false,
    error: ''
  }
}

export const normalizeAgentEnvelope = (value, options = {}) => {
  const citations = Array.isArray(options.citations) ? options.citations : []
  const idFactory = typeof options.idFactory === 'function'
    ? options.idFactory
    : (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const parsed = jsonCandidate(value)
  const fallbackText = typeof value === 'string' ? value.trim() : ''
  if (!parsed || typeof parsed !== 'object') {
    return { answer: fallbackText, actions: [], citations: clone(citations) }
  }
  const answer = text(parsed.answer || parsed.response || parsed.content || fallbackText)
  const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
    .slice(0, 8)
    .map((action) => normalizeAction(action, citations, idFactory))
    .filter(Boolean)
  return { answer, actions, citations: clone(citations) }
}

export const AGENT_JSON_SCHEMA = Object.freeze({
  name: 'elephant_vault_agent_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'actions'],
    properties: {
      answer: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'rationale', 'query', 'limit', 'path', 'title', 'topic', 'markdown', 'summary', 'sourcePaths', 'proposalId'],
          properties: {
            type: { type: 'string', enum: ACTION_TYPES },
            rationale: { type: ['string', 'null'] },
            query: { type: ['string', 'null'] },
            limit: { type: ['number', 'null'] },
            path: { type: ['string', 'null'] },
            title: { type: ['string', 'null'] },
            topic: { type: ['string', 'null'] },
            markdown: { type: ['string', 'null'] },
            summary: { type: ['string', 'null'] },
            sourcePaths: { type: ['array', 'null'], items: { type: 'string' } },
            proposalId: { type: ['string', 'null'] }
          }
        }
      }
    }
  }
})

const sourceContext = (citations, maxCharacters) => {
  const output = []
  let used = 0
  for (let index = 0; index < citations.length; index += 1) {
    const citation = citations[index]
    const block = `[${index + 1}] ${citationTitle(citation)}\nPath: ${citationPath(citation)}\n${citationExcerpt(citation)}`
    if (used + block.length > maxCharacters && output.length) break
    output.push(block)
    used += block.length
  }
  return output.join('\n\n')
}

export const buildAgentMessages = ({ question, history = [], citations = [], route = {} }) => {
  const enableTools = route.enableTools !== false
  const sourceText = sourceContext(citations, Math.min(80_000, Math.max(4_000, Number(route.contextWindow || 32_768) * 2)))
  const system = [
    'You are Elephant, an agent operating on the active local knowledge vault.',
    'Answer in the same language as the user. Be precise, cite grounded vault claims with [1], [2], and never invent note contents.',
    'Return one JSON object only. Do not use Markdown fences and do not expose hidden chain-of-thought.',
    'The JSON shape is {"answer":"...","actions":[...]}.',
    enableTools
      ? 'Only propose a write action when the user explicitly asked to create, append, replace, organize, create a Wiki, or reject a Wiki proposal. Search is read-only and may be executed automatically. Write actions require approval unless Auto mode is enabled.'
      : 'Actions are disabled. Return an empty actions array.',
    enableTools
      ? 'Allowed action types: search_notes, create_note, append_to_note, replace_note, add_wiki_suggestion, create_wiki, reject_wiki_suggestion. Use safe relative Markdown paths. For every action include all schema fields; use null for irrelevant fields.'
      : '',
    route.systemPrompt ? `Additional user configuration:\n${route.systemPrompt}` : '',
    sourceText ? `Vault sources:\n\n${sourceText}` : 'No matching vault source was retrieved. State that clearly rather than fabricating evidence.'
  ].filter(Boolean).join('\n\n')

  const transcript = (Array.isArray(history) ? history : [])
    .filter((message) => message && ['user', 'assistant'].includes(message.role) && text(message.content))
    .slice(-20)
    .map((message) => ({ role: message.role, content: String(message.content) }))
  if (!transcript.length || transcript.at(-1)?.role !== 'user' || text(transcript.at(-1)?.content) !== text(question)) {
    transcript.push({ role: 'user', content: String(question || '') })
  }
  return [{ role: 'system', content: system }, ...transcript]
}

export const actionTypeLabel = (type) => ({
  search_notes: 'Rechercher dans les notes',
  create_note: 'Créer une note',
  append_to_note: 'Ajouter à une note',
  replace_note: 'Remplacer une note',
  add_wiki_suggestion: 'Proposer un Wiki',
  create_wiki: 'Créer un Wiki',
  reject_wiki_suggestion: 'Refuser un Wiki'
})[type] || 'Action Elephant'
