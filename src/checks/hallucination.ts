// VibeLint — Hallucination Checker
// Detects imports that reference packages not in your dependency files

import { CheckResult, Issue, DiffFile, Language } from '../types';

// Python stdlib modules (common ones — not exhaustive but covers 95%)
const PYTHON_STDLIB = new Set([
  'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio', 'asyncore',
  'atexit', 'base64', 'bdb', 'binascii', 'binhex', 'bisect', 'builtins',
  'bz2', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath', 'cmd', 'code',
  'codecs', 'codeop', 'collections', 'colorsys', 'compileall', 'concurrent',
  'configparser', 'contextlib', 'contextvars', 'copy', 'copyreg', 'cProfile',
  'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm',
  'decimal', 'difflib', 'dis', 'distutils', 'doctest', 'email', 'encodings',
  'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch',
  'fractions', 'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext',
  'glob', 'grp', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http',
  'idlelib', 'imaplib', 'imghdr', 'imp', 'importlib', 'inspect', 'io',
  'ipaddress', 'itertools', 'json', 'keyword', 'lib2to3', 'linecache',
  'locale', 'logging', 'lzma', 'mailbox', 'mailcap', 'marshal', 'math',
  'mimetypes', 'mmap', 'modulefinder', 'multiprocessing', 'netrc', 'nis',
  'nntplib', 'numbers', 'operator', 'optparse', 'os', 'ossaudiodev',
  'pathlib', 'pdb', 'pickle', 'pickletools', 'pipes', 'pkgutil', 'platform',
  'plistlib', 'poplib', 'posix', 'posixpath', 'pprint', 'profile', 'pstats',
  'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc', 'queue', 'quopri',
  'random', 're', 'readline', 'reprlib', 'resource', 'rlcompleter', 'runpy',
  'sched', 'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil',
  'signal', 'site', 'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver',
  'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
  'subprocess', 'sunau', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny',
  'tarfile', 'telnetlib', 'tempfile', 'termios', 'test', 'textwrap',
  'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize', 'tomllib',
  'trace', 'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo',
  'types', 'typing', 'unicodedata', 'unittest', 'urllib', 'uu', 'uuid',
  'venv', 'warnings', 'wave', 'weakref', 'webbrowser', 'winreg', 'winsound',
  'wsgiref', 'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport',
  'zlib', '_thread', '__future__', 'typing_extensions',
]);

// Node.js built-in modules
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
  'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url',
  'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  'node:assert', 'node:buffer', 'node:child_process', 'node:crypto',
  'node:dns', 'node:events', 'node:fs', 'node:http', 'node:http2',
  'node:https', 'node:net', 'node:os', 'node:path', 'node:process',
  'node:querystring', 'node:readline', 'node:stream', 'node:timers',
  'node:tls', 'node:url', 'node:util', 'node:v8', 'node:vm',
  'node:worker_threads', 'node:zlib', 'node:test',
]);

interface ImportInfo {
  module: string;      // The top-level package name
  fullPath: string;    // Full import path
  line: number;
  raw: string;         // Original import statement
}

export function extractPythonImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // import foo / import foo.bar / import foo as f
    const importMatch = line.match(/^import\s+([\w.]+)/);
    if (importMatch) {
      const fullPath = importMatch[1];
      const module = fullPath.split('.')[0];
      imports.push({ module, fullPath, line: lineNum, raw: line });
    }

    // from foo import bar / from foo.bar import baz
    const fromMatch = line.match(/^from\s+([\w.]+)\s+import/);
    if (fromMatch) {
      const fullPath = fromMatch[1];
      const module = fullPath.split('.')[0];
      imports.push({ module, fullPath, line: lineNum, raw: line });
    }
  }

  return imports;
}

export function extractJSImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // import ... from 'package'
    const esImport = line.match(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/);
    if (esImport) {
      const fullPath = esImport[1];
      if (!fullPath.startsWith('.') && !fullPath.startsWith('/')) {
        // Third-party package
        const module = fullPath.startsWith('@')
          ? fullPath.split('/').slice(0, 2).join('/')  // @scope/package
          : fullPath.split('/')[0];
        imports.push({ module, fullPath, line: lineNum, raw: line });
      }
    }

    // const x = require('package')
    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const fullPath = requireMatch[1];
      if (!fullPath.startsWith('.') && !fullPath.startsWith('/')) {
        const module = fullPath.startsWith('@')
          ? fullPath.split('/').slice(0, 2).join('/')
          : fullPath.split('/')[0];
        imports.push({ module, fullPath, line: lineNum, raw: line });
      }
    }
  }

  return imports;
}

export function checkHallucinations(
  file: DiffFile,
  language: Language,
  dependencies: Set<string>
): CheckResult {
  const issues: Issue[] = [];
  const content = file.content || '';

  if (!content) return { issues };

  const imports = language === 'python'
    ? extractPythonImports(content)
    : extractJSImports(content);

  const builtins = language === 'python' ? PYTHON_STDLIB : NODE_BUILTINS;

  for (const imp of imports) {
    // Skip builtins/stdlib
    if (builtins.has(imp.module)) continue;

    // Skip relative imports (already handled above for JS)
    if (imp.module.startsWith('.') || imp.module.startsWith('/')) continue;

    // Check against declared dependencies
    if (!dependencies.has(imp.module)) {
      issues.push({
        type: 'hallucination',
        severity: 'error',
        file: file.filename,
        line: imp.line,
        message: `Package '${imp.module}' not found in dependencies`,
        detail: `\`${imp.raw}\`\n→ '${imp.module}' is not listed in your ${language === 'python' ? 'requirements.txt / pyproject.toml' : 'package.json'}. This may be a hallucinated import.`,
        penalty: 15,
      });
    }
  }

  return { issues };
}

export function parsePythonDeps(content: string): Set<string> {
  const deps = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    // Handle: package==1.0, package>=1.0, package[extra], package
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)/);
    if (match) {
      deps.add(match[1].toLowerCase().replace(/-/g, '_'));
    }
  }
  return deps;
}

export function parsePackageJson(content: string): Set<string> {
  const deps = new Set<string>();
  try {
    const pkg = JSON.parse(content);
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (pkg[section]) {
        for (const name of Object.keys(pkg[section])) {
          deps.add(name);
        }
      }
    }
  } catch {
    // Invalid JSON — skip
  }
  return deps;
}
