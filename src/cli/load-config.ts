import { cosmiconfig } from 'cosmiconfig';
import type { OpenCrocConfig } from '../types.js';
import { loadEnvFiles } from '../env/load-env.js';

const MODULE_NAME = 'opencroc';

const SEARCH_PLACES = [
  'openclaw-feishu-progress.config.ts',
  'openclaw-feishu-progress.config.js',
  'openclaw-feishu-progress.config.json',
  '.openclaw-feishu-progressrc.json',
  'opencroc.config.ts',
  'opencroc.config.js',
  'opencroc.config.json',
  '.opencrocrc.json',
  'package.json',
];

export interface LoadConfigResult {
  config: OpenCrocConfig;
  filepath: string;
}

export async function loadConfig(cwd?: string): Promise<LoadConfigResult> {
  loadEnvFiles(cwd ?? process.cwd());

  const explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: SEARCH_PLACES,
    ...(cwd ? { stopDir: cwd } : {}),
  });

  const result = cwd ? await explorer.search(cwd) : await explorer.search();

  if (!result || result.isEmpty) {
    throw new Error(
      'No project config found. Create `openclaw-feishu-progress.config.*` or use the legacy `opencroc.config.*` name.',
    );
  }

  const config: OpenCrocConfig =
    result.config?.default ?? result.config;

  if (!config.backendRoot) {
    throw new Error(
      `Invalid config in ${result.filepath}: "backendRoot" is required.`,
    );
  }

  return { config, filepath: result.filepath };
}
