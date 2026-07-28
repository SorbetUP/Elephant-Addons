import assert from 'node:assert/strict'
import test from 'node:test'

import ElephantCodexAddon from '../official/codex-connection/main.js'

const createApi = (status) => {
  const contributions = []
  const serviceCalls = []
  const registeredSections = []
  const api = {
    experimental: { window: {} },
    native: {
      service: {
        start: async () => { serviceCalls.push('service.start') },
        stop: async () => { serviceCalls.push('service.stop') },
        call: async (method) => {
          serviceCalls.push(method)
          if (method === 'codex.status') return status.current
          throw new Error(`Unexpected service call: ${method}`)
        }
      }
    },
    workspace: {
      registerContribution: (point, contribution) => {
        contributions.push({ point, contribution })
      }
    },
    resources: {
      get: () => null
    },
    ui: {
      registerStyle: () => {}
    },
    settings: {
      registerSection: (section) => { registeredSections.push(section) }
    }
  }
  return { api, contributions, serviceCalls, registeredSections }
}

test('Codex does not expose an AI provider when its executable is missing', async () => {
  const status = {
    current: {
      installed: false,
      detected: false,
      running: false,
      connected: false,
      error: 'Codex runtime is not installed'
    }
  }
  const harness = createApi(status)
  const addon = new ElephantCodexAddon(harness.api)

  await addon.onload(harness.api)

  assert.deepEqual(harness.contributions, [])
  assert.deepEqual(harness.serviceCalls, ['service.start', 'codex.status'])
  assert.equal(harness.registeredSections.length, 1)
  assert.equal(addon.providerRegistered, false)
})

test('Codex registers its provider once after a runtime becomes available', async () => {
  const status = {
    current: {
      installed: true,
      detected: true,
      running: true,
      connected: false,
      runtimePath: '/package/runtime/codex',
      version: 'codex-cli fixture'
    }
  }
  const harness = createApi(status)
  const addon = new ElephantCodexAddon(harness.api)

  await addon.onload(harness.api)
  assert.equal(harness.contributions.length, 1)
  assert.equal(harness.contributions[0].point, 'ai.providers')
  assert.equal(harness.contributions[0].contribution.providerId, 'codex')
  assert.equal(addon.ensureProvider(status.current), false)
  assert.equal(harness.contributions.length, 1)
})

test('Codex can register after a later refresh detects the installed runtime', async () => {
  const status = {
    current: {
      installed: false,
      detected: false,
      running: false,
      connected: false,
      error: 'Codex runtime is not installed'
    }
  }
  const harness = createApi(status)
  const addon = new ElephantCodexAddon(harness.api)

  await addon.onload(harness.api)
  assert.equal(harness.contributions.length, 0)

  status.current = {
    installed: true,
    detected: true,
    running: true,
    connected: false,
    runtimePath: '/package/runtime/codex',
    version: 'codex-cli fixture'
  }
  assert.equal(addon.ensureProvider(status.current), true)
  assert.equal(harness.contributions.length, 1)
})
