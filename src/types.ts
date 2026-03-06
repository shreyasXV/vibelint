// VibeLint — Types

export interface Issue {
  type: 'hallucination' | 'empty-test' | 'tautological-test' | 'disconnected-test' | 'removed-code';
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  message: string;
  detail: string;
  penalty: number;
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

export type Language = 'python' | 'javascript' | 'typescript';

export function detectLanguage(filename: string): Language | null {
  if (filename.endsWith('.py')) return 'python';
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
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
    lower.endsWith('.spec.js')
  );
}
