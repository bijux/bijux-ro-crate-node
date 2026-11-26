.PHONY: product-build product-types

product-build:
	npm run build

product-types:
	npm run check:types
