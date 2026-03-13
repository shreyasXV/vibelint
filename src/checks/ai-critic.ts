// VibeLint — AI Critic Gate (v0.3.0)
// LLM-powered semantic code review that catches what static analysis can't.
// This is the moat: curated prompts + accumulated AI bug patterns.

import { Issue, CheckResult, Language, DiffFile, VibeLintConfig } from '../types';

export interface AICriticOptions {
  apiKey: string;
  baseUrl?: string;         // OpenAI-compatible endpoint (default: https://api.openai.com/v1)
  model?: string;           // default: gpt-4o-mini (cheap + good)
  provider?: 'openai' | 'anthropic';  // auto-detected from apiKey prefix
  maxFilesPerRequest?: number;  // batch size (default: 5)
  temperature?: number;     // default: 0.1 (deterministic)
  maxTokens?: number;       // default: 4096
}

// The prompt is the product. This is where the moat lives.
const SYSTEM_PROMPT = `You are VibeLint's AI Critic — a senior engineer who specializes in catching bugs that AI coding tools (Cursor, Copilot, Claude Code, Windsurf) introduce.

You are NOT a general code reviewer. You specifically look for patterns where AI-generated code fails:

1. **Hallucinated APIs**: Methods, functions, or properties that don't exist in the library version being used. AI models are trained on multiple library versions and frequently hallucinate APIs from wrong versions.

2. **Subtle Logic Errors**: Off-by-one errors, wrong comparison operators (< vs <=), inverted boolean conditions, wrong variable used in similar-named pairs (userId vs usersId), incorrect null/undefined checks.

3. **Incomplete Implementations**: Functions that return hardcoded values, TODO/FIXME placeholders masquerading as real code, \`pass\` or empty blocks where real logic should be, mock data returned from production functions.

4. **Security Vulnerabilities**: SQL injection via string concatenation, hardcoded secrets/tokens, XSS from unescaped user input, path traversal, insecure randomness for crypto, eval() with user input.

5. **Type Confusion**: Wrong types passed to functions (string where number expected), incorrect generic parameters, unsafe type assertions that hide real type errors.

6. **Async/Concurrency Bugs**: Missing await, fire-and-forget promises that swallow errors, race conditions on shared state, incorrect error handling in async chains.

7. **Copy-Paste Artifacts**: AI copies patterns and forgets to update variable names, array indices, string literals, or function arguments. Look for suspicious repetition.

RULES:
- Only report issues you are CONFIDENT about (>80% sure it's a bug)
- Do NOT flag style preferences, formatting, or naming conventions
- Do NOT flag minor optimizations or "nice to have" improvements
- Focus on bugs that will cause runtime failures or security issues
- Each issue MUST have a specific line number and concrete fix
- If the code looks correct, return an empty issues array. DO NOT invent problems.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "issues": [
    {
      "line": 42,
      "severity": "error|warning",
      "category": "hallucinated-api|logic-error|incomplete|security|type-confusion|async-bug|copy-paste",
      "message": "Short one-line description",
      "detail": "Why this is a bug and what will happen",
      "suggestion": "Concrete fix (show the corrected code)"
    }
  ]
}`;

function buildFilePrompt(files: Array<{ filename: string; content: string; language: Language }>): string {
  let prompt = 'Review the following files for AI-generated code bugs:\n\n';
  for (const file of files) {
    prompt += `--- FILE: ${file.filename} (${file.language}) ---\n`;
    prompt += file.content + '\n\n';
  }
  return prompt;
}

interface LLMResponse {
  issues: Array<{
    line: number;
    severity: 'error' | 'warning';
    category: string;
    message: string;
    detail: string;
    suggestion: string;
  }>;
}

async function callOpenAI(
  prompt: string,
  options: AICriticOptions
): Promise<LLMResponse> {
  const baseUrl = options.baseUrl || 'https://api.openai.com/v1';
  const model = options.model || 'gpt-4o-mini';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error (${response.status}): ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices?.[0]?.message?.content || '{"issues":[]}';

  try {
    return JSON.parse(content) as LLMResponse;
  } catch {
    // LLM returned invalid JSON — try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as LLMResponse;
    }
    return { issues: [] };
  }
}

async function callAnthropic(
  prompt: string,
  options: AICriticOptions
): Promise<LLMResponse> {
  const model = options.model || 'claude-sonnet-4-20250514';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.1,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };
  const content = data.content?.[0]?.text || '{"issues":[]}';

  try {
    return JSON.parse(content) as LLMResponse;
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as LLMResponse;
    }
    return { issues: [] };
  }
}

async function callLLM(prompt: string, options: AICriticOptions): Promise<LLMResponse> {
  // Auto-detect provider from API key prefix
  const provider = options.provider ||
    (options.apiKey.startsWith('sk-ant-') ? 'anthropic' : 'openai');

  if (provider === 'anthropic') {
    return callAnthropic(prompt, options);
  }
  return callOpenAI(prompt, options);
}

const CATEGORY_TO_TYPE: Record<string, Issue['type']> = {
  'hallucinated-api': 'hallucination',
  'logic-error': 'suspicious',
  'incomplete': 'suspicious',
  'security': 'suspicious',
  'type-confusion': 'suspicious',
  'async-bug': 'suspicious',
  'copy-paste': 'suspicious',
};

export async function checkWithAICritic(
  files: Array<{ filename: string; content: string; language: Language }>,
  options: AICriticOptions,
  _config?: VibeLintConfig
): Promise<CheckResult> {
  const allIssues: Issue[] = [];
  const batchSize = options.maxFilesPerRequest || 5;

  // Batch files to avoid token limits
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    // Skip huge files (>500 lines) — they'll blow the token budget
    const filteredBatch = batch.filter(f => {
      const lines = f.content.split('\n').length;
      if (lines > 500) {
        // For large files, only send first 500 lines
        f.content = f.content.split('\n').slice(0, 500).join('\n') +
          '\n// ... (file truncated at 500 lines for AI review)';
      }
      return true;
    });

    const prompt = buildFilePrompt(filteredBatch);

    try {
      const result = await callLLM(prompt, options);

      for (const issue of result.issues || []) {
        // Find which file this issue belongs to
        const matchedFile = filteredBatch.find(f => {
          const lineCount = f.content.split('\n').length;
          return issue.line > 0 && issue.line <= lineCount;
        }) || filteredBatch[0];

        allIssues.push({
          type: CATEGORY_TO_TYPE[issue.category] || 'suspicious',
          severity: issue.severity === 'error' ? 'error' : 'warning',
          file: matchedFile?.filename || 'unknown',
          line: issue.line || 1,
          message: `[AI Critic] ${issue.message}`,
          detail: issue.detail,
          penalty: issue.severity === 'error' ? 15 : 8,
          suggestion: issue.suggestion,
        });
      }
    } catch (err) {
      // AI Critic is best-effort — don't fail the whole scan
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`AI Critic error on batch: ${errMsg}`);
    }
  }

  return { issues: allIssues };
}

// Resolve API key from config or environment
export function resolveAICriticOptions(config?: VibeLintConfig): AICriticOptions | null {
  // Check env vars in priority order
  const vibelintKey = process.env.VIBELINT_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const apiKey = vibelintKey || openaiKey || anthropicKey;
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || process.env.VIBELINT_BASE_URL,
    model: process.env.VIBELINT_MODEL || process.env.OPENAI_MODEL,
    provider: anthropicKey && !vibelintKey && !openaiKey ? 'anthropic' : 'openai',
  };
}
