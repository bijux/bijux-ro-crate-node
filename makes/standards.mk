BIJUX_STD_PIN_FILE := .github/standards/bijux-std.sha
BIJUX_STD_REF ?= $(strip $(shell cat "$(BIJUX_STD_PIN_FILE)"))
BIJUX_HELP_TARGETS += bijux-std-checks bijux-standard-check
BIJUX_HELP_bijux-std-checks := Verify shared libraries against the exact accepted source
BIJUX_HELP_bijux-standard-check := Verify canonical governance and owned workflow admission

.PHONY: bijux-std-checks bijux-standard-check
bijux-std-checks:
	@BIJUX_STD_REF="$(BIJUX_STD_REF)" BIJUX_STD_CAPABILITIES="$(BIJUX_STD_CAPABILITIES)" \
		BIJUX_STD_REQUIRE_REMOTE_MATCH=1 BIJUX_STD_STRICT_REMOTE=1 \
		bash .bijux/shared/bijux-checks/check-bijux-std.sh

bijux-standard-check:
	@bash scripts/standards/check.sh
