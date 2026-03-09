// VibeLint — Main Entry Point (GitHub Action)

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import { DiffFile, Language, VibeReport, VibeLintConfig, detectLanguage, isTestFile, isIgnored } from './types';
import { checkHallucinations, parsePackageJson, parsePythonDeps, parsePyprojectToml, parseGoMod, parseCargoToml } from './checks/hallucination';
import { checkTests } from './checks/empty-tests';
import { checkRemovedCode } from './checks/removed-code';
import { checkSuspicious } from './checks/suspicious';
import { calculateScore, formatReport } from './scoring';
import { loadConfig, loadConfigFromContent } from './config';

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const failBelowInput = core.getInput('fail-below') || '0';
    const languagesInput = core.getInput('languages') || 'python,javascript,typescript,go,rust';
    const configPath = core.getInput('config') || '.vibelint.yml';
    const enabledLanguages = new Set(languagesInput.split(',').map(l => l.trim().toLowerCase()));

    const octokit = github.getOctokit(token);
    const context = github.context;

    if (!context.payload.pull_request) {
      core.info('Not a pull request — skipping VibeLint.');
      return;
    }

    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const pullNumber = context.payload.pull_request.number;
    const headSha = context.payload.pull_request.head.sha;

    core.info(`🔍 VibeLint scanning PR #${pullNumber}...`);

    // v0.2.0: Load config from repo (try fetching from GitHub first, fall back to local)
    let config: VibeLintConfig = {};
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: configPath,
        ref: headSha,
      });
      if ('content' in data && data.content) {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        config = loadConfigFromContent(content);
        core.info(`📋 Loaded VibeLint config from ${configPath}`);
      }
    } catch {
      // Config file doesn't exist — use defaults (backward compatible)
      // Also try local filesystem (for testing)
      if (fs.existsSync(configPath)) {
        config = loadConfig(configPath);
        core.info(`📋 Loaded VibeLint config from local ${configPath}`);
      } else {
        core.info(`📋 No ${configPath} found — using defaults`);
      }
    }

    // Config can override fail-below
    const failBelow = config['fail-below'] ?? parseInt(failBelowInput, 10);
    const ignorePatterns = config.ignore || [];

    // Get PR files
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    // Fetch dependency files for hallucination checking
    const dependencies = new Set<string>();
    const depFileMap: Record<string, (content: string) => Set<string>> = {
      'package.json': parsePackageJson,
      'requirements.txt': parsePythonDeps,
      'pyproject.toml': parsePyprojectToml,
      'go.mod': parseGoMod,
      'Cargo.toml': parseCargoToml,
    };

    for (const [depFile, parser] of Object.entries(depFileMap)) {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: depFile,
          ref: headSha,
        });
        if ('content' in data && data.content) {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          for (const dep of parser(content)) dependencies.add(dep);
        }
      } catch {
        // File doesn't exist — that's fine
      }
    }

    core.info(`📦 Found ${dependencies.size} declared dependencies`);

    // Process each changed file
    const allIssues: VibeReport['issues'] = [];
    let filesChecked = 0;
    const allFileContents = new Map<string, string>();

    for (const file of files) {
      // v0.2.0: Check ignore patterns
      if (ignorePatterns.length > 0 && isIgnored(file.filename, ignorePatterns)) {
        core.info(`⏭️  Skipping ${file.filename} (matches ignore pattern)`);
        continue;
      }

      const language = detectLanguage(file.filename);
      if (!language || !enabledLanguages.has(language)) continue;
      if (file.status === 'removed') continue;

      filesChecked++;

      // Fetch full file content
      let content = '';
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: file.filename,
          ref: headSha,
        });
        if ('content' in data && data.content) {
          content = Buffer.from(data.content, 'base64').toString('utf-8');
        }
      } catch {
        core.warning(`Could not fetch content for ${file.filename}`);
        continue;
      }

      allFileContents.set(file.filename, content);

      const diffFile: DiffFile = {
        filename: file.filename,
        status: file.status as DiffFile['status'],
        patch: file.patch,
        additions: file.additions,
        deletions: file.deletions,
        content,
      };

      // Run hallucination check on all files
      const hallResult = checkHallucinations(diffFile, language, dependencies, config);
      allIssues.push(...hallResult.issues);

      // Run test checks on test files only
      if (isTestFile(file.filename)) {
        const testResult = checkTests(diffFile, language, config);
        allIssues.push(...testResult.issues);
      }

      // Run suspicious patterns check on all files
      const suspiciousResult = checkSuspicious(diffFile, language, config);
      allIssues.push(...suspiciousResult.issues);

      // Run removed code check on modified files
      if (file.status === 'modified' && file.patch) {
        const removedResult = checkRemovedCode(diffFile, allFileContents, config);
        allIssues.push(...removedResult.issues);
      }
    }

    // Build report
    const score = calculateScore(allIssues);
    const report: VibeReport = {
      score,
      issues: allIssues,
      filesChecked,
      summary: `Vibe Score: ${score}/100 — ${allIssues.length} issues found`,
    };

    const reportMd = formatReport(report);

    core.info(`\n${reportMd}`);

    // Post comment on PR
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 50,
    });

    const existingComment = comments.find(c =>
      c.body?.includes('VibeLint — AI Code Audit')
    );

    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: reportMd,
      });
      core.info(`📝 Updated existing VibeLint comment`);
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: reportMd,
      });
      core.info(`📝 Posted VibeLint comment on PR #${pullNumber}`);
    }

    // v0.2.0: Post inline check run annotations
    await postCheckRunAnnotations(octokit, owner, repo, headSha, pullNumber, allIssues, score);

    // Set outputs
    core.setOutput('score', score.toString());
    core.setOutput('issues', allIssues.length.toString());

    // Fail if below threshold
    if (failBelow > 0 && score < failBelow) {
      core.setFailed(`VibeLint score ${score} is below threshold ${failBelow}`);
    }

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

// v0.2.0: Post check run with inline PR annotations
async function postCheckRunAnnotations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  owner: string,
  repo: string,
  headSha: string,
  pullNumber: number,
  issues: VibeReport['issues'],
  score: number
): Promise<void> {
  try {
    const annotations = issues.map(issue => ({
      path: issue.file,
      start_line: issue.line,
      end_line: issue.line,
      annotation_level: issue.severity === 'error'
        ? 'failure' as const
        : issue.severity === 'warning'
        ? 'warning' as const
        : 'notice' as const,
      title: `VibeLint: ${issue.message}`,
      message: issue.suggestion
        ? `${issue.detail}\n\n💡 Suggestion: ${issue.suggestion}`
        : issue.detail,
    }));

    // GitHub limits to 50 annotations per request
    const chunks: typeof annotations[] = [];
    for (let i = 0; i < annotations.length; i += 50) {
      chunks.push(annotations.slice(i, i + 50));
    }

    const conclusion = score >= 70 ? 'success' : 'failure';
    const summary = `VibeLint found ${issues.length} issue${issues.length !== 1 ? 's' : ''}. Vibe Score: ${score}/100`;

    if (chunks.length === 0) {
      // No issues — post clean check
      await octokit.rest.checks.create({
        owner,
        repo,
        name: 'VibeLint',
        head_sha: headSha,
        status: 'completed',
        conclusion: 'success',
        output: {
          title: `Vibe Score: ${score}/100 ✅`,
          summary: 'No AI code smells detected.',
        },
      });
      return;
    }

    // Post first chunk with check creation
    await octokit.rest.checks.create({
      owner,
      repo,
      name: 'VibeLint',
      head_sha: headSha,
      status: 'completed',
      conclusion,
      output: {
        title: `Vibe Score: ${score}/100`,
        summary,
        annotations: chunks[0],
      },
    });

    // Update with remaining chunks if needed
    // Note: additional annotations require check update (omitted for simplicity)
    core.info(`📌 Posted ${chunks[0].length} inline annotations`);

  } catch (err) {
    // Annotation posting is best-effort — don't fail the whole action
    core.warning(`Could not post inline annotations: ${err instanceof Error ? err.message : String(err)}`);
  }
}

run();
