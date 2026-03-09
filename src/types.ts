// VibeLint — Types

export interface Issue {
  type: 'hallucination' | 'empty-test' | 'tautological-test' | 'disconnected-test' | 'removed-code' | 'suspicious' | 'custom';
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  message: string;
  detail: string;
  penalty: number;
  suggestion?: string;  // v0.2.0: auto-fix suggestion
}

export interface CheckResult {
  issues: Issue[];
}

export interface DiffFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  patch?: string;
  additions: number;
  deletions: number;
  content?: string;  // full file content (fetched separately)
}

export interface VibeReport {
  score: number;
  issues: Issue[];
  filesChecked: number;
  summary: string;
}

// v0.2.0: Config file support
export interface CustomRule {
  pattern: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface VibeLintConfig {
  'fail-below'?: number;
  ignore?: string[];
  rules?: {
    hallucinations?: 'error' | 'warning' | 'info' | 'off';
    'empty-tests'?: 'error' | 'warning' | 'info' | 'off';
    'removed-code'?: 'error' | 'warning' | 'info' | 'off';
    suspicious?: 'error' | 'warning' | 'info' | 'off';
  };
  'custom-rules'?: CustomRule[];
}

export type Language = 'python' | 'javascript' | 'typescript' | 'go' | 'rust';

export function detectLanguage(filename: string): Language | null {
  if (filename.endsWith('.py')) return 'python';
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
  if (filename.endsWith('.go')) return 'go';
  if (filename.endsWith('.rs')) return 'rust';
  return null;
}

export function isTestFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.includes('test') ||
    lower.includes('spec') ||
    lower.includes('__tests__') ||
    lower.startsWith('test_') ||
    lower.endsWith('_test.py') ||
    lower.endsWith('.test.ts') ||
    lower.endsWith('.test.js') ||
    lower.endsWith('.spec.ts') ||
    lower.endsWith('.spec.js') ||
    lower.endsWith('_test.go') ||    // Go test files
    lower.includes('_test.go')       // Go test files (any path)
  );
}

// Simple glob matching for ignore patterns
export function matchesGlob(filename: string, pattern: string): boolean {
  // Convert glob to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '###DOUBLESTAR###')
    .replace(/\*/g, '[^/]*')
    .replace(/###DOUBLESTAR###/g, '.*');
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(filename);
}

export function isIgnored(filename: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some(pattern => matchesGlob(filename, pattern));
}
