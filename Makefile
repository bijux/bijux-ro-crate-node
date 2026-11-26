include makes/product.mk

ifeq ($(strip $(MAKECMDGOALS)),)
include makes/root.mk
else ifneq ($(strip $(filter-out product-build product-types app-build app-check app-test app-dev app-stop app-serve docs-build docs-serve,$(MAKECMDGOALS))),)
include makes/root.mk
endif
