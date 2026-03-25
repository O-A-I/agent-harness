import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type HarnessConfig, DEFAULT_CONFIG } from './schema.js';

const CONFIG_FILENAMES = ['harness.config.yaml', 'harness.config.yml'] as const;

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

/**
 * Load and validate harness.config.yaml from a repo root.
 * Returns DEFAULT_CONFIG if no config file is found.
 */
export async function loadConfig(repoRoot: string): Promise<HarnessConfig> {
  const raw = await findAndReadConfig(repoRoot);

  if (raw === null) {
    return DEFAULT_CONFIG;
  }

  return mergeWithDefaults(raw);
}

async function findAndReadConfig(repoRoot: string): Promise<Record<string, unknown> | null> {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = join(repoRoot, filename);
    try {
      const content = await readFile(filepath, 'utf-8');
      return parseYaml(content);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        continue;
      }
      throw new ConfigLoadError(`Failed to read ${filepath}`, err);
    }
  }
  return null;
}

function parseYaml(content: string): Record<string, unknown> {
  // Minimal YAML-like parser for simple key-value configs.
  // For production, swap in a proper YAML parser (js-yaml).
  // For now, we support JSON as a subset of YAML.
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ConfigLoadError('Config must be a YAML/JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ConfigLoadError) throw err;
    throw new ConfigLoadError(
      'Failed to parse config. Currently only JSON format is supported. Install js-yaml for full YAML support.',
      err,
    );
  }
}

function mergeWithDefaults(raw: Record<string, unknown>): HarnessConfig {
  const version = raw['version'];
  if (version !== undefined && version !== 1) {
    throw new ConfigLoadError(`Unsupported config version: ${version}. Expected 1.`);
  }

  return {
    version: 1,
    repo: {
      ...DEFAULT_CONFIG.repo,
      ...((raw['repo'] as Record<string, unknown>) ?? {}),
    },
    agents: {
      ...DEFAULT_CONFIG.agents,
      ...((raw['agents'] as Record<string, unknown>) ?? {}),
    },
    verification: {
      ...DEFAULT_CONFIG.verification,
      ...((raw['verification'] as Record<string, unknown>) ?? {}),
    },
    constraints: {
      ...DEFAULT_CONFIG.constraints,
      ...((raw['constraints'] as Record<string, unknown>) ?? {}),
    },
  } as HarnessConfig;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
