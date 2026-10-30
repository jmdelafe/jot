APP_NAME := Jot
BUILD_DIR := build
APP_BUNDLE := $(BUILD_DIR)/$(APP_NAME).app

.PHONY: bootstrap editor build test test-editor test-swift check bundle run clean

## Installs the exact editor dependencies recorded in the lockfile.
bootstrap:
	cd editor && npm ci

editor:
	cd editor && npm run build

## Builds the bundled editor and the Swift app in debug mode.
build: editor
	swift build --product $(APP_NAME)

test: test-editor test-swift

test-editor:
	cd editor && npm run typecheck && npm test

## The native backend loads Swift Testing macros on CLT-only toolchains.
## Keep its cache separate from the app's default build backend.
test-swift:
	swift run --build-system native --scratch-path .build/testing JotTestRunner

check: test build

## Local development only: this is not a notarized distribution artifact.
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
	cp LICENSE "$(APP_BUNDLE)/Contents/Resources/LICENSE.txt"
	@resources="$(APP_BUNDLE)/Contents/Resources/$(APP_NAME)_$(APP_NAME).bundle"; \
	test -s "$$resources/Contents/Resources/editor/index.html" || \
	test -s "$$resources/editor/index.html" || \
	{ echo "error: packaged editor is missing" >&2; exit 1; }
	plutil -lint "$(APP_BUNDLE)/Contents/Info.plist"
	codesign --sign - --entitlements Packaging/Jot.entitlements --force "$(APP_BUNDLE)"
	codesign --verify --deep --strict "$(APP_BUNDLE)"
	@echo "Built $(APP_BUNDLE)"

## Bundles (if needed) and launches Jot.
run: bundle
	open "$(APP_BUNDLE)"

clean:
	rm -rf .build "$(BUILD_DIR)" Sources/Jot/Resources/editor
	cd editor && rm -rf dist node_modules/.vite
