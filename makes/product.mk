.PHONY: product-build product-types app-build app-check app-test app-dev app-stop app-serve docs-build docs-serve

product-build:
	npm run build

product-types:
	npm run check:types

app-build: product-build
	npm run build --workspace @bijux/ro-crate-web

app-check: product-build
	npm run check --workspace @bijux/ro-crate-web

app-test: product-build
	npm test --workspace @bijux/ro-crate-web

app-dev: product-build
	npm run dev --workspace @bijux/ro-crate-web

app-serve: app-build
	node artifacts/web/dist/server/entry.mjs

app-stop:
	npm run dev --workspace @bijux/ro-crate-web -- stop

docs-build:
	npm run docs:build

docs-serve:
	npm run docs:serve
