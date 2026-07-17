import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChatState, shapeToolCalls } from '../official/ai-chat/main.js'
import ElephantChatAddon from '../official/ai-chat/main.v2.js'

test('normalizes persistent per-vault conversations and repairs active ids', () => {
  const state = normalizeChatState({
    vaults: {
      alpha: {
        activeId: 'missing',
        conversations: [{ id: 'one', title: 'Test', messages: [{ role: 'user', content: 'Hello' }] }]
      }
    }
  })
  assert.equal(state.version, 2)
  assert.equal(state.vaults.alpha.activeId, 'one')
  assert.equal(state.vaults.alpha.conversations[0].messages[0].role, 'user')
})

test('shapes RAG sources and actions into visible tool phases', () => {
  const calls = shapeToolCalls({
    citations: [{ relative_path: 'Notes/A.md', title: 'A' }, { path: 'Notes/B.md', title: 'B' }],
    actions: [{ proposal: { id: 'p1' } }]
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].name, 'rag.search')
  assert.equal(calls[0].sources[0].path, 'Notes/A.md')
  assert.equal(calls[1].name, 'elephant.actions')
})

const fakeApi = ({ providerAnswer, knowledge = [], wiki = null } = {}) => {
  const calls = []
  const resources = new Map([
    ['knowledge.provider', { search: async () => knowledge }],
    ...(wiki ? [['wiki.provider', wiki]] : [])
  ])
  const api = {
    experimental: {
      window: {
        elephantnote: {
          api: {
            call: async (action, payload) => {
              calls.push({ action, payload })
              if (action === 'notes.create') return { data: { note: { path: [payload.relativePath, payload.filename].filter(Boolean).join('/') } } }
              if (action === 'notes.read') return { data: { markdown: '# Existing' } }
              return { data: { ok: true } }
            }
          }
        }
      }
    },
    resources: { get: (id) => resources.get(id), has: (id) => resources.has(id) },
    app: {
      pinia: null,
      addons: {
        getContributions: (point) => point === 'ai.providers'
          ? [{ addonId: 'fake', contribution: {
              providerId: 'fake',
              title: 'Fake',
              capabilities: ['chat'],
              getModels: async () => ['model'],
              chat: async () => ({ answer: providerAnswer })
            } }]
          : []
      }
    },
    storage: { get: async () => null, set: async () => {} }
  }
  return { api, calls }
}

test('runs the addon-owned grounded agent and creates approval proposals', async () => {
  const response = JSON.stringify({
    answer: 'La source confirme le plan [1].',
    actions: [{
      type: 'create_note', rationale: 'Demandé explicitement', query: null, limit: null,
      path: 'Projects/Plan.md', title: 'Plan', topic: null, markdown: '# Plan', summary: null,
      sourcePaths: ['Notes/A.md'], proposalId: null
    }]
  })
  const { api } = fakeApi({
    providerAnswer: response,
    knowledge: [{ path: 'Notes/A.md', title: 'A', excerpt: 'Evidence' }]
  })
  const addon = new ElephantChatAddon(api)
  const result = await addon.directChat('Crée le plan', [{ role: 'user', content: 'Crée le plan' }], {
    routes: { chat: { source: 'fake', provider: 'fake', model: 'model', enableRag: true, enableTools: true, stream: false } }
  }, new AbortController().signal)
  assert.equal(result.engine, 'addon-owned-rag-agent-v2')
  assert.equal(result.citations[0].path, 'Notes/A.md')
  assert.equal(result.actions[0].proposal.status, 'proposed')
})

test('executes note writes only through the reviewed local action boundary', async () => {
  const { api, calls } = fakeApi()
  const addon = new ElephantChatAddon(api)
  const entry = {
    proposal: {
      id: 'p1', status: 'proposed',
      action: { action: 'create_note', path: 'Projects/Plan.md', title: 'Plan', markdown: '# Plan' }
    }
  }
  await addon.executeLocalAction(entry)
  assert.equal(entry.proposal.status, 'executed')
  assert.deepEqual(calls.map((call) => call.action), ['notes.create', 'notes.write'])
  assert.equal(calls[0].payload.filename, 'Plan.md')
})
