# Study authoring application

The private `apps/web` workspace provides a local study editor. Astro owns the
page and Node server; a Vue editor uses creator's public document operations.
The current editor creates a study, edits its title, description and license,
and downloads RO-Crate metadata. The draft exists only in the open tab; a
metadata download does not include image payloads or save an editable backup.
Import and draft recovery are not available in this version.

The application requires Node.js 22.23.4 or a later supported even-numbered
release. This does not change the public packages' Node 22 compatibility floor.
From the repository root, run:

```sh
npm ci
npm run build
npm run dev --workspace @bijux/ro-crate-web
```

Use `npm run check --workspace @bijux/ro-crate-web` for Astro and Vue template
checks, `npm run test --workspace @bijux/ro-crate-web` for editor and boundary
checks, and `npm run build --workspace @bijux/ro-crate-web` followed by
`npm run test:e2e --workspace @bijux/ro-crate-web` for the built browser journey.
The browser test uses the repository's locked Playwright installation; set
`PLAYWRIGHT_BROWSERS_PATH` to the existing browser cache when needed.

App output and generated framework files are under `artifacts/`. Package
publication and installed-consumer qualification continue to discover public
workspaces under `packages/`; the app is private.

The private application compiler project sets `skipLibCheck: true` for
third-party declaration defects. Authored TypeScript remains strict, and
`astro check` and `vue-tsc` still check Astro and Vue templates. The app test
project and all public package compiler projects continue to check library
declarations. This exception does not alter the public packages' type policy.

With the locked Astro 7.4.13 and unstorage 1.17.6, checking third-party
declarations reports missing `AstroAdapterClientConfig` and `ContextProvider`
in published Astro declarations, despite their definitions in the matching
Astro sources for [adapter configuration](https://github.com/withastro/astro/blob/astro%407.4.13/packages/astro/src/types/public/integrations.ts#L98-L114)
and [request context](https://github.com/withastro/astro/blob/astro%407.4.13/packages/astro/src/core/fetch/fetch-state.ts#L84-L96).
The same check reports unresolved `@astrojs/markdown-remark` declarations and
unstorage optional session-provider types, including Cloudflare `KVNamespace`
and `db0`. No replacement ambient declarations are supplied.

To reproduce the vendor diagnostics from the repository root, run:

```sh
npm run build
mkdir -p artifacts/logs
./node_modules/.bin/vue-tsc --noEmit -p apps/web/tsconfig.json --skipLibCheck false > artifacts/logs/astro-vendor-types.log 2>&1
```

Remove the app-only exception when a supported Astro and unstorage dependency
set resolves these declarations. Verify the command above exits successfully,
then rerun the app checks and `npm run check:types` without the exception.
Until then, the app compiler does not verify third-party declaration internals.
