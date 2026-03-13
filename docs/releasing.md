---
summary: "Release checklist + Homebrew tap update."
---

# Releasing

## Goals

- Ship npm packages (core first, then CLI).
- Tag + GitHub release.
- Update the macOS-only Homebrew tap so `brew install steipete/tap/summarize` matches latest tag.

## Checklist

1. `scripts/release.sh all` (gates → build → verify → publish → smoke → tag → tap).
2. Create GitHub release for the new tag (match version, attach notes/assets as needed).
3. If you didn’t run `tap` in the script, update the Homebrew tap formula for `summarize`:
   - Bump version to the new tag.
   - Update tarball URL + SHA256 for the new release.
   - Keep the formula guarded as macOS-only; Linux installs must fail clearly and point users to npm until Linux artifacts exist.
4. Verify Homebrew install reflects the new version:
   - macOS: `brew install steipete/tap/summarize`
   - macOS: `summarize --version` matches tag.
   - macOS: run a feature added in the release (e.g. `summarize daemon install` for v0.8.2).
   - Linux: `brew install steipete/tap/summarize` fails with the explicit macOS-only / npm guidance.
5. If anything fails, fix and re-cut the release (no partials).

## Common failure

- NPM/GitHub release updated, tap not updated → users stuck on old version.
  Fix: always do step 3–4 before announcing.
