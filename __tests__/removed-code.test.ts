import { extractDeletedSymbols, checkRemovedCode } from '../src/checks/removed-code';
import { DiffFile } from '../src/types';

describe('extractDeletedSymbols', () => {
  test('extracts deleted Python functions', () => {
    const file: DiffFile = {
      filename: 'utils.py',
      status: 'modified',
      additions: 0,
      deletions: 5,
      patch: `@@ -10,5 +10,0 @@
-def rate_limit_check(request):
-    if request.rate > MAX_RATE:
-        raise RateLimitError()
-    return True
-`,
    };

    const symbols = extractDeletedSymbols(file);
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe('rate_limit_check');
    expect(symbols[0].type).toBe('function');
  });

  test('extracts deleted JS functions', () => {
    const file: DiffFile = {
      filename: 'helpers.ts',
      status: 'modified',
      additions: 0,
      deletions: 3,
      patch: `@@ -5,3 +5,0 @@
-export function validateEmail(email: string): boolean {
-  return /^[^@]+@[^@]+$/.test(email);
-}`,
    };

    const symbols = extractDeletedSymbols(file);
    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe('validateEmail');
  });
});

describe('checkRemovedCode', () => {
  test('flags deleted function still referenced', () => {
    const file: DiffFile = {
      filename: 'utils.py',
      status: 'modified',
      additions: 0,
      deletions: 4,
      patch: `@@ -10,4 +10,0 @@
-def rate_limit_check(request):
-    if request.rate > MAX_RATE:
-        raise RateLimitError()
-    return True`,
    };

    const otherFiles = new Map([
      ['app.py', 'from utils import rate_limit_check\n\nresult = rate_limit_check(req)'],
      ['middleware.py', '# This uses rate limiting\nrate_limit_check(request)'],
    ]);

    const result = checkRemovedCode(file, otherFiles);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].type).toBe('removed-code');
    expect(result.issues[0].message).toContain('rate_limit_check');
  });

  test('does not flag unreferenced deleted function', () => {
    const file: DiffFile = {
      filename: 'utils.py',
      status: 'modified',
      additions: 0,
      deletions: 3,
      patch: `@@ -10,3 +10,0 @@
-def old_unused_helper():
-    return "deprecated"
-`,
    };

    const otherFiles = new Map([
      ['app.py', 'from utils import something_else\n\nresult = do_work()'],
    ]);

    const result = checkRemovedCode(file, otherFiles);
    expect(result.issues.length).toBe(0);
  });
});
