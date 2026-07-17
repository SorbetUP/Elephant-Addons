import ElephantWikiAddonBase from './main.js'
import { discoverSemanticWikiRecords } from './semanticWikiProposals.js'

const ADDON_ID = 'elephant.wiki'
const PROVIDER_RESOURCE = 'wiki.provider'
const SEARCH_RESOURCE = 'search.provider'
const KNOWLEDGE_RESOURCE = 'knowledge.provider'
const AI_INFERENCE_RESOURCE = 'ai.inference'

const normalizeQuery = (value = '') => String(value || '').trim().toLowerCase()
const safeSlug = (value = '') => String(value || 'topic')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'topic'

const visibleRecordFromDraft = (draft, relativePath = '') => ({
  id: String(draft?.id || ''),
  title: String(draft?.title || draft?.topic || draft?.id || 'Untitled'),
  topic: String(draft?.topic || draft?.title || draft?.id || 'Untitled'),
  status: String(draft?.status || 'accepted') === 'rejected'
    ? 'dismissed'
    : String(draft?.status || 'accepted'),
  summary: String(draft?.topic || ''),
  path: relativePath || `Wiki/${safeSlug(draft?.slug || draft?.title || draft?.topic)}.md`,
  sources: (Array.isArray(draft?.citations) ? draft.citations : []).map((citation) => ({
    path: citation.document_path,
    title: citation.document_title,
    heading: citation.heading,
    chunkId: citation.chunk_id
  })),
  sourceCount: Array.isArray(draft?.source_paths) ? draft.source_paths.length : 0,
  providerOwned: true
})

const sourcePath = (source = {}) => String(source.path || source.relativePath || source.relative_path || source.document_path || '').trim()
const sourceTitle = (source = {}) => String(source.title || source.document_title || source.heading || sourcePath(source)).trim()
const sourceExcerpt = (source = {}) => String(source.excerpt || source.text || source.content || '').trim().slice(0, 600)

const normalizeSources = (sources = []) => {
  const seen = new Set()
  return (Array.isArray(sources) ? sources : [])
    .map((source) => ({ path: sourcePath(source), title: sourceTitle(source), excerpt: sourceExcerpt(source) }))
    .filter((source) => source.path && !seen.has(source.path) && seen.add(source.path))
    .slice(0, 24)
}

export default class ElephantWikiAddon extends ElephantWikiAddonBase {
  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async readNote(path) {
    const result = await this.invoke('tauri_addons_notes_read', {
      addonId: ADDON_ID,
      path
    })
    return String(result?.markdown || '')
  }

  async generateProposals() {
    const existing = await this.loadRecords()
    const preserved = existing.filter((record) => record.status !== 'proposed' || record.origin === 'manual' || record.origin === 'chat-agent')
    const knowledge = this.api.resources.get(KNOWLEDGE_RESOURCE)
    const inference = this.api.resources.get(AI_INFERENCE_RESOURCE)

    try {
      const semantic = await discoverSemanticWikiRecords(knowledge, existing, {
        limit: 12,
        inference
      })
      if (semantic.available) {
        const merged = [
          ...preserved,
          ...semantic.records.filter((proposal) => !preserved.some((record) => record.id === proposal.id))
        ]
        await this.saveRecords(merged.filter((record) => !record.providerOwned))
        return {
          generated: semantic.records.length,
          records: merged,
          engine: 'knowledge-semantic-v2',
          labeling: semantic.labeling
        }
      }
    } catch (error) {
      console.warn('[wiki-addon] Semantic organization failed; using lexical fallback', error)
    }

    const notes = await this.scanNotes()
    const proposals = this.buildProposals(notes)
    const merged = [
      ...preserved,
      ...proposals.filter((proposal) => !preserved.some((record) => record.id === proposal.id))
    ]
    await this.saveRecords(merged.filter((record) => !record.providerOwned))
    return { generated: proposals.length, records: merged, engine: 'lexical-fallback' }
  }

  async acceptRecord(id) {
    const knowledge = this.api.resources.get(KNOWLEDGE_RESOURCE)
    if (knowledge && typeof knowledge.acceptWiki === 'function') {
      try {
        const accepted = await knowledge.acceptWiki(id)
        const draft = accepted?.draft
        if (draft?.markdown) {
          const relativePath = `Wiki/${safeSlug(draft.slug || draft.title || draft.topic)}.md`
          await this.writeNote(relativePath, String(draft.markdown))
          return visibleRecordFromDraft(draft, relativePath)
        }
      } catch (error) {
        console.warn('[wiki-addon] Knowledge acceptance could not be materialized; trying the local proposal', error)
      }
    }
    return super.acceptRecord(id)
  }

  async search(query, options = {}) {
    const normalized = normalizeQuery(query)
    if (!normalized) return []

    const searchProvider = this.api.resources.get(SEARCH_RESOURCE)
    if (searchProvider?.query) {
      const results = await searchProvider.query(query, {
        limit: Math.min(100, Math.max(1, Number(options.limit) || 20))
      })
      return results.map((result) => ({
        ...result,
        source: 'search.provider',
        wikiCandidate: !String(result.path || '').startsWith('Wiki/')
      }))
    }

    const records = await this.loadRecords()
    return records
      .filter((record) => [record.title, record.topic, record.summary]
        .some((value) => String(value || '').toLowerCase().includes(normalized)))
      .slice(0, Math.min(100, Math.max(1, Number(options.limit) || 20)))
      .map((record) => ({ ...record, source: 'wiki.records' }))
  }

  async resolveSources(topic, requestedPaths = []) {
    const requested = new Set((Array.isArray(requestedPaths) ? requestedPaths : []).map(String).filter(Boolean))
    const candidates = await this.search(topic, { limit: 40 }).catch(() => [])
    const selected = requested.size
      ? candidates.filter((candidate) => requested.has(sourcePath(candidate)))
      : candidates
    const normalized = normalizeSources(selected)
    if (requested.size) {
      for (const path of requested) {
        if (!normalized.some((source) => source.path === path)) normalized.push({ path, title: path.split('/').pop()?.replace(/\.md$/i, '') || path, excerpt: '' })
      }
    }
    return normalized.slice(0, 24)
  }

  async propose(topic, options = {}) {
    const normalizedTopic = String(topic || options.title || '').trim()
    if (!normalizedTopic) throw new Error('A Wiki topic is required')
    const title = String(options.title || normalizedTopic).trim()
    const id = `wiki-chat-${safeSlug(normalizedTopic)}`
    const records = await this.loadRecords()
    const existing = records.find((record) => record.id === id)
    const sources = await this.resolveSources(normalizedTopic, options.sourcePaths)
    const timestamp = new Date().toISOString()
    const record = {
      ...(existing || {}),
      id,
      topic: normalizedTopic,
      title,
      summary: String(options.summary || `Proposition de Wiki sur ${title}, fondée sur ${sources.length} source${sources.length > 1 ? 's' : ''}.`).trim(),
      sources,
      sourceCount: sources.length,
      status: 'proposed',
      origin: 'chat-agent',
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      providerOwned: false
    }
    const next = [record, ...records.filter((candidate) => candidate.id !== id && !candidate.providerOwned)]
    await this.saveRecords(next)
    return record
  }

  async create(topic, options = {}) {
    const normalizedTopic = String(topic || options.title || '').trim()
    if (!normalizedTopic) throw new Error('A Wiki topic is required')
    const title = String(options.title || normalizedTopic).trim()
    const sources = await this.resolveSources(normalizedTopic, options.sourcePaths)
    const relativePath = `Wiki/${safeSlug(title)}.md`
    const fallbackSources = sources.map((source, index) => `[^source-${index + 1}]: [[${source.path.replace(/\.md$/i, '')}]]${source.excerpt ? ` — ${source.excerpt}` : ''}`).join('\n')
    const markdown = String(options.markdown || `# ${title}\n\n${options.summary || ''}\n\n## Sources\n\n${fallbackSources || 'Aucune source locale fournie.'}\n`).trim()
    await this.writeNote(relativePath, `${markdown}\n`)

    const records = await this.loadRecords()
    const id = `wiki-chat-${safeSlug(normalizedTopic)}`
    const existing = records.find((record) => record.id === id)
    const timestamp = new Date().toISOString()
    const record = {
      ...(existing || {}),
      id,
      topic: normalizedTopic,
      title,
      summary: String(options.summary || existing?.summary || '').trim(),
      path: relativePath,
      sources,
      sourceCount: sources.length,
      status: 'accepted',
      origin: 'chat-agent',
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      providerOwned: false
    }
    await this.saveRecords([record, ...records.filter((candidate) => candidate.id !== id && !candidate.providerOwned)])
    return record
  }

  async status() {
    const records = await this.loadRecords()
    return {
      records: records.length,
      proposed: records.filter((record) => record.status === 'proposed').length,
      accepted: records.filter((record) => record.status === 'accepted').length,
      searchProvider: this.api.resources.has(SEARCH_RESOURCE),
      knowledgeProvider: this.api.resources.has(KNOWLEDGE_RESOURCE),
      inferenceProvider: this.api.resources.has(AI_INFERENCE_RESOURCE),
      targetedActions: true,
      engine: 'package-owned-wiki'
    }
  }

  onload(api) {
    super.onload(api)
    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      apiVersion: 2,
      list: () => this.loadRecords(),
      generate: () => this.generateProposals(),
      propose: (topic, options) => this.propose(topic, options),
      create: (topic, options) => this.create(topic, options),
      accept: (id) => this.acceptRecord(id),
      dismiss: (id) => this.dismissRecord(id),
      search: (query, options) => this.search(query, options),
      status: () => this.status()
    }))
  }
}
