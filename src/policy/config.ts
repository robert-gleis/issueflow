import fs from 'node:fs/promises';

import { defaultConfigPath, loadConfig, parseAutonomousModeFromContent, repoConfigPath } from '../config/load.js';

export interface ResolveAutonomousModeDeps {
  globalConfigPath?: string;
  readFile?: typeof fs.readFile;
}

async function readRepoAutonomousMode(
  repoRoot: string,
  readFile: typeof fs.readFile
): Promise<boolean | undefined> {
  const configPath = repoConfigPath(repoRoot);
  try {
    const content = await readFile(configPath, 'utf8');
    return parseAutonomousModeFromContent(content, configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function resolveAutonomousMode(
  repoRoot: string,
  deps: ResolveAutonomousModeDeps = {}
): Promise<boolean> {
  const readFile = deps.readFile ?? fs.readFile;
  const repoMode = await readRepoAutonomousMode(repoRoot, readFile);
  if (repoMode !== undefined) {
    return repoMode;
  }
  const config = await loadConfig(deps.globalConfigPath ?? defaultConfigPath());
  return config.autonomous_mode;
}
