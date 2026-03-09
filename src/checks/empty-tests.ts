// VibeLint — Empty/Tautological Test Detector
// Detects tests that don't actually test anything

import { CheckResult, Issue, DiffFile, Language, VibeLintConfig } from '../types';

interface TestFunction {
  name: string;
  startLine: number;
  endLine: number;
  body: string;
  assertions: Assertion[];
}

interface Assertion {
  line: number;
  raw: string;
  isTautological: boolean;
  reason?: string;
}

// Python tautological patterns
const PYTHON_TAUTOLOGICAL = [
  /assert\s+True\b/,
  /assert\s+not\s+False\b/,
  /assert\s+1\s*==\s*1/,
  /assert\s+""?\s*==\s*""?/,
  /assert\s+\d+\s*==\s*\d+/,
  /assertEqual\s*\(\s*True\s*,\s*True\s*\)/,
  /assertEqual\s*\(\s*1\s*,\s*1\s*\)/,
  /assertTrue\s*\(\s*True\s*\)/,
  /assertFalse\s*\(\s*False\s*\)/,
  /assert\s+None\s+is\s+None/,
  /assert\s+\[\]\s*==\s*\[\]/,
  /assert\s+{}\s*==\s*{}/,
];

// JS/TS tautological patterns
const JS_TAUTOLOGICAL = [
  /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/,
  /expect\s*\(\s*false\s*\)\s*\.toBe\s*\(\s*false\s*\)/,
  /expect\s*\(\s*1\s*\)\s*\.toBe\s*\(\s*1\s*\)/,
  /expect\s*\(\s*1\s*\)\s*\.toEqual\s*\(\s*1\s*\)/,
  /expect\s*\(\s*"[^"]*"\s*\)\s*\.toBe\s*\(\s*"[^"]*"\s*\)/,
  /expect\s*\(\s*true\s*\)\s*\.toBeTruthy\s*\(\s*\)/,
  /expect\s*\(\s*false\s*\)\s*\.toBeFalsy\s*\(\s*\)/,
  /expect\s*\(\s*null\s*\)\s*\.toBeNull\s*\(\s*\)/,
  /expect\s*\(\s*undefined\s*\)\s*\.toBeUndefined\s*\(\s*\)/,
  /assert\.ok\s*\(\s*true\s*\)/,
  /assert\.equal\s*\(\s*1\s*,\s*1\s*\)/,
  /assert\.strictEqual\s*\(\s*true\s*,\s*true\s*\)/,
];

// Go tautological patterns
const GO_TAUTOLOGICAL = [
  /if\s+true\s*\{/,
  /if\s+1\s*==\s*1\s*\{/,
];

// Rust tautological patterns
const RUST_TAUTOLOGICAL = [
  /assert!\s*\(\s*true\s*\)/,
  /assert_eq!\s*\(\s*1\s*,\s*1\s*\)/,
  /assert_eq!\s*\(\s*"[^"]*"\s*,\s*"[^"]*"\s*\)/,
];

// Assertion patterns (to check if they exist at all)
const PYTHON_ASSERT_PATTERNS = [
  /\bassert\b/,
  /\.assert/,
  /self\.assert/,
  /pytest\.raises/,
  /pytest\.warns/,
  /with\s+raises/,
];

const JS_ASSERT_PATTERNS = [
  /\bexpect\s*\(/,
  /\bassert\b/,
  /\.should\b/,
  /\.to\b/,
  /\.toEqual/,
  /\.toBe/,
  /\.toThrow/,
  /\.rejects/,
  /\.resolves/,
];

const GO_ASSERT_PATTERNS = [
  /\bt\.Error\b/,
  /\bt\.Errorf\b/,
  /\bt\.Fatal\b/,
  /\bt\.Fatalf\b/,
  /\bt\.Fail\b/,
  /\bt\.FailNow\b/,
  /\btestify\/assert\b/,
  /assert\.\w+\s*\(/,
  /require\.\w+\s*\(/,
];

const RUST_ASSERT_PATTERNS = [
  /\bassert!\s*\(/,
  /\bassert_eq!\s*\(/,
  /\bassert_ne!\s*\(/,
  /\bassert_matches!\s*\(/,
  /panic!\s*\(/,
];

function extractPythonTestFunctions(content: string): TestFunction[] {
  const lines = content.split('\n');
  const tests: TestFunction[] = [];
  let currentTest: { name: string; startLine: number; bodyLines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect test function start
    const testMatch = line.match(/^(\s*)def\s+(test_\w+)\s*\(/);
    if (testMatch) {
      // Save previous test if any
      if (currentTest) {
        tests.push(buildTestFunction(currentTest, 'python'));
      }
      currentTest = { name: testMatch[2], startLine: lineNum, bodyLines: [] };
      continue;
    }

    // Class method test
    const methodMatch = line.match(/^(\s+)def\s+(test_\w+)\s*\(self/);
    if (methodMatch) {
      if (currentTest) {
        tests.push(buildTestFunction(currentTest, 'python'));
      }
      currentTest = { name: methodMatch[2], startLine: lineNum, bodyLines: [] };
      continue;
    }

    // Collect body lines (indented lines after the def)
    if (currentTest) {
      if (line.trim() === '' || line.match(/^\s+/)) {
        currentTest.bodyLines.push(line);
      } else if (line.match(/^(def |class |\S)/)) {
        // New top-level definition — end current test
        tests.push(buildTestFunction(currentTest, 'python'));
        currentTest = null;
      }
    }
  }

  if (currentTest) {
    tests.push(buildTestFunction(currentTest, 'python'));
  }

  return tests;
}

function extractJSTestFunctions(content: string): TestFunction[] {
  const lines = content.split('\n');
  const tests: TestFunction[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^\s*(?:test|it)\s*\(\s*['"]([^'"]+)['"]/);

    if (match) {
      const name = match[1];
      const startLine = i + 1;
      // Collect until matching brace
      let braceCount = 0;
      let started = false;
      const bodyLines: string[] = [];

      for (let j = i; j < lines.length; j++) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === '{' || ch === '(') { braceCount++; started = true; }
          if (ch === '}' || ch === ')') braceCount--;
        }
        bodyLines.push(l);
        if (started && braceCount <= 0) {
          i = j + 1;
          break;
        }
      }

      tests.push(buildTestFunction({ name, startLine, bodyLines }, 'javascript'));
      continue;
    }
    i++;
  }

  return tests;
}

// v0.2.0: Go test function extraction
function extractGoTestFunctions(content: string): TestFunction[] {
  const lines = content.split('\n');
  const tests: TestFunction[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // func TestXxx(t *testing.T) {
    const match = line.match(/^func\s+(Test\w+)\s*\(.*\*testing\.T\)/);

    if (match) {
      const name = match[1];
      const startLine = i + 1;
      let braceCount = 0;
      let started = false;
      const bodyLines: string[] = [];

      for (let j = i; j < lines.length; j++) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === '{') { braceCount++; started = true; }
          if (ch === '}') braceCount--;
        }
        bodyLines.push(l);
        if (started && braceCount <= 0) {
          i = j + 1;
          break;
        }
      }

      tests.push(buildTestFunction({ name, startLine, bodyLines }, 'go' as Language));
      continue;
    }
    i++;
  }

  return tests;
}

// v0.2.0: Rust test function extraction
function extractRustTestFunctions(content: string): TestFunction[] {
  const lines = content.split('\n');
  const tests: TestFunction[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // #[test] followed by fn test_name()
    if (line === '#[test]' || line.startsWith('#[test]')) {
      // Next non-empty line should be the fn definition
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length) {
        const fnLine = lines[j].trim();
        const fnMatch = fnLine.match(/fn\s+(\w+)\s*\(/);
        if (fnMatch) {
          const name = fnMatch[1];
          const startLine = j + 1;
          let braceCount = 0;
          let started = false;
          const bodyLines: string[] = [];

          for (let k = j; k < lines.length; k++) {
            const l = lines[k];
            for (const ch of l) {
              if (ch === '{') { braceCount++; started = true; }
              if (ch === '}') braceCount--;
            }
            bodyLines.push(l);
            if (started && braceCount <= 0) {
              i = k + 1;
              break;
            }
          }

          tests.push(buildTestFunction({ name, startLine, bodyLines }, 'rust' as Language));
          continue;
        }
      }
    }
    i++;
  }

  return tests;
}

function buildTestFunction(
  raw: { name: string; startLine: number; bodyLines: string[] },
  language: Language
): TestFunction {
  const body = raw.bodyLines.join('\n');
  const assertions: Assertion[] = [];

  let assertPatterns: RegExp[];
  let tautPatterns: RegExp[];

  switch (language) {
    case 'python':
      assertPatterns = PYTHON_ASSERT_PATTERNS;
      tautPatterns = PYTHON_TAUTOLOGICAL;
      break;
    case 'go':
      assertPatterns = GO_ASSERT_PATTERNS;
      tautPatterns = GO_TAUTOLOGICAL;
      break;
    case 'rust':
      assertPatterns = RUST_ASSERT_PATTERNS;
      tautPatterns = RUST_TAUTOLOGICAL;
      break;
    default:
      assertPatterns = JS_ASSERT_PATTERNS;
      tautPatterns = JS_TAUTOLOGICAL;
  }

  for (let i = 0; i < raw.bodyLines.length; i++) {
    const line = raw.bodyLines[i].trim();
    const lineNum = raw.startLine + i + 1;

    // Check if this line has an assertion
    const hasAssertion = assertPatterns.some(p => p.test(line));
    if (hasAssertion) {
      const isTaut = tautPatterns.some(p => p.test(line));
      assertions.push({
        line: lineNum,
        raw: line,
        isTautological: isTaut,
        reason: isTaut ? 'Asserts a constant — this test passes regardless of code behavior' : undefined,
      });
    }
  }

  return {
    name: raw.name,
    startLine: raw.startLine,
    endLine: raw.startLine + raw.bodyLines.length,
    body,
    assertions,
  };
}

function getSuggestion(testName: string, language: Language): string {
  switch (language) {
    case 'python':
      return `Add an assertion like: \`self.assertEqual(${testName.replace('test_', '')}(), expected_value)\``;
    case 'go':
      return `Add a check like: \`if got != want { t.Errorf("got %v, want %v", got, want) }\``;
    case 'rust':
      return `Add an assertion like: \`assert_eq!(result, expected_value);\``;
    default:
      return `Add an assertion like: \`expect(result).toBe(expectedValue);\``;
  }
}

export function checkTests(file: DiffFile, language: Language, config?: VibeLintConfig): CheckResult {
  const issues: Issue[] = [];
  const content = file.content || '';

  if (!content) return { issues };

  // Determine severity from config
  const severity = config?.rules?.['empty-tests'] ?? 'warning';
  if (severity === 'off') return { issues };

  let tests: TestFunction[];
  switch (language) {
    case 'python':
      tests = extractPythonTestFunctions(content);
      break;
    case 'go':
      tests = extractGoTestFunctions(content);
      break;
    case 'rust':
      tests = extractRustTestFunctions(content);
      break;
    default:
      tests = extractJSTestFunctions(content);
  }

  for (const test of tests) {
    // Check 1: No assertions at all
    if (test.assertions.length === 0) {
      // Skip if it's just a pass/... stub
      const bodyTrimmed = test.body.replace(/\s+/g, ' ').trim();
      if (bodyTrimmed.includes('pass') && bodyTrimmed.length < 50) continue;
      if (bodyTrimmed.includes('...') && bodyTrimmed.length < 50) continue;
      if (bodyTrimmed.includes('TODO') || bodyTrimmed.includes('FIXME')) continue;

      issues.push({
        type: 'empty-test',
        severity: severity as 'error' | 'warning' | 'info',
        file: file.filename,
        line: test.startLine,
        message: `Test '${test.name}' has no assertions`,
        detail: `This test function runs but never checks any results. It will always pass regardless of code behavior.`,
        penalty: severity === 'error' ? 15 : severity === 'warning' ? 10 : 3,
        suggestion: getSuggestion(test.name, language),
      });
    }

    // Check 2: All assertions are tautological
    const tautAssertions = test.assertions.filter(a => a.isTautological);
    if (tautAssertions.length > 0 && tautAssertions.length === test.assertions.length) {
      for (const taut of tautAssertions) {
        issues.push({
          type: 'tautological-test',
          severity: severity as 'error' | 'warning' | 'info',
          file: file.filename,
          line: taut.line,
          message: `Tautological assertion in '${test.name}'`,
          detail: `\`${taut.raw}\`\n→ ${taut.reason}`,
          penalty: severity === 'error' ? 15 : 10,
          suggestion: getSuggestion(test.name, language),
        });
      }
    } else {
      // Some tautological, some real — still flag the tautological ones
      for (const taut of tautAssertions) {
        issues.push({
          type: 'tautological-test',
          severity: 'info',
          file: file.filename,
          line: taut.line,
          message: `Tautological assertion in '${test.name}'`,
          detail: `\`${taut.raw}\`\n→ ${taut.reason}`,
          penalty: 5,
          suggestion: getSuggestion(test.name, language),
        });
      }
    }
  }

  return { issues };
}
