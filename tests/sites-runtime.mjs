import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const builderSource = await readFile(new URL('../official/sites/site-builder.js', import.meta.url), 'utf8')
const builderUrl = `data:text/javascript;base64,${Buffer.from(builderSource).toString('base64')}`
const rawMain = await readFile(new URL('../official/sites/main.js', import.meta.url), 'utf8')
const mainSource = rawMain.replace("from './site-builder'", `from '${builderUrl}'`)
const { default: SitesAddon } = await import(`data:text/javascript;base64,${Buffer.from(mainSource).toString('base64')}`)

const textWrites = new Map()
const binaryWrites = new Map()
const operations = []
const opened = []
const storage = new Map()
const notes = new Map([
  ['Sites/index.md', '# Home\n\n![Logo](assets/logo.png)\n\n![Shared](../.assets/shared.png)\n\n[[Guide]]'],
  ['Sites/Guide.md', '# Guide\n\n[Home](index.md)']
])
const sourceBinaries = new Map([
  ['Sites/assets/logo.png', 'bG9nbw=='],
  ['.assets/shared.png', 'c2hhcmVk']
])

const tauriWindow = {
  __TAURI__: {
    core: {
      convertFileSrc: (path) => `asset://${path}`,
      invoke: async (command, payload = {}) => {
        operations.push({ command, payload })
        if (command === 'tauri_addons_assets_allow_directory') {
          const suffix = payload.relativePath === '.' ? '' : `/${payload.relativePath}`
          return { relativePath: payload.relativePath, path: `/vault${suffix}` }
        }
        if (command === 'tauri_addons_notes_list') {
          return [...notes.keys()].map((path) => ({ path }))
        }
        if (command === 'tauri_addons_notes_read') {
          return { path: payload.path, markdown: notes.get(payload.path) }
        }
        if (command === 'tauri_addons_call') {
          assert.equal(payload.method, 'notes.write')
          textWrites.set(payload.params.path, payload.params.content)
          return { ok: true }
        }
        if (command === 'tauri_vault_remove_path') {
          if (![...textWrites.keys(), ...binaryWrites.keys()].some((path) => path.startsWith(payload.pathname))) {
            throw new Error('No such file or directory (os error 2)')
          }
          for (const key of [...textWrites.keys()]) if (key.startsWith(payload.pathname)) textWrites.delete(key)
          for (const key of [...binaryWrites.keys()]) if (key.startsWith(payload.pathname)) binaryWrites.delete(key)
          return { ok: true }
        }
        if (command === 'tauri_vault_ensure_dir') return { ok: true }
        if (command === 'tauri_vault_read_binary') {
          const dataBase64 = sourceBinaries.get(payload.pathname)
          if (!dataBase64) throw new Error(`Missing mock binary ${payload.pathname}`)
          return { ok: true, dataBase64 }
        }
        if (command === 'tauri_vault_write_binary') {
          binaryWrites.set(payload.pathname, payload.dataBase64)
          return { ok: true }
        }
        throw new Error(`Unexpected command ${command}`)
      }
    },
    opener: {
      openPath: async (path) => opened.push(path),
      openUrl: async (url) => opened.push(url)
    }
  }
}

const api = {
  experimental: { window: tauriWindow },
  storage: {
    get: async (key) => storage.get(key) ?? null,
    set: async (key, value) => { storage.set(key, value) }
  },
  app: { emit: () => {} }
}

const addon = new SitesAddon(api)
const build = await addon.generate({ sourceDirectory: 'Sites', mode: 'build' })
assert.equal(build.pages, 2)
assert.equal(build.assets, 2)
assert.match(textWrites.get(`${build.relativePath}/index.html`), /assets\/content\/assets\/logo\.png/)
assert.match(textWrites.get(`${build.relativePath}/index.html`), /assets\/vault\/\.assets\/shared\.png/)
assert.equal(binaryWrites.get(`${build.relativePath}/assets/content/assets/logo.png`), 'bG9nbw==')
assert.equal(binaryWrites.get(`${build.relativePath}/assets/vault/.assets/shared.png`), 'c2hhcmVk')
assert.ok(operations.find(({ command }) => command === 'tauri_vault_remove_path'))

await addon.openExternal(build)
assert.equal(opened.at(-1), build.indexPath)

const preview = await addon.generate({ sourceDirectory: 'Sites', mode: 'preview' })
assert.ok(textWrites.has(`${preview.relativePath}/index.html`))
const stopped = await addon.stopPreview(preview.siteId)
assert.equal(stopped.cleaned, true)
assert.equal(textWrites.has(`${preview.relativePath}/index.html`), false)

console.log('Sites runtime integration checks passed')
