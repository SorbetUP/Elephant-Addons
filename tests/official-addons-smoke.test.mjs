import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const staticImportPattern = /(^|[;\n])(\s*(?:import|export)\s+(?:[^'";]+?\s+from\s+)?)(['"])([^'"]+)\3/gm

const normalizeModulePath = (value) => {
  const normalized = path.posix.normalize(String(value || '').replaceAll('\\', '/')).replace(/^\.\//, '')
  assert.ok(normalized && normalized !== '..' && !normalized.startsWith('../'), `Invalid addon module path: ${value}`)
  return normalized.endsWith('.js') ? normalized : `${normalized}.js`
}

const resolveRelativeModule = (parentPath, specifier) => {
  assert.ok(specifier.startsWith('.'), `Official addon imports an external dependency: ${specifier}`)
  return normalizeModulePath(path.posix.join(path.posix.dirname(parentPath), specifier))
}

const createModuleGraphLoader = () => {
  const moduleUrls = new Map()
  const loading = new Set()

  const load = async (requestedPath) => {
    const modulePath = normalizeModulePath(requestedPath)
    if (moduleUrls.has(modulePath)) return moduleUrls.get(modulePath)
    assert.equal(loading.has(modulePath), false, `Cyclic official addon module graph: ${modulePath}`)
    loading.add(modulePath)
    try {
      const source = await readFile(path.join(root, modulePath), 'utf8')
      const dependencies = new Map()
      for (const match of source.matchAll(staticImportPattern)) {
        const specifier = match[4]
        dependencies.set(specifier, await load(resolveRelativeModule(modulePath, specifier)))
      }
      const rewritten = source.replace(staticImportPattern, (full, boundary, statement, quote, specifier) => {
        const dependencyUrl = dependencies.get(specifier)
        return dependencyUrl ? `${boundary}${statement}${quote}${dependencyUrl}${quote}` : full
      })
      const url = `data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`
      moduleUrls.set(modulePath, url)
      return url
    } finally {
      loading.delete(modulePath)
    }
  }

  return { load }
}

test('every official addon entry loads through the trusted module graph', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8'))
  const loader = createModuleGraphLoader()

  for (const entry of catalog.addons) {
    const entryUrl = await loader.load(entry.entryPath)
    const addonModule = await import(entryUrl)
    assert.equal(typeof addonModule.default, 'function', `${entry.id} must export an addon class`)
    assert.ok(new addonModule.default({ experimental: { window: {} } }), `${entry.id} addon class must be constructible`)
  }
})
