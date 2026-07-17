import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAiInferenceResource,
  normalizeMessages,
  normalizeModelList,
  parseAssistantPayload,
  resolveExternalProvider
} from '../official/ai/inference.js'

test('normalizes rich messages without losing tool metadata', () => {
  assert.deepEqual(normalizeMessages([
    { role: 'assistant', content: [{ text: 'hello' }], tool_calls: [{ id: '1' }] },
    { role: 'tool', content: 'done', tool_call_id: '1' }
  ]), [
    { role: 'assistant', content: 'hello', tool_calls: [{ id: '1' }] },
    { role: 'tool', content: 'done', tool_call_id: '1' }
  ])
})

test('resolves route source and model deterministically', () => {
  const config = {
    providers: { list: [{ id: 'api', endpoint: 'https://example.test/v1', chatModel: 'fallback', enabled: true }] },
    routes: { chat: { source: 'api', model: 'selected' } }
  }
  const resolved = resolveExternalProvider(config, 'chat')
  assert.equal(resolved.provider.id, 'api')
  assert.equal(resolved.model, 'selected')
})

test('normalizes model APIs and assistant responses', () => {
  assert.deepEqual(normalizeModelList({ data: [{ id: 'gpt-b' }, { id: 'gpt-a', owned_by: 'openai' }] }), [
    { id: 'gpt-a', label: 'gpt-a', ownedBy: 'openai', contextWindow: undefined },
    { id: 'gpt-b', label: 'gpt-b', ownedBy: '', contextWindow: undefined }
  ])
  const parsed = parseAssistantPayload({
    choices: [{ message: { content: [{ text: 'Answer' }], tool_calls: [{ id: 'call-1' }] }, finish_reason: 'tool_calls' }],
    usage: { total_tokens: 8 }
  })
  assert.equal(parsed.text, 'Answer')
  assert.equal(parsed.toolCalls[0].id, 'call-1')
  assert.equal(parsed.finishReason, 'tool_calls')
})

test('retries a throttled provider and returns structured completion metadata', async () => {
  const responses = [
    { ok: false, status: 429, headers: { 'retry-after': '0' }, body: JSON.stringify({ error: { message: 'slow down' } }) },
    { ok: true, status: 200, headers: {}, body: JSON.stringify({ choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }) }
  ]
  const api = {
    experimental: {
      window: {
        __TAURI__: {
          core: {
            invoke: async () => responses.shift()
          }
        }
      }
    }
  }
  const inference = createAiInferenceResource(api, async () => ({
    providers: { list: [{ id: 'api', endpoint: 'https://example.test/v1', chatModel: 'model', enabled: true }] },
    routes: { chat: { source: 'api', model: 'model' } }
  }))
  const result = await inference.complete('hello', { retries: 1 })
  assert.equal(result.text, 'Recovered')
  assert.equal(result.providerId, 'api')
  assert.equal(result.usage.total_tokens, 10)
})

test('rejects every insecure external endpoint, including loopback URLs', async () => {
  const call = async (endpoint) => {
    const api = { experimental: { window: { __TAURI__: { core: { invoke: async () => ({ ok: true, status: 200, body: '{"data":[]}' }) } } } } }
    const inference = createAiInferenceResource(api, async () => ({ providers: { list: [{ id: 'x', endpoint, enabled: true }] } }))
    return inference.listModels({ providerId: 'x', retries: 0 })
  }
  await assert.rejects(() => call('http://127.0.0.1:11434/v1'), /HTTPS/)
  await assert.rejects(() => call('http://example.test/v1'), /HTTPS/)
})
