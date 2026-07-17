import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAgentMessages,
  normalizeAgentEnvelope,
  safeRelativePath
} from '../official/ai-chat/agent.js'

test('rejects traversal and normalizes Markdown paths', () => {
  assert.equal(safeRelativePath('../secret'), '')
  assert.equal(safeRelativePath('/Notes/Plan'), 'Notes/Plan.md')
  assert.equal(safeRelativePath('Notes\\Plan.md'), 'Notes/Plan.md')
})

test('normalizes only supported explicit agent actions', () => {
  const result = normalizeAgentEnvelope(JSON.stringify({
    answer: 'Done [1].',
    actions: [
      {
        type: 'create_note',
        rationale: 'Requested by the user',
        path: 'Projects/Plan.md',
        title: 'Plan',
        markdown: '# Plan',
        query: null,
        limit: null,
        topic: null,
        summary: null,
        sourcePaths: ['Notes/Source.md', '../bad.md'],
        proposalId: null
      },
      { type: 'shell_exec', path: 'bad', markdown: 'bad' }
    ]
  }), {
    citations: [{ path: 'Notes/Source.md', title: 'Source' }],
    idFactory: (prefix) => `${prefix}-fixed`
  })
  assert.equal(result.answer, 'Done [1].')
  assert.equal(result.actions.length, 1)
  assert.equal(result.actions[0].proposal.id, 'proposal-fixed')
  assert.equal(result.actions[0].proposal.status, 'proposed')
  assert.equal(result.actions[0].proposal.action.path, 'Projects/Plan.md')
})

test('preserves plain answers when a provider ignores the JSON contract', () => {
  const result = normalizeAgentEnvelope('Ordinary answer', { citations: [] })
  assert.equal(result.answer, 'Ordinary answer')
  assert.deepEqual(result.actions, [])
})

test('builds a grounded prompt with sources and no hidden reasoning request', () => {
  const messages = buildAgentMessages({
    question: 'Résume cette note',
    history: [{ role: 'user', content: 'Résume cette note' }],
    citations: [{ path: 'Notes/A.md', title: 'A', excerpt: 'Evidence' }],
    route: { enableTools: true, contextWindow: 4096 }
  })
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /\[1\] A/)
  assert.match(messages[0].content, /do not expose hidden chain-of-thought/i)
  assert.equal(messages.at(-1).content, 'Résume cette note')
})
