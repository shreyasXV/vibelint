# VibeLint 🔍

**Your AI writes code. VibeLint makes sure it works.**

A GitHub Action + CLI that catches the bugs your AI coding tools introduce — hallucinated imports, empty tests, tautological assertions, deleted-but-still-referenced code, and more. Now with an **AI Critic Gate** for deep semantic analysis.

## Quick Start

### CLI (fastest way to try)

```bash
npx vibelint scan .
```

Or install globally:
```bash
npm install -g vibelint
vibelint scan ./src --fail-below 70
```

### GitHub Action

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
      - uses: shreyasXV/vibelint@v0.3.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-below: 70
```

#### With AI Critic Gate (Pro)

```yaml
      - uses: shreyasXV/vibelint@v0.3.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-below: 70
          ai-critic: true
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
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

### 🧠 AI Critic Gate (v0.3.0)
LLM-powered deep analysis that catches what static checks can't:
- **Hallucinated APIs** — methods that don't exist in the library version
- **Subtle logic errors** — off-by-one, inverted conditions, wrong variables
- **Incomplete implementations** — hardcoded returns, placeholder code
- **Security vulnerabilities** — SQL injection, XSS, path traversal
- **Type confusion** — wrong types, unsafe assertions
- **Async bugs** — missing await, swallowed errors
- **Copy-paste artifacts** — forgotten variable name updates

## CLI Usage

```bash
# Scan current directory
vibelint scan .

# Scan with threshold (exit 1 if below)
vibelint scan ./src --fail-below 70

# Enable AI Critic
OPENAI_API_KEY=sk-... vibelint scan . --ai-critic

# Use Anthropic
ANTHROPIC_API_KEY=sk-ant-... vibelint scan . --ai-critic

# JSON output (for CI)
vibelint scan . --format json

# SARIF output (for GitHub Code Scanning)
vibelint scan . --format sarif

# Create config file
vibelint init
```

## Configuration (`.vibelint.yml`)

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

## Vibe Score

Every scan gets a score from 0-100:
- ✅ **90-100** — Clean
- ⚠️ **70-89** — Review Suggested
- 🟡 **50-69** — Concerning
- 🔴 **0-49** — Needs Human Review

## Supported Languages

| Language | Dependency File | Import Detection | Test Detection |
|----------|----------------|-----------------|----------------|
| Python | `requirements.txt`, `pyproject.toml` | ✅ | ✅ |
| JavaScript | `package.json` | ✅ | ✅ |
| TypeScript | `package.json` | ✅ | ✅ |
| Go | `go.mod` | ✅ | ✅ |
| Rust | `Cargo.toml` | ✅ | ✅ |

## AI Critic — API Keys

The AI Critic gate supports multiple providers:

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| Custom | `VIBELINT_API_KEY` + `VIBELINT_BASE_URL` | Any OpenAI-compatible |

Set `VIBELINT_MODEL` to override the model.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md)

## License

MIT
