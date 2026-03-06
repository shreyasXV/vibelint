// VibeLint — Removed Code Detector
// Flags deleted functions/classes that are still referenced elsewhere

import { CheckResult, Issue, DiffFile } from '../types';

interface DeletedSymbol {
  name: string;
  type: 'function' | 'class' | 'method';
  file: string;
  line: number;
}

// Extract deleted function/class names from a diff patch
export function extractDeletedSymbols(file: DiffFile): DeletedSymbol[] {
  const symbols: DeletedSymbol[] = [];
  const patch = file.patch || '';

  const lines = patch.split('\n');
  let currentLine = 0;

  for (const line of lines) {
    // Track line numbers from hunk headers
    const hunkMatch = line.match(/^@@\s*-(\d+)/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    // Only look at deleted lines (start with -)
    if (line.startsWith('-') && !line.startsWith('---')) {
      const content = line.slice(1);

      // Python: def function_name( or class ClassName
      const pyFunc = content.match(/^\s*def\s+(\w+)\s*\(/);
      if (pyFunc) {
        symbols.push({
          name: pyFunc[1],
          type: 'function',
          file: file.filename,
          line: currentLine,
        });
      }

      const pyClass = content.match(/^\s*class\s+(\w+)[\s(:]/);
      if (pyClass) {
        symbols.push({
          name: pyClass[1],
          type: 'class',
          file: file.filename,
          line: currentLine,
        });
      }

      // JS/TS: function name(, const name = (, export function name(
      const jsFunc = content.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
      if (jsFunc) {
        symbols.push({
          name: jsFunc[1],
          type: 'function',
          file: file.filename,
          line: currentLine,
        });
      }

      // const name = (...) => or const name = function
      const jsArrow = content.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|function)/);
      if (jsArrow) {
        symbols.push({
          name: jsArrow[1],
          type: 'function',
          file: file.filename,
          line: currentLine,
        });
      }

      // class ClassName
      const jsClass = content.match(/(?:export\s+)?class\s+(\w+)/);
      if (jsClass) {
        symbols.push({
          name: jsClass[1],
          type: 'class',
          file: file.filename,
          line: currentLine,
        });
      }

      currentLine++;
    } else if (!line.startsWith('+')) {
      currentLine++;
    }
  }

  return symbols;
}

// Check if deleted symbols are referenced in other files
export function checkRemovedCode(
  deletedFile: DiffFile,
  allFileContents: Map<string, string>  // filename -> content (rest of codebase)
): CheckResult {
  const issues: Issue[] = [];
  const deletedSymbols = extractDeletedSymbols(deletedFile);

  for (const symbol of deletedSymbols) {
    // Skip private/dunder methods
    if (symbol.name.startsWith('_') && symbol.type === 'function') continue;
    // Skip very common names that would false-positive
    if (['setup', 'teardown', 'main', 'init', 'run', 'test'].includes(symbol.name.toLowerCase())) continue;

    const references: { file: string; line: number }[] = [];

    for (const [filename, content] of allFileContents) {
      // Don't check the file where the symbol was deleted
      if (filename === deletedFile.filename) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for the symbol name as a word boundary match
        const regex = new RegExp(`\\b${escapeRegex(symbol.name)}\\b`);
        if (regex.test(line)) {
          // Skip comments
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          references.push({ file: filename, line: i + 1 });
        }
      }
    }

    if (references.length > 0) {
      const refList = references.slice(0, 3).map(r => `${r.file}:${r.line}`).join(', ');
      const moreCount = references.length > 3 ? ` (+${references.length - 3} more)` : '';

      issues.push({
        type: 'removed-code',
        severity: 'error',
        file: deletedFile.filename,
        line: symbol.line,
        message: `Deleted ${symbol.type} '${symbol.name}' is still referenced`,
        detail: `\`${symbol.name}\` was removed but is still used in: ${refList}${moreCount}`,
        penalty: 20,
      });
    }
  }

  return { issues };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
