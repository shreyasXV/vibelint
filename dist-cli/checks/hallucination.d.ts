import { CheckResult, DiffFile, Language, VibeLintConfig } from '../types';
interface ImportInfo {
    module: string;
    fullPath: string;
    line: number;
    raw: string;
}
export declare function extractPythonImports(content: string): ImportInfo[];
export declare function extractJSImports(content: string): ImportInfo[];
export declare function extractGoImports(content: string): ImportInfo[];
export declare function extractRustImports(content: string): ImportInfo[];
export declare function checkHallucinations(file: DiffFile, language: Language, dependencies: Set<string>, config?: VibeLintConfig): CheckResult;
export declare function parsePythonDeps(content: string): Set<string>;
export declare function parsePyprojectToml(content: string): Set<string>;
export declare function parsePackageJson(content: string): Set<string>;
export declare function parseGoMod(content: string): Set<string>;
export declare function parseCargoToml(content: string): Set<string>;
export {};
//# sourceMappingURL=hallucination.d.ts.map