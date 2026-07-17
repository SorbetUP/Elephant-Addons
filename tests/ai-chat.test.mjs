import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChatState, shapeToolCalls } from '../official/ai-chat/main.js'

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
