import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import {posix} from 'node:path'

/** Render repository Markdown without enabling raw HTML. */
export function renderDocument(source: string, path: string, recordLink: (href: string) => void = () => {}): string {
  const markdown = new MarkdownIt({html: false, linkify: true}).use(anchor)
  const original = markdown.renderer.rules.link_open ?? ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options))
  markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index]
    const href = token.attrGet('href')
    if (typeof href === 'string' && href && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) {
      recordLink(href)
      token.attrSet('href', href.replace(/\.md(?=([?#]|$))/i, '.html'))
    }
    return original(tokens, index, options, env, renderer)
  }
  const image = markdown.renderer.rules.image
  if (image) markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
    const src = tokens[index].attrGet('src')
    if (typeof src === 'string' && src && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) recordLink(src)
    return image(tokens, index, options, env, renderer)
  }
  const body = markdown.render(source)
  const title = (source.match(/^# +(.+)$/m)?.[1] ?? path).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] ?? c))
  const parent = posix.relative(posix.dirname(path), '.')
  const prefix = parent ? parent + '/' : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font:1rem/1.6 system-ui,sans-serif;color:#172940;max-width:68rem;margin:2rem auto;padding:0 1rem}pre{overflow:auto;background:#f2f5f8;padding:1rem}code{font-family:monospace}a{color:#205493}table{border-collapse:collapse}td,th{border:1px solid #ccd5df;padding:.4rem}img{max-width:100%}</style></head><body><nav aria-label="Documentation"><a href="${prefix}index.html">Home</a> · <a href="${prefix}contents.html">All guides</a></nav><main>${body}</main></body></html>`
}
