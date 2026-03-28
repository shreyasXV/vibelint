// VibeLint — Slop Comments Detector
// Detects AI-generated slop comments: tautological comments, boilerplate filler,
// over-commenting, section divider spam, and AI signature phrases

import { CheckResult, Issue, DiffFile, Language, VibeLintConfig } from '../types';

// Tautological comment patterns — comments that just restate the code
const TAUTOLOGICAL_PATTERNS: Array<{ comment: RegExp; code: RegExp; label: string }> = [
  { comment: /initialize\s+(?:the\s+)?(?:variable|var)/i, code: /(?:let|const|var|int|float|string)\s+\w+\s*=/, label: 'variable initialization' },
  { comment: /return\s+(?:the\s+)?result/i, code: /return\s/, label: 'return statement' },
  { comment: /import\s+(?:the\s+)?(?:dependencies|modules|packages|libraries)/i, code: /(?:import\s|from\s.*import|require\s*\(|use\s)/, label: 'import statement' },
  { comment: /define\s+(?:the\s+)?(?:function|method|class)/i, code: /(?:function\s|def\s|fn\s|func\s|class\s)/, label: 'definition' },
  { comment: /loop\s+(?:through|over)\s+(?:the\s+)?(?:items|elements|array|list|entries)/i, code: /(?:for\s|\.forEach|\.map|while\s)/, label: 'loop' },
  { comment: /check\s+(?:if|whether)\s+(?:the\s+)?(?:condition|value)/i, code: /if\s*\(/, label: 'conditional' },
  { comment: /set\s+(?:the\s+)?(?:value|property)/i, code: /\w+\s*=\s*/, label: 'assignment' },
  { comment: /create\s+(?:a\s+)?(?:new\s+)?(?:instance|object)/i, code: /new\s+\w+/, label: 'instantiation' },
  { comment: /call\s+(?:the\s+)?(?:function|method)/i, code: /\w+\s*\(/, label: 'function call' },
  { comment: /declare\s+(?:the\s+)?(?:variable|constant)/i, code: /(?:let|const|var)\s+\w+/, label: 'declaration' },
  { comment: /export\s+(?:the\s+)?(?:module|function|class|component)/i, code: /export\s/, label: 'export statement' },
  { comment: /add\s+(?:the\s+)?(?:event\s+)?listener/i, code: /\.addEventListener|\.on\(/, label: 'event listener' },
  { comment: /throw\s+(?:an?\s+)?(?:error|exception)/i, code: /throw\s/, label: 'throw statement' },
];

// AI boilerplate filler phrases
const BOILERPLATE_PATTERNS: RegExp[] = [
  /this\s+function\s+handles/i,
  /TODO:?\s*add\s+(?:error\s+)?handling/i,
  /TODO:?\s*add\s+(?:proper\s+)?(?:error\s+)?handling/i,
  /TODO:?\s*implement/i,
  /helper\s+function\s+(?:to|for|that)/i,
  /utility\s+(?:method|function)\s+(?:to|for|that)/i,
  /main\s+logic\s+here/i,
  /process\s+the\s+data/i,
  /handle\s+the\s+response/i,
  /configuration\s+section/i,
  /this\s+(?:method|class)\s+(?:is\s+responsible\s+for|handles|manages)/i,
  /the\s+(?:following|above|below)\s+(?:code|function|method)\s+(?:is|does|will)/i,
  /we\s+need\s+to\s+(?:first|also|then)/i,
  /here\s+we\s+(?:define|create|initialize|set\s+up)/i,
];

// AI signature phrases in comments
const AI_SIGNATURE_PATTERNS: RegExp[] = [
  /as\s+mentioned\s+(?:above|below|earlier|previously)/i,
  /note\s+that\s+this/i,
  /it(?:'s| is)\s+important\s+to\s+note/i,
  /for\s+(?:better\s+)?clarity/i,
  /for\s+(?:better\s+)?readability/i,
  /self[- ]explanatory/i,
  /as\s+(?:you\s+can\s+)?see\s+(?:above|below|here)/i,
  /(?:please\s+)?note\s+that\s+we/i,
  /this\s+(?:is\s+)?(?:a\s+)?(?:simple|basic|straightforward)\s+(?:implementation|approach)/i,
  /for\s+(?:the\s+sake\s+of|purposes\s+of)\s+(?:simplicity|brevity)/i,
];

// Section divider patterns
const SECTION_DIVIDER_PATTERN = /^[/*#-]*\s*[=\-*]{5,}\s*[/*#-]*$/;

function isCommentLine(text: string, language: Language): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return true;
  }
  if ((language === 'python') && trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
    return true;
  }
  return false;
}

function extractCommentText(text: string): string {
  const trimmed = text.trim();
  // Strip comment prefix
  if (trimmed.startsWith('///')) return trimmed.slice(3).trim();
  if (trimmed.startsWith('//')) return trimmed.slice(2).trim();
  if (trimmed.startsWith('#')) return trimmed.slice(1).trim();
  if (trimmed.startsWith('/*')) return trimmed.slice(2).replace(/\*\/\s*$/, '').trim();
  if (trimmed.startsWith('*')) return trimmed.slice(1).trim();
  return trimmed;
}

function isJsDocOrDocstring(text: string, prevLine: string | undefined, nextLine: string | undefined): boolean {
  const trimmed = text.trim();
  // JSDoc / Javadoc
  if (trimmed.startsWith('/**') || trimmed.startsWith('* @') || trimmed === '*/') return true;
  // Python docstrings
  if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) return true;
  // Rust doc comments
  if (trimmed.startsWith('///') || trimmed.startsWith('//!')) return true;
  // Go doc comments (comment immediately before func/type/package)
  if (trimmed.startsWith('//') && nextLine && /^\s*(func|type|package|var|const)\s/.test(nextLine)) return true;
  // Inside a JSDoc block (line starts with *)
  if (trimmed.startsWith('*') && !trimmed.startsWith('**') && prevLine && /^\s*\/?\*/.test(prevLine.trim())) return true;
  return false;
}

export function checkSlopComments(file: DiffFile, language: Language, config?: VibeLintConfig): CheckResult {
  const issues: Issue[] = [];
  const content = file.content || '';
  const patch = file.patch || '';

  if (!content && !patch) return { issues };

  // Determine severity from config
  const severity = config?.rules?.['slop-comments'] ?? 'warning';
  if (severity === 'off') return { issues };

  // Extract lines to check (added lines from diff, or full content)
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

  if (linesToCheck.length === 0) return { issues };

  // --- Check 1: Tautological comments ---
  for (let i = 0; i < linesToCheck.length - 1; i++) {
    const { text, lineNum } = linesToCheck[i];
    if (!isCommentLine(text, language)) continue;

    const commentText = extractCommentText(text);
    if (!commentText) continue;

    // Skip doc comments
    const prevText = i > 0 ? linesToCheck[i - 1].text : undefined;
    const nextText = linesToCheck[i + 1]?.text;
    if (isJsDocOrDocstring(text, prevText, nextText)) continue;

    // Check next non-empty line for tautological match
    let nextCodeLine: string | undefined;
    for (let j = i + 1; j < linesToCheck.length; j++) {
      const candidate = linesToCheck[j].text.trim();
      if (candidate && !isCommentLine(linesToCheck[j].text, language)) {
        nextCodeLine = candidate;
        break;
      }
    }

    if (nextCodeLine) {
      for (const pattern of TAUTOLOGICAL_PATTERNS) {
        if (pattern.comment.test(commentText) && pattern.code.test(nextCodeLine)) {
          issues.push({
            type: 'slop-comments',
            severity: severity as 'error' | 'warning' | 'info',
            file: file.filename,
            line: lineNum,
            message: `Tautological comment restates the ${pattern.label}`,
            detail: `\`${text.trim().slice(0, 80)}\`\n→ This comment just describes what the code already says. Remove it.`,
            penalty: 3,
            suggestion: 'Delete this comment — the code is self-documenting here.',
          });
          break;
        }
      }
    }
  }

  // --- Check 2: AI boilerplate filler ---
  for (const { text, lineNum } of linesToCheck) {
    if (!isCommentLine(text, language)) continue;
    const commentText = extractCommentText(text);
    if (!commentText) continue;

    // Skip pattern definitions (e.g., regex arrays in linter code)
    if (/\/.*\/.test|RegExp|new RegExp|pattern.*[:=]|regex.*[:=]/i.test(text.trim())) continue;

    for (const pattern of BOILERPLATE_PATTERNS) {
      if (pattern.test(commentText)) {
        issues.push({
          type: 'slop-comments',
          severity: severity as 'error' | 'warning' | 'info',
          file: file.filename,
          line: lineNum,
          message: 'AI boilerplate filler comment',
          detail: `\`${text.trim().slice(0, 80)}\`\n→ Generic AI-generated comment that adds no value.`,
          penalty: 3,
          suggestion: 'Remove this boilerplate comment or replace with a specific explanation of *why*, not *what*.',
        });
        break;
      }
    }
  }

  // --- Check 3: Over-commenting (>40% of added lines are comments) ---
  const totalLines = linesToCheck.filter(l => l.text.trim().length > 0).length;
  if (totalLines >= 10) { // Only flag if there are enough lines to be meaningful
    const commentLines = linesToCheck.filter(l => l.text.trim().length > 0 && isCommentLine(l.text, language)).length;
    const commentRatio = commentLines / totalLines;

    if (commentRatio > 0.4) {
      issues.push({
        type: 'slop-comments',
        severity: severity as 'error' | 'warning' | 'info',
        file: file.filename,
        line: linesToCheck[0].lineNum,
        message: `Over-commenting: ${Math.round(commentRatio * 100)}% of lines are comments`,
        detail: `${commentLines} of ${totalLines} non-empty lines are comments. AI-generated code tends to over-explain every line.`,
        penalty: 8,
        suggestion: 'Remove obvious comments and keep only those explaining *why* something is done, not *what* is done.',
      });
    }
  }

  // --- Check 4: Section divider spam ---
  let consecutiveCommentCount = 0;
  let consecutiveCommentStart = 0;
  let dividerCount = 0;

  for (const { text, lineNum } of linesToCheck) {
    const trimmed = text.trim();

    // Count section dividers
    if (SECTION_DIVIDER_PATTERN.test(trimmed)) {
      dividerCount++;
      if (dividerCount >= 3) {
        issues.push({
          type: 'slop-comments',
          severity: severity as 'error' | 'warning' | 'info',
          file: file.filename,
          line: lineNum,
          message: 'Excessive section divider comments',
          detail: `Found ${dividerCount} decorative divider comments. AI loves to add ======= and ------- everywhere.`,
          penalty: 3,
          suggestion: 'Remove decorative divider comments. Use blank lines or code structure to separate sections instead.',
        });
        dividerCount = 0; // Reset to avoid duplicate reports
      }
    }

    // Track consecutive comment-only lines (not JSDoc/docstrings)
    if (isCommentLine(text, language) && trimmed.length > 0) {
      const prevText = consecutiveCommentCount > 0 ? linesToCheck.find(l => l.lineNum === lineNum - 1)?.text : undefined;
      if (!isJsDocOrDocstring(text, prevText, undefined)) {
        if (consecutiveCommentCount === 0) consecutiveCommentStart = lineNum;
        consecutiveCommentCount++;
      } else {
        consecutiveCommentCount = 0;
      }
    } else {
      if (consecutiveCommentCount >= 3) {
        issues.push({
          type: 'slop-comments',
          severity: severity as 'error' | 'warning' | 'info',
          file: file.filename,
          line: consecutiveCommentStart,
          message: `${consecutiveCommentCount} consecutive comment lines`,
          detail: `Found ${consecutiveCommentCount} consecutive non-doc comment lines. AI tends to write walls of comments explaining obvious code.`,
          penalty: 3,
          suggestion: 'Consolidate or remove these comments. If the code needs this much explanation, consider refactoring instead.',
        });
      }
      consecutiveCommentCount = 0;
    }
  }

  // Check trailing consecutive comments at end of file
  if (consecutiveCommentCount >= 3) {
    issues.push({
      type: 'slop-comments',
      severity: severity as 'error' | 'warning' | 'info',
      file: file.filename,
      line: consecutiveCommentStart,
      message: `${consecutiveCommentCount} consecutive comment lines`,
      detail: `Found ${consecutiveCommentCount} consecutive non-doc comment lines. AI tends to write walls of comments explaining obvious code.`,
      penalty: 3,
      suggestion: 'Consolidate or remove these comments. If the code needs this much explanation, consider refactoring instead.',
    });
  }

  // --- Check 5: AI signature phrases in comments ---
  for (const { text, lineNum } of linesToCheck) {
    if (!isCommentLine(text, language)) continue;
    const commentText = extractCommentText(text);
    if (!commentText) continue;

    for (const pattern of AI_SIGNATURE_PATTERNS) {
      if (pattern.test(commentText)) {
        issues.push({
          type: 'slop-comments',
          severity: severity as 'error' | 'warning' | 'info',
          file: file.filename,
          line: lineNum,
          message: 'AI signature phrase in comment',
          detail: `\`${text.trim().slice(0, 80)}\`\n→ This phrasing is a hallmark of AI-generated comments.`,
          penalty: 3,
          suggestion: 'Rewrite this comment in your own voice, or remove it if it adds no value.',
        });
        break;
      }
    }
  }

  return { issues };
}
