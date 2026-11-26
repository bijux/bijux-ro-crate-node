include makes/product.mk

ifeq ($(strip $(MAKECMDGOALS)),)
include makes/root.mk
else ifneq ($(strip $(filter-out product-build product-types,$(MAKECMDGOALS))),)
include makes/root.mk
endif
