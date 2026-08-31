import Testing

// This target exists because `swift test` does not execute tests on this
// machine's Command Line Tools-only Swift 6.3.3 toolchain: it builds the
// `.xctest` bundle successfully but the SwiftPM test driver never invokes
// it (confirmed independently with a minimal from-scratch package). Calling
// Swift Testing's own entry point from a plain executable sidesteps the
// broken `.xctest` bundle-execution path entirely and produces real,
// readable output plus a correct process exit code (0 on success, 1 on any
// failure) — see README.md for the full story.
@main
struct JotTestRunner {
    static func main() async {
        await Testing.__swiftPMEntryPoint() as Never
    }
}
