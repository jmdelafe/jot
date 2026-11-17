**Source-only release.** There is no signed or notarized app download; build
Jot from the attached source archive.

- **Requirements:** macOS 26+, Swift 6.2+, Node.js 24+ and npm.
- **Install:** `make bootstrap && make run`. See the
  [README](https://github.com/jmdelafe/jot#install-from-source) for details.
- **Before upgrading:** quit Jot and back up its notes folder. See
  [Data, privacy, and recovery](https://github.com/jmdelafe/jot#data-privacy-and-recovery).
- **Known limitations:** the local build is ad-hoc signed, so Gatekeeper may
  flag it on another Mac. Pre-release versions (`-alpha`, `-beta`, `-rc`) may
  change behavior before the final release.
