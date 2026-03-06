// VibeLint — Main Entry Point (GitHub Action)

import * as core from '@actions/core';
import * as github from '@actions/github';
import { DiffFile, Language, VibeReport, detectLanguage, isTestFile } from './types';
import { checkHallucinations, parsePackageJson, parsePythonDeps } from './checks/hallucination';
import { checkTests } from './checks/empty-tests';
import { checkRemovedCode } from './checks/removed-code';
import { calculateScore, formatReport } from './scoring';

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const failBelow = parseInt(core.getInput('fail-below') || '0', 10);
    const languagesInput = core.getInput('languages') || 'python,javascript,typescript';
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

    core.info(`🔍 VibeLint scanning PR #${pullNumber}...`);

    // Get PR files
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    // Fetch dependency files for hallucination checking
    const dependencies = new Set<string>();
    for (const depFile of ['package.json', 'requirements.txt', 'pyproject.toml']) {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: depFile,
          ref: context.payload.pull_request.head.sha,
        });
        if ('content' in data && data.content) {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          if (depFile === 'package.json') {
            for (const dep of parsePackageJson(content)) dependencies.add(dep);
          } else {
            for (const dep of parsePythonDeps(content)) dependencies.add(dep);
          }
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
          ref: context.payload.pull_request.head.sha,
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
      const hallResult = checkHallucinations(diffFile, language, dependencies);
      allIssues.push(...hallResult.issues);

      // Run test checks on test files only
      if (isTestFile(file.filename)) {
        const testResult = checkTests(diffFile, language);
        allIssues.push(...testResult.issues);
      }

      // Run removed code check on modified files
      if (file.status === 'modified' && file.patch) {
        const removedResult = checkRemovedCode(diffFile, allFileContents);
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
    // First, check if we already have a VibeLint comment (update instead of spam)
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

run();
