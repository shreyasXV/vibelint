// VibeLint — Scoring Engine & Report Formatter

import { Issue, VibeReport } from './types';

export function calculateScore(issues: Issue[]): number {
  const totalPenalty = issues.reduce((sum, issue) => sum + issue.penalty, 0);
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

export function getScoreEmoji(score: number): string {
  if (score >= 90) return '✅';
  if (score >= 70) return '⚠️';
  if (score >= 50) return '🟡';
  return '🔴';
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return 'Clean';
  if (score >= 70) return 'Review Suggested';
  if (score >= 50) return 'Concerning';
  return 'Needs Human Review';
}

const ISSUE_EMOJI: Record<string, string> = {
  'hallucination': '👻',
  'empty-test': '🧪',
  'tautological-test': '🧪',
  'disconnected-test': '🔌',
  'removed-code': '🗑️',
  'suspicious': '⚠️',
  'custom': '🔎',
};

const ISSUE_LABEL: Record<string, string> = {
  'hallucination': 'HALLUCINATED IMPORT',
  'empty-test': 'EMPTY TEST',
  'tautological-test': 'TAUTOLOGICAL TEST',
  'disconnected-test': 'DISCONNECTED TEST',
  'removed-code': 'REMOVED CODE',
  'suspicious': 'SUSPICIOUS PATTERN',
  'custom': 'CUSTOM RULE',
};

export function formatReport(report: VibeReport): string {
  const { score, issues, filesChecked } = report;
  const emoji = getScoreEmoji(score);
  const label = getScoreLabel(score);

  const criticalCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  let md = `## 🔍 VibeLint — AI Code Audit\n\n`;
  md += `**Vibe Score: ${score}/100** ${emoji} ${label}\n\n`;

  // Summary table
  if (issues.length > 0) {
    md += `| Severity | Count |\n|----------|-------|\n`;
    if (criticalCount > 0) md += `| 🔴 Critical | ${criticalCount} |\n`;
    if (warningCount > 0) md += `| 🟡 Warning | ${warningCount} |\n`;
    if (infoCount > 0) md += `| ℹ️ Info | ${infoCount} |\n`;
    md += `\n`;
  }

  md += `*Checked ${filesChecked} file${filesChecked !== 1 ? 's' : ''} • VibeLint v0.2.0*\n\n`;

  if (issues.length === 0) {
    md += `> ✨ No AI code smells detected. Your code looks good!\n`;
    md += `\n---\n`;
    md += `*[VibeLint](https://github.com/shreyasXV/vibelint) — Your AI writes code. VibeLint makes sure it works.*\n`;
    return md;
  }

  md += `Found **${issues.length} issue${issues.length !== 1 ? 's' : ''}**:\n\n`;

  // Group by file
  const byFile = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!byFile.has(issue.file)) byFile.set(issue.file, []);
    byFile.get(issue.file)!.push(issue);
  }

  for (const [file, fileIssues] of byFile) {
    const fileEmoji = fileIssues.some(i => i.severity === 'error') ? '🔴' :
                      fileIssues.some(i => i.severity === 'warning') ? '🟡' : 'ℹ️';

    md += `<details>\n<summary>${fileEmoji} <code>${file}</code> — ${fileIssues.length} issue${fileIssues.length !== 1 ? 's' : ''}</summary>\n\n`;

    for (const issue of fileIssues) {
      const issueEmoji = ISSUE_EMOJI[issue.type] || '⚠️';
      const issueLabel = ISSUE_LABEL[issue.type] || issue.type.toUpperCase();
      const severityBadge = issue.severity === 'error' ? '🔴' :
                            issue.severity === 'warning' ? '🟡' : 'ℹ️';

      md += `${issueEmoji} **${issueLabel}** ${severityBadge} (line ${issue.line})\n`;
      md += `${issue.message}\n`;
      if (issue.detail) {
        md += `${issue.detail}\n`;
      }
      // v0.2.0: Show inline suggestion if available
      if (issue.suggestion) {
        md += `💡 **Suggestion:** ${issue.suggestion}\n`;
      }
      md += `\n`;
    }

    md += `</details>\n\n`;
  }

  md += `---\n`;
  md += `*[VibeLint](https://github.com/shreyasXV/vibelint) — Your AI writes code. VibeLint makes sure it works. • v0.2.0*\n`;

  return md;
}
