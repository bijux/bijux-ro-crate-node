import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import * as shards from '../../../scripts/ci/root-test-shards.mts'
const {collectRootTestLanes, partitionRootTests} = shards

test('root test lanes preserve every selected file exactly once', async () => {
  const {all, lanes} = await collectRootTestLanes()
  const files = Object.entries(lanes).filter(([name]) => !name.startsWith('installed-workspaces-')).flatMap(([, paths]) => paths)
  files.push(lanes['installed-workspaces-contracts'][0])
  assert.equal(new Set(files).size, files.length)
  assert.deepEqual([...files].sort(), [...all].sort())
  for (const lane of ['workspace-build', 'installed-workspaces-contracts', 'installed-workspaces-scenarios', 'installed-workspaces-assets', 'compiler-contract']) assert.equal(lanes[lane].length, 1)
})

test('installed workspace lanes select every case exactly once', async () => {
  const {lanes} = await collectRootTestLanes()
  const contents = await readFile(new URL('../packages/installed-workspaces.test.ts', import.meta.url), 'utf8')
  const source = ts.createSourceFile('installed-workspaces.test.ts', contents, ts.ScriptTarget.Latest, true)
  const names: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && node.expression.text === 'test') ||
        (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'test'))) {
      const name = node.arguments[0]
      if (ts.isStringLiteral(name)) names.push(name.text)
      else {
        assert.ok(ts.isIdentifier(name), 'Test names must be statically discoverable')
        let loop: ts.Node | undefined = node.parent
        while (loop && !ts.isForOfStatement(loop)) loop = loop.parent
        assert.ok(loop && ts.isForOfStatement(loop), 'Dynamic test names require a literal case table')
        const values = ts.isAsExpression(loop.expression) ? loop.expression.expression : loop.expression
        assert.ok(ts.isArrayLiteralExpression(values), 'Test cases must be a literal array')
        for (const item of values.elements) {
          assert.ok(ts.isArrayLiteralExpression(item) && item.elements.length === 2 && ts.isStringLiteral(item.elements[1]), 'Test case must declare a literal name')
          names.push(item.elements[1].text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(names.length > 0, 'No installed workspace cases found')
  assert.equal(new Set(names).size, names.length, 'Duplicate installed workspace case name')
  const selectors = Object.keys(lanes).filter(name => name.startsWith('installed-workspaces-')).map(name => {
    const args = shards.rootTestLaneArgs(name, lanes[name])
    assert.equal(args[0], '--test-name-pattern')
    const selector = new RegExp(args[1])
    assert.equal(selector.test('tests/tooling/packages/installed-workspaces.test.ts'), false, 'A selector must not match the test-file ancestor')
    return selector
  })
  for (const name of names) assert.equal(selectors.filter(selector => selector.test(name)).length, 1, name)
})

test('root test lanes reject duplicate files and missing isolated tests', () => {
  assert.throws(() => partitionRootTests(['tests/tooling/build/workspace.test.ts', 'tests/tooling/build/workspace.test.ts']), /Duplicate/)
  assert.throws(() => partitionRootTests(['tests/ci/example.test.ts']), /Missing isolated root test/)
})
