BIJUX_MAKE_COMPONENTS := node
BIJUX_STD_CAPABILITIES := node
export BIJUX_STD_CAPABILITIES

BIJUX_LINT_TARGETS += node-check bijux-standard-check
BIJUX_TEST_TARGETS += node-test
BIJUX_CI_FAST_TARGETS += node-check node-test
BIJUX_CI_PR_TARGETS += node-check node-test bijux-std-checks bijux-standard-check

include $(CURDIR)/.bijux/shared/bijux-makes/bijux.mk
include $(CURDIR)/makes/standards.mk
