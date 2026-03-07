import { checkSuspicious } from '../src/checks/suspicious';
import { DiffFile } from '../src/types';

describe('checkSuspicious — Hardcoded Secrets', () => {
  test('flags hardcoded API key', () => {
    const file: DiffFile = {
      filename: 'config.py',
      status: 'modified',
      additions: 3,
      deletions: 0,
      content: `
API_KEY = "sk-1234567890abcdefghij"
DATABASE_URL = "postgres://localhost/mydb"
`,
    };
    const result = checkSuspicious(file, 'python');
    expect(result.issues.some(i => i.message.includes('API Key') || i.message.includes('Token'))).toBe(true);
  });

  test('flags GitHub PAT', () => {
    const file: DiffFile = {
      filename: 'deploy.js',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";\n`,
    };
    const result = checkSuspicious(file, 'javascript');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('skips placeholder secrets', () => {
    const file: DiffFile = {
      filename: 'config.py',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `API_KEY = "your_api_key_here"\n`,
    };
    const result = checkSuspicious(file, 'python');
    expect(result.issues.length).toBe(0);
  });

  test('skips test files', () => {
    const file: DiffFile = {
      filename: 'test_config.py',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `API_KEY = "sk-1234567890abcdefghij"\n`,
    };
    const result = checkSuspicious(file, 'python');
    const secretIssues = result.issues.filter(i => i.message.includes('Key') || i.message.includes('Token'));
    expect(secretIssues.length).toBe(0);
  });
});

describe('checkSuspicious — TODO/FIXME', () => {
  test('flags TODO comments in new code', () => {
    const file: DiffFile = {
      filename: 'app.py',
      status: 'modified',
      additions: 2,
      deletions: 0,
      content: `
# TODO: implement proper validation
def validate(data):
    return True
`,
    };
    const result = checkSuspicious(file, 'python');
    expect(result.issues.some(i => i.message.includes('TODO'))).toBe(true);
  });

  test('flags FIXME and HACK comments', () => {
    const file: DiffFile = {
      filename: 'utils.ts',
      status: 'modified',
      additions: 2,
      deletions: 0,
      content: `
// FIXME: this is a temporary workaround
// HACK: need to refactor this later
function doStuff() { return 42; }
`,
    };
    const result = checkSuspicious(file, 'typescript');
    expect(result.issues.filter(i => i.message.includes('TODO')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('checkSuspicious — Empty Catch Blocks', () => {
  test('flags Python except:pass', () => {
    const file: DiffFile = {
      filename: 'handler.py',
      status: 'modified',
      additions: 3,
      deletions: 0,
      content: `
try:
    do_something()
except Exception: pass
`,
    };
    const result = checkSuspicious(file, 'python');
    expect(result.issues.some(i => i.message.includes('error handler'))).toBe(true);
  });

  test('flags JS empty catch', () => {
    const file: DiffFile = {
      filename: 'api.js',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `try { fetch(url); } catch(e) {}\n`,
    };
    const result = checkSuspicious(file, 'javascript');
    expect(result.issues.some(i => i.message.includes('error handler'))).toBe(true);
  });
});

describe('checkSuspicious — Debug Logging', () => {
  test('flags console.log in production code', () => {
    const file: DiffFile = {
      filename: 'api.js',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `console.log("debug: user data", userData);\n`,
    };
    const result = checkSuspicious(file, 'javascript');
    expect(result.issues.some(i => i.message.includes('Debug logging'))).toBe(true);
  });

  test('allows console.log in test files', () => {
    const file: DiffFile = {
      filename: 'api.test.js',
      status: 'modified',
      additions: 1,
      deletions: 0,
      content: `console.log("test output");\n`,
    };
    const result = checkSuspicious(file, 'javascript');
    const debugIssues = result.issues.filter(i => i.message.includes('Debug logging'));
    expect(debugIssues.length).toBe(0);
  });
});
