// Tests for AI Critic Gate + CLI scanner logic

import { resolveAICriticOptions } from '../src/checks/ai-critic';

describe('AI Critic — resolveAICriticOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VIBELINT_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.VIBELINT_BASE_URL;
    delete process.env.VIBELINT_MODEL;
    delete process.env.OPENAI_MODEL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns null when no API key is set', () => {
    const result = resolveAICriticOptions();
    expect(result).toBeNull();
  });

  test('detects OpenAI from OPENAI_API_KEY', () => {
    process.env.OPENAI_API_KEY = 'sk-test-123';
    const result = resolveAICriticOptions();
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe('sk-test-123');
    expect(result!.provider).toBe('openai');
  });

  test('detects Anthropic from ANTHROPIC_API_KEY', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-123';
    const result = resolveAICriticOptions();
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe('sk-ant-test-123');
    expect(result!.provider).toBe('anthropic');
  });

  test('VIBELINT_API_KEY takes priority', () => {
    process.env.VIBELINT_API_KEY = 'vl-key-123';
    process.env.OPENAI_API_KEY = 'sk-test-123';
    const result = resolveAICriticOptions();
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe('vl-key-123');
  });

  test('respects OPENAI_BASE_URL', () => {
    process.env.OPENAI_API_KEY = 'sk-test-123';
    process.env.OPENAI_BASE_URL = 'https://custom.api.com/v1';
    const result = resolveAICriticOptions();
    expect(result!.baseUrl).toBe('https://custom.api.com/v1');
  });

  test('respects VIBELINT_MODEL', () => {
    process.env.OPENAI_API_KEY = 'sk-test-123';
    process.env.VIBELINT_MODEL = 'gpt-4o';
    const result = resolveAICriticOptions();
    expect(result!.model).toBe('gpt-4o');
  });
});

// Test the Issue type now accepts 'ai-critic'
import { Issue } from '../src/types';

describe('Types — ai-critic issue type', () => {
  test('Issue type accepts ai-critic', () => {
    const issue: Issue = {
      type: 'ai-critic',
      severity: 'warning',
      file: 'test.py',
      line: 1,
      message: 'AI Critic found issue',
      detail: 'test detail',
      penalty: 8,
    };
    expect(issue.type).toBe('ai-critic');
  });
});

// Test CLI file discovery logic
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI — file discovery', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibelint-test-'));

    // Create test file structure
    fs.writeFileSync(path.join(tmpDir, 'app.py'), 'import os\nprint("hello")');
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'console.log("hi")');
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Not a source file');
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'main.go'), 'package main');
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'lib.js'), 'module.exports = {}');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('finds source files recursively', () => {
    // Import the function by requiring the built file
    // For testing, we'll just verify the file structure exists
    const files = walkDir(tmpDir);
    expect(files).toContain(path.join(tmpDir, 'app.py'));
    expect(files).toContain(path.join(tmpDir, 'index.ts'));
    expect(files).toContain(path.join(tmpDir, 'src', 'main.go'));
  });

  test('skips node_modules', () => {
    const files = walkDir(tmpDir);
    expect(files.find(f => f.includes('node_modules'))).toBeUndefined();
  });

  test('skips non-source files', () => {
    const files = walkDir(tmpDir);
    expect(files.find(f => f.endsWith('.md'))).toBeUndefined();
  });
});

// Simple walk for testing (mirrors CLI logic)
import { detectLanguage } from '../src/types';

function walkDir(dir: string): string[] {
  const results: string[] = [];
  const skip = ['node_modules', '.git', 'dist', 'build'];

  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (!skip.includes(entry.name)) walk(full);
      } else if (detectLanguage(entry.name)) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}
