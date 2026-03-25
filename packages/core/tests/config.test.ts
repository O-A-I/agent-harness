import { describe, it, expect } from 'vitest';
import { loadConfig, DEFAULT_CONFIG, ConfigLoadError } from '../src/index.js';

describe('loadConfig', () => {
  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig('/nonexistent-path');
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('default config has sensible values', () => {
    expect(DEFAULT_CONFIG.version).toBe(1);
    expect(DEFAULT_CONFIG.verification.checks).toHaveLength(5);
    expect(DEFAULT_CONFIG.constraints.maxFileChanges).toBe(50);
    expect(DEFAULT_CONFIG.constraints.timeout).toBe(300_000);
    expect(DEFAULT_CONFIG.constraints.forbiddenPaths).toContain('.git/**');
  });
});
