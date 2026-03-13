import { CheckResult, Language, VibeLintConfig } from '../types';
export interface AICriticOptions {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    provider?: 'openai' | 'anthropic';
    maxFilesPerRequest?: number;
    temperature?: number;
    maxTokens?: number;
}
export declare function checkWithAICritic(files: Array<{
    filename: string;
    content: string;
    language: Language;
}>, options: AICriticOptions, _config?: VibeLintConfig): Promise<CheckResult>;
export declare function resolveAICriticOptions(config?: VibeLintConfig): AICriticOptions | null;
//# sourceMappingURL=ai-critic.d.ts.map