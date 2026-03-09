// VibeLint — Config Loader
// Reads .vibelint.yml from the repository root

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { VibeLintConfig } from './types';

export function loadConfig(configPath: string): VibeLintConfig {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    return {};
  }

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    const parsed = yaml.load(content) as VibeLintConfig;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (err) {
    // Invalid YAML — return empty config (fail gracefully)
    return {};
  }
}

export function loadConfigFromContent(content: string): VibeLintConfig {
  try {
    const parsed = yaml.load(content) as VibeLintConfig;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}
