import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const builderSource = await readFile(new URL('../official/sites/site-builder.js', import.meta.url), 'utf8')
const builderModule = await import(`data:text/javascript;base64,${Buffer.from(builderSource).toString('base64')}`)
const mainSource = await readFile(new URL('../official/sites/main.js', import.meta.url), 'utf8')
const manifest = JSON.parse(await readFile(new URL('../official/sites/manifest.json', import.meta.url), 'utf8'))

assert.equal(builderModule.normalizeDirectory('Sites/demo'), 'Sites/demo')
assert.throws(() => builderModule.normalizeDirectory('../secret'))
assert.equal(builderModule.routeForMarkdown('index.md'), 'index.html')
assert.equal(builderModule.routeForMarkdown('guides/start.md'), 'guides/start/index.html')

const assetCalls = []
const plan = builderModule.createSitePlan({
  sourceDirectory: 'Sites',
  notes: [
    { path: 'Sites/index.md', markdown: '# Home\n\nGo to [[Guide]].\n\n![Logo](assets/logo.png)\n\n![Shared](../.assets/shared.png)\n\n[[Missing page]]' },
    { path: 'Sites/Guide.md', markdown: '# Guide\n\n[Home](index.md)\n\n| A | B |\n|---|---|\n| 1 | 2 |' }
  ],
  resolveAssetUrl: (path, context) => {
    assetCalls.push({ path, context })
    return context.wiki ? '#' : `asset://${path}`
  },
  generatedAt: '2026-07-17T00:00:00.000Z'
})

assert.equal(plan.pages.length, 2)
assert.match(plan.files.get('index.html'), /href="Guide\/"/)
assert.match(plan.files.get('index.html'), /asset:\/\/Sites\/assets\/logo\.png/)
assert.match(plan.files.get('index.html'), /asset:\/\/\.assets\/shared\.png/)
assert.match(plan.files.get('index.html'), /href="#"/)
assert.match(plan.files.get('Guide/index.html'), /<table>/)
assert.ok(plan.files.has('elephant-site.json'))
assert.ok(assetCalls.some(({ path, context }) => path === '.assets/shared.png' && context.pageRoute === 'index.html' && context.wiki === false))
assert.ok(assetCalls.some(({ context }) => context.wiki === true))
assert.throws(() => builderModule.createSitePlan({
  sourceDirectory: 'Sites',
  notes: [
    { path: 'Sites/Foo.md', markdown: '# Foo' },
    { path: 'Sites/Foo/index.md', markdown: '# Foo index' }
  ],
  resolveAssetUrl: (path) => `asset://${path}`
}), /same site route/)

assert.match(mainSource, /api\.settings\.registerSection\(/)
assert.doesNotMatch(mainSource, /workspace\.registerView\(/)
assert.doesNotMatch(mainSource, /workspace\.openView\(/)
assert.match(mainSource, /tauri_vault_read_binary/)
assert.match(mainSource, /tauri_vault_write_binary/)
assert.match(mainSource, /tauri_vault_remove_path/)
assert.match(mainSource, /joinPath\('assets', 'content'/)
assert.match(mainSource, /joinPath\('assets', 'vault'/)
assert.equal(manifest.version, '1.4.0')
assert.equal(manifest.contributes.settings, true)
assert.equal(manifest.contributes.views, undefined)
assert.equal(manifest.contributes.layout, undefined)
assert.ok(manifest.permissions.notes.write.includes('.elephantnote/site-previews/**'))
assert.ok(manifest.permissions.notes.write.includes('.elephantnote/site-builds/**'))

console.log('Sites regression checks passed')
