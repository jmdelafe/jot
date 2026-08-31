APP_NAME := Jot
BUNDLE_ID := com.jmdelafe.jot
BUILD_DIR := build
APP_BUNDLE := $(BUILD_DIR)/$(APP_NAME).app
RELEASE_BIN := .build/release/$(APP_NAME)

.PHONY: bootstrap build test check bundle run clean

## Installs the editor's npm dependencies (only needed once, or after
## editor/package.json changes).
bootstrap:
	cd editor && npm install

## Builds the bundled editor (TipTap/ProseMirror) and the Swift app in debug
## mode. The editor build writes directly into
## Sources/Jot/Resources/editor/index.html, which SwiftPM then copies as an
## app resource.
build:
	cd editor && npm run build
	swift build

## Runs both halves' automated test suites.
##
## NOTE: `swift test` does not work on this machine's Command Line
## Tools-only (no Xcode.app) Swift 6.3.3 toolchain — it builds the
## `.xctest` bundle successfully but the SwiftPM test driver never invokes
## it (confirmed with a from-scratch minimal reproduction: `swift test`
## reports "Build complete!" and exits 0 even with a deliberately failing
## `#expect`). Swift tests instead live in the `JotTestRunner` executable
## target, which calls Swift Testing's entry point directly and is run via
## `swift run`. See README.md for details.
test:
	cd editor && npm run typecheck && npx vitest run
	swift run JotTestRunner

## Runs everything required before considering a change good: editor
## typecheck + tests + production build, and the Swift test runner + debug
## build.
check: test
	cd editor && npm run build
	swift build

## Assembles an ad-hoc-signed build/Jot.app from a release build.
bundle:
	cd editor && npm run build
	swift build -c release --product $(APP_NAME)
	rm -rf "$(APP_BUNDLE)"
	mkdir -p "$(APP_BUNDLE)/Contents/MacOS"
	mkdir -p "$(APP_BUNDLE)/Contents/Resources"
	cp "$(RELEASE_BIN)" "$(APP_BUNDLE)/Contents/MacOS/$(APP_NAME)"
	cp Packaging/Info.plist "$(APP_BUNDLE)/Contents/Info.plist"
	@resource_bundle=".build/release/$(APP_NAME)_$(APP_NAME).bundle"; \
	if [ -d "$$resource_bundle" ]; then \
		cp -R "$$resource_bundle" "$(APP_BUNDLE)/Contents/Resources/"; \
	else \
		echo "warning: expected resource bundle $$resource_bundle not found" >&2; exit 1; \
	fi
	codesign --sign - --entitlements Packaging/Jot.entitlements --force --deep "$(APP_BUNDLE)"
	@echo "Built $(APP_BUNDLE)"

## Bundles (if needed) and launches Jot.
run: bundle
	open "$(APP_BUNDLE)"

clean:
	rm -rf .build "$(BUILD_DIR)"
	cd editor && rm -rf dist node_modules/.vite
