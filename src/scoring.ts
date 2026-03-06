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
};

const ISSUE_LABEL: Record<string, string> = {
  'hallucination': 'HALLUCINATED IMPORT',
  'empty-test': 'EMPTY TEST',
  'tautological-test': 'TAUTOLOGICAL TEST',
  'disconnected-test': 'DISCONNECTED TEST',
  'removed-code': 'REMOVED CODE',
};

export function formatReport(report: VibeReport): string {
  const { score, issues, filesChecked } = report;
  const emoji = getScoreEmoji(score);
  const label = getScoreLabel(score);

  let md = `## 🔍 VibeLint — AI Code Audit\n\n`;
  md += `**Vibe Score: ${score}/100** ${emoji} ${label}\n\n`;
  md += `*Checked ${filesChecked} file${filesChecked !== 1 ? 's' : ''}*\n\n`;

  if (issues.length === 0) {
    md += `> ✨ No AI code smells detected. Your code looks good!\n`;
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
    md += `### \`${file}\`\n\n`;
    for (const issue of fileIssues) {
      const emoji = ISSUE_EMOJI[issue.type] || '⚠️';
      const label = ISSUE_LABEL[issue.type] || issue.type.toUpperCase();
      md += `${emoji} **${label}** (line ${issue.line})\n`;
      md += `${issue.message}\n`;
      if (issue.detail) {
        md += `${issue.detail}\n`;
      }
      md += `\n`;
    }
  }

  md += `---\n`;
  md += `*[VibeLint](https://github.com/vibelint/vibelint) — Your AI writes code. VibeLint makes sure it works.*\n`;

  return md;
}
