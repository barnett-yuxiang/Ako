SHELL := /bin/bash

NAME := ako
DIST_DIR := dist
# Extract version from manifest.json without external deps
VERSION := $(shell sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' manifest.json | head -n 1)
ZIP := $(DIST_DIR)/$(NAME)-$(VERSION).zip

FILES := \
	manifest.json \
	popup.html \
	popup.css \
	popup.js \
	constants.js \
	logger.js \
	storage-manager.js \
	drag-drop-handler.js \
	ako-store.js \
	icons

.PHONY: package clean print-version check

# JavaScript syntax check using Node.js
check:
	@echo "🔍 Checking JavaScript syntax..."
	@for file in constants.js logger.js storage-manager.js drag-drop-handler.js ako-store.js popup.js; do \
		if node --check "$$file" 2>/dev/null; then \
			echo "  ✓ $$file"; \
		else \
			echo "  ❌ $$file has syntax errors:"; \
			node --check "$$file"; \
			exit 1; \
		fi \
	done
	@echo "✅ All JavaScript files passed syntax check"

package: check $(ZIP)
	@echo "📦 Created $(ZIP)"

$(ZIP): $(FILES)
	@mkdir -p $(DIST_DIR)
	@rm -f $(ZIP)
	@zip -r -q $(ZIP) $(FILES) -x "**/.DS_Store" "__MACOSX" "*.zip"

print-version:
	@echo $(VERSION)

clean:
	@rm -rf $(DIST_DIR)
