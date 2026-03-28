import { checkSlopComments } from '../src/checks/slop-comments';
import { DiffFile } from '../src/types';

describe('checkSlopComments — Tautological Comments', () => {
  test('flags "Initialize the variable" above variable init', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// Initialize the variable\nlet x = 0;\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('Tautological'))).toBe(true);
  });

  test('flags "Return the result" above return statement', () => {
    const file: DiffFile = {
      filename: 'utils.ts',
      status: 'added',
      additions: 4,
      deletions: 0,
      content: `function foo() {\n  const result = 42;\n  // Return the result\n  return result;\n}\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('Tautological'))).toBe(true);
  });

  test('flags "Import dependencies" above imports', () => {
    const file: DiffFile = {
      filename: 'app.py',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `# Import dependencies\nimport os\n`,
    };
    const result = checkSlopComments(file, 'python');
    expect(result.issues.some(i => i.message.includes('Tautological'))).toBe(true);
  });

  test('flags "Define the function" above function def', () => {
    const file: DiffFile = {
      filename: 'app.py',
      status: 'added',
      additions: 3,
      deletions: 0,
      content: `# Define the function\ndef process_data(data):\n    return data\n`,
    };
    const result = checkSlopComments(file, 'python');
    expect(result.issues.some(i => i.message.includes('Tautological'))).toBe(true);
  });

  test('flags "Loop through items" above for loop', () => {
    const file: DiffFile = {
      filename: 'app.js',
      status: 'added',
      additions: 4,
      deletions: 0,
      content: `// Loop through items\nfor (const item of items) {\n  process(item);\n}\n`,
    };
    const result = checkSlopComments(file, 'javascript');
    expect(result.issues.some(i => i.message.includes('Tautological'))).toBe(true);
  });

  test('does not flag meaningful comments', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// Offset by 1 because the API uses 1-based indexing\nlet offset = page - 1;\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    const tautological = result.issues.filter(i => i.message.includes('Tautological'));
    expect(tautological.length).toBe(0);
  });
});

describe('checkSlopComments — AI Boilerplate Filler', () => {
  test('flags "This function handles..."', () => {
    const file: DiffFile = {
      filename: 'handler.ts',
      status: 'added',
      additions: 3,
      deletions: 0,
      content: `// This function handles the user authentication\nfunction auth(user: string) {\n  return true;\n}\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('boilerplate'))).toBe(true);
  });

  test('flags "Helper function to..."', () => {
    const file: DiffFile = {
      filename: 'utils.py',
      status: 'added',
      additions: 3,
      deletions: 0,
      content: `# Helper function to format the output\ndef format_output(data):\n    return str(data)\n`,
    };
    const result = checkSlopComments(file, 'python');
    expect(result.issues.some(i => i.message.includes('boilerplate'))).toBe(true);
  });

  test('flags "TODO: Add error handling"', () => {
    const file: DiffFile = {
      filename: 'api.ts',
      status: 'added',
      additions: 3,
      deletions: 0,
      content: `// TODO: Add error handling\nfunction fetchData() {\n  return fetch('/api');\n}\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('boilerplate'))).toBe(true);
  });

  test('flags "Main logic here"', () => {
    const file: DiffFile = {
      filename: 'app.js',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// Main logic here\nrunApp();\n`,
    };
    const result = checkSlopComments(file, 'javascript');
    expect(result.issues.some(i => i.message.includes('boilerplate'))).toBe(true);
  });
});

describe('checkSlopComments — Over-commenting', () => {
  test('flags when >40% of lines are comments', () => {
    const lines: string[] = [];
    for (let i = 0; i < 6; i++) {
      lines.push(`// Comment line ${i}`);
    }
    for (let i = 0; i < 6; i++) {
      lines.push(`const x${i} = ${i};`);
    }
    const file: DiffFile = {
      filename: 'verbose.ts',
      status: 'added',
      additions: 12,
      deletions: 0,
      content: lines.join('\n') + '\n',
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('Over-commenting'))).toBe(true);
    const overIssue = result.issues.find(i => i.message.includes('Over-commenting'));
    expect(overIssue?.penalty).toBe(8);
  });

  test('does not flag files with <10 lines', () => {
    const file: DiffFile = {
      filename: 'small.ts',
      status: 'added',
      additions: 4,
      deletions: 0,
      content: `// comment\n// comment\n// comment\nconst x = 1;\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('Over-commenting'))).toBe(false);
  });

  test('does not flag normal comment ratio', () => {
    const lines: string[] = [];
    lines.push('// One comment');
    for (let i = 0; i < 10; i++) {
      lines.push(`const x${i} = ${i};`);
    }
    const file: DiffFile = {
      filename: 'normal.ts',
      status: 'added',
      additions: 11,
      deletions: 0,
      content: lines.join('\n') + '\n',
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('Over-commenting'))).toBe(false);
  });
});

describe('checkSlopComments — Section Divider Spam', () => {
  test('flags excessive decorative dividers', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 9,
      deletions: 0,
      content: [
        '// =============',
        'const a = 1;',
        '// -------------',
        'const b = 2;',
        '// *************',
        'const c = 3;',
      ].join('\n') + '\n',
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('section divider'))).toBe(true);
  });

  test('flags consecutive comment lines (3+)', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 6,
      deletions: 0,
      content: [
        '// Step 1: Get the data',
        '// Step 2: Process the data',
        '// Step 3: Return the data',
        'const data = getData();',
        'process(data);',
        'return data;',
      ].join('\n') + '\n',
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('consecutive comment'))).toBe(true);
  });

  test('does not flag JSDoc blocks', () => {
    const file: DiffFile = {
      filename: 'api.ts',
      status: 'added',
      additions: 6,
      deletions: 0,
      content: [
        '/**',
        ' * Fetches user data from the API.',
        ' * @param id - The user ID',
        ' * @returns The user object',
        ' */',
        'function getUser(id: string) { return {}; }',
      ].join('\n') + '\n',
    };
    const result = checkSlopComments(file, 'typescript');
    const consecutive = result.issues.filter(i => i.message.includes('consecutive comment'));
    expect(consecutive.length).toBe(0);
  });
});

describe('checkSlopComments — AI Signature Phrases', () => {
  test('flags "as mentioned above"', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// As mentioned above, this handles auth\nfunction auth() {}\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues.some(i => i.message.includes('AI signature'))).toBe(true);
  });

  test('flags "it\'s important to note"', () => {
    const file: DiffFile = {
      filename: 'config.py',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `# It's important to note that this config is global\nCONFIG = {}\n`,
    };
    const result = checkSlopComments(file, 'python');
    expect(result.issues.some(i => i.message.includes('AI signature'))).toBe(true);
  });

  test('flags "for better readability"', () => {
    const file: DiffFile = {
      filename: 'utils.js',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// Extracted for better readability\nfunction helper() {}\n`,
    };
    const result = checkSlopComments(file, 'javascript');
    expect(result.issues.some(i => i.message.includes('AI signature'))).toBe(true);
  });

  test('flags "self-explanatory"', () => {
    const file: DiffFile = {
      filename: 'app.go',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// The code below is self-explanatory\nfunc main() {}\n`,
    };
    const result = checkSlopComments(file, 'go');
    expect(result.issues.some(i => i.message.includes('AI signature'))).toBe(true);
  });
});

describe('checkSlopComments — Config', () => {
  test('respects "off" rule config', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// Initialize the variable\nlet x = 0;\n`,
    };
    const result = checkSlopComments(file, 'typescript', { rules: { 'slop-comments': 'off' } });
    expect(result.issues.length).toBe(0);
  });

  test('uses configured severity', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// Initialize the variable\nlet x = 0;\n`,
    };
    const result = checkSlopComments(file, 'typescript', { rules: { 'slop-comments': 'error' } });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].severity).toBe('error');
  });

  test('defaults to warning severity', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// Initialize the variable\nlet x = 0;\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    expect(result.issues[0].severity).toBe('warning');
  });
});

describe('checkSlopComments — Penalty values', () => {
  test('tautological comments get penalty 3', () => {
    const file: DiffFile = {
      filename: 'app.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      content: `// Initialize the variable\nlet x = 0;\n`,
    };
    const result = checkSlopComments(file, 'typescript');
    const issue = result.issues.find(i => i.message.includes('Tautological'));
    expect(issue?.penalty).toBe(3);
  });

  test('over-commenting gets penalty 8', () => {
    const lines: string[] = [];
    for (let i = 0; i < 6; i++) lines.push(`// Comment ${i}`);
    for (let i = 0; i < 6; i++) lines.push(`const x${i} = ${i};`);
    const file: DiffFile = {
      filename: 'verbose.ts',
      status: 'added',
      additions: 12,
      deletions: 0,
      content: lines.join('\n') + '\n',
    };
    const result = checkSlopComments(file, 'typescript');
    const issue = result.issues.find(i => i.message.includes('Over-commenting'));
    expect(issue?.penalty).toBe(8);
  });
});
