import assert from 'node:assert/strict'
import {execFileSync, spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {dirname, resolve, relative, sep} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const projectPath = (file: string) => relative(root, file).split(sep).join('/')

test('TypeScript language service discovers the intended projects', {timeout: 60_000}, async t => {
  const server = spawn(process.execPath, [require.resolve('typescript/lib/tsserver.js')], {cwd: root, stdio: ['pipe', 'pipe', 'pipe']})
  t.after(() => server.kill())
  let buffer = Buffer.alloc(0)
  let sequence = 0
  const pending = new Map<number, {resolve: (value: unknown) => void, reject: (error: Error) => void}>()
  server.on('error', error => {for (const item of pending.values()) item.reject(error); pending.clear()})
  server.on('exit', (code, signal) => {
    for (const item of pending.values()) item.reject(new Error(`TypeScript server exited: ${code ?? signal}`))
    pending.clear()
  })
  server.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const boundary = buffer.indexOf('\r\n\r\n')
      if (boundary < 0) return
      const match = /Content-Length: (\d+)/i.exec(buffer.subarray(0, boundary).toString())
      if (!match) throw new Error('TypeScript server omitted Content-Length')
      const length = Number(match[1])
      if (buffer.length < boundary + 4 + length) return
      const response = JSON.parse(buffer.subarray(boundary + 4, boundary + 4 + length).toString()) as {
        type: string, request_seq?: number, success?: boolean, message?: string, body?: unknown
      }
      buffer = buffer.subarray(boundary + 4 + length)
      if (response.type !== 'response' || response.request_seq === undefined) continue
      const item = pending.get(response.request_seq)
      if (!item) continue
      pending.delete(response.request_seq)
      if (response.success) item.resolve(response.body)
      else item.reject(new Error(response.message ?? 'TypeScript server request failed'))
    }
  })
  function send(command: string, args: object): void {
    server.stdin.write(JSON.stringify({seq: ++sequence, type: 'request', command, arguments: args}) + '\n')
  }
  function request(command: string, args: object): Promise<unknown> {
    const id = ++sequence
    return new Promise((resolveRequest, reject) => {
      pending.set(id, {resolve: resolveRequest, reject})
      server.stdin.write(JSON.stringify({seq: id, type: 'request', command, arguments: args}) + '\n')
    })
  }
  const examples = [
    ['packages/validator/tests/manifest/format.test.ts', 'packages/validator/tests/tsconfig.json'],
    ['packages/core/tests/path-names.test.ts', 'packages/core/tests/tsconfig.json'],
    ['scripts/typecheck.mts', 'tsconfig.tooling.json'],
    ['tests/tooling/reference/url-authority-fixtures.test.ts', 'tests/tooling/tsconfig.tests.json'],
    ['tests/browser/observe-worker.mts', 'tests/browser/tsconfig.worker.json'],
    ['tests/package/receipts.mts', 'tests/package/tsconfig.consumers.json'],
    ['tests/types/browser.ts', 'tests/types/tsconfig.browser.json'],
    ['tests/types/node.ts', 'tests/types/tsconfig.node.json'],
  ] as const
  for (const [source, project] of examples) {
    const file = resolve(root, source)
    send('open', {file})
    const info = await request('projectInfo', {file, needFileNameList: false}) as {configFileName: string}
    assert.equal(projectPath(info.configFileName), project, source)
    const diagnostics = await request('semanticDiagnosticsSync', {file, includeLinePosition: true})
    assert.deepEqual(diagnostics, [], source)
    send('close', {file})
  }
})

test('every tracked TypeScript file is directly discoverable by an editor project', () => {
  const solutionPath = resolve(root, 'tsconfig.json')
  const solution = ts.readConfigFile(solutionPath, ts.sys.readFile)
  assert.equal(solution.error, undefined)
  const references = (solution.config as {references: {path: string}[]}).references.map(item => item.path)
  const projects = new Map<string, Set<string>>()
  function projectFiles(path: string): Set<string> {
    const existing = projects.get(path)
    if (existing) return existing
    const config = ts.readConfigFile(path, ts.sys.readFile)
    assert.equal(config.error, undefined, projectPath(path))
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(path))
    assert.deepEqual(parsed.errors, [], projectPath(path))
    const files = new Set(parsed.fileNames.map(projectPath))
    projects.set(path, files)
    return files
  }
  const referenced = new Set(references.flatMap(project => [...projectFiles(resolve(root, project))]))
  const files = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0')
  const missing = files.filter(file => {
    if (!/\.(?:ts|mts|cts|tsx)$/.test(file)) return false
    const nearest = ts.findConfigFile(dirname(resolve(root, file)), ts.sys.fileExists)
    if (!nearest) return true
    return !(projectPath(nearest) === projectPath(solutionPath) ? referenced : projectFiles(nearest)).has(file)
  })
  assert.deepEqual(missing, [])
})
