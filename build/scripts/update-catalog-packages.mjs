import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const releaseRoot = resolve(root, 'build/out/addons/releases')
const catalogPath = join(root, 'catalog.json')
const desktopPlatforms = ['linux-x86_64', 'windows-x86_64', 'macos-x86_64', 'macos-aarch64']
const mobilePlatforms = ['android-aarch64', 'android-x86_64', 'ios-aarch64', 'ios-x86_64']
const nativeIds = [
  'elephant.ai-ocr',
  'elephant.code-execution',
  'elephant.codex-connection',
  'elephant.knowledge',
  'elephant.open-models',
  'elephant.sync'
]

const fail = (message) => {
  throw new Error(`[catalog-packages] ${message}`)
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const filesUnder = (directory) => {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

if (!existsSync(releaseRoot)) fail(`missing package output directory: ${releaseRoot}`)

const catalog = readJson(catalogPath)
const entries = new Map(catalog.addons.map((entry) => [entry.id, entry]))
const metadataFiles = filesUnder(releaseRoot).filter((path) => path.endsWith('.enaddon.json'))
const published = new Map()

for (const metadataPath of metadataFiles) {
  const metadata = readJson(metadataPath)
  const archivePath = metadataPath.slice(0, -'.json'.length)
  const entry = entries.get(metadata.id)
  if (!entry) fail(`package ${metadata.id} is absent from catalog.json`)
  if (!existsSync(archivePath)) fail(`archive missing next to ${metadataPath}`)
  if (metadata.version !== entry.version) fail(`${metadata.id} package version ${metadata.version} does not match ${entry.version}`)
  if (!/^[0-9a-f]{64}$/i.test(metadata.blake3 || '')) fail(`${metadata.id} package has an invalid BLAKE3 hash`)
  if (!metadata.catalogPath?.startsWith(`official/${entry.slug}/releases/`) || !metadata.catalogPath.endsWith('.enaddon')) {
    fail(`${metadata.id} package path escapes its official release directory`)
  }

  const destination = resolve(root, metadata.catalogPath)
  if (relative(root, destination).startsWith('../')) fail(`${metadata.id} package path escapes repository root`)
  mkdirSync(resolve(destination, '..'), { recursive: true })
  copyFileSync(archivePath, destination)
  copyFileSync(metadataPath, `${destination}.json`)

  entry.requiresPlatformPackage = true
  entry.packages ??= {}
  entry.packages[metadata.platform] = { path: metadata.catalogPath, hash: metadata.blake3.toLowerCase() }
  delete entry.packagePath
  delete entry.packageHash
  published.set(`${metadata.id}:${metadata.platform}`, true)
}

for (const id of nativeIds) {
  const entry = entries.get(id)
  if (!entry) fail(`native addon ${id} is absent from catalog.json`)
  const expected = [...desktopPlatforms, ...(id === 'elephant.code-execution' ? mobilePlatforms : [])]
  const actual = Object.keys(entry.packages || {}).sort()
  if (actual.join('|') !== [...expected].sort().join('|')) {
    fail(`${id} platform matrix mismatch: expected ${expected.join(', ')}, got ${actual.join(', ')}`)
  }
}

catalog.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
catalog.addons.sort((left, right) => String(left.name).localeCompare(String(right.name)) || left.id.localeCompare(right.id))
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`[catalog-packages] synchronized ${published.size} platform packages`)
