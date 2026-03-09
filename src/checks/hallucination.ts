// VibeLint — Hallucination Checker
// Detects imports that reference packages not in your dependency files

import { CheckResult, Issue, DiffFile, Language, VibeLintConfig } from '../types';

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

// Go standard library packages (common ones)
const GO_STDLIB = new Set([
  'bufio', 'bytes', 'context', 'crypto', 'database', 'encoding', 'errors',
  'fmt', 'html', 'http', 'io', 'log', 'math', 'net', 'os', 'path',
  'reflect', 'regexp', 'runtime', 'sort', 'strconv', 'strings', 'sync',
  'syscall', 'testing', 'time', 'unicode', 'unsafe',
  // Full stdlib paths
  'crypto/md5', 'crypto/sha256', 'crypto/tls', 'encoding/json', 'encoding/xml',
  'encoding/base64', 'fmt', 'io/ioutil', 'io/fs', 'net/http', 'net/url',
  'os/exec', 'path/filepath', 'sync/atomic', 'text/template', 'html/template',
]);

// Rust standard library crates (always available)
const RUST_STDLIB = new Set([
  'std', 'core', 'alloc', 'proc_macro',
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

// v0.2.0: Go import extraction
export function extractGoImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');
  let inImportBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Single import: import "package"
    const singleImport = line.match(/^import\s+"([^"]+)"/);
    if (singleImport) {
      const fullPath = singleImport[1];
      const parts = fullPath.split('/');
      // External packages have domain-like first segment (e.g., github.com/...)
      if (fullPath.includes('.') || parts[0].includes('.')) {
        imports.push({ module: fullPath, fullPath, line: lineNum, raw: line });
      }
      continue;
    }

    // Start of import block
    if (line.match(/^import\s*\(/) || line === 'import (') {
      inImportBlock = true;
      continue;
    }

    if (inImportBlock) {
      if (line === ')') {
        inImportBlock = false;
        continue;
      }
      // Package path (with optional alias): alias "path" or "path"
      const pkgMatch = line.match(/(?:\w+\s+)?"([^"]+)"/);
      if (pkgMatch) {
        const fullPath = pkgMatch[1];
        const parts = fullPath.split('/');
        // External packages have domain-like first segment (e.g., github.com/...)
        if (fullPath.includes('.') && parts[0].includes('.')) {
          imports.push({ module: fullPath, fullPath, line: lineNum, raw: line });
        }
      }
    }
  }

  return imports;
}

// v0.2.0: Rust use statement extraction
export function extractRustImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // extern crate foo;
    const externCrate = line.match(/^extern\s+crate\s+(\w+)/);
    if (externCrate) {
      const module = externCrate[1];
      imports.push({ module, fullPath: module, line: lineNum, raw: line });
      continue;
    }

    // use foo::bar or use foo::{bar, baz}
    const useMatch = line.match(/^use\s+([\w]+)/);
    if (useMatch) {
      const module = useMatch[1];
      // Skip std/core/alloc
      if (!RUST_STDLIB.has(module)) {
        imports.push({ module, fullPath: module, line: lineNum, raw: line });
      }
    }
  }

  return imports;
}

export function checkHallucinations(
  file: DiffFile,
  language: Language,
  dependencies: Set<string>,
  config?: VibeLintConfig
): CheckResult {
  const issues: Issue[] = [];
  const content = file.content || '';

  if (!content) return { issues };

  // Determine severity from config
  const severity = config?.rules?.hallucinations ?? 'error';
  if (severity === 'off') return { issues };

  let imports: ImportInfo[] = [];
  let builtins: Set<string>;

  switch (language) {
    case 'python':
      imports = extractPythonImports(content);
      builtins = PYTHON_STDLIB;
      break;
    case 'javascript':
    case 'typescript':
      imports = extractJSImports(content);
      builtins = NODE_BUILTINS;
      break;
    case 'go':
      imports = extractGoImports(content);
      builtins = GO_STDLIB;
      break;
    case 'rust':
      imports = extractRustImports(content);
      builtins = RUST_STDLIB;
      break;
    default:
      return { issues };
  }

  for (const imp of imports) {
    // Skip builtins/stdlib
    if (builtins.has(imp.module)) continue;

    // Skip relative imports (already handled above for JS)
    if (imp.module.startsWith('.') || imp.module.startsWith('/')) continue;

    // For Go: the module key in go.mod is the module path prefix
    if (language === 'go') {
      const isKnown = Array.from(dependencies).some(dep =>
        imp.fullPath.startsWith(dep) || dep.startsWith(imp.fullPath)
      );
      if (isKnown) continue;
    } else if (language === 'rust') {
      if (dependencies.has(imp.module)) continue;
    } else {
      // Check against declared dependencies
      // Normalize module name for Python (replace - with _)
      const normalizedModule = language === 'python'
        ? imp.module.toLowerCase().replace(/-/g, '_')
        : imp.module;

      // Check direct match
      if (dependencies.has(normalizedModule) || dependencies.has(imp.module)) continue;

      // Check namespace packages (e.g., google.cloud -> google-cloud-*)
      if (language === 'python') {
        const isNamespace = Array.from(dependencies).some(dep => {
          const depNorm = dep.replace(/-/g, '_');
          return depNorm.startsWith(normalizedModule) || normalizedModule.startsWith(depNorm);
        });
        if (isNamespace) continue;
      }
    }

    // Generate suggestion
    let suggestion: string;
    if (language === 'python') {
      suggestion = `Run \`pip install ${imp.module}\` and add it to requirements.txt, or remove this import if it was hallucinated.`;
    } else if (language === 'go') {
      suggestion = `Run \`go get ${imp.module}\` to add this dependency, or remove the import if it was hallucinated.`;
    } else if (language === 'rust') {
      suggestion = `Add \`${imp.module} = "...\"\` to [dependencies] in Cargo.toml, or remove this \`use\` if it was hallucinated.`;
    } else {
      suggestion = `Run \`npm install ${imp.module}\` and add it to package.json, or remove this import if it was hallucinated.`;
    }

    const depFileName = language === 'python'
      ? 'requirements.txt / pyproject.toml'
      : language === 'go'
      ? 'go.mod'
      : language === 'rust'
      ? 'Cargo.toml'
      : 'package.json';

    issues.push({
      type: 'hallucination',
      severity: severity as 'error' | 'warning' | 'info',
      file: file.filename,
      line: imp.line,
      message: `Package '${imp.module}' not found in dependencies`,
      detail: `\`${imp.raw}\`\n→ '${imp.module}' is not listed in your ${depFileName}. This may be a hallucinated import.`,
      penalty: severity === 'error' ? 15 : severity === 'warning' ? 8 : 3,
      suggestion,
    });
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

export function parsePyprojectToml(content: string): Set<string> {
  const deps = new Set<string>();
  // Simple TOML parser for [project.dependencies] and [tool.poetry.dependencies]
  const lines = content.split('\n');
  let inDeps = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inDeps = false;
      if (trimmed === '[tool.poetry.dependencies]') {
        inDeps = true;
      }
      continue;
    }

    // Handle [project] dependencies = [...] format
    if (trimmed.startsWith('dependencies') && trimmed.includes('=')) {
      inDeps = true;
      // Handle inline array: dependencies = ["numpy>=1.0", "pandas"]
      const arrayMatch = trimmed.match(/\[([^\]]*)\]/);
      if (arrayMatch) {
        const items = arrayMatch[1].split(',');
        for (const item of items) {
          const cleaned = item.trim().replace(/['"]/g, '');
          const match = cleaned.match(/^([a-zA-Z0-9_-]+)/);
          if (match) deps.add(match[1].toLowerCase().replace(/-/g, '_'));
        }
        if (!trimmed.endsWith(',')) inDeps = false;
      }
      continue;
    }

    if (inDeps) {
      // Handle items in multi-line array or TOML table
      const cleaned = trimmed.replace(/['"]/g, '').replace(/,\s*$/, '');
      if (cleaned === ']') { inDeps = false; continue; }
      const match = cleaned.match(/^([a-zA-Z0-9_-]+)/);
      if (match && match[1] !== '#') {
        deps.add(match[1].toLowerCase().replace(/-/g, '_'));
      }
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

// v0.2.0: Parse go.mod for module dependencies
export function parseGoMod(content: string): Set<string> {
  const deps = new Set<string>();
  const lines = content.split('\n');
  let inRequireBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // require ( ... ) block
    if (trimmed.startsWith('require (')) {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && trimmed === ')') {
      inRequireBlock = false;
      continue;
    }

    if (inRequireBlock) {
      // format: github.com/user/repo v1.2.3
      const match = trimmed.match(/^([\w./-]+)\s+v/);
      if (match) deps.add(match[1]);
      continue;
    }

    // Single require: require github.com/user/repo v1.2.3
    const singleRequire = trimmed.match(/^require\s+([\w./-]+)\s+v/);
    if (singleRequire) {
      deps.add(singleRequire[1]);
    }
  }

  return deps;
}

// v0.2.0: Parse Cargo.toml for crate dependencies
export function parseCargoToml(content: string): Set<string> {
  const deps = new Set<string>();
  const lines = content.split('\n');
  let inDeps = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[')) {
      inDeps = trimmed === '[dependencies]' ||
               trimmed === '[dev-dependencies]' ||
               trimmed === '[build-dependencies]';
      continue;
    }

    if (inDeps && trimmed && !trimmed.startsWith('#')) {
      // crate_name = "version" or crate_name = { version = "..." }
      const match = trimmed.match(/^([\w-]+)\s*=/);
      if (match) {
        deps.add(match[1]);
      }
    }
  }

  return deps;
}
