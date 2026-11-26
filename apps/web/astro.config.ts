import {fileURLToPath} from 'node:url'
import {mkdirSync} from 'node:fs'
import {defineConfig} from 'astro/config'
import vue from '@astrojs/vue'
import node from '@astrojs/node'
import {boundaries} from './boundaries.js'
import {build} from 'esbuild'

const root = new URL('../../artifacts/web/project/', import.meta.url)
mkdirSync(root, {recursive: true})
export default defineConfig({
  root: fileURLToPath(root),
  srcDir: fileURLToPath(new URL('./src/', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
  output: 'server',
  adapter: node({mode: 'standalone'}),
  integrations: [vue(), {
    name: 'qualification-worker',
    hooks: {'astro:build:done': async () => {
      await build({entryPoints: [fileURLToPath(new URL('./src/server/qualification/worker.ts', import.meta.url)),
        fileURLToPath(new URL('./src/server/qualification/index.ts', import.meta.url))],
        outdir: fileURLToPath(new URL('../../artifacts/web/dist/server/qualification/', import.meta.url)), platform: 'node', format: 'esm',
        target: 'node22', bundle: true, outExtension: {'.js': '.mjs'}})
    }},
  }],
  vite: {plugins: [boundaries(fileURLToPath(new URL('../../', import.meta.url)))]},
  outDir: fileURLToPath(new URL('../../artifacts/web/dist/', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../../artifacts/cache/astro/', import.meta.url)),
})
