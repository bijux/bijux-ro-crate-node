import assert from 'node:assert/strict'
import type {PackageRecord} from './contracts.mjs'


export function assertPublicInventory(packages: PackageRecord[], workspaces: Array<Pick<PackageRecord, 'name' | 'directory' | 'version' | 'dependencies'>>) {
  const inventory = packages.map(({name, directory, version, dependencies}) => ({name, directory, version, dependencies}))
  assert.deepEqual(inventory, workspaces, 'Packed package inventory differs from public workspaces')
}

export function planConsumers<T>(packages: PackageRecord[], scenarios: ReadonlyMap<string, T>) {
  for (const item of packages) assert.match(item.directory, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Invalid consumer directory')
  const byName = new Map(packages.map(item => [item.name, item]))
  assert.equal(byName.size, packages.length, 'Duplicate public package')
  assert.equal(new Set(packages.map(item => item.directory)).size, packages.length, 'Duplicate consumer directory')
  assert.deepEqual([...scenarios.keys()].sort(), [...byName.keys()].sort(), 'Each public package requires exactly one installed scenario')
  return packages.map(item => {
    const included = new Set<string>()
    const active = new Set<string>()
    function visit(current: PackageRecord) {
      if (included.has(current.name)) return
      assert.ok(!active.has(current.name), 'Workspace dependency cycle')
      active.add(current.name)
      for (const [name, version] of Object.entries(current.dependencies)) {
        const dependency = byName.get(name)
        if (!dependency) continue
        assert.equal(dependency.version, version, 'Workspace dependency version mismatch: ' + name)
        visit(dependency)
      }
      active.delete(current.name)
      included.add(current.name)
    }
    visit(item)
    return {item, packages: packages.filter(dependency => included.has(dependency.name)), scenario: scenarios.get(item.name)!}
  })
}
