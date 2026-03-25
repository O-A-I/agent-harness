import { describe, it, expect } from 'vitest';
import { analyzeRepo } from '../src/index.js';
import { join } from 'node:path';

describe('analyzer', () => {
  it('analyzes the current monorepo', async () => {
    // Use the agent-harness repo itself as the test subject
    const rootPath = join(import.meta.dirname, '..', '..', '..');
    const profile = await analyzeRepo(rootPath);

    expect(profile.rootPath).toBe(rootPath);
    expect(profile.languages.length).toBeGreaterThan(0);

    // Should detect TypeScript as the primary language
    const tsLang = profile.languages.find((l) => l.name === 'typescript');
    expect(tsLang).toBeDefined();
    expect(tsLang!.fileCount).toBeGreaterThan(0);

    // Should detect pnpm as package manager
    expect(profile.packageManager).toBe('pnpm');

    // Should detect npm as build system (package.json)
    expect(profile.buildSystem).toBe('npm');
  });

  it('handles non-existent directory gracefully', async () => {
    const profile = await analyzeRepo('/nonexistent-path-xyz');
    expect(profile.languages).toHaveLength(0);
    expect(profile.frameworks).toHaveLength(0);
  });
});
