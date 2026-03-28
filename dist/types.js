"use strict";
// VibeLint — Types
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLanguage = detectLanguage;
exports.isTestFile = isTestFile;
exports.matchesGlob = matchesGlob;
exports.isIgnored = isIgnored;
function detectLanguage(filename) {
    if (filename.endsWith('.py'))
        return 'python';
    if (filename.endsWith('.js') || filename.endsWith('.jsx'))
        return 'javascript';
    if (filename.endsWith('.ts') || filename.endsWith('.tsx'))
        return 'typescript';
    if (filename.endsWith('.go'))
        return 'go';
    if (filename.endsWith('.rs'))
        return 'rust';
    return null;
}
function isTestFile(filename) {
    const lower = filename.toLowerCase();
    return (lower.includes('test') ||
        lower.includes('spec') ||
        lower.includes('__tests__') ||
        lower.startsWith('test_') ||
        lower.endsWith('_test.py') ||
        lower.endsWith('.test.ts') ||
        lower.endsWith('.test.js') ||
        lower.endsWith('.spec.ts') ||
        lower.endsWith('.spec.js') ||
        lower.endsWith('_test.go') || // Go test files
        lower.includes('_test.go') // Go test files (any path)
    );
}
// Simple glob matching for ignore patterns
function matchesGlob(filename, pattern) {
    // Convert glob to regex
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '###DOUBLESTAR###')
        .replace(/\*/g, '[^/]*')
        .replace(/###DOUBLESTAR###/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(filename);
}
function isIgnored(filename, ignorePatterns) {
    return ignorePatterns.some(pattern => matchesGlob(filename, pattern));
}
//# sourceMappingURL=types.js.map