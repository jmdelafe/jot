APP_NAME := Jot
BUILD_DIR := build
APP_BUNDLE := $(BUILD_DIR)/$(APP_NAME).app

.PHONY: bootstrap editor build test test-editor test-swift test-release check bundle dist run release clean

## Installs the exact editor dependencies recorded in the lockfile.
bootstrap:
	cd editor && npm ci

editor:
	cd editor && npm run build

## Builds the bundled editor and the Swift app in debug mode.
build: editor
	swift build --product $(APP_NAME)

test: test-editor test-swift test-release

test-editor:
	cd editor && npm run typecheck && npm test

## The native backend loads Swift Testing macros on CLT-only toolchains.
## Keep its cache separate from the app's default build backend.
test-swift:
	swift run --build-system native --scratch-path .build/testing JotTestRunner
	swiftc Sources/Jot/Panel/JotPanel.swift scripts/panel-shortcuts-test.swift -o .build/testing/panel-shortcuts-test
	.build/testing/panel-shortcuts-test

test-release:
	scripts/check-release-tag-test.sh
	node --test scripts/third-party-notices.test.mjs

check: test build

## Ad-hoc signed, not Developer ID signed or notarized.
bundle: editor
	swift build -c release --product $(APP_NAME)
	@set -eu; \
	bin_dir="$$(swift build -c release --show-bin-path)"; \
	resource_bundle="$$bin_dir/$(APP_NAME)_$(APP_NAME).bundle"; \
	if [ ! -x "$$bin_dir/$(APP_NAME)" ] || [ ! -d "$$resource_bundle" ]; then \
		echo "error: release executable or resource bundle missing in $$bin_dir" >&2; exit 1; \
	fi; \
	rm -rf "$(APP_BUNDLE)"; \
	mkdir -p "$(APP_BUNDLE)/Contents/MacOS" "$(APP_BUNDLE)/Contents/Resources"; \
	cp "$$bin_dir/$(APP_NAME)" "$(APP_BUNDLE)/Contents/MacOS/$(APP_NAME)"; \
	cp -R "$$resource_bundle" "$(APP_BUNDLE)/Contents/Resources/"
	cp Packaging/Info.plist "$(APP_BUNDLE)/Contents/Info.plist"
	cp Packaging/AppIcon.icns "$(APP_BUNDLE)/Contents/Resources/AppIcon.icns"
	cp LICENSE "$(APP_BUNDLE)/Contents/Resources/LICENSE.txt"
	node scripts/third-party-notices.mjs > "$(APP_BUNDLE)/Contents/Resources/THIRD_PARTY_NOTICES.txt"
	@resources="$(APP_BUNDLE)/Contents/Resources/$(APP_NAME)_$(APP_NAME).bundle"; \
	test -s "$$resources/Contents/Resources/editor/index.html" || \
	test -s "$$resources/editor/index.html" || \
	{ echo "error: packaged editor is missing" >&2; exit 1; }
	plutil -lint "$(APP_BUNDLE)/Contents/Info.plist"
	codesign --sign - --entitlements Packaging/Jot.entitlements --force "$(APP_BUNDLE)"
	codesign --verify --deep --strict "$(APP_BUNDLE)"
	@echo "Built $(APP_BUNDLE)"

## Apple Silicon download, with the same ad-hoc signature as local builds.
dist: bundle
	@test "$$(lipo -archs "$(APP_BUNDLE)/Contents/MacOS/$(APP_NAME)")" = arm64 || \
		{ echo "error: release downloads must contain only arm64 code; build on Apple Silicon" >&2; exit 1; }
	mkdir -p "$(BUILD_DIR)/release"
	ditto -c -k --sequesterRsrc --keepParent "$(APP_BUNDLE)" "$(BUILD_DIR)/release/Jot-macos-arm64.zip"
	unzip -tq "$(BUILD_DIR)/release/Jot-macos-arm64.zip"
	cd "$(BUILD_DIR)/release" && shasum -a 256 Jot-macos-arm64.zip > checksums.txt && shasum -a 256 -c checksums.txt

## Bundles (if needed) and launches Jot.
run: bundle
	open "$(APP_BUNDLE)"

## Tags origin/master as v$(VERSION) (SemVer) and pushes it to trigger the
## Release workflow, e.g. `make release VERSION=0.1.0-alpha.1`.
release:
	@test -n "$(VERSION)" || { echo "usage: make release VERSION=0.1.0-alpha.1" >&2; exit 1; }
	scripts/release.sh "$(VERSION)"

clean:
	rm -rf .build "$(BUILD_DIR)" Sources/Jot/Resources/editor
	cd editor && rm -rf dist node_modules/.vite
