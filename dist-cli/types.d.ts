export interface Issue {
    type: 'hallucination' | 'empty-test' | 'tautological-test' | 'disconnected-test' | 'removed-code' | 'suspicious' | 'custom' | 'ai-critic';
    severity: 'error' | 'warning' | 'info';
    file: string;
    line: number;
    message: string;
    detail: string;
    penalty: number;
    suggestion?: string;
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
    content?: string;
}
export interface VibeReport {
    score: number;
    issues: Issue[];
    filesChecked: number;
    summary: string;
}
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
export declare function detectLanguage(filename: string): Language | null;
export declare function isTestFile(filename: string): boolean;
export declare function matchesGlob(filename: string, pattern: string): boolean;
export declare function isIgnored(filename: string, ignorePatterns: string[]): boolean;
