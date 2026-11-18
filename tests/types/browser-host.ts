import {root, serve} from '../browser/host.mjs'

if (false) {
  const path: string = root
  const pending = serve(path)
  void pending.then(host => {
    const origin: string = host.origin
    const closed: Promise<unknown> = host.close()
    void [origin, closed]
  })
  // @ts-expect-error A server root is a filesystem path.
  serve(42)
}
