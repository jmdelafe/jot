// swift-tools-version:6.2
import Foundation
import PackageDescription

// On a Command Line Tools-only install (no full Xcode.app), `swiftc` does
// not automatically search CLT's own Developer/Frameworks directory, so the
// bundled Swift Testing framework can't be found by `swift test` without
// help. Xcode-based toolchains don't need this, so it's added conditionally.
let cltTestingFrameworksPath = "/Library/Developer/CommandLineTools/Library/Developer/Frameworks"
let cltTestingInteropLibPath = "/Library/Developer/CommandLineTools/Library/Developer/usr/lib"
var testTargetSwiftSettings: [SwiftSetting] = []
var testTargetLinkerSettings: [LinkerSetting] = []
if FileManager.default.fileExists(atPath: cltTestingFrameworksPath + "/Testing.framework") {
    testTargetSwiftSettings.append(.unsafeFlags(["-F", cltTestingFrameworksPath]))
    testTargetLinkerSettings.append(.unsafeFlags([
        "-F", cltTestingFrameworksPath, "-framework", "Testing",
        "-Xlinker", "-rpath", "-Xlinker", cltTestingFrameworksPath,
        "-Xlinker", "-rpath", "-Xlinker", cltTestingInteropLibPath
    ]))
}

let package = Package(
    name: "Jot",
    platforms: [.macOS(.v26)],
    targets: [
        // Pure-Foundation logic (JSON model, bridge protocol, persistence).
        // Kept AppKit/WebKit-free so it can be exercised by JotTestRunner
        // without needing to link UI frameworks.
        .target(
            name: "JotCore",
            path: "Sources/JotCore"
        ),
        .executableTarget(
            name: "Jot",
            dependencies: ["JotCore"],
            path: "Sources/Jot",
            resources: [
                .copy("Resources/editor")
            ]
        ),
        // NOTE: `swift test` / `.testTarget` does not actually execute tests
        // on this machine's CLT-only (no Xcode.app) Swift 6.3.3 toolchain —
        // it builds the .xctest bundle successfully but the SwiftPM test
        // driver never invokes it (confirmed with a minimal, from-scratch
        // reproduction package: `swift test` reports "Build complete!" and
        // exits 0 even with a deliberately failing `#expect`). Instead,
        // JotTestRunner is a plain executable that calls Swift Testing's
        // entry point directly (`Testing.__swiftPMEntryPoint()`), which
        // does produce real console output and a correct exit code. See
        // README.md for details.
        .executableTarget(
            name: "JotTestRunner",
            dependencies: ["JotCore"],
            path: "Sources/JotTestRunner",
            swiftSettings: testTargetSwiftSettings,
            linkerSettings: testTargetLinkerSettings
        )
    ]
)
