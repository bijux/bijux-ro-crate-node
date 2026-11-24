import {fileURLToPath} from 'node:url'
import {mkdirSync} from 'node:fs'
import {defineConfig} from 'astro/config'
import vue from '@astrojs/vue'
import node from '@astrojs/node'
import {boundaries} from './boundaries.js'

const root = new URL('../../artifacts/web/project/', import.meta.url)
mkdirSync(root, {recursive: true})
export default defineConfig({
  root: fileURLToPath(root),
  srcDir: fileURLToPath(new URL('./src/', import.meta.url)),
  output: 'server',
  adapter: node({mode: 'standalone'}),
  integrations: [vue()],
  vite: {plugins: [boundaries(fileURLToPath(new URL('../../', import.meta.url)))]},
  outDir: fileURLToPath(new URL('../../artifacts/web/dist/', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../../artifacts/cache/astro/', import.meta.url)),
})
