# Changelog

## v0.3.0 — AI Critic Gate + CLI (2026-03-13)

### 🧠 AI Critic Gate (NEW)
- LLM-powered semantic code review that catches what static analysis can't
- Detects: hallucinated APIs, subtle logic errors, incomplete implementations, security vulns, type confusion, async bugs, copy-paste artifacts
- Supports OpenAI, Anthropic (Claude), and any OpenAI-compatible endpoint
- Configurable via env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `VIBELINT_API_KEY`
- Custom model selection via `VIBELINT_MODEL` env var
- Best-effort: failures don't block the scan
- GitHub Action: `ai-critic: true` input
- CLI: `--ai-critic` flag

### 🖥️ CLI Tool (NEW)
- `npx vibelint scan [path]` — scan local code without GitHub
- `vibelint init` — create `.vibelint.yml` config
- Beautiful terminal output with colors, progress bar, score
- JSON output: `--format json` (for CI pipelines)
- SARIF output: `--format sarif` (for GitHub Code Scanning)
- `--fail-below <score>` — exit code 1 if below threshold
- Auto-discovers project root (walks up to find package.json/requirements.txt)

### 🛠️ Improvements
- Import checkers now skip comment lines (reduces false positives)
- Suspicious patterns skip CLI/bin files for console.log checks
- TODO/FIXME checker skips regex pattern definitions
- Package published with `bin` field — `npx vibelint` just works
- SARIF output for GitHub Advanced Security integration

## v0.2.0 — Config File, Go/Rust, Auto-fix (2026-03-09)

### Added
- **Config file** (`.vibelint.yml`) — customize rules, ignore paths, set thresholds
- **Go & Rust support** — checks `go.mod` and `Cargo.toml` dependencies
- **Auto-fix suggestions** — every issue now includes a concrete fix
- **Inline PR annotations** — GitHub Check Run with line-by-line annotations
- **Custom rules** — define your own pattern-matching rules in config
- **Severity overrides** — set rules to error/warning/info/off

### Improved
- Better test detection for Go (`_test.go`) and Rust (`#[test]`)
- Pyproject.toml parsing for Python dependencies
- Report formatting with collapsible file sections

## v0.1.0 — MVP (2026-03-06)

### Added
- Hallucinated import detection (Python, JS/TS)
- Empty/tautological test detection
- Removed code still referenced detection
- Suspicious patterns (secrets, empty catches, debug logs, TODOs)
- Vibe Score (0-100)
- GitHub Action with PR comments
