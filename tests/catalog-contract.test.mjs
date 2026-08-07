import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const supportedAppVersion = '0.1.0'

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))

const parseVersion = (value) => {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  assert.ok(match, `invalid semantic version: ${value}`)
  return match.slice(1).map(Number)
}

const compareVersions = (left, right) => {
  const a = parseVersion(left)
  const b = parseVersion(right)
  return a.map((part, index) => part - b[index]).find((difference) => difference !== 0) || 0
}

test('every official addon declares the 0.1.0 application contract', async () => {
  const catalog = await readJson('catalog.json')
  assert.equal(catalog.packageRoot, 'official')
  assert.ok(Array.isArray(catalog.addons) && catalog.addons.length > 0)

  const ids = new Set()
  for (const entry of catalog.addons) {
    assert.equal(entry.official, true, `${entry.id} must be official`)
    assert.equal(ids.has(entry.id), false, `duplicate addon id: ${entry.id}`)
    ids.add(entry.id)

    const manifest = await readJson(entry.manifestPath)
    assert.equal(manifest.id, entry.id)
    assert.equal(manifest.version, entry.version)
    assert.equal(manifest.minAppVersion, supportedAppVersion, `${entry.id} minAppVersion drift`)
    assert.ok(compareVersions(supportedAppVersion, manifest.minAppVersion) >= 0)
    assert.equal(manifest.runtime?.type, 'javascript-worker')
    assert.equal(manifest.runtime?.entry, path.posix.basename(entry.entryPath))
    await access(path.join(root, entry.entryPath))
    if (manifest.permissions?.native === true && entry.requiresPlatformPackage === true) {
      assert.equal(entry.requiresPlatformPackage, true, `${entry.id} must publish native packages`)
      assert.ok(Object.keys(entry.packages || {}).length > 0, `${entry.id} has no published native packages`)
      for (const [platform, packageInfo] of Object.entries(entry.packages)) {
        assert.match(platform, /^(macos|linux|windows|android|ios)-(aarch64|x86_64|armv7|i686)$/)
        assert.match(packageInfo.hash, /^[0-9a-f]{64}$/i)
        await access(path.join(root, packageInfo.path))
      }
    }
  }
})

test('protected addon packs contain the catalog versions and only official addons', async () => {
  const catalog = await readJson('catalog.json')
  const versions = new Map(catalog.addons.map((entry) => [entry.id, entry.version]))
  for (const packName of ['packs/base.enaddonpack', 'packs/develop-parity.enaddonpack']) {
    const pack = await readJson(packName)
    assert.equal(pack.format, 'elephantnote-addon-pack')
    assert.equal(pack.version, 1)
    assert.equal(pack.protected, true)
    assert.ok(Array.isArray(pack.addons) && pack.addons.length > 0)
    for (const addon of pack.addons) {
      assert.equal(versions.get(addon.id), addon.version, `${packName}: ${addon.id} version drift`)
      assert.equal(addon.source, 'official', `${packName}: ${addon.id} is not official`)
      assert.equal(addon.enabled, true, `${packName}: ${addon.id} is disabled`)
    }
  }
})

test('example addons stay in the addon repository and target the released app', async () => {
  for (const slug of ['platform-proof', 'trusted-workspace-lab', 'finance-notes']) {
    const manifest = await readJson(`examples/addons/${slug}/manifest.json`)
    assert.equal(manifest.minAppVersion, supportedAppVersion, `${slug} minAppVersion drift`)
    await access(path.join(root, `examples/addons/${slug}`, manifest.runtime.entry))
  }
})
