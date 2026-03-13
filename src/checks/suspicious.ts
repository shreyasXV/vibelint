// VibeLint — Suspicious Patterns Detector
// Detects AI-generated code smells: TODOs, hardcoded secrets, empty catches, console.logs

import { CheckResult, Issue, DiffFile, Language, VibeLintConfig } from '../types';

// Hardcoded secret patterns
const SECRET_PATTERNS = [
  { regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'API Key' },
  { regex: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i, label: 'Password/Secret' },
  { regex: /(?:token|auth[_-]?token|access[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'Token' },
  { regex: /(?:private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'Private Key' },
  { regex: /(?:aws[_-]?secret|aws[_-]?key)\s*[:=]\s*['"][A-Za-z0-9/+=]{20,}['"]/i, label: 'AWS Credential' },
  { regex: /(?:Bearer\s+)[A-Za-z0-9._-]{20,}/i, label: 'Bearer Token' },
  { regex: /ghp_[A-Za-z0-9]{36}/, label: 'GitHub PAT' },
  { regex: /sk-[A-Za-z0-9]{20,}/, label: 'OpenAI API Key' },
  { regex: /xox[bps]-[A-Za-z0-9-]{10,}/, label: 'Slack Token' },
];

// TODO/FIXME patterns
const TODO_PATTERNS = [
  /\b(TODO|FIXME|HACK|XXX|TEMP|TEMPORARY)\b\s*[:.]?\s*/i,
];

// Empty catch patterns
const EMPTY_CATCH_PYTHON = [
  /except\s*(?:\w+\s*)?:\s*$/,          // except: or except Exception:
  /except\s*(?:\w+\s*)?:\s*pass\s*$/,   // except: pass
  /except\s*(?:\w+\s*)?:\s*\.{3}\s*$/,  // except: ...
];

const EMPTY_CATCH_JS = [
  /catch\s*\([^)]*\)\s*\{\s*\}/,        // catch(e) {}
  /catch\s*\([^)]*\)\s*\{\s*\/\//,      // catch(e) { // ignore
  /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/, // .catch(() => {})
];

// Console.log left in code
const CONSOLE_LOG_PATTERNS = [
  /console\.(log|debug|info)\s*\(/,
  /print\s*\(\s*f?['"]debug/i,
  /System\.out\.println/,
];

export function checkSuspicious(file: DiffFile, language: Language, config?: VibeLintConfig): CheckResult {
  const issues: Issue[] = [];
  const content = file.content || '';
  const patch = file.patch || '';

  if (!content && !patch) return { issues };

  // Determine severity from config
  const severity = config?.rules?.suspicious ?? 'warning';
  if (severity === 'off') return { issues };

  // We only check ADDED lines from the diff if available, otherwise full content
  const linesToCheck: { text: string; lineNum: number }[] = [];

  if (patch) {
    const patchLines = patch.split('\n');
    let currentLine = 0;
    for (const line of patchLines) {
      const hunkMatch = line.match(/^@@\s*-\d+(?:,\d+)?\s*\+(\d+)/);
      if (hunkMatch) {
        currentLine = parseInt(hunkMatch[1], 10);
        continue;
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        linesToCheck.push({ text: line.slice(1), lineNum: currentLine });
        currentLine++;
      } else if (!line.startsWith('-')) {
        currentLine++;
      }
    }
  } else {
    content.split('\n').forEach((text, i) => {
      linesToCheck.push({ text, lineNum: i + 1 });
    });
  }

  for (const { text, lineNum } of linesToCheck) {
    const trimmed = text.trim();

    // Skip empty lines and pure comments that are just file headers
    if (!trimmed) continue;

    // Check for hardcoded secrets
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(trimmed)) {
        // Skip if it looks like an example/placeholder
        if (/(?:example|placeholder|xxx|your[_-]|changeme|replace)/i.test(trimmed)) continue;
        // Skip test files
        if (file.filename.includes('test') || file.filename.includes('spec')) continue;
        // Skip .env.example files
        if (file.filename.includes('.example') || file.filename.includes('.sample')) continue;

        issues.push({
          type: 'suspicious',
          severity: 'error',
          file: file.filename,
          line: lineNum,
          message: `Possible hardcoded ${pattern.label} detected`,
          detail: `Line contains what appears to be a hardcoded ${pattern.label}. Consider using environment variables instead.`,
          penalty: 15,
          suggestion: `Replace with an environment variable: \`process.env.${pattern.label.toUpperCase().replace(/[/ ]/g, '_')}\` or use a secrets manager.`,
        });
        break; // One match per line is enough
      }
    }

    // Check for TODO/FIXME in new code
    for (const pattern of TODO_PATTERNS) {
      if (pattern.test(trimmed)) {
        // Only flag if it's in a comment (not in a regex pattern definition or string)
        const isComment = trimmed.startsWith('#') || trimmed.startsWith('//') ||
                         trimmed.startsWith('*') || trimmed.startsWith('/*');
        // Skip lines that define regex patterns containing TODO/FIXME (e.g., linter rule definitions)
        const isPatternDef = /\/.*TODO.*\/|RegExp\(|new RegExp|pattern.*[:=]|regex.*[:=]/i.test(trimmed);
        if (isPatternDef) break;

        if (isComment || /\/\/.*\b(TODO|FIXME|HACK|XXX)\b/i.test(trimmed) ||
            /#.*\b(TODO|FIXME|HACK|XXX)\b/i.test(trimmed)) {

          const todoMatch = trimmed.match(/\b(TODO|FIXME|HACK|XXX)\b/i);
          const kind = todoMatch ? todoMatch[1].toUpperCase() : 'TODO';

          issues.push({
            type: 'suspicious',
            severity: 'info',
            file: file.filename,
            line: lineNum,
            message: `TODO/FIXME comment in new code`,
            detail: `\`${trimmed.slice(0, 80)}\`\n→ AI-generated code often includes placeholder ${kind}s. Consider resolving before merging.`,
            penalty: 3,
            suggestion: `Resolve this ${kind} before merging: implement the intended logic or remove the placeholder comment.`,
          });
        }
        break;
      }
    }

    // Check for empty catch blocks
    const catchPatterns = language === 'python' ? EMPTY_CATCH_PYTHON : EMPTY_CATCH_JS;
    for (const pattern of catchPatterns) {
      if (pattern.test(trimmed)) {
        issues.push({
          type: 'suspicious',
          severity: severity as 'error' | 'warning' | 'info',
          file: file.filename,
          line: lineNum,
          message: 'Empty error handler — errors are silently swallowed',
          detail: `\`${trimmed.slice(0, 80)}\`\n→ Silently catching errors hides bugs. At minimum, log the error.`,
          penalty: severity === 'error' ? 15 : severity === 'warning' ? 10 : 3,
          suggestion: language === 'python'
            ? `Add error logging: \`except Exception as e:\\n    logger.error("Unexpected error: %s", e)\``
            : `Add error logging: \`catch (err) { console.error('Unexpected error:', err); }\``,
        });
        break;
      }
    }

    // Check for console.log/print debug left in code
    if (!file.filename.includes('test') && !file.filename.includes('spec')) {
      for (const pattern of CONSOLE_LOG_PATTERNS) {
        if (pattern.test(trimmed)) {
          // Skip if it's in a logging utility file or a CLI tool (CLI tools are SUPPOSED to print)
          if (file.filename.includes('log') || file.filename.includes('debug')) continue;
          if (file.filename.includes('cli') || file.filename.includes('bin/')) continue;
          issues.push({
            type: 'suspicious',
            severity: 'info',
            file: file.filename,
            line: lineNum,
            message: 'Debug logging left in code',
            detail: `\`${trimmed.slice(0, 80)}\`\n→ Consider removing debug output before merging.`,
            penalty: 2,
            suggestion: `Remove this debug statement or replace with a proper logger (e.g., \`logger.debug(...)\`).`,
          });
          break;
        }
      }
    }

    // v0.2.0: Custom rules from config
    if (config?.['custom-rules']) {
      for (const rule of config['custom-rules']) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(trimmed)) {
            issues.push({
              type: 'custom',
              severity: rule.severity,
              file: file.filename,
              line: lineNum,
              message: rule.message,
              detail: `\`${trimmed.slice(0, 80)}\`\n→ Matched custom rule pattern: \`${rule.pattern}\``,
              penalty: rule.severity === 'error' ? 10 : rule.severity === 'warning' ? 5 : 2,
              suggestion: `Review and address the pattern matching: \`${rule.pattern}\``,
            });
            break; // One custom rule match per line
          }
        } catch {
          // Invalid regex in custom rule — skip
        }
      }
    }
  }

  return { issues };
}
