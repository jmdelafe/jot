**Apple Silicon macOS alpha.** Download `Jot-macos-arm64.zip` for the prebuilt
app, or use the source archives to build it yourself.

- **Requirements:** macOS 26+ on Apple Silicon. No build tools are needed for
  the prebuilt app; source builds require Swift 6.2+, Node.js 24+ and npm.
- **Verify:** download `checksums.txt` alongside the ZIP and run
  `shasum -a 256 -c checksums.txt`.
- **Install:** unzip, move `Jot.app` to `/Applications`, and open it. The app is
  ad-hoc signed, **not Developer ID signed or notarized**. If macOS blocks it
  and you trust the download, use **System Settings > Privacy & Security >
  Open Anyway** after the first launch attempt. See the
  [README](https://github.com/jmdelafe/jot#install-a-prebuilt-app) for details.
- **Before upgrading:** quit Jot and back up its notes folder. See
  [Data, privacy, and recovery](https://github.com/jmdelafe/jot#data-privacy-and-recovery).
- **Known limitations:** only Apple Silicon downloads are provided.
  Pre-release versions (`-alpha`, `-beta`, `-rc`) may change behavior before
  the final release.
- **Known dependency advisory:** build/test tooling uses picomatch affected by
  [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
  with no patched version available as of 2026-11-17. Do not use untrusted glob
  patterns with those tools. The CI exception expires on 2026-12-01 at 00:00 UTC;
  other advisories remain blocking.
