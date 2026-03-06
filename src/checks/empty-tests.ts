// VibeLint — Empty/Tautological Test Detector
// Detects tests that don't actually test anything

import { CheckResult, Issue, DiffFile, Language } from '../types';

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

  // Simple approach: find test()/it()/describe() blocks
  // For MVP, we use a bracket-counting approach
  const testStartPattern = /^\s*(?:test|it|describe)\s*\(\s*['"]/;

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

function buildTestFunction(
  raw: { name: string; startLine: number; bodyLines: string[] },
  language: 'python' | 'javascript' | 'typescript'
): TestFunction {
  const body = raw.bodyLines.join('\n');
  const assertions: Assertion[] = [];
  const assertPatterns = language === 'python' ? PYTHON_ASSERT_PATTERNS : JS_ASSERT_PATTERNS;
  const tautPatterns = language === 'python' ? PYTHON_TAUTOLOGICAL : JS_TAUTOLOGICAL;

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

export function checkTests(file: DiffFile, language: Language): CheckResult {
  const issues: Issue[] = [];
  const content = file.content || '';

  if (!content) return { issues };

  const tests = language === 'python'
    ? extractPythonTestFunctions(content)
    : extractJSTestFunctions(content);

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
        severity: 'warning',
        file: file.filename,
        line: test.startLine,
        message: `Test '${test.name}' has no assertions`,
        detail: `This test function runs but never checks any results. It will always pass regardless of code behavior.`,
        penalty: 10,
      });
    }

    // Check 2: All assertions are tautological
    const tautAssertions = test.assertions.filter(a => a.isTautological);
    if (tautAssertions.length > 0 && tautAssertions.length === test.assertions.length) {
      for (const taut of tautAssertions) {
        issues.push({
          type: 'tautological-test',
          severity: 'warning',
          file: file.filename,
          line: taut.line,
          message: `Tautological assertion in '${test.name}'`,
          detail: `\`${taut.raw}\`\n→ ${taut.reason}`,
          penalty: 10,
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
        });
      }
    }
  }

  return { issues };
}
