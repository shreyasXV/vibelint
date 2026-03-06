# VibeLint 🔍

**Your AI writes code. VibeLint makes sure it works.**

A GitHub Action that catches the bugs your AI coding tools introduce — hallucinated imports, empty tests, tautological assertions, and deleted-but-still-referenced code.

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
    steps:
      - uses: actions/checkout@v4
      - uses: vibelint/vibelint@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## What It Catches

### 👻 Hallucinated Imports
LLMs hallucinate package names and module paths. VibeLint checks every import against your actual dependency files.

```python
# VibeLint flags this ↓
from langchain.memory import ConversationBufferMemory  
# → 'langchain' not in requirements.txt
```

### 🧪 Empty & Tautological Tests  
AI writes tests that look good but test nothing. VibeLint detects:
- Tests with **no assertions** (always pass)
- Tests that **assert constants** (`assert True`, `expect(true).toBe(true)`)

```python
# VibeLint flags this ↓
def test_user_login():
    user = User("test@test.com", "pass")
    result = user.login()
    assert True  # ← Tests nothing!
```

### 🗑️ Removed Code Still Referenced
AI "refactors" by deleting functions that other files still use.

```
# VibeLint flags this ↓
Deleted `rate_limit_check()` but it's still called in app.py:42, middleware.py:17
```

## Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `github-token` | GitHub token for PR comments | `${{ github.token }}` |
| `fail-below` | Fail check if score < threshold (0 = disabled) | `0` |
| `languages` | Languages to check | `python,javascript,typescript` |

## Vibe Score

Every PR gets a score from 0-100:
- ✅ **90-100** — Clean
- ⚠️ **70-89** — Review Suggested
- 🟡 **50-69** — Concerning  
- 🔴 **0-49** — Needs Human Review

## License

MIT
