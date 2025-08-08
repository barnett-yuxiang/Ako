SHELL := /bin/bash

NAME := ako
DIST_DIR := dist
# Extract version from manifest.json without external deps
VERSION := $(shell sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' manifest.json | head -n 1)
ZIP := $(DIST_DIR)/$(NAME)-$(VERSION).zip

FILES := \
	manifest.json \
	popup.html \
	popup.js \
	popup.css \
	icons

.PHONY: package clean print-version

package: $(ZIP)
	@echo "Created $(ZIP)"

$(ZIP): $(FILES)
	@mkdir -p $(DIST_DIR)
	@rm -f $(ZIP)
	@zip -r -q $(ZIP) $(FILES) -x "**/.DS_Store" "__MACOSX" "*.zip"

print-version:
	@echo $(VERSION)

clean:
	@rm -rf $(DIST_DIR)
