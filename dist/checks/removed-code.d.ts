import { CheckResult, DiffFile } from '../types';
interface DeletedSymbol {
    name: string;
    type: 'function' | 'class' | 'method';
    file: string;
    line: number;
}
export declare function extractDeletedSymbols(file: DiffFile): DeletedSymbol[];
export declare function checkRemovedCode(deletedFile: DiffFile, allFileContents: Map<string, string>): CheckResult;
export {};
//# sourceMappingURL=removed-code.d.ts.map