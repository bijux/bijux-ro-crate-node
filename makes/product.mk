.PHONY: product-build product-types app-build app-check app-config-check app-test app-test-browser app-browser-install app-dev app-stop app-serve docs-build docs-serve

PLAYWRIGHT_BROWSERS_PATH ?= $(CURDIR)/artifacts/playwright

product-build:
	npm run build

product-types:
	npm run check:types

app-build: product-build
	npm run build --workspace @bijux/ro-crate-web

app-check: product-build
	npm run check --workspace @bijux/ro-crate-web

app-config-check:
	node --import tsx apps/web/config-check.mts

app-test: product-build
	npm test --workspace @bijux/ro-crate-web

app-browser-install:
	PLAYWRIGHT_BROWSERS_PATH="$(PLAYWRIGHT_BROWSERS_PATH)" npm exec -- playwright install chromium

app-test-browser: app-build
	PLAYWRIGHT_BROWSERS_PATH="$(PLAYWRIGHT_BROWSERS_PATH)" npm run test:e2e --workspace @bijux/ro-crate-web

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
