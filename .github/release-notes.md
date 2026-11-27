**Apple Silicon macOS release.** Download `Jot-macos-arm64.zip` for the prebuilt
app, or use the source archives to build it yourself.

- **Requirements:** macOS 26+ on Apple Silicon. No build tools are needed for
  the prebuilt app; source builds require Swift 6.2+, Node.js 24+ and npm.
- **Verify:** download `checksums.txt` alongside the ZIP and run
  `shasum -a 256 -c checksums.txt`.
- **Install:** unzip, move `Jot.app` to `/Applications`, and open it. The app is
  ad-hoc signed, **not Developer ID signed or notarized**. If macOS blocks it
  and you trust the download, use **System Settings > Privacy & Security >
  Open Anyway** after the first launch attempt. See the
  [README](https://github.com/jmdelafe/jot#get-started) for details.
- **Before upgrading:** quit Jot and back up its notes folder. See
  [Data, privacy, and recovery](https://github.com/jmdelafe/jot#data-privacy-and-recovery).
- **Known limitations:** only Apple Silicon downloads are provided.
