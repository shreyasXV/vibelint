// VibeLint v0.2.0 — New Feature Tests

import { detectLanguage, isTestFile, isIgnored, matchesGlob } from '../src/types';
import { extractGoImports, extractRustImports, checkHallucinations, parseGoMod, parseCargoToml } from '../src/checks/hallucination';
import { checkTests } from '../src/checks/empty-tests';
import { checkSuspicious } from '../src/checks/suspicious';
import { checkRemovedCode, extractDeletedSymbols } from '../src/checks/removed-code';
import { loadConfigFromContent } from '../src/config';
import { DiffFile, VibeLintConfig } from '../src/types';

// ─── Language Detection ──────────────────────────────────────────────────────

describe('detectLanguage — Go and Rust', () => {
  test('detects .go files', () => {
    expect(detectLanguage('main.go')).toBe('go');
    expect(detectLanguage('internal/server/handler.go')).toBe('go');
  });

  test('detects .rs files', () => {
    expect(detectLanguage('src/main.rs')).toBe('rust');
    expect(detectLanguage('lib.rs')).toBe('rust');
  });

  test('returns null for unknown extensions', () => {
    expect(detectLanguage('README.md')).toBeNull();
    expect(detectLanguage('build.gradle')).toBeNull();
  });
});

describe('isTestFile — Go and Rust', () => {
  test('detects Go test files', () => {
    expect(isTestFile('server_test.go')).toBe(true);
    expect(isTestFile('internal/handler_test.go')).toBe(true);
  });

  test('does not flag non-test Go files', () => {
    expect(isTestFile('main.go')).toBe(false);
    expect(isTestFile('handler.go')).toBe(false);
  });
});

// ─── Ignore Patterns ─────────────────────────────────────────────────────────

describe('matchesGlob', () => {
  test('matches simple glob', () => {
    expect(matchesGlob('vendor/foo.go', 'vendor/**')).toBe(true);
    expect(matchesGlob('generated/schema.ts', 'generated/**')).toBe(true);
  });

  test('does not match unrelated paths', () => {
    expect(matchesGlob('src/main.go', 'vendor/**')).toBe(false);
    expect(matchesGlob('src/generated.ts', 'generated/**')).toBe(false);
  });
});

describe('isIgnored', () => {
  test('respects ignore patterns', () => {
    const patterns = ['vendor/**', 'generated/**'];
    expect(isIgnored('vendor/some/dep.go', patterns)).toBe(true);
    expect(isIgnored('generated/proto.ts', patterns)).toBe(true);
    expect(isIgnored('src/main.go', patterns)).toBe(false);
  });

  test('returns false when no patterns', () => {
    expect(isIgnored('src/main.go', [])).toBe(false);
  });
});

// ─── Go Import Extraction ─────────────────────────────────────────────────────

describe('extractGoImports', () => {
  test('extracts external imports from import block', () => {
    const code = `
package main

import (
	"fmt"
	"net/http"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)
`;
    const imports = extractGoImports(code);
    expect(imports.some(i => i.module === 'github.com/gin-gonic/gin')).toBe(true);
    expect(imports.some(i => i.module === 'go.uber.org/zap')).toBe(true);
    // stdlib should not be extracted
    expect(imports.some(i => i.module === 'fmt')).toBe(false);
    expect(imports.some(i => i.module === 'net/http')).toBe(false);
  });

  test('extracts aliased imports', () => {
    const code = `
import (
	mux "github.com/gorilla/mux"
)
`;
    const imports = extractGoImports(code);
    expect(imports.some(i => i.module === 'github.com/gorilla/mux')).toBe(true);
  });
});

// ─── Rust Import Extraction ───────────────────────────────────────────────────

describe('extractRustImports', () => {
  test('extracts use statements for third-party crates', () => {
    const code = `
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tokio::runtime::Runtime;
use reqwest::Client;
`;
    const imports = extractRustImports(code);
    expect(imports.some(i => i.module === 'serde')).toBe(true);
    expect(imports.some(i => i.module === 'tokio')).toBe(true);
    expect(imports.some(i => i.module === 'reqwest')).toBe(true);
    // std is stdlib — should be skipped
    expect(imports.some(i => i.module === 'std')).toBe(false);
  });

  test('extracts extern crate declarations', () => {
    const code = `extern crate serde;\nextern crate log;\n`;
    const imports = extractRustImports(code);
    expect(imports.some(i => i.module === 'serde')).toBe(true);
    expect(imports.some(i => i.module === 'log')).toBe(true);
  });
});

// ─── Go Dep Parsing ───────────────────────────────────────────────────────────

describe('parseGoMod', () => {
  test('parses require block', () => {
    const content = `
module github.com/myapp/server

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	go.uber.org/zap v1.26.0
	github.com/stretchr/testify v1.8.4
)
`;
    const deps = parseGoMod(content);
    expect(deps.has('github.com/gin-gonic/gin')).toBe(true);
    expect(deps.has('go.uber.org/zap')).toBe(true);
    expect(deps.has('github.com/stretchr/testify')).toBe(true);
  });

  test('parses single require line', () => {
    const content = `require github.com/gorilla/mux v1.8.1\n`;
    const deps = parseGoMod(content);
    expect(deps.has('github.com/gorilla/mux')).toBe(true);
  });
});

// ─── Cargo.toml Parsing ───────────────────────────────────────────────────────

describe('parseCargoToml', () => {
  test('parses [dependencies]', () => {
    const content = `
[package]
name = "myapp"
version = "0.1.0"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = "1.35"
reqwest = "0.11"

[dev-dependencies]
mockall = "0.12"
`;
    const deps = parseCargoToml(content);
    expect(deps.has('serde')).toBe(true);
    expect(deps.has('tokio')).toBe(true);
    expect(deps.has('reqwest')).toBe(true);
    expect(deps.has('mockall')).toBe(true);
  });
});

// ─── Hallucination Check — Go ─────────────────────────────────────────────────

describe('checkHallucinations — Go', () => {
  test('flags Go imports not in go.mod', () => {
    const file: DiffFile = {
      filename: 'main.go',
      status: 'modified',
      additions: 5,
      deletions: 0,
      content: `package main

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/fake/nonexistent"
)

func main() {}
`,
    };
    const deps = new Set(['github.com/gin-gonic/gin']);
    const result = checkHallucinations(file, 'go', deps);
    expect(result.issues.some(i => i.message.includes('fake/nonexistent'))).toBe(true);
    expect(result.issues.some(i => i.message.includes('gin-gonic/gin'))).toBe(false);
  });

  test('includes suggestion for Go hallucination', () => {
    const file: DiffFile = {
      filename: 'main.go',
      status: 'added',
      additions: 3,
      deletions: 0,
      content: `package main

import "github.com/fake/pkg"

func main() {}
`,
    };
    const result = checkHallucinations(file, 'go', new Set());
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].suggestion).toContain('go get');
  });
});

// ─── Hallucination Check — Rust ───────────────────────────────────────────────

describe('checkHallucinations — Rust', () => {
  test('flags Rust crates not in Cargo.toml', () => {
    const file: DiffFile = {
      filename: 'src/main.rs',
      status: 'modified',
      additions: 3,
      deletions: 0,
      content: `use std::collections::HashMap;
use serde::Serialize;
use fake_crate::Something;
`,
    };
    const deps = new Set(['serde']);
    const result = checkHallucinations(file, 'rust', deps);
    expect(result.issues.some(i => i.message.includes('fake_crate'))).toBe(true);
    expect(result.issues.some(i => i.message.includes('serde'))).toBe(false);
  });

  test('includes Cargo.toml suggestion for Rust hallucination', () => {
    const file: DiffFile = {
      filename: 'src/lib.rs',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `use nonexistent_crate::Foo;\n`,
    };
    const result = checkHallucinations(file, 'rust', new Set());
    expect(result.issues[0].suggestion).toContain('Cargo.toml');
  });
});

// ─── Config File Support ──────────────────────────────────────────────────────

describe('loadConfigFromContent', () => {
  test('parses valid YAML config', () => {
    const yaml = `
fail-below: 70
ignore:
  - "vendor/**"
  - "generated/**"
rules:
  hallucinations: error
  empty-tests: warning
  removed-code: warning
  suspicious: warning
`;
    const config = loadConfigFromContent(yaml);
    expect(config['fail-below']).toBe(70);
    expect(config.ignore).toEqual(['vendor/**', 'generated/**']);
    expect(config.rules?.hallucinations).toBe('error');
    expect(config.rules?.['empty-tests']).toBe('warning');
  });

  test('parses custom rules', () => {
    const yaml = `
custom-rules:
  - pattern: "FIXME|HACK"
    severity: warning
    message: "AI left a FIXME/HACK comment"
`;
    const config = loadConfigFromContent(yaml);
    expect(config['custom-rules']?.length).toBe(1);
    expect(config['custom-rules']?.[0].pattern).toBe('FIXME|HACK');
    expect(config['custom-rules']?.[0].severity).toBe('warning');
  });

  test('returns empty config for invalid YAML', () => {
    const config = loadConfigFromContent('{ invalid yaml ::');
    expect(config).toEqual({});
  });

  test('returns empty config for empty content', () => {
    const config = loadConfigFromContent('');
    expect(config).toEqual({});
  });
});

// ─── Config — Severity Override ───────────────────────────────────────────────

describe('config severity override', () => {
  test('honors off rule for hallucinations', () => {
    const file: DiffFile = {
      filename: 'app.py',
      status: 'modified',
      additions: 2,
      deletions: 0,
      content: `import fake_package\n`,
    };
    const config: VibeLintConfig = { rules: { hallucinations: 'off' } };
    const result = checkHallucinations(file, 'python', new Set(), config);
    expect(result.issues.length).toBe(0);
  });

  test('honors off rule for empty-tests', () => {
    const file: DiffFile = {
      filename: 'test_app.py',
      status: 'modified',
      additions: 5,
      deletions: 0,
      content: `
def test_something():
    x = 1 + 1
`,
    };
    const config: VibeLintConfig = { rules: { 'empty-tests': 'off' } };
    const result = checkTests(file, 'python', config);
    expect(result.issues.length).toBe(0);
  });

  test('honors off rule for suspicious', () => {
    const file: DiffFile = {
      filename: 'app.py',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `# TODO: implement this\n`,
    };
    const config: VibeLintConfig = { rules: { suspicious: 'off' } };
    const result = checkSuspicious(file, 'python', config);
    expect(result.issues.length).toBe(0);
  });
});

// ─── Custom Rules ─────────────────────────────────────────────────────────────

describe('custom rules', () => {
  test('flags content matching custom pattern', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'modified',
      additions: 2,
      deletions: 0,
      content: `// FIXME: this is a hack\nconst x = 1;\n`,
    };
    const config: VibeLintConfig = {
      'custom-rules': [
        { pattern: 'FIXME|HACK', severity: 'warning', message: 'AI left a FIXME/HACK comment' },
      ],
    };
    const result = checkSuspicious(file, 'typescript', config);
    const customIssues = result.issues.filter(i => i.type === 'custom');
    expect(customIssues.length).toBeGreaterThan(0);
    expect(customIssues[0].message).toBe('AI left a FIXME/HACK comment');
  });

  test('does not flag non-matching content', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `const x = 1;\n`,
    };
    const config: VibeLintConfig = {
      'custom-rules': [
        { pattern: 'FIXME|HACK', severity: 'warning', message: 'AI left a FIXME/HACK' },
      ],
    };
    const result = checkSuspicious(file, 'typescript', config);
    const customIssues = result.issues.filter(i => i.type === 'custom');
    expect(customIssues.length).toBe(0);
  });
});

// ─── Auto-fix Suggestions ─────────────────────────────────────────────────────

describe('auto-fix suggestions', () => {
  test('hallucination includes npm install suggestion for JS', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `import { foo } from 'fake-package';\n`,
    };
    const result = checkHallucinations(file, 'typescript', new Set());
    expect(result.issues[0].suggestion).toContain('npm install');
  });

  test('hallucination includes pip install suggestion for Python', () => {
    const file: DiffFile = {
      filename: 'app.py',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `import fake_package\n`,
    };
    const result = checkHallucinations(file, 'python', new Set());
    expect(result.issues[0].suggestion).toContain('pip install');
  });

  test('empty test includes assertion suggestion', () => {
    const file: DiffFile = {
      filename: 'app.test.ts',
      status: 'modified',
      additions: 4,
      deletions: 0,
      content: `
test('does something', () => {
  const x = 1 + 1;
});
`,
    };
    const result = checkTests(file, 'typescript');
    const emptyTestIssue = result.issues.find(i => i.type === 'empty-test');
    expect(emptyTestIssue?.suggestion).toBeTruthy();
    expect(emptyTestIssue?.suggestion).toContain('expect');
  });

  test('removed code includes update references suggestion', () => {
    const file: DiffFile = {
      filename: 'lib.ts',
      status: 'modified',
      additions: 0,
      deletions: 2,
      patch: `@@ -1,3 +1,1 @@\n-export function myFunction() {\n-  return 42;\n-}\n`,
    };
    const otherFiles = new Map([
      ['src/app.ts', 'const result = myFunction();\n'],
    ]);
    const result = checkRemovedCode(file, otherFiles);
    expect(result.issues[0].suggestion).toBeTruthy();
    expect(result.issues[0].suggestion).toContain('myFunction');
  });
});

// ─── Go Test Detection ────────────────────────────────────────────────────────

describe('checkTests — Go', () => {
  test('flags Go test with no t.Error calls', () => {
    const file: DiffFile = {
      filename: 'server_test.go',
      status: 'modified',
      additions: 8,
      deletions: 0,
      content: `package server

import "testing"

func TestHandler(t *testing.T) {
	// set up
	x := 1 + 1
	_ = x
}
`,
    };
    const result = checkTests(file, 'go');
    expect(result.issues.some(i => i.type === 'empty-test')).toBe(true);
  });

  test('passes valid Go test with t.Errorf', () => {
    const file: DiffFile = {
      filename: 'server_test.go',
      status: 'modified',
      additions: 10,
      deletions: 0,
      content: `package server

import "testing"

func TestAdd(t *testing.T) {
	got := Add(1, 2)
	if got != 3 {
		t.Errorf("Add(1,2) = %d, want 3", got)
	}
}
`,
    };
    const result = checkTests(file, 'go');
    expect(result.issues.filter(i => i.type === 'empty-test').length).toBe(0);
  });
});

// ─── Rust Test Detection ──────────────────────────────────────────────────────

describe('checkTests — Rust', () => {
  test('flags Rust test with no assert calls', () => {
    const file: DiffFile = {
      filename: 'lib.rs',
      status: 'modified',
      additions: 8,
      deletions: 0,
      content: `
#[cfg(test)]
mod tests {
    #[test]
    fn test_add() {
        let x = 1 + 1;
        let _ = x;
    }
}
`,
    };
    const result = checkTests(file, 'rust');
    expect(result.issues.some(i => i.type === 'empty-test')).toBe(true);
  });

  test('passes valid Rust test with assert_eq!', () => {
    const file: DiffFile = {
      filename: 'lib.rs',
      status: 'modified',
      additions: 8,
      deletions: 0,
      content: `
#[cfg(test)]
mod tests {
    #[test]
    fn test_add() {
        assert_eq!(1 + 1, 2);
    }
}
`,
    };
    const result = checkTests(file, 'rust');
    expect(result.issues.filter(i => i.type === 'empty-test').length).toBe(0);
  });
});
