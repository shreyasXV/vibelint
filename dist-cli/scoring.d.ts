import { Issue, VibeReport } from './types';
export declare function calculateScore(issues: Issue[]): number;
export declare function getScoreEmoji(score: number): string;
export declare function getScoreLabel(score: number): string;
export declare function formatReport(report: VibeReport): string;
