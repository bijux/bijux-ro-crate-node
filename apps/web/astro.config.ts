import {fileURLToPath} from 'node:url'
import {mkdirSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {defineConfig} from 'astro/config'
import vue from '@astrojs/vue'
import node from '@astrojs/node'
import {boundaries} from './boundaries.js'
import {build} from 'esbuild'
import {validateBssStartup} from './src/server/bss/startup.js'

const root = new URL('../../artifacts/web/project/', import.meta.url)
mkdirSync(root, {recursive: true})
export default defineConfig({
  root: fileURLToPath(root),
  srcDir: fileURLToPath(new URL('./src/', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
  output: 'server',
  build: {assetsPrefix: '.'},
  session: false,
  adapter: node({mode: 'standalone'}),
  integrations: [vue(), {
    name: 'qualification-worker',
    hooks: {'astro:build:done': async () => {
      await build({entryPoints: [fileURLToPath(new URL('./src/server/qualification/worker.ts', import.meta.url)),
        fileURLToPath(new URL('./src/server/qualification/index.ts', import.meta.url))],
        outdir: fileURLToPath(new URL('../../artifacts/web/dist/server/qualification/', import.meta.url)), platform: 'node', format: 'esm',
        target: 'node22', bundle: true, outExtension: {'.js': '.mjs'}})
    }},
  }, {
    name: 'bss-startup-validation',
    hooks: {'astro:server:setup': () => validateBssStartup(process.env), 'astro:build:done': async () => {
      const server = new URL('../../artifacts/web/dist/server/', import.meta.url)
      await build({entryPoints: [fileURLToPath(new URL('./src/server/bss/startup-entry.ts', import.meta.url))],
        outfile: fileURLToPath(new URL('bss-startup.mjs', server)), platform: 'node', format: 'esm', target: 'node22', bundle: true})
      const entry = new URL('entry.mjs', server)
      await writeFile(entry, "import './bss-startup.mjs'\n" + await readFile(entry, 'utf8'))
    }},
  }],
  vite: {base: './', plugins: [boundaries(fileURLToPath(new URL('../../', import.meta.url)))]},
  outDir: fileURLToPath(new URL('../../artifacts/web/dist/', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../../artifacts/cache/astro/', import.meta.url)),
})
