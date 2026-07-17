const ADDON_ID = 'elephant.ai'
const DEFAULT_TIMEOUT_MS = 120_000
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}))
const trimSlash = (value = '') => String(value || '').replace(/\/+$/, '')
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const abortError = () => {
  const error = new Error('AI request was cancelled.')
  error.name = 'AbortError'
  return error
}

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw abortError()
}

export const normalizeMessages = (messages) => (Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages || '') }])
  .filter((message) => message && typeof message === 'object')
  .map((message) => {
    const role = ['system', 'user', 'assistant', 'tool'].includes(message.role) ? message.role : 'user'
    const content = Array.isArray(message.content)
      ? message.content.map((part) => typeof part === 'string' ? part : part?.text || part?.content || '').join('')
      : String(message.content || '')
    const normalized = { role, content }
    if (message.name) normalized.name = String(message.name)
    if (message.tool_call_id) normalized.tool_call_id = String(message.tool_call_id)
    if (Array.isArray(message.tool_calls)) normalized.tool_calls = clone(message.tool_calls)
    return normalized
  })
  .filter((message) => message.content.trim() || message.tool_calls?.length)

const enabledProviders = (config) => (Array.isArray(config?.providers?.list) ? config.providers.list : [])
  .filter((provider) => provider?.enabled !== false && provider?.endpoint)

const routeConfig = (config, routeName) => {
  const route = config?.routes?.[routeName]
  if (typeof route === 'string') return { providerId: route, source: route, model: '' }
  return route && typeof route === 'object' ? route : {}
}

const providerSource = (provider = {}) => String(provider.id || provider.providerId || provider.type || '').trim()

export const resolveExternalProvider = (config, routeName, options = {}) => {
  const providers = enabledProviders(config)
  const route = routeConfig(config, routeName)
  const providerId = String(options.providerId || options.source || route.providerId || route.source || route.provider || '')
  const provider = providers.find((entry) => providerSource(entry) === providerId) || providers[0]
  if (!provider) throw new Error(`No enabled external AI provider is configured for ${routeName}.`)
  const model = String(options.model || route.model || provider[`${routeName}Model`] || provider.model || '').trim()
  if (!model && options.allowEmptyModel !== true) throw new Error(`No model is configured for AI route ${routeName}.`)
  return { provider, model, route }
}

const optionalRoute = (config, routeName) => {
  try {
    const { provider, model } = resolveExternalProvider(config, routeName)
    return { providerId: providerSource(provider), model }
  } catch {
    return routeConfig(config, routeName)
  }
}

const endpointFor = (provider, path) => {
  const endpoint = trimSlash(provider.endpoint)
  if (!endpoint.startsWith('https://')) {
    throw new Error('External AI provider endpoints must use HTTPS. Local models must use the Open Models addon service.')
  }
  if (endpoint.endsWith(path)) return endpoint
  return `${endpoint}${path}`
}

const headersFor = (provider) => {
  const headers = {
    'content-type': 'application/json',
    ...(provider?.headers && typeof provider.headers === 'object' ? provider.headers : {})
  }
  if (provider?.apiKey && !headers.authorization && !headers.Authorization) {
    headers.authorization = `Bearer ${provider.apiKey}`
  }
  if (provider?.type === 'openrouter') {
    if (!headers['HTTP-Referer']) headers['HTTP-Referer'] = 'https://github.com/SorbetUP/ElephantNote'
    if (!headers['X-Title']) headers['X-Title'] = 'Elephant'
  }
  return headers
}

const parseBody = (body) => {
  if (body === null || body === undefined || body === '') return null
  if (typeof body === 'object') return body
  try { return JSON.parse(String(body)) } catch { return String(body) }
}

const errorDetail = (payload, fallback) => payload?.error?.message || payload?.error?.detail || payload?.message || payload?.detail || (typeof payload === 'string' ? payload : '') || fallback

const requestBroker = async (api, params, signal) => {
  throwIfAborted(signal)
  const invoke = api.experimental.window?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') throw new Error('Tauri addon broker is unavailable.')
  const response = await invoke('tauri_addons_call', {
    addonId: ADDON_ID,
    method: 'http.request',
    params
  })
  throwIfAborted(signal)
  return {
    ok: response?.ok === true,
    status: Number(response?.status || 0),
    headers: response?.headers || {},
    payload: parseBody(response?.body)
  }
}

const retryDelay = (attempt, response) => {
  const header = response?.headers?.['retry-after'] || response?.headers?.['Retry-After']
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1000)
  return Math.min(8_000, 350 * (2 ** attempt) + Math.floor(Math.random() * 150))
}

const requestJson = async (api, provider, path, init = {}, options = {}) => {
  const retries = Math.min(4, Math.max(0, Number(options.retries ?? 2)))
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    throwIfAborted(options.signal)
    try {
      const response = await requestBroker(api, {
        url: endpointFor(provider, path),
        method: init.method || 'POST',
        headers: { ...headersFor(provider), ...(init.headers || {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        timeoutMs: Math.min(300_000, Math.max(1_000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)))
      }, options.signal)
      if (response.ok) return response.payload
      const message = errorDetail(response.payload, `AI provider returned HTTP ${response.status || 0}.`)
      const error = new Error(message)
      error.status = response.status
      error.providerId = providerSource(provider)
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= retries) throw error
      lastError = error
      await sleep(retryDelay(attempt, response))
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      lastError = error
      if (attempt >= retries || (Number(error?.status) && !RETRYABLE_STATUS.has(Number(error.status)))) throw error
      await sleep(retryDelay(attempt))
    }
  }
  throw lastError || new Error('AI provider request failed.')
}

export const normalizeModelList = (payload) => {
  const values = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
  return values
    .map((entry) => typeof entry === 'string'
      ? { id: entry, label: entry }
      : {
          id: String(entry?.id || entry?.model || entry?.name || entry?.slug || '').trim(),
          label: String(entry?.name || entry?.label || entry?.id || entry?.model || '').trim(),
          ownedBy: entry?.owned_by || entry?.ownedBy || '',
          contextWindow: Number(entry?.context_window || entry?.contextWindow || 0) || undefined
        })
    .filter((entry) => entry.id)
    .sort((left, right) => left.label.localeCompare(right.label))
}

const normalizeEmbeddingResponse = (payload, expected) => {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.embeddings) ? payload.embeddings : []
  const ordered = [...data].sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0))
  const vectors = ordered.map((entry) => Array.isArray(entry) ? entry : entry?.embedding).filter(Array.isArray)
  if (vectors.length !== expected) throw new Error(`Embedding provider returned ${vectors.length} vectors for ${expected} inputs.`)
  const dimensions = vectors[0]?.length || 0
  if (!dimensions || vectors.some((vector) => vector.length !== dimensions || vector.some((value) => !Number.isFinite(value)))) {
    throw new Error('Embedding provider returned invalid or inconsistent vectors.')
  }
  return vectors
}

const textFromContent = (content) => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => part?.text || part?.content || part?.output_text || '').join('')
}

export const parseAssistantPayload = (payload) => {
  const choice = payload?.choices?.[0] || {}
  const message = choice?.message || {}
  const responseOutput = Array.isArray(payload?.output) ? payload.output : []
  const responseMessage = responseOutput.find((item) => item?.type === 'message')
  const text = textFromContent(message.content)
    || String(choice?.text || '')
    || textFromContent(responseMessage?.content)
    || String(payload?.output_text || payload?.response || '')
  const reasoning = textFromContent(message.reasoning_content)
    || textFromContent(payload?.reasoning)
    || ''
  const toolCalls = Array.isArray(message.tool_calls)
    ? clone(message.tool_calls)
    : responseOutput.filter((item) => item?.type === 'function_call').map((item) => ({
        id: item.call_id || item.id,
        type: 'function',
        function: { name: item.name, arguments: item.arguments }
      }))
  return {
    text: String(text || '').trim(),
    reasoning: String(reasoning || '').trim(),
    toolCalls,
    finishReason: choice?.finish_reason || payload?.status || '',
    usage: payload?.usage || null,
    raw: payload
  }
}

const completionBody = (model, messages, options) => {
  const body = {
    model,
    messages: normalizeMessages(messages),
    temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.2,
    stream: false
  }
  if (Number.isFinite(Number(options.maxTokens || options.max_tokens))) body.max_tokens = Math.max(1, Number(options.maxTokens || options.max_tokens))
  if (Number.isFinite(Number(options.topP || options.top_p))) body.top_p = Number(options.topP || options.top_p)
  if (Number.isFinite(Number(options.seed))) body.seed = Number(options.seed)
  if (Array.isArray(options.tools) && options.tools.length) body.tools = clone(options.tools)
  if (options.toolChoice || options.tool_choice) body.tool_choice = clone(options.toolChoice || options.tool_choice)
  if (options.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: options.jsonSchema.name || 'elephant_response',
        strict: options.jsonSchema.strict !== false,
        schema: options.jsonSchema.schema || options.jsonSchema
      }
    }
  } else if (options.json === true) {
    body.response_format = { type: 'json_object' }
  }
  return body
}

const chunkText = (text, size = 36) => {
  const chunks = []
  for (let offset = 0; offset < text.length; offset += size) chunks.push(text.slice(offset, offset + size))
  return chunks
}

export const createAiInferenceResource = (api, getConfig) => Object.freeze({
  apiVersion: 2,
  owner: ADDON_ID,
  capabilities: Object.freeze(['chat', 'embeddings', 'models', 'tools', 'structured-output', 'buffered-stream']),

  async listProviders() {
    const config = await getConfig()
    return enabledProviders(config).map((provider) => ({
      id: providerSource(provider),
      label: provider.label || providerSource(provider),
      type: provider.type || 'openai-compatible',
      endpoint: provider.endpoint,
      enabled: provider.enabled !== false,
      capabilities: ['chat', 'embeddings', 'models']
    }))
  },

  async listModels(options = {}) {
    const config = await getConfig()
    const { provider } = resolveExternalProvider(config, options.route || 'chat', { ...options, allowEmptyModel: true })
    const payload = await requestJson(api, provider, '/models', { method: 'GET' }, options)
    return { providerId: providerSource(provider), models: normalizeModelList(payload) }
  },

  async testProvider(options = {}) {
    const startedAt = Date.now()
    const result = await this.listModels({ ...options, retries: 0, timeoutMs: options.timeoutMs || 20_000 })
    return { ok: true, latencyMs: Date.now() - startedAt, ...result }
  },

  async embed(texts, options = {}) {
    const input = (Array.isArray(texts) ? texts : [texts]).map(String).filter((value) => value.trim())
    if (!input.length) return { vectors: [], model: '', providerId: '' }
    const config = await getConfig()
    const { provider, model } = resolveExternalProvider(config, 'embedding', options)
    const batchSize = Math.min(128, Math.max(1, Number(options.batchSize || 32)))
    const vectors = []
    for (let offset = 0; offset < input.length; offset += batchSize) {
      throwIfAborted(options.signal)
      const batch = input.slice(offset, offset + batchSize)
      const payload = await requestJson(api, provider, '/embeddings', {
        body: { model, input: batch, dimensions: Number(options.dimensions) || undefined }
      }, options)
      vectors.push(...normalizeEmbeddingResponse(payload, batch.length))
      options.onProgress?.({ completed: Math.min(input.length, offset + batch.length), total: input.length })
    }
    return { vectors, dimensions: vectors[0]?.length || 0, model, providerId: providerSource(provider) }
  },

  async complete(messages, options = {}) {
    const config = await getConfig()
    const { provider, model } = resolveExternalProvider(config, 'chat', options)
    const payload = await requestJson(api, provider, '/chat/completions', {
      body: completionBody(model, messages, options)
    }, options)
    const parsed = parseAssistantPayload(payload)
    if (!parsed.text && !parsed.toolCalls.length) throw new Error('AI provider completed without text or tool calls.')
    return {
      ...parsed,
      model,
      providerId: providerSource(provider)
    }
  },

  async stream(messages, options = {}) {
    const result = await this.complete(messages, options)
    if (typeof options.onDelta === 'function') {
      for (const delta of chunkText(result.text, Math.max(8, Number(options.chunkSize || 36)))) {
        throwIfAborted(options.signal)
        await options.onDelta(delta, { providerId: result.providerId, model: result.model, buffered: true })
      }
    }
    return { ...result, buffered: true }
  },

  async status() {
    const config = await getConfig()
    const providers = enabledProviders(config)
    return {
      apiVersion: 2,
      configuredProviders: providers.map((provider) => ({ id: providerSource(provider), label: provider.label, type: provider.type })),
      embeddingRoute: optionalRoute(config, 'embedding'),
      chatRoute: optionalRoute(config, 'chat'),
      capabilities: ['chat', 'embeddings', 'models', 'tools', 'structured-output', 'buffered-stream']
    }
  }
})
