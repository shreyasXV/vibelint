# Changelog

All notable changes to VibeLint will be documented in this file.

## [0.2.0] - 2026-03-09

### Added

- **Config file support** (`.vibelint.yml`): Customize VibeLint behavior via a YAML config file in your repo root
  - Set `fail-below` threshold
  - Ignore paths with glob patterns (`vendor/**`, `generated/**`)
  - Override rule severities (`error`, `warning`, `info`, `off`)
  - Define custom pattern rules with regex
- **Auto-fix suggestions**: Every issue now includes a `suggestion` field with a concrete fix recommendation
  - Hallucinated import → install command or removal hint
  - Empty test → example assertion for the language
  - Removed code → list of files to update
  - Suspicious pattern → specific remediation advice
- **Go language support**: Detects hallucinated imports in `.go` files, parses `go.mod`, detects empty `*testing.T` test functions
- **Rust language support**: Detects hallucinated `use`/`extern crate` in `.rs` files, parses `Cargo.toml`, detects empty `#[test]` functions
- **Inline PR annotations**: Posts a GitHub Check Run with per-line annotations on exact lines, in addition to the summary PR comment
- **`config` action input**: Specify a custom config file path (default: `.vibelint.yml`)

### Changed

- `languages` default now includes `go` and `rust`
- PR comment version badge updated to `v0.2.0`
- Issue types expanded: `suspicious` and `custom` are now first-class types (was re-using `empty-test`/`removed-code`)
- Penalty values respect configured severity overrides

### Fixed

- Backward compatible: repos without `.vibelint.yml` work exactly as before

## [0.1.0] - 2026-02-15

### Added

- Initial release
- Hallucination detection for Python, JavaScript, TypeScript
- Empty/tautological test detection
- Removed code (dead reference) detection
- Suspicious pattern detection (hardcoded secrets, TODO/FIXME, empty catches, debug logs)
- GitHub PR comment with Vibe Score (0–100)
- `fail-below` threshold support
