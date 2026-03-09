# VibeLint 🔍

**Your AI writes code. VibeLint makes sure it works.**

A GitHub Action that catches the bugs your AI coding tools introduce — hallucinated imports, empty tests, tautological assertions, deleted-but-still-referenced code, and more.

## Quick Start

Add to `.github/workflows/vibelint.yml`:

```yaml
name: VibeLint
on: [pull_request]

jobs:
  vibelint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
    steps:
      - uses: actions/checkout@v4
      - uses: shreyasXV/vibelint@v0.2.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-below: 70
```

## What It Catches

### 👻 Hallucinated Imports
LLMs hallucinate package names. VibeLint checks every import against your actual dependency files (Python, JS/TS, Go, Rust).

```python
# VibeLint flags this ↓
from langchain.memory import ConversationBufferMemory  
# → 'langchain' not in requirements.txt
# 💡 Run `pip install langchain` or remove this import
```

### 🧪 Empty & Tautological Tests
AI writes tests that look good but test nothing:

```python
# VibeLint flags this ↓
def test_user_login():
    user = User("test@test.com", "pass")
    result = user.login()
    assert True  # ← Tests nothing!
# 💡 Add: self.assertEqual(user.login(), expected_result)
```

### 🗑️ Removed Code Still Referenced
AI "refactors" by deleting functions that other files still use:

```
# VibeLint flags this ↓
Deleted `rate_limit_check()` but it's still called in app.py:42, middleware.py:17
# 💡 Update all call sites or restore the function
```

### ⚠️ Suspicious Patterns
Hardcoded secrets, empty catch blocks, TODO/FIXME comments, debug logs left in production.

## v0.2.0 — New Features

### 📋 Config File (`.vibelint.yml`)

Create `.vibelint.yml` in your repo root to customize behavior:

```yaml
fail-below: 70
ignore:
  - "vendor/**"
  - "generated/**"
rules:
  hallucinations: error
  empty-tests: warning
  removed-code: warning
  suspicious: warning
custom-rules:
  - pattern: "FIXME|HACK"
    severity: warning
    message: "AI left a FIXME/HACK comment"
```

### 🔧 Auto-fix Suggestions

Every issue now includes a concrete suggestion:
- Hallucinated import → exact install command
- Empty test → example assertion for the language  
- Removed code → list of files to update

### 🦀🐹 Go & Rust Support

VibeLint now checks Go (`.go`) and Rust (`.rs`) files:
- Parses `go.mod` and `Cargo.toml` for declared dependencies
- Detects hallucinated `import "github.com/..."` and `use fake_crate::`
- Identifies empty `func TestXxx(t *testing.T)` and `#[test]` functions

### 📌 Inline PR Annotations

In addition to the PR summary comment, VibeLint posts a GitHub Check Run with inline annotations on the exact lines with issues.

## Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `github-token` | GitHub token for PR comments & checks | `${{ github.token }}` |
| `fail-below` | Fail check if score < threshold (0 = disabled) | `0` |
| `languages` | Languages to check | `python,javascript,typescript,go,rust` |
| `config` | Path to config file | `.vibelint.yml` |

## Vibe Score

Every PR gets a score from 0-100:
- ✅ **90-100** — Clean
- ⚠️ **70-89** — Review Suggested
- 🟡 **50-69** — Concerning
- 🔴 **0-49** — Needs Human Review

## Changelog

See [CHANGELOG.md](./CHANGELOG.md)

## License

MIT
