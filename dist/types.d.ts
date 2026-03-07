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
    content?: string;
}
export interface VibeReport {
    score: number;
    issues: Issue[];
    filesChecked: number;
    summary: string;
}
export type Language = 'python' | 'javascript' | 'typescript';
export declare function detectLanguage(filename: string): Language | null;
export declare function isTestFile(filename: string): boolean;
