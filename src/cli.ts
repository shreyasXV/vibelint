#!/usr/bin/env node
// VibeLint CLI — scan local code for AI-generated bugs
// Usage: vibelint scan [path] [options]

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { DiffFile, Language, Issue, VibeReport, VibeLintConfig, detectLanguage, isTestFile, isIgnored } from './types';
import { checkHallucinations, parsePackageJson, parsePythonDeps, parsePyprojectToml, parseGoMod, parseCargoToml } from './checks/hallucination';
import { checkTests } from './checks/empty-tests';
import { checkSuspicious } from './checks/suspicious';
import { calculateScore } from './scoring';
import { loadConfig } from './config';
import { checkWithAICritic, resolveAICriticOptions, AICriticOptions } from './checks/ai-critic';

const VERSION = '0.3.0';

// ANSI colors — no chalk dependency needed
const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// Recursively find all source files
function findFiles(dir: string, ignorePatterns: string[] = []): string[] {
  const results: string[] = [];
  const defaultIgnore = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'vendor', 'target'];

  function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (entry.isDirectory()) {
        if (defaultIgnore.includes(entry.name)) continue;
        if (ignorePatterns.length > 0 && isIgnored(relativePath + '/', ignorePatterns)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (ignorePatterns.length > 0 && isIgnored(relativePath, ignorePatterns)) continue;
        if (detectLanguage(entry.name)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

// Load dependencies from local project (walks up to find project root)
function loadLocalDependencies(startDir: string): Set<string> {
  const deps = new Set<string>();
  const depFiles: Record<string, (content: string) => Set<string>> = {
    'package.json': parsePackageJson,
    'requirements.txt': parsePythonDeps,
    'pyproject.toml': parsePyprojectToml,
    'go.mod': parseGoMod,
    'Cargo.toml': parseCargoToml,
  };

  // Walk up from startDir to find dependency files (max 10 levels)
  let searchDir = path.resolve(startDir);
  for (let i = 0; i < 10; i++) {
    let foundAny = false;
    for (const [filename, parser] of Object.entries(depFiles)) {
      const filePath = path.join(searchDir, filename);
      if (fs.existsSync(filePath)) {
        foundAny = true;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          for (const dep of parser(content)) deps.add(dep);
        } catch {
          // Skip unreadable files
        }
      }
    }
    if (foundAny) break;  // Found project root
    const parent = path.dirname(searchDir);
    if (parent === searchDir) break;  // Hit filesystem root
    searchDir = parent;
  }

  return deps;
}

// Format issue for terminal output
function formatIssue(issue: Issue, idx: number): string {
  const sevIcon = issue.severity === 'error' ? c.red('✖') :
                  issue.severity === 'warning' ? c.yellow('⚠') : c.blue('ℹ');
  const sevLabel = issue.severity === 'error' ? c.red('ERROR') :
                   issue.severity === 'warning' ? c.yellow('WARN') : c.blue('INFO');

  let out = `  ${sevIcon} ${c.gray(`${idx + 1}.`)} ${c.bold(issue.message)}\n`;
  out += `     ${c.cyan(issue.file)}${c.gray(`:${issue.line}`)} ${sevLabel}\n`;
  if (issue.detail) {
    out += `     ${c.dim(issue.detail)}\n`;
  }
  if (issue.suggestion) {
    out += `     ${c.green('💡 ' + issue.suggestion)}\n`;
  }
  return out;
}

// Score display
function formatScore(score: number): string {
  const bar = '█'.repeat(Math.floor(score / 5)) + '░'.repeat(20 - Math.floor(score / 5));
  const color = score >= 90 ? c.green : score >= 70 ? c.yellow : c.red;
  const label = score >= 90 ? 'Clean' :
                score >= 70 ? 'Review Suggested' :
                score >= 50 ? 'Concerning' : 'Needs Human Review';

  return `\n${c.bold('Vibe Score:')} ${color(`${score}/100`)} ${c.dim(label)}\n${c.gray(bar)}\n`;
}

// Format JSON output (for CI integration)
function formatJSON(report: VibeReport & { aiCriticUsed: boolean }): string {
  return JSON.stringify({
    version: VERSION,
    score: report.score,
    filesChecked: report.filesChecked,
    issueCount: report.issues.length,
    aiCriticUsed: report.aiCriticUsed,
    issues: report.issues.map(i => ({
      type: i.type,
      severity: i.severity,
      file: i.file,
      line: i.line,
      message: i.message,
      detail: i.detail,
      suggestion: i.suggestion,
    })),
  }, null, 2);
}

// Format SARIF output (for GitHub Code Scanning)
function formatSARIF(report: VibeReport): string {
  return JSON.stringify({
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'VibeLint',
          version: VERSION,
          informationUri: 'https://github.com/shreyasXV/vibelint',
          rules: [
            { id: 'hallucination', shortDescription: { text: 'Hallucinated Import' } },
            { id: 'empty-test', shortDescription: { text: 'Empty/Tautological Test' } },
            { id: 'removed-code', shortDescription: { text: 'Removed Code Still Referenced' } },
            { id: 'suspicious', shortDescription: { text: 'Suspicious Pattern' } },
          ],
        },
      },
      results: report.issues.map(i => ({
        ruleId: i.type,
        level: i.severity === 'error' ? 'error' : i.severity === 'warning' ? 'warning' : 'note',
        message: { text: `${i.message}${i.detail ? '\n' + i.detail : ''}` },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: i.file },
            region: { startLine: i.line },
          },
        }],
      })),
    }],
  }, null, 2);
}

async function scanCommand(scanPath: string, options: {
  failBelow?: string;
  aiCritic?: boolean;
  model?: string;
  format?: string;
  config?: string;
  verbose?: boolean;
}) {
  const targetDir = path.resolve(scanPath || '.');
  const configPath = options.config || path.join(targetDir, '.vibelint.yml');

  if (!fs.existsSync(targetDir)) {
    console.error(c.red(`Error: Path "${targetDir}" does not exist`));
    process.exit(1);
  }

  // Load config
  const config: VibeLintConfig = fs.existsSync(configPath) ? loadConfig(configPath) : {};
  const failBelow = options.failBelow ? parseInt(options.failBelow, 10) : (config['fail-below'] || 0);
  const ignorePatterns = config.ignore || [];

  if (options.format !== 'json' && options.format !== 'sarif') {
    console.log(`\n${c.bold('🔍 VibeLint')} ${c.dim(`v${VERSION}`)}`);
    console.log(c.dim(`Scanning ${targetDir}...\n`));
  }

  // Find all source files
  const files = findFiles(targetDir, ignorePatterns);
  if (files.length === 0) {
    if (options.format !== 'json' && options.format !== 'sarif') {
      console.log(c.yellow('No supported source files found.'));
    }
    process.exit(0);
  }

  // Load project dependencies
  const dependencies = loadLocalDependencies(targetDir);

  if (options.verbose && options.format !== 'json') {
    console.log(c.dim(`Found ${files.length} files, ${dependencies.size} declared dependencies\n`));
  }

  // Run static checks on each file
  const allIssues: Issue[] = [];
  let filesChecked = 0;
  const allFileContents = new Map<string, string>();
  const aiCriticFiles: Array<{ filename: string; content: string; language: Language }> = [];

  for (const filePath of files) {
    const relativePath = path.relative(targetDir, filePath);
    const language = detectLanguage(filePath);
    if (!language) continue;

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    filesChecked++;
    allFileContents.set(relativePath, content);

    const diffFile: DiffFile = {
      filename: relativePath,
      status: 'added',  // Treat all local files as "added" for checking
      additions: content.split('\n').length,
      deletions: 0,
      content,
    };

    // Hallucination check
    const hallResult = checkHallucinations(diffFile, language, dependencies, config);
    allIssues.push(...hallResult.issues);

    // Test checks
    if (isTestFile(relativePath)) {
      const testResult = checkTests(diffFile, language, config);
      allIssues.push(...testResult.issues);
    }

    // Suspicious patterns
    const suspiciousResult = checkSuspicious(diffFile, language, config);
    allIssues.push(...suspiciousResult.issues);

    // Collect for AI Critic
    if (options.aiCritic) {
      aiCriticFiles.push({ filename: relativePath, content, language });
    }
  }

  // Run AI Critic if enabled
  let aiCriticUsed = false;
  if (options.aiCritic) {
    const aiOptions = resolveAICriticOptions(config);
    if (aiOptions) {
      if (options.model) aiOptions.model = options.model;
      if (options.format !== 'json' && options.format !== 'sarif') {
        console.log(c.cyan(`🧠 Running AI Critic (${aiOptions.provider || 'openai'})...\n`));
      }

      const aiResult = await checkWithAICritic(aiCriticFiles, aiOptions, config);
      allIssues.push(...aiResult.issues);
      aiCriticUsed = true;
    } else {
      if (options.format !== 'json' && options.format !== 'sarif') {
        console.log(c.yellow('⚠ AI Critic enabled but no API key found.'));
        console.log(c.dim('  Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or VIBELINT_API_KEY\n'));
      }
    }
  }

  // Calculate score
  const score = calculateScore(allIssues);
  const report: VibeReport & { aiCriticUsed: boolean } = {
    score,
    issues: allIssues,
    filesChecked,
    summary: `Vibe Score: ${score}/100 — ${allIssues.length} issues found`,
    aiCriticUsed,
  };

  // Output
  if (options.format === 'json') {
    console.log(formatJSON(report));
  } else if (options.format === 'sarif') {
    console.log(formatSARIF(report));
  } else {
    // Terminal output
    if (allIssues.length === 0) {
      console.log(c.green('✨ No AI code smells detected. Your code looks clean!\n'));
    } else {
      // Sort: errors first, then warnings, then info
      const sorted = [...allIssues].sort((a, b) => {
        const sevOrder = { error: 0, warning: 1, info: 2 };
        return sevOrder[a.severity] - sevOrder[b.severity];
      });

      const errors = sorted.filter(i => i.severity === 'error').length;
      const warnings = sorted.filter(i => i.severity === 'warning').length;
      const infos = sorted.filter(i => i.severity === 'info').length;

      console.log(`Found ${c.bold(String(allIssues.length))} issues: ` +
        `${errors > 0 ? c.red(`${errors} errors`) : ''}` +
        `${errors > 0 && warnings > 0 ? ', ' : ''}` +
        `${warnings > 0 ? c.yellow(`${warnings} warnings`) : ''}` +
        `${(errors > 0 || warnings > 0) && infos > 0 ? ', ' : ''}` +
        `${infos > 0 ? c.blue(`${infos} info`) : ''}\n`);

      sorted.forEach((issue, idx) => {
        console.log(formatIssue(issue, idx));
      });
    }

    console.log(formatScore(score));
    console.log(c.dim(`Checked ${filesChecked} files${aiCriticUsed ? ' (AI Critic enabled)' : ''}`));
    console.log(c.dim(`VibeLint v${VERSION} — https://github.com/shreyasXV/vibelint\n`));
  }

  // Exit code
  if (failBelow > 0 && score < failBelow) {
    process.exit(1);
  }
}

function initCommand() {
  const configContent = `# VibeLint Configuration
# See: https://github.com/shreyasXV/vibelint

# Fail CI if Vibe Score drops below this threshold (0 = disabled)
fail-below: 70

# Files/directories to ignore
ignore:
  - "vendor/**"
  - "generated/**"
  - "*.min.js"

# Rule severity overrides (error | warning | info | off)
rules:
  hallucinations: error
  empty-tests: warning
  removed-code: warning
  suspicious: warning

# Custom pattern rules
# custom-rules:
#   - pattern: "FIXME|HACK"
#     severity: warning
#     message: "AI left a FIXME/HACK comment"
`;

  const targetPath = path.join(process.cwd(), '.vibelint.yml');
  if (fs.existsSync(targetPath)) {
    console.log(c.yellow('⚠ .vibelint.yml already exists. Skipping.'));
    return;
  }

  fs.writeFileSync(targetPath, configContent);
  console.log(c.green('✅ Created .vibelint.yml'));
  console.log(c.dim('Edit it to customize VibeLint for your project.\n'));
}

// CLI setup
const program = new Command();

program
  .name('vibelint')
  .description('AI Code Audit — catches bugs your AI coding tool introduces')
  .version(VERSION);

program
  .command('scan')
  .description('Scan code for AI-generated bugs')
  .argument('[path]', 'Directory to scan', '.')
  .option('-f, --fail-below <score>', 'Fail if Vibe Score is below threshold')
  .option('--ai-critic', 'Enable AI Critic (requires OPENAI_API_KEY or ANTHROPIC_API_KEY)')
  .option('--model <model>', 'LLM model for AI Critic')
  .option('--format <format>', 'Output format: text, json, sarif', 'text')
  .option('-c, --config <path>', 'Path to .vibelint.yml')
  .option('-v, --verbose', 'Verbose output')
  .action(scanCommand);

program
  .command('init')
  .description('Create a .vibelint.yml config file')
  .action(initCommand);

// Default command: if no subcommand, treat arg as path to scan
program
  .argument('[path]', 'Directory to scan (shorthand for `vibelint scan <path>`)')
  .action(async (scanPath?: string) => {
    if (scanPath) {
      await scanCommand(scanPath, {});
    } else {
      program.help();
    }
  });

program.parse();
