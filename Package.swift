// swift-tools-version:6.2
import Foundation
import PackageDescription

// JotTestRunner is a plain executable rather than a test bundle (see the
// note on that target), so SwiftPM doesn't give it the search and runtime
// paths for the Swift Testing framework that test bundles get. Point it at
// the Testing.framework that ships with the *active* developer directory:
//   - Command Line Tools: <dir>/Library/Developer/Frameworks
//   - Xcode: <dir>/Platforms/MacOSX.platform/Developer/Library/Frameworks
//
// It has to be the active toolchain's copy: the compiler's Swift Testing
// macros must pair with the framework from the same toolchain, and a
// Command Line Tools install sitting next to Xcode (as on GitHub-hosted
// macOS runners) can ship a different, incompatible version.
let cltDeveloperPath = "/Library/Developer/CommandLineTools"

// `xcode-select -p` honors DEVELOPER_DIR, matching the toolchain that builds
// this package. If it can't be determined, assume Command Line Tools.
func activeDeveloperPath() -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/xcode-select")
    process.arguments = ["-p"]
    let output = Pipe()
    process.standardOutput = output
    process.standardError = FileHandle.nullDevice
    guard (try? process.run()) != nil else { return cltDeveloperPath }
    let data = try? output.fileHandleForReading.readToEnd()
    process.waitUntilExit()
    guard process.terminationStatus == 0, let data else { return cltDeveloperPath }
    let path = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    return path.isEmpty ? cltDeveloperPath : path
}

// Directories holding Testing.framework and the libraries it loads
// (`_TestingInterop`), for the active toolchain. Nil if it has neither.
func activeTestingPaths() -> (frameworks: String, libraries: String)? {
    let developerPath = activeDeveloperPath()
    let xcodePlatformPath = developerPath + "/Platforms/MacOSX.platform/Developer"
    let candidates = [
        (frameworks: developerPath + "/Library/Developer/Frameworks",
         libraries: developerPath + "/Library/Developer/usr/lib"),
        (frameworks: xcodePlatformPath + "/Library/Frameworks",
         libraries: xcodePlatformPath + "/usr/lib"),
    ]
    return candidates.first {
        FileManager.default.fileExists(atPath: $0.frameworks + "/Testing.framework")
    }
}

var testTargetSwiftSettings: [SwiftSetting] = []
var testTargetLinkerSettings: [LinkerSetting] = []
if let testing = activeTestingPaths() {
    testTargetSwiftSettings.append(.unsafeFlags(["-F", testing.frameworks]))
    testTargetLinkerSettings.append(.unsafeFlags([
        "-F", testing.frameworks, "-framework", "Testing",
        "-Xlinker", "-rpath", "-Xlinker", testing.frameworks,
        "-Xlinker", "-rpath", "-Xlinker", testing.libraries
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
