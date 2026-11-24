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
