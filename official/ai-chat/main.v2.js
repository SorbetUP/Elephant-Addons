import ElephantChatAddonBase, { shapeToolCalls } from './main.js'
import {
  AGENT_JSON_SCHEMA,
  buildAgentMessages,
  normalizeAgentEnvelope,
  safeRelativePath
} from './agent.js'

const AI_INFERENCE_RESOURCE = 'ai.inference'
const WIKI_RESOURCE = 'wiki.provider'
const text = (value = '') => String(value || '').trim()
const clone = (value) => JSON.parse(JSON.stringify(value ?? {}))
const now = () => new Date().toISOString()
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const citationPath = (citation = {}) => text(citation.path || citation.relativePath || citation.relative_path || citation.document_path || citation.id)

export default class ElephantChatAddon extends ElephantChatAddonBase {
  async runProvider(option, messages, route, config, signal) {
    if (option.kind === 'addon') {
      if (typeof option.provider.chat !== 'function') throw new Error(`${option.label} n’expose pas l’exécution du chat.`)
      const result = await option.provider.chat({
        messages,
        model: route.model,
        route: clone(route),
        config: clone(config),
        signal
      })
      return {
        raw: result?.answer || result?.content || result?.text || '',
        provider: result?.provider || option.source,
        model: result?.model || route.model,
        usage: result?.usage || null
      }
    }

    const inference = this.api.resources.get(AI_INFERENCE_RESOURCE)
    if (!inference?.complete) throw new Error('La ressource ai.inference est indisponible.')
    const options = {
      providerId: option.source,
      model: route.model,
      temperature: route.temperature,
      maxTokens: route.maxTokens,
      signal,
      jsonSchema: AGENT_JSON_SCHEMA
    }
    let result
    try {
      result = await inference.complete(messages, options)
    } catch (error) {
      const unsupportedSchema = /response.?format|json.?schema|schema.*unsupported|invalid.*schema/i.test(String(error?.message || error))
      if (!unsupportedSchema) throw error
      result = await inference.complete(messages, { ...options, jsonSchema: undefined, json: true })
    }
    return {
      raw: result?.text || result?.answer || result?.content || '',
      provider: result?.providerId || option.source,
      model: result?.model || route.model,
      usage: result?.usage || null
    }
  }

  async executeReadOnlyActions(actions, citations) {
    const merged = [...citations]
    for (const entry of actions) {
      const action = entry?.proposal?.action || {}
      if (action.action !== 'search_notes') continue
      try {
        const results = await this.retrieveContext(action.query, action.limit)
        entry.proposal.status = 'executed'
        entry.proposal.updatedAt = now()
        entry.execution = { result: clone(results), executedAt: now() }
        for (const result of results) {
          const path = citationPath(result)
          if (path && !merged.some((item) => citationPath(item) === path)) merged.push(result)
        }
      } catch (error) {
        entry.proposal.status = 'failed'
        entry.proposal.updatedAt = now()
        entry.error = error?.message || String(error)
      }
    }
    return merged
  }

  async directChat(question, history, config, signal, hooks = {}) {
    const route = this.route(config)
    const source = text(route.source || route.provider)
    const option = (await this.providerOptions(config)).find((candidate) => candidate.source === source)
    if (!option) throw new Error(`Le provider sélectionné n’est plus installé ou configuré : ${source || 'aucun'}.`)

    hooks.onPhase?.('Recherche dans le vault…')
    let citations = route.enableRag === false ? [] : await this.retrieveContext(question, route.ragTopK)
    const messages = buildAgentMessages({ question, history, citations, route })

    hooks.onPhase?.(`Génération avec ${option.label}…`)
    const generated = await this.runProvider(option, messages, route, config, signal)
    const envelope = normalizeAgentEnvelope(generated.raw, { citations, idFactory: uid })
    citations = await this.executeReadOnlyActions(envelope.actions, citations)
    const answer = text(envelope.answer || generated.raw) || (citations.length
      ? 'Les sources ont été retrouvées, mais le modèle n’a pas produit de réponse exploitable.'
      : 'Aucune source correspondante n’a été retrouvée dans le vault.')

    if (route.stream !== false && typeof hooks.onDelta === 'function') {
      hooks.onPhase?.('Rédaction…')
      const size = 48
      for (let offset = 0; offset < answer.length; offset += size) {
        if (signal?.aborted) throw Object.assign(new Error('Génération annulée.'), { name: 'AbortError' })
        hooks.onDelta(answer.slice(offset, offset + size))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    return {
      answer,
      citations,
      actions: envelope.actions,
      provider: generated.provider || source,
      model: generated.model || route.model,
      usage: generated.usage,
      reasoningEffort: route.reasoningEffort,
      engine: 'addon-owned-rag-agent-v2'
    }
  }

  async sendChat(question, conversation, assistantMessage) {
    const config = await this.config()
    const route = this.route(config)
    const source = text(route.source || route.provider)
    if (!source || source === 'disabled') throw new Error('Aucun provider de chat n’est sélectionné dans les réglages IA.')

    this.abort?.abort()
    this.abort = new AbortController()
    const streamId = uid('chat-stream')
    this.activeStream = { id: streamId, messageId: assistantMessage.id, conversationId: conversation.id }
    const history = conversation.messages
      .filter((message) => message.id !== assistantMessage.id && !message.error)
      .map(({ role, content }) => ({ role, content }))

    assistantMessage.content = ''
    const result = await this.directChat(question, history, config, this.abort.signal, {
      onPhase: (phase) => {
        assistantMessage.phase = phase
        this.renderRefresh?.({ keepScroll: true })
      },
      onDelta: (delta) => {
        assistantMessage.content += delta
        conversation.updatedAt = now()
        this.scheduleSave()
        this.renderRefresh?.({ keepScroll: true })
      }
    })
    return {
      ...result,
      answer: text(result?.answer || result?.content || result?.text),
      citations: Array.isArray(result?.citations) ? result.citations : Array.isArray(result?.sources) ? result.sources : [],
      actions: Array.isArray(result?.actions) ? result.actions : [],
      toolCalls: shapeToolCalls(result),
      reasoningEffort: text(result?.reasoningEffort || route.reasoningEffort),
      provider: text(result?.provider || source),
      model: text(result?.model || route.model)
    }
  }

  async readNote(path) {
    const result = await this.call('notes.read', { relativePath: path })
    return String(result?.markdown ?? result?.content ?? result?.note?.markdown ?? '')
  }

  async writeNote(path, markdown) {
    return this.call('notes.write', { relativePath: path, markdown: String(markdown || '') })
  }

  async createNote(path, title, markdown) {
    const safePath = safeRelativePath(path)
    if (!safePath) throw new Error('Le chemin de note proposé est invalide.')
    const parts = safePath.split('/')
    const filename = parts.pop()
    const relativePath = parts.join('/')
    const created = await this.call('notes.create', { relativePath, filename, title: title || filename.replace(/\.md$/i, '') })
    const actualPath = created?.note?.path || created?.path || safePath
    await this.writeNote(actualPath, markdown)
    return { path: actualPath, title: title || filename.replace(/\.md$/i, '') }
  }

  async executeLocalAction(entry) {
    const proposal = entry?.proposal || {}
    const action = proposal.action || {}
    if (proposal.status === 'executed') return entry.execution
    proposal.status = 'approved'
    proposal.updatedAt = now()
    let result

    if (action.action === 'create_note') {
      result = await this.createNote(action.path, action.title, action.markdown)
    } else if (action.action === 'append_to_note') {
      const current = await this.readNote(action.path)
      const separator = current && !current.endsWith('\n') ? '\n\n' : ''
      await this.writeNote(action.path, `${current}${separator}${action.markdown}`)
      result = { path: action.path, operation: 'append' }
    } else if (action.action === 'replace_note') {
      await this.writeNote(action.path, action.markdown)
      result = { path: action.path, operation: 'replace' }
    } else if (action.action === 'add_wiki_suggestion') {
      const wiki = this.api.resources.get(WIKI_RESOURCE)
      if (typeof wiki?.propose !== 'function') throw new Error('Le provider Wiki installé ne permet pas encore de créer une proposition ciblée.')
      result = await wiki.propose(action.topic, {
        title: action.title,
        summary: action.summary,
        sourcePaths: action.sourcePaths
      })
    } else if (action.action === 'create_wiki') {
      const wiki = this.api.resources.get(WIKI_RESOURCE)
      if (typeof wiki?.create !== 'function') throw new Error('Le provider Wiki installé ne permet pas encore de créer un Wiki ciblé.')
      result = await wiki.create(action.topic, {
        title: action.title,
        markdown: action.markdown,
        sourcePaths: action.sourcePaths
      })
    } else if (action.action === 'reject_wiki_suggestion') {
      const wiki = this.api.resources.get(WIKI_RESOURCE)
      if (typeof wiki?.dismiss !== 'function') throw new Error('Le provider Wiki installé ne permet pas de refuser cette proposition.')
      let id = action.proposalId
      if (!id && action.topic && typeof wiki.list === 'function') {
        const records = await wiki.list()
        id = records.find((record) => text(record.topic).toLowerCase() === text(action.topic).toLowerCase())?.id
      }
      if (!id) throw new Error('La proposition Wiki à refuser est introuvable.')
      result = await wiki.dismiss(id)
    } else if (action.action === 'search_notes') {
      result = await this.retrieveContext(action.query, action.limit)
    } else {
      throw new Error(`Action IA non prise en charge : ${action.action || 'inconnue'}`)
    }

    proposal.status = 'executed'
    proposal.result = clone(result)
    proposal.updatedAt = now()
    entry.execution = { result: clone(result), executedAt: now() }
    return entry.execution
  }

  async executeAction(conversation, message, entry) {
    if (!entry?.proposal?.id || entry.busy) return
    entry.busy = true
    entry.error = ''
    this.renderRefresh?.({ keepScroll: true })
    try {
      await this.executeLocalAction(entry)
      this.window?.dispatchEvent?.(new CustomEvent('elephantnote:knowledge-changed', { detail: { reason: 'chat-action' } }))
    } catch (error) {
      entry.proposal.status = 'failed'
      entry.proposal.updatedAt = now()
      entry.error = error?.message || String(error)
    } finally {
      entry.busy = false
      conversation.updatedAt = now()
      this.scheduleSave()
      this.renderRefresh?.({ keepScroll: true })
    }
  }

  async rejectAction(conversation, entry) {
    if (!entry?.proposal?.id || entry.busy) return
    entry.proposal.status = 'rejected'
    entry.proposal.updatedAt = now()
    entry.error = ''
    conversation.updatedAt = now()
    this.scheduleSave()
    this.renderRefresh?.({ keepScroll: true })
  }
}
