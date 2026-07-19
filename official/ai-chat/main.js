const ADDON_ID = 'elephant.ai-chat'
const ACTION_ID = `${ADDON_ID}.toggle`
const STORAGE_KEY = 'chat-state-v2'
const AI_CONFIG_RESOURCE = 'ai.config'
const AI_INFERENCE_RESOURCE = 'ai.inference'
const SEARCH_RESOURCE = 'search.provider'
const KNOWLEDGE_RESOURCE = 'knowledge.provider'
const CHAT_STREAM_EVENT = 'elephantnote://chat-stream'

const DEFAULT_ROUTE = Object.freeze({
  source: 'disabled',
  provider: 'disabled',
  model: '',
  reasoningEffort: 'medium',
  temperature: 0.2,
  maxTokens: 4096,
  contextWindow: 32768,
  ragTopK: 8,
  enableRag: true,
  enableTools: true,
  stream: true,
  autoApproveTools: false,
  systemPrompt: ''
})

const QUICK_PROMPTS = Object.freeze([
  { label: 'Synthèse du vault', hint: 'Résume les sujets importants du vault', icon: 'graph', prompt: 'Résume les sujets importants du vault et cite les notes utilisées.' },
  { label: 'Relier les idées', hint: 'Trouve les liens entre mes notes', icon: 'link', prompt: 'Trouve les liens importants entre mes notes et explique les relations.' },
  { label: 'Travail à poursuivre', hint: 'Repère les prochaines actions', icon: 'doc', prompt: 'Repère les décisions, tâches, questions ouvertes et prochaines actions.' },
  { label: 'Organiser le Wiki', hint: 'Propose les sujets utiles', icon: 'source', prompt: 'Propose les sujets de Wiki les plus utiles à créer ou mettre à jour.' }
])

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}))
const now = () => new Date().toISOString()
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const text = (value = '') => String(value || '').trim()

const node = (documentRef, tag, className = '', content = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (content) element.textContent = content
  return element
}

const normalizeMessage = (message = {}) => ({
  id: text(message.id) || uid('message'),
  role: message.role === 'user' ? 'user' : 'assistant',
  content: String(message.content || ''),
  createdAt: message.createdAt || now(),
  citations: Array.isArray(message.citations) ? clone(message.citations) : [],
  actions: Array.isArray(message.actions) ? clone(message.actions) : [],
  toolCalls: Array.isArray(message.toolCalls) ? clone(message.toolCalls) : [],
  reasoningEffort: text(message.reasoningEffort),
  provider: text(message.provider),
  model: text(message.model),
  phase: text(message.phase),
  streaming: message.streaming === true,
  error: text(message.error)
})

const normalizeConversation = (conversation = {}) => ({
  id: text(conversation.id) || uid('conversation'),
  title: text(conversation.title) || 'Nouvelle conversation',
  createdAt: conversation.createdAt || now(),
  updatedAt: conversation.updatedAt || conversation.createdAt || now(),
  messages: (Array.isArray(conversation.messages) ? conversation.messages : []).map(normalizeMessage)
})

export const normalizeChatState = (value = {}) => {
  const vaults = {}
  for (const [vaultId, state] of Object.entries(value?.vaults && typeof value.vaults === 'object' ? value.vaults : {})) {
    const conversations = (Array.isArray(state?.conversations) ? state.conversations : []).map(normalizeConversation)
    const activeId = conversations.some((conversation) => conversation.id === state?.activeId)
      ? state.activeId
      : conversations[0]?.id || ''
    vaults[vaultId] = { activeId, conversations }
  }
  return { version: 2, vaults }
}

const providerSource = (provider = {}) => text(provider.providerId || provider.id || provider.type)
const providerModels = (value) => {
  const list = Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : Array.isArray(value?.models) ? value.models : []
  return list.map((entry) => typeof entry === 'string'
    ? { id: entry, label: entry }
    : { id: text(entry?.id || entry?.model || entry?.name || entry?.slug), label: text(entry?.name || entry?.label || entry?.id || entry?.model) })
    .filter((entry) => entry.id)
}

const citationPath = (citation = {}) => text(citation.path || citation.relativePath || citation.relative_path || citation.document_path || citation.id)
const citationTitle = (citation = {}) => text(citation.title || citation.document_title || citation.heading || citationPath(citation))

export const shapeToolCalls = (result = {}) => {
  const existing = Array.isArray(result.toolCalls) ? result.toolCalls : []
  if (existing.length) return clone(existing)
  const calls = []
  const citations = result.citations || result.sources || []
  if (Array.isArray(citations) && citations.length) {
    calls.push({
      id: uid('tool'),
      name: 'rag.search',
      label: 'Recherche dans les notes',
      summary: `${citations.length} source${citations.length > 1 ? 's' : ''} utilisée${citations.length > 1 ? 's' : ''}`,
      status: 'completed',
      sources: citations.map((item) => ({ path: citationPath(item), title: citationTitle(item) })).filter((item) => item.path)
    })
  }
  if (Array.isArray(result.actions) && result.actions.length) {
    calls.push({
      id: uid('tool'),
      name: 'elephant.actions',
      label: 'Actions Elephant',
      summary: `${result.actions.length} action${result.actions.length > 1 ? 's' : ''} proposée${result.actions.length > 1 ? 's' : ''}`,
      status: 'completed'
    })
  }
  return calls
}

export default class ElephantChatAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.state = normalizeChatState()
    this.configCache = {}
    this.abort = null
    this.activeStream = null
    this.unlistenStream = null
    this.renderRefresh = null
    this.saveTimer = 0
  }

  async call(action, payload = {}) {
    const client = this.window?.elephantnote?.api
    if (typeof client?.call !== 'function') throw new Error(`Elephant API is unavailable for ${action}`)
    const response = await client.call(action, payload)
    if (response?.ok === false) throw new Error(response.error?.message || `${action} failed`)
    return response?.data ?? response
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  getVaultStore() {
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    return bridge?.getStore?.(this.api.app.pinia, 'elephantnoteVaults') || null
  }

  vaultKey() {
    const store = this.getVaultStore()
    return text(store?.activeVault?.id || store?.activeVaultId || store?.activeVault?.path || store?.vaultPath || 'default') || 'default'
  }

  vaultState(create = true) {
    const key = this.vaultKey()
    if (!this.state.vaults[key] && create) this.state.vaults[key] = { activeId: '', conversations: [] }
    return this.state.vaults[key] || { activeId: '', conversations: [] }
  }

  activeConversation(create = true) {
    const state = this.vaultState(create)
    let conversation = state.conversations.find((item) => item.id === state.activeId)
    if (!conversation && create) {
      conversation = normalizeConversation()
      state.conversations.unshift(conversation)
      state.activeId = conversation.id
      this.scheduleSave()
    }
    return conversation || null
  }

  async loadState() {
    this.state = normalizeChatState(await this.api.storage.get(STORAGE_KEY))
    this.activeConversation(true)
    return this.state
  }

  scheduleSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.saveState(), 250)
  }

  async saveState() {
    clearTimeout(this.saveTimer)
    for (const state of Object.values(this.state.vaults)) {
      state.conversations.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      state.conversations = state.conversations.slice(0, 50)
      for (const conversation of state.conversations) conversation.messages = conversation.messages.slice(-300)
    }
    await this.api.storage.set(STORAGE_KEY, clone(this.state))
  }

  async config() {
    const resource = this.api.resources.get(AI_CONFIG_RESOURCE)
    if (resource?.get) this.configCache = await resource.get()
    else this.configCache = await this.call('ai.config.get').catch(() => this.configCache || {})
    return clone(this.configCache || {})
  }

  async setConfig(config) {
    const resource = this.api.resources.get(AI_CONFIG_RESOURCE)
    this.configCache = resource?.set
      ? await resource.set(config)
      : await this.call('ai.config.set', config)
    return clone(this.configCache || {})
  }

  route(config = this.configCache) {
    return { ...DEFAULT_ROUTE, ...(config?.routes?.chat || {}) }
  }

  providerEntries() {
    return (this.api.app.addons?.getContributions?.('ai.providers') || [])
      .map((entry) => ({ addonId: entry.addonId, ...(entry.contribution || {}) }))
      .filter((provider) => providerSource(provider) && Array.isArray(provider.capabilities) && provider.capabilities.includes('chat'))
  }

  async providerOptions(config = null) {
    const current = config || await this.config()
    const options = this.providerEntries().map((provider) => ({
      source: providerSource(provider),
      label: provider.title || providerSource(provider),
      kind: 'addon',
      provider
    }))
    for (const provider of Array.isArray(current.providers?.list) ? current.providers.list : []) {
      if (provider?.enabled === false) continue
      const source = providerSource(provider)
      if (!source || options.some((option) => option.source === source)) continue
      options.push({ source, label: provider.label || source, kind: 'external', provider })
    }
    return options
  }

  async modelsFor(source, config = null) {
    if (!source || source === 'disabled') return []
    const current = config || await this.config()
    const option = (await this.providerOptions(current)).find((item) => item.source === source)
    if (!option) return []
    try {
      if (option.kind === 'addon' && typeof option.provider.getModels === 'function') {
        return providerModels(await option.provider.getModels())
      }
      const inference = this.api.resources.get(AI_INFERENCE_RESOURCE)
      if (option.kind === 'external' && typeof inference?.listModels === 'function') {
        return providerModels((await inference.listModels({ providerId: source, route: 'chat' }))?.models)
      }
    } catch (error) {
      console.warn('[ai-chat] unable to list provider models', source, error)
    }
    return []
  }

  startConversation() {
    const state = this.vaultState()
    const conversation = normalizeConversation()
    state.conversations.unshift(conversation)
    state.activeId = conversation.id
    this.scheduleSave()
    this.renderRefresh?.()
    return conversation
  }

  selectConversation(id) {
    const state = this.vaultState()
    if (state.conversations.some((item) => item.id === id)) {
      state.activeId = id
      this.scheduleSave()
      this.renderRefresh?.()
    }
  }

  deleteConversation(id) {
    const state = this.vaultState()
    state.conversations = state.conversations.filter((item) => item.id !== id)
    if (state.activeId === id) state.activeId = state.conversations[0]?.id || ''
    this.activeConversation(true)
    this.scheduleSave()
    this.renderRefresh?.()
  }

  updateConversationTitle(conversation) {
    if (!conversation || conversation.title !== 'Nouvelle conversation') return
    const first = conversation.messages.find((message) => message.role === 'user')?.content || ''
    conversation.title = first.split(/\s+/).slice(0, 8).join(' ').slice(0, 72) || conversation.title
  }

  async retrieveContext(message, limit = 8) {
    const knowledge = this.api.resources.get(KNOWLEDGE_RESOURCE)
    if (knowledge?.search) {
      try {
        const results = await knowledge.search(message, { limit })
        return Array.isArray(results) ? results : []
      } catch (error) {
        console.warn('[ai-chat] knowledge search unavailable', error)
      }
    }
    const search = this.api.resources.get(SEARCH_RESOURCE)
    if (search?.query) {
      try {
        const results = await search.query(message, { limit })
        return Array.isArray(results) ? results : []
      } catch (error) {
        console.warn('[ai-chat] search fallback unavailable', error)
      }
    }
    return []
  }

  async directChat(question, history, config, signal) {
    const route = this.route(config)
    const source = text(route.source || route.provider)
    const option = (await this.providerOptions(config)).find((candidate) => candidate.source === source)
    if (!option) throw new Error(`Le provider sélectionné n’est plus installé ou configuré : ${source || 'aucun'}.`)
    const citations = route.enableRag === false ? [] : await this.retrieveContext(question, route.ragTopK)
    const context = citations.length
      ? `Contexte provenant du vault Elephant. Cite les sources avec [1], [2], etc.\n\n${citations.map((item, index) => `[${index + 1}] ${citationTitle(item)}\nChemin: ${citationPath(item)}\n${item.excerpt || item.text || item.content || ''}`).join('\n\n')}`
      : ''
    const messages = [
      ...(route.systemPrompt ? [{ role: 'system', content: route.systemPrompt }] : []),
      ...(context ? [{ role: 'system', content: context }] : []),
      ...history.map(({ role, content }) => ({ role, content }))
    ]
    if (option.kind === 'addon') {
      if (typeof option.provider.chat !== 'function') throw new Error(`${option.label} n’expose pas l’exécution du chat.`)
      const result = await option.provider.chat({ messages, model: route.model, route: clone(route), config: clone(config), signal })
      return { ...result, answer: text(result?.answer || result?.content), citations }
    }
    const inference = this.api.resources.get(AI_INFERENCE_RESOURCE)
    if (!inference?.complete) throw new Error('La ressource ai.inference est indisponible.')
    const result = await inference.complete(messages, {
      providerId: source,
      model: route.model,
      temperature: route.temperature,
      maxTokens: route.maxTokens,
      signal
    })
    return { ...result, answer: text(result.text), provider: result.providerId, citations }
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

    let result
    try {
      result = await this.call('rag.chat', {
        message: question,
        limit: Math.min(30, Math.max(1, Number(route.ragTopK || 8))),
        messages: history,
        aiConfig: config,
        streamId,
        autoApproveTools: route.autoApproveTools === true
      })
    } catch (error) {
      const message = String(error?.message || error)
      const unavailable = /unknown action|unsupported|not available|unavailable|rag\.chat/i.test(message)
      if (!unavailable) throw error
      console.warn('[ai-chat] orchestrated RAG route unavailable; using addon composition fallback', error)
      result = await this.directChat(question, history, config, this.abort.signal)
    }
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

  stopGeneration() {
    this.abort?.abort()
    this.abort = null
    const active = this.activeStream
    this.activeStream = null
    if (!active) return
    const conversation = this.vaultState().conversations.find((item) => item.id === active.conversationId)
    const message = conversation?.messages.find((item) => item.id === active.messageId)
    if (message) {
      message.streaming = false
      message.phase = ''
      if (!message.content) message.content = 'Génération annulée.'
      conversation.updatedAt = now()
      this.scheduleSave()
      this.renderRefresh?.()
    }
  }

  handleStreamEvent(event) {
    const payload = event?.payload || event
    const active = this.activeStream
    if (!active || payload?.streamId !== active.id) return
    const conversation = this.vaultState().conversations.find((item) => item.id === active.conversationId)
    const message = conversation?.messages.find((item) => item.id === active.messageId)
    if (!message) return
    if (payload.type === 'reset') {
      message.content = ''
      message.phase = 'Résultats trouvés, rédaction…'
    } else if (payload.type === 'delta') {
      message.content += String(payload.delta || '')
      message.phase = 'Rédaction…'
    } else if (payload.type === 'phase') {
      message.phase = text(payload.phase || payload.label || 'Finalisation…')
    }
    conversation.updatedAt = now()
    this.scheduleSave()
    this.renderRefresh?.({ keepScroll: true })
  }

  async executeAction(conversation, message, entry) {
    const id = entry?.proposal?.id
    if (!id || entry.busy) return
    entry.busy = true
    entry.error = ''
    this.renderRefresh?.({ keepScroll: true })
    try {
      await this.invoke('tauri_knowledge_chat_action_approve', { proposalId: id })
      const execution = await this.invoke('tauri_knowledge_chat_action_execute', { proposalId: id })
      entry.proposal = execution.proposal
      entry.execution = execution
      this.window?.dispatchEvent?.(new CustomEvent('elephantnote:knowledge-changed', { detail: { reason: 'chat-action' } }))
    } catch (error) {
      entry.error = error?.message || String(error)
    } finally {
      entry.busy = false
      conversation.updatedAt = now()
      this.scheduleSave()
      this.renderRefresh?.({ keepScroll: true })
    }
  }

  async rejectAction(conversation, entry) {
    const id = entry?.proposal?.id
    if (!id || entry.busy) return
    entry.busy = true
    entry.error = ''
    this.renderRefresh?.({ keepScroll: true })
    try {
      entry.proposal = await this.invoke('tauri_knowledge_chat_action_reject', { proposalId: id })
    } catch (error) {
      entry.error = error?.message || String(error)
    } finally {
      entry.busy = false
      conversation.updatedAt = now()
      this.scheduleSave()
      this.renderRefresh?.({ keepScroll: true })
    }
  }

  openNote(citation) {
    const path = citationPath(citation)
    if (!path) return
    this.api.logger?.info?.('[ai-chat] citation opened', { path })
    const store = this.getVaultStore()
    const entries = [...(store?.entries || []), ...(store?.rootEntries || []), ...(store?.openedNotes || [])]
    const existing = entries.find((entry) => entry?.path === path)
    const note = existing || {
      kind: 'note',
      type: 'note',
      path,
      title: citationTitle(citation) || path.split('/').pop()?.replace(/\.md$/i, '') || path
    }
    if (typeof store?.openNote === 'function') store.openNote(note)
    else this.window?.dispatchEvent?.(new CustomEvent('elephantnote:open-note', { detail: note }))
  }

  renderMessage(documentRef, conversation, message) {
    const article = node(documentRef, 'article', `en-chat-message elephant-chat-message ${message.role}`)
    const header = node(documentRef, 'header', 'en-chat-message-head elephant-chat-message-head')
    header.append(
      node(documentRef, 'strong', '', message.role === 'user' ? 'Vous' : 'Elephant'),
      node(documentRef, 'small', '', [message.phase, message.model, message.reasoningEffort ? `réflexion ${message.reasoningEffort}` : ''].filter(Boolean).join(' · '))
    )
    article.append(header)
    const body = node(documentRef, 'div', 'en-chat-message-body elephant-chat-message-body')
    body.textContent = message.content || (message.streaming ? 'Recherche et raisonnement…' : '')
    article.append(body)

    if (message.toolCalls.length) {
      const tools = node(documentRef, 'div', 'en-chat-tools elephant-chat-tools')
      for (const tool of message.toolCalls) {
        const pill = node(documentRef, 'span', 'en-chat-tool elephant-chat-tool', `${tool.label || tool.name}${tool.summary ? ` · ${tool.summary}` : ''}`)
        tools.append(pill)
      }
      article.append(tools)
    }

    if (message.citations.length) {
      const citations = node(documentRef, 'div', 'en-chat-citations elephant-chat-citations')
      message.citations.forEach((citation, index) => {
        const button = node(documentRef, 'button', 'en-chat-citation elephant-chat-citation', `${index + 1}  ${citationTitle(citation)}`)
        button.type = 'button'
        button.title = citationPath(citation)
        button.setAttribute('aria-label', `Ouvrir la source ${citationTitle(citation)}`)
        button.onclick = () => this.openNote(citation)
        citations.append(button)
      })
      article.append(citations)
    }

    if (message.actions.length) {
      const actions = node(documentRef, 'section', 'en-chat-tools elephant-chat-action-list')
      for (const entry of message.actions) {
        const card = node(documentRef, 'article', 'elephant-chat-action')
        const proposal = entry?.proposal || {}
        const action = proposal?.action || {}
        const preview = proposal?.preview || {}
        const copy = node(documentRef, 'div')
        copy.append(
          node(documentRef, 'strong', '', action.action || 'Action Elephant'),
          node(documentRef, 'p', '', preview.relative_path || preview.title || preview.topic || preview.query || proposal.rationale || '')
        )
        if (entry.error) copy.append(node(documentRef, 'small', 'elephant-chat-error', entry.error))
        const controls = node(documentRef, 'div', 'elephant-chat-action-controls')
        controls.append(node(documentRef, 'span', '', proposal.status || 'proposed'))
        if ((proposal.status || 'proposed') === 'proposed') {
          const approve = node(documentRef, 'button', '', entry.busy ? 'Exécution…' : 'Approuver')
          approve.type = 'button'; approve.disabled = entry.busy === true
          approve.onclick = () => void this.executeAction(conversation, message, entry)
          const reject = node(documentRef, 'button', '', 'Refuser')
          reject.type = 'button'; reject.disabled = entry.busy === true
          reject.onclick = () => void this.rejectAction(conversation, entry)
          controls.append(approve, reject)
        }
        card.append(copy, controls)
        actions.append(card)
      }
      article.append(actions)
    }
    return article
  }

  async renderChat(container) {
    const documentRef = container.ownerDocument
    await this.loadState()
    await this.config().catch(() => ({}))
    let disposed = false
    let preserveScroll = false
    let historyOpen = false

      const root = node(documentRef, 'section', 'en-chat elephant-chat-package')
    container.replaceChildren(root)

    const render = (options = {}) => {
      if (disposed || !root.isConnected) return
      preserveScroll = options.keepScroll === true
      const previousScroll = root.querySelector('.elephant-chat-history')?.scrollTop || 0
      const conversation = this.activeConversation(true)
      const vaultState = this.vaultState()
      const route = this.route()
      root.replaceChildren()

      const topbar = node(documentRef, 'header', 'en-chat-topbar elephant-chat-topbar')
      const historyToggle = node(documentRef, 'button', 'en-icon-btn elephant-chat-icon-button', '☰')
      historyToggle.type = 'button'
      historyToggle.title = 'Historique des conversations'
      historyToggle.setAttribute('aria-label', 'Ouvrir l’historique des conversations')
      historyToggle.onclick = () => { historyOpen = !historyOpen; render({ keepScroll: true }) }
      const status = node(documentRef, 'span', 'elephant-chat-route-status', [route.source !== 'disabled' ? route.source : 'IA désactivée', route.model].filter(Boolean).join(' · '))
      const title = node(documentRef, 'div', 'en-chat-topbar-title elephant-chat-topbar-title')
      title.append(node(documentRef, 'h2', '', conversation.title || 'Nouvelle conversation'))
      if (this.activeStream) title.append(node(documentRef, 'small', '', 'Recherche et génération en cours…'))
      const closeButton = node(documentRef, 'button', 'en-icon-btn elephant-chat-icon-button', '×')
      closeButton.type = 'button'
      closeButton.title = 'Fermer le chat'
      closeButton.onclick = () => { this.getVaultStore()?.closeChatSidebar?.() }
      const actions = node(documentRef, 'div', 'en-chat-topbar-actions elephant-chat-topbar-actions')
      actions.append(status, closeButton)
      topbar.append(historyToggle, title, actions)

      const backdrop = node(documentRef, 'div', 'en-chat-backdrop')
      backdrop.hidden = !historyOpen
      backdrop.onclick = () => { historyOpen = false; render({ keepScroll: true }) }
      const conversationHistory = node(documentRef, 'aside', `en-chat-history elephant-chat-conversation-history${historyOpen ? ' is-open' : ''}`)
      conversationHistory.setAttribute('aria-label', 'Historique des conversations')
      const historyHead = node(documentRef, 'header', 'en-chat-history-head')
      const historyClose = node(documentRef, 'button', 'en-icon-btn', '×')
      historyClose.type = 'button'; historyClose.onclick = () => { historyOpen = false; render({ keepScroll: true }) }
      historyHead.append(historyClose)
      const historyActions = node(documentRef, 'div', 'en-chat-history-actions')
      const newButton = node(documentRef, 'button', 'en-chat-history-row en-chat-history-row-primary', '+  Nouvelle conversation')
      newButton.type = 'button'; newButton.onclick = () => { this.startConversation(); historyOpen = false }
      historyActions.append(newButton)
      const historySearch = node(documentRef, 'input', 'en-chat-history-search-input')
      historySearch.type = 'search'; historySearch.placeholder = 'Rechercher une conversation'; historySearch.spellcheck = false
      const historySearchWrap = node(documentRef, 'div', 'en-chat-history-search'); historySearchWrap.append(historySearch)
      const historyList = node(documentRef, 'div', 'en-chat-history-scroll')
      for (const item of vaultState.conversations) {
        const row = node(documentRef, 'button', `en-chat-history-row en-chat-history-conversation${item.id === conversation.id ? ' active' : ''}`, item.title)
        row.type = 'button'
        row.onclick = () => { this.selectConversation(item.id); historyOpen = false }
        historyList.append(row)
      }
      conversationHistory.append(historyHead, historyActions, historySearchWrap, historyList)

      const history = node(documentRef, 'div', 'en-chat-scroll elephant-chat-history')
      if (!conversation.messages.length) {
        const empty = node(documentRef, 'section', 'en-chat-empty elephant-chat-empty')
        const emptyHead = node(documentRef, 'div', 'en-chat-empty-head')
        emptyHead.append(node(documentRef, 'h1', '', 'Ask'), node(documentRef, 'p', '', 'Grounded answers from the active vault and semantic graph.'))
        empty.append(emptyHead)
        const prompts = node(documentRef, 'div', 'en-chat-quick elephant-chat-quick-prompts')
        for (const prompt of QUICK_PROMPTS) {
          const button = node(documentRef, 'button', 'en-chat-quick-row')
          button.type = 'button'
          const icon = node(documentRef, 'span', 'en-chat-quick-icon', prompt.icon === 'graph' ? '✦' : prompt.icon === 'link' ? '↗' : prompt.icon === 'doc' ? '▤' : '◈')
          const copy = node(documentRef, 'span', 'en-chat-quick-text')
          copy.append(node(documentRef, 'strong', '', prompt.label), node(documentRef, 'small', '', prompt.hint))
          button.append(icon, copy)
          button.onclick = () => {
            const textarea = root.querySelector('textarea')
            if (textarea) { textarea.value = prompt.prompt; textarea.focus() }
          }
          prompts.append(button)
        }
        empty.append(prompts)
        history.append(empty)
      }
      for (const message of conversation.messages) history.append(this.renderMessage(documentRef, conversation, message))

      const form = node(documentRef, 'form', 'en-chat-composer elephant-chat-form')
      const capsule = node(documentRef, 'div', 'en-chat-composer-capsule')
      const textarea = node(documentRef, 'textarea', 'en-chat-composer-input')
      textarea.rows = 1
      textarea.placeholder = 'Ask'
      const controls = node(documentRef, 'div', 'en-chat-composer-controls elephant-chat-form-controls')
      const mode = node(documentRef, 'button', 'en-chat-composer-mode', 'Advanced ▾')
      mode.type = 'button'
      const send = node(documentRef, 'button', 'en-chat-composer-send', '↑')
      send.type = 'submit'; send.disabled = Boolean(this.activeStream)
      const stop = node(documentRef, 'button', 'secondary', 'Arrêter')
      stop.type = 'button'; stop.hidden = !this.activeStream; stop.onclick = () => this.stopGeneration()
      controls.append(mode, stop, send)
      capsule.append(textarea, controls)
      form.append(capsule)
      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const question = textarea.value.trim()
        if (!question || this.activeStream) return
        textarea.value = ''
        const userMessage = normalizeMessage({ role: 'user', content: question })
        const assistantMessage = normalizeMessage({ role: 'assistant', content: '', streaming: true, phase: 'Recherche et raisonnement…', reasoningEffort: route.reasoningEffort })
        conversation.messages.push(userMessage, assistantMessage)
        conversation.updatedAt = now()
        this.updateConversationTitle(conversation)
        this.scheduleSave()
        render()
        try {
          const result = await this.sendChat(question, conversation, assistantMessage)
          assistantMessage.content = result.answer || 'Aucune réponse exploitable n’a été retournée.'
          assistantMessage.citations = clone(result.citations)
          assistantMessage.actions = clone(result.actions)
          assistantMessage.toolCalls = clone(result.toolCalls)
          assistantMessage.reasoningEffort = result.reasoningEffort
          assistantMessage.provider = result.provider
          assistantMessage.model = result.model
          if (route.autoApproveTools === true) {
            for (const entry of assistantMessage.actions) {
              if ((entry?.proposal?.status || 'proposed') === 'proposed') await this.executeAction(conversation, assistantMessage, entry)
            }
          }
        } catch (error) {
          assistantMessage.error = error?.message || String(error)
          assistantMessage.content = assistantMessage.error
        } finally {
          assistantMessage.streaming = false
          assistantMessage.phase = ''
          conversation.updatedAt = now()
          this.activeStream = null
          this.abort = null
          this.scheduleSave()
          render()
        }
      })

      root.append(backdrop, conversationHistory, topbar, history, form)
      history.scrollTop = preserveScroll ? previousScroll : history.scrollHeight
    }

    this.renderRefresh = render
    render()
    const listen = this.window?.__TAURI__?.event?.listen
    if (typeof listen === 'function') {
      this.unlistenStream = await listen(CHAT_STREAM_EVENT, (event) => this.handleStreamEvent(event)).catch(() => null)
    }

    return () => {
      disposed = true
      this.stopGeneration()
      this.unlistenStream?.()
      this.unlistenStream = null
      this.renderRefresh = null
      root.remove()
    }
  }

  async renderSettings(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-chat-settings')
    container.replaceChildren(root)
    let config = await this.config()
    let route = this.route(config)
    const options = await this.providerOptions(config)

    const field = (label, control, help = '') => {
      const wrapper = node(documentRef, 'label', 'elephant-chat-field')
      wrapper.append(node(documentRef, 'span', '', label), control)
      if (help) wrapper.append(node(documentRef, 'small', '', help))
      return wrapper
    }

    const source = node(documentRef, 'select')
    source.append(Object.assign(node(documentRef, 'option', '', 'Désactivé'), { value: 'disabled' }))
    for (const option of options) source.append(Object.assign(node(documentRef, 'option', '', option.label), { value: option.source }))
    source.value = options.some((option) => option.source === (route.source || route.provider)) ? (route.source || route.provider) : 'disabled'

    const model = node(documentRef, 'select')
    const modelCustom = node(documentRef, 'input')
    modelCustom.placeholder = 'Identifiant de modèle personnalisé'
    modelCustom.value = route.model || ''
    const refreshModels = async () => {
      const models = await this.modelsFor(source.value, config)
      model.replaceChildren()
      const values = new Map(models.map((entry) => [entry.id, entry.label]))
      if (modelCustom.value && !values.has(modelCustom.value)) values.set(modelCustom.value, modelCustom.value)
      for (const [id, label] of values) model.append(Object.assign(node(documentRef, 'option', '', label), { value: id }))
      model.value = modelCustom.value
      model.hidden = values.size === 0
    }
    source.onchange = () => void refreshModels()
    model.onchange = () => { modelCustom.value = model.value }
    await refreshModels()

    const reasoning = node(documentRef, 'select')
    for (const value of ['low', 'medium', 'high']) reasoning.append(Object.assign(node(documentRef, 'option', '', ({ low: 'Faible', medium: 'Moyenne', high: 'Élevée' })[value]), { value }))
    reasoning.value = route.reasoningEffort || 'medium'
    const ragTopK = Object.assign(node(documentRef, 'input'), { type: 'number', min: '1', max: '30', value: String(route.ragTopK || 8) })
    const maxTokens = Object.assign(node(documentRef, 'input'), { type: 'number', min: '128', value: String(route.maxTokens || 4096) })
    const temperature = Object.assign(node(documentRef, 'input'), { type: 'number', min: '0', max: '2', step: '0.1', value: String(route.temperature ?? 0.2) })
    const enableRag = Object.assign(node(documentRef, 'input'), { type: 'checkbox', checked: route.enableRag !== false })
    const enableTools = Object.assign(node(documentRef, 'input'), { type: 'checkbox', checked: route.enableTools !== false })
    const autoApprove = Object.assign(node(documentRef, 'input'), { type: 'checkbox', checked: route.autoApproveTools === true })
    const systemPrompt = node(documentRef, 'textarea')
    systemPrompt.rows = 4; systemPrompt.value = route.systemPrompt || ''
    const feedback = node(documentRef, 'p', 'elephant-chat-feedback')

    const save = node(documentRef, 'button', '', 'Enregistrer la route Chat')
    save.type = 'button'
    save.onclick = async () => {
      route = {
        ...route,
        source: source.value,
        provider: source.value,
        model: source.value === 'disabled' ? '' : modelCustom.value.trim(),
        reasoningEffort: reasoning.value,
        ragTopK: Math.min(30, Math.max(1, Number(ragTopK.value) || 8)),
        maxTokens: Math.max(128, Number(maxTokens.value) || 4096),
        temperature: Math.min(2, Math.max(0, Number(temperature.value) || 0)),
        enableRag: enableRag.checked,
        enableTools: enableTools.checked,
        autoApproveTools: autoApprove.checked,
        stream: true,
        systemPrompt: systemPrompt.value.trim()
      }
      config = await this.setConfig({ ...config, provider: route.provider, model: route.model, routes: { ...(config.routes || {}), chat: route } })
      feedback.textContent = 'Route Chat enregistrée.'
      this.renderRefresh?.()
    }

    root.append(
      node(documentRef, 'h4', '', 'Route Chat orchestrée'),
      node(documentRef, 'p', 'elephant-chat-feedback', 'Le Chat réutilise le moteur RAG, Knowledge, Wiki et les actions Elephant quand ils sont disponibles.'),
      field('Provider', source),
      field('Modèle détecté', model, 'La liste provient directement du provider installé.'),
      field('Modèle personnalisé', modelCustom),
      field('Niveau de réflexion', reasoning),
      field('Sources RAG', ragTopK),
      field('Tokens maximum', maxTokens),
      field('Température', temperature),
      field('Recherche dans le vault', enableRag),
      field('Actions Elephant', enableTools),
      field('Approbation automatique des actions', autoApprove, 'Désactivée par défaut : les modifications de notes restent confirmables.'),
      field('Instructions système', systemPrompt),
      save,
      feedback
    )
    return () => root.remove()
  }

  async onload(api) {
    await this.loadState()
    api.ui.registerStyle(`
      .elephant-chat-package{position:relative;height:100%;min-width:340px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;border-left:1px solid var(--en-border);background:var(--en-bg);color:var(--en-text);overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      .elephant-chat-topbar{display:flex;align-items:center;gap:10px;padding:14px 18px 10px;border-bottom:1px solid var(--en-border);background:var(--en-bg)}
      .elephant-chat-icon-button{width:34px!important;min-width:34px!important;padding:0!important;border:0!important;border-radius:10px!important;background:transparent!important;color:var(--en-text)!important;font-size:18px;cursor:pointer}.elephant-chat-icon-button:hover{background:var(--en-soft)!important}
      .elephant-chat-topbar-title{flex:1;min-width:0}.elephant-chat-topbar-title h2{margin:0;color:var(--en-text);font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.elephant-chat-topbar-title small{display:block;margin-top:2px;color:var(--en-muted);font-size:11px}.elephant-chat-topbar-actions{display:flex;align-items:center;gap:8px}
      .elephant-chat-topbar select,.elephant-chat-topbar button,.elephant-chat-form button,.elephant-chat-citation,.elephant-chat-action button,.elephant-chat-quick-prompts button{min-height:32px;border:1px solid var(--en-border);border-radius:9px;background:var(--en-surface);color:var(--en-text);padding:0 10px;cursor:pointer}
      .elephant-chat-conversation-select{min-width:0;max-width:190px}.elephant-chat-route-status{margin-left:auto;color:var(--en-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .elephant-chat-history{overflow:auto;padding:24px 22px 20px;display:grid;align-content:start;gap:12px}.elephant-chat-empty{max-width:520px;margin:10vh auto 0;display:grid;gap:14px;text-align:center;color:var(--en-muted)}
      .elephant-chat-empty h3{margin:0;color:var(--en-text)}.elephant-chat-empty p{margin:0}.elephant-chat-quick-prompts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .elephant-chat-conversation-history{position:absolute;z-index:5;top:0;bottom:0;left:0;width:min(260px,80%);padding:18px 14px;background:var(--en-bg);border-right:1px solid var(--en-border);transform:translateX(-100%);transition:transform .2s ease;display:flex;flex-direction:column;gap:14px}.elephant-chat-conversation-history.is-open{transform:translateX(0)}.elephant-chat-conversation-list{display:grid;gap:4px;overflow:auto}.elephant-chat-conversation-row{border:0!important;background:transparent!important;color:var(--en-text)!important;text-align:left!important;border-radius:10px!important;padding:10px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.elephant-chat-conversation-row:hover,.elephant-chat-conversation-row.active{background:var(--en-soft)!important}
      .elephant-chat-message{display:grid;gap:8px;padding:12px;border:1px solid var(--en-border);border-radius:14px;background:var(--en-surface)}.elephant-chat-message.user{margin-left:36px;background:var(--en-soft)}.elephant-chat-message.assistant{margin-right:20px}
      .elephant-chat-message-head{display:flex;justify-content:space-between;gap:8px}.elephant-chat-message-head small{color:var(--en-muted)}.elephant-chat-message-body{white-space:pre-wrap;line-height:1.55}
      .elephant-chat-tools,.elephant-chat-citations{display:flex;flex-wrap:wrap;gap:6px}.elephant-chat-tool{padding:5px 8px;border-radius:999px;background:var(--en-soft);color:var(--en-muted);font-size:11px}.elephant-chat-citation{text-align:left}
      .elephant-chat-action-list{display:grid;gap:8px}.elephant-chat-action{display:flex;justify-content:space-between;gap:10px;padding:10px;border:1px solid var(--en-border);border-radius:10px}.elephant-chat-action p{margin:4px 0 0;color:var(--en-muted)}.elephant-chat-action-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.elephant-chat-error{color:var(--en-danger,#b42318)}
      .elephant-chat-form{display:grid;gap:8px;padding:12px;border-top:1px solid var(--en-border)}.elephant-chat-form textarea,.elephant-chat-field input,.elephant-chat-field select,.elephant-chat-field textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--en-border);border-radius:9px;background:var(--en-surface);color:var(--en-text)}.elephant-chat-form-controls{display:flex;justify-content:flex-end;gap:8px}.elephant-chat-form button:not(.secondary){background:var(--en-accent,var(--en-primary,#111827));color:white}
      .elephant-chat-settings{display:grid;gap:11px}.elephant-chat-settings h4,.elephant-chat-settings p{margin:0}.elephant-chat-field{display:grid;gap:5px;color:var(--en-muted);font-size:11px}.elephant-chat-field small{font-size:10px}.elephant-chat-feedback{color:var(--en-muted)}
      .en-chat{position:relative;min-width:0;min-height:0;height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--en-bg);color:var(--en-text);overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.en-chat *{box-sizing:border-box}.en-chat-backdrop{position:absolute;z-index:4;inset:0;background:color-mix(in srgb,var(--en-bg) 60%,transparent)}.en-chat-history{position:absolute!important;z-index:5;top:0;bottom:0;left:0;width:min(260px,80%);padding:0 14px 14px!important;background:var(--en-bg);border-right:1px solid var(--en-border);transform:translateX(-100%);transition:transform .22s ease;display:flex!important;flex-direction:column!important;gap:0!important;overflow:hidden!important}.en-chat-history.is-open{transform:translateX(0)}.en-chat-history-head{display:flex;justify-content:flex-end;padding:18px 4px 10px}.en-chat-history-actions{display:grid;gap:4px;padding:4px 0 10px}.en-chat-history-search{padding:0 0 12px}.en-chat-history-search-input{width:100%;height:36px;padding:0 12px;border:1px solid var(--en-border);border-radius:10px;background:var(--en-surface);color:var(--en-text)}.en-chat-history-scroll{flex:1;min-height:0;overflow:auto;padding:4px 0 14px!important;display:grid;align-content:start;gap:4px}.en-chat-history-row{display:flex;align-items:center;width:100%;padding:10px;border:0;border-radius:10px;color:var(--en-text);background:transparent;text-align:left;cursor:pointer}.en-chat-history-row:hover,.en-chat-history-row.active{background:var(--en-soft)}.en-chat-history-row-primary{background:var(--en-surface);font-weight:500}.en-chat-scroll{min-height:0;overflow-y:auto;padding:10px 0 20px;scroll-behavior:smooth}.en-chat-empty{display:flex;flex-direction:column;gap:26px;padding:10vh 22px 20px;color:var(--en-text)}.en-chat-empty-head h1{margin:0 0 8px;font-size:22px;font-weight:600}.en-chat-empty-head p{margin:0;color:var(--en-muted);font-size:13px}.en-chat-quick{display:flex;flex-direction:column;gap:6px}.en-chat-quick-row{display:flex;align-items:center;padding:10px 12px!important;border:0!important;border-radius:12px!important;color:var(--en-text)!important;background:transparent!important;text-align:left;cursor:pointer}.en-chat-quick-row:hover{background:var(--en-soft)!important}.en-chat-composer{padding:12px!important;border-top:1px solid var(--en-border);background:var(--en-bg)}
      @media(max-width:700px){.elephant-chat-package{min-width:0}.elephant-chat-topbar{flex-wrap:wrap}.elephant-chat-route-status{width:100%;margin-left:0}.elephant-chat-message.user{margin-left:14px}.elephant-chat-message.assistant{margin-right:8px}.elephant-chat-quick-prompts{grid-template-columns:1fr}}
+.en-chat {
  position: relative;
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  background: var(--en-bg);
  color: var(--en-text);
  overflow: hidden;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  --chat-surface: color-mix(in srgb, var(--en-surface) 96%, var(--en-bg));
  --chat-surface-hover: var(--en-soft);
  --chat-surface-active: color-mix(in srgb, var(--en-soft) 80%, var(--en-border));
  --chat-border: var(--en-border);
  --chat-text: var(--en-text);
  --chat-text-secondary: var(--en-muted);
  --chat-text-muted: color-mix(in srgb, var(--en-muted) 80%, transparent);
  --chat-accent: var(--en-primary);
  --chat-accent-hover: color-mix(in srgb, var(--en-primary) 82%, white);
}

.en-chat * {
  box-sizing: border-box;
}

.en-chat-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--en-bg) 60%, transparent);
  z-index: 30;
  border: 0;
  padding: 0;
}

.en-chat-history {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: min(260px, 80%);
  z-index: 40;
  display: flex;
  flex-direction: column;
  background: var(--en-bg);
  border-right: 1px solid var(--en-border);
  transform: translateX(-100%);
  transition: transform 0.22s ease;
}

.en-chat-history.is-open {
  transform: translateX(0);
}

.en-chat-history-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 18px 18px 10px;
}

.en-chat-history-actions {
  display: grid;
  gap: 4px;
  padding: 4px 14px 10px;
}

.en-chat-history-search {
  padding: 0 14px 12px;
}

.en-chat-history-search input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  background: var(--en-surface);
  color: var(--en-text);
  font: inherit;
  font-size: 13px;
}

.en-chat-history-search input::placeholder {
  color: var(--chat-text-muted);
}

.en-chat-history-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 14px 14px;
}

.en-chat-history-empty {
  margin: 20px 6px;
  color: var(--chat-text-muted);
  font-size: 13px;
}

.en-chat-history-group + .en-chat-history-group {
  margin-top: 16px;
}

.en-chat-history-group-title {
  margin: 0 6px 6px;
  color: var(--chat-text-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.en-chat-history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 10px;
  border-radius: 10px;
  color: var(--en-text);
  background: transparent;
  border: 0;
  text-align: left;
  font-size: 13px;
  line-height: 1.3;
}

.en-chat-history-row:hover {
  background: var(--en-soft);
}

.en-chat-history-row.active {
  background: var(--chat-surface);
}

.en-chat-history-row-primary {
  background: var(--chat-surface);
  margin-bottom: 6px;
  font-weight: 500;
}

.en-chat-history-conversation-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-history-conversation-actions {
  display: none;
  gap: 4px;
}

.en-chat-history-conversation:hover .en-chat-history-conversation-actions,
.en-chat-history-conversation.active .en-chat-history-conversation-actions {
  display: inline-flex;
}

.en-chat-main {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--en-bg);
}

.en-chat-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px 10px;
  background: var(--en-bg);
}

.en-chat-topbar-title {
  flex: 1;
  min-width: 0;
}

.en-chat-topbar-title h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--en-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-topbar-title small {
  display: block;
  margin-top: 2px;
  color: var(--en-muted);
  font-size: 11px;
}

.en-chat-topbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.en-chat-status {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--en-primary);
}

.en-chat-status-pulse {
  animation: en-chat-pulse 1.1s ease-in-out infinite;
}

@keyframes en-chat-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.en-icon-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  color: var(--en-text);
  background: transparent;
  cursor: pointer;
}

.en-icon-btn:hover {
  background: var(--en-soft);
}

.en-icon-btn-ghost {
  width: 26px;
  height: 26px;
  color: var(--en-muted);
  background: transparent;
}

.en-icon-btn-ghost:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.en-chat-history-row .en-icon {
  color: var(--en-muted);
}

.en-chat-scroll {
  min-height: 0;
  overflow-y: auto;
  padding: 10px 0 20px;
  scroll-behavior: smooth;
}

.en-chat-empty {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 10vh 22px 20px;
  color: var(--en-text);
}

.en-chat-empty-head h1 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.en-chat-empty-head p {
  margin: 0;
  color: var(--en-muted);
  font-size: 13px;
}

.en-chat-quick {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.en-chat-quick-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  color: var(--en-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.en-chat-quick-row:hover {
  background: var(--en-soft);
}

.en-chat-quick-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--chat-surface);
  color: var(--en-text);
}

.en-chat-quick-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.en-chat-quick-text strong {
  font-size: 13px;
  font-weight: 500;
}

.en-chat-quick-text small {
  color: var(--en-muted);
  font-size: 11px;
}

.en-chat-thread {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 6px 18px 20px;
}

.en-chat-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--chat-surface);
  color: var(--en-text);
}

.en-chat-message.user {
  align-self: flex-end;
  max-width: min(680px, 92%);
  background: color-mix(in srgb, var(--en-primary) 18%, var(--chat-surface));
}

.en-chat-message.assistant {
  align-self: stretch;
}

.en-chat-message-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.en-chat-message-avatar {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--chat-surface-active);
  color: var(--en-text);
  font-size: 10px;
  font-weight: 700;
}

.en-chat-message-avatar[data-role='user'] {
  background: var(--en-primary);
  color: #ffffff;
}

.en-chat-message-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.en-chat-message-meta strong {
  font-size: 12px;
  font-weight: 600;
}

.en-chat-message-meta small {
  color: var(--en-muted);
  font-size: 11px;
}

.en-chat-message-body {
  color: var(--en-text);
  font-size: 14px;
  line-height: 1.55;
}

.en-chat-message-body p {
  margin: 0 0 8px;
}

.en-chat-message-body p:last-child {
  margin-bottom: 0;
}

.en-chat-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.en-chat-tool {
  border: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--en-bg) 55%, transparent);
  color: var(--en-text);
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.en-chat-tool:hover {
  background: color-mix(in srgb, var(--en-bg) 35%, transparent);
}

.en-chat-tool-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
}

.en-chat-tool-status {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--en-muted);
  flex: 0 0 auto;
}

.en-chat-tool-status[data-status='running'] {
  background: var(--en-primary);
  animation: en-chat-pulse 1.1s ease-in-out infinite;
}

.en-chat-tool-status[data-status='done'] {
  background: #4ade80;
}

.en-chat-tool-name {
  font-size: 12px;
  font-weight: 500;
}

.en-chat-tool-summary {
  flex: 1;
  min-width: 0;
  color: var(--en-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-tool-chevron {
  width: 15px;
  height: 15px;
  color: var(--en-muted);
  transition: transform 0.18s ease;
}

.en-chat-tool.expanded .en-chat-tool-chevron {
  transform: rotate(180deg);
}

.en-chat-tool-detail {
  padding: 0 11px 11px;
  border-top: 1px solid var(--en-border);
}

.en-chat-tool-detail-meta {
  margin: 8px 0;
  color: var(--en-muted);
  font-size: 11px;
}

.en-chat-tool-detail-meta code {
  background: var(--en-soft);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
}

.en-chat-tool-sources {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.en-chat-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.en-chat-citation {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 9px;
  border: 1px solid var(--en-border);
  border-radius: 9px;
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-bg) 60%, transparent);
  font-size: 11px;
  cursor: pointer;
}

.en-chat-citation:hover {
  background: var(--en-soft);
}

.en-chat-citation span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-chat-citation-index {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: var(--chat-surface-active);
  color: var(--en-text);
  font-size: 10px;
  font-weight: 700;
}

.en-chat-composer {
  padding: 6px 18px 18px;
  background: var(--en-bg);
}

.en-chat-composer-capsule {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--en-border);
  border-radius: 22px;
  background: var(--chat-surface);
}

.en-chat-composer-input {
  min-width: 0;
  min-height: 36px;
  max-height: 168px;
  border: 0;
  background: transparent;
  color: var(--en-text);
  font: inherit;
  font-size: 14px;
  line-height: 1.45;
  resize: none;
  padding: 8px 4px;
  overflow-y: auto;
  scrollbar-width: none;
}

.en-chat-composer-input::-webkit-scrollbar {
  display: none;
}

.en-chat-composer-input::placeholder {
  color: var(--en-muted);
}

.en-chat-composer-input:focus {
  outline: none;
}

.en-chat-composer-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.en-chat-composer-mode {
  height: 34px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 10px;
  color: var(--en-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.en-chat-composer-mode:hover {
  background: var(--en-soft);
  color: var(--en-text);
}

.en-chat-composer-caret {
  font-size: 10px;
  opacity: 0.7;
}

.en-chat-composer-send {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 12px;
  color: #ffffff;
  background: var(--chat-surface-active);
  cursor: pointer;
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.en-chat-composer-send.is-ready {
  background: var(--en-primary);
}

.en-chat-composer-send.is-ready:hover {
  background: var(--chat-accent-hover);
  transform: translateY(-1px);
}

.en-chat-composer-send:disabled {
  cursor: default;
}

.en-chat-composer-send .en-icon {
  width: 17px;
  height: 17px;
}

.en-chat-scroll,
.en-chat-history-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--en-border) transparent;
}

.en-chat-scroll::-webkit-scrollbar,
.en-chat-history-scroll::-webkit-scrollbar {
  width: 7px;
}

.en-chat-scroll::-webkit-scrollbar-thumb,
.en-chat-history-scroll::-webkit-scrollbar-thumb {
  background: var(--en-border);
  border-radius: 999px;
}

.en-chat-scroll::-webkit-scrollbar-thumb:hover,
.en-chat-history-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--en-border-strong, var(--en-border));
}

@media (max-width: 720px) {
  .en-chat-empty {
    padding: 6vh 16px 20px;
  }
  .en-chat-thread {
    padding: 6px 12px 20px;
  }
  .en-chat-composer {
    padding: 6px 12px 14px;
  }
  .en-chat-topbar {
    padding: 12px 14px 8px;
  }
}
    `, 'ai-chat-package-v2')

    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')
    const component = bridge.createDomComponent({
      name: 'ElephantPhysicalChatSidebarV2',
      className: 'elephant-physical-chat-host',
      mount: (container) => this.renderChat(container)
    })

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: 'ai.chat',
      chrome: false,
      title: 'Chat',
      description: 'Configure le provider, le modèle, le RAG, les actions et le niveau de réflexion.',
      order: 20,
      render: (container) => this.renderSettings(container)
    })

    api.layout.registerZone({
      id: `${ADDON_ID}.sidebar`,
      zone: 'shell.right',
      order: 40,
      component,
      when: () => this.getVaultStore()?.chatSidebarOpen === true
    })

    api.commands.register({
      id: ACTION_ID,
      title: 'Ouvrir ou fermer le Chat IA',
      run: () => {
        const store = this.getVaultStore()
        if (!store) throw new Error('Vault store is unavailable')
        if (typeof store.toggleChatSidebar === 'function') store.toggleChatSidebar()
        else store.chatSidebarOpen = !store.chatSidebarOpen
        return { open: store.chatSidebarOpen }
      }
    })

    api.workspace.registerSidebarItem({
      id: `${ADDON_ID}.sidebar-item`,
      title: 'Chat',
      tooltip: 'Assistant IA connecté au vault',
      icon: 'message-circle',
      actionId: ACTION_ID,
      order: 46
    })
  }

  async onunload() {
    this.stopGeneration()
    this.unlistenStream?.()
    clearTimeout(this.saveTimer)
    await this.saveState().catch(() => {})
    const store = this.getVaultStore()
    if (store) store.chatSidebarOpen = false
  }
}
