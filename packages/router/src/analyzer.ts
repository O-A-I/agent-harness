/**
 * Repo Context Analyzer — detects languages, frameworks, build system,
 * test framework, and CI config from a repo's file structure.
 */

import { readdir, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { RepoProfile, LanguageInfo } from '@agent-harness/core';

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.swift': 'swift',
  '.kt': 'kotlin',
};

const FRAMEWORK_INDICATORS: Record<string, string[]> = {
  react: ['react', 'react-dom'],
  'next.js': ['next'],
  vue: ['vue'],
  angular: ['@angular/core'],
  svelte: ['svelte'],
  express: ['express'],
  fastify: ['fastify'],
  django: ['django'],
  fastapi: ['fastapi'],
  flask: ['flask'],
  'spring-boot': ['spring-boot'],
  rails: ['rails'],
};

const BUILD_INDICATORS: Record<string, string> = {
  'package.json': 'npm',
  'Cargo.toml': 'cargo',
  'go.mod': 'go',
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  Makefile: 'make',
  'CMakeLists.txt': 'cmake',
  'pyproject.toml': 'python',
  'setup.py': 'python',
};

const TEST_INDICATORS: Record<string, string> = {
  'vitest.config.ts': 'vitest',
  'vitest.config.js': 'vitest',
  'jest.config.ts': 'jest',
  'jest.config.js': 'jest',
  'pytest.ini': 'pytest',
  'pyproject.toml': 'pytest', // may override
  '.mocharc.yml': 'mocha',
  'karma.conf.js': 'karma',
};

const CI_INDICATORS: Record<string, string> = {
  '.github/workflows': 'github-actions',
  '.gitlab-ci.yml': 'gitlab-ci',
  Jenkinsfile: 'jenkins',
  '.circleci': 'circleci',
  '.travis.yml': 'travis',
};

export async function analyzeRepo(rootPath: string): Promise<RepoProfile> {
  const [languages, frameworks, buildSystem, testFramework, ciConfig, packageManager] =
    await Promise.all([
      detectLanguages(rootPath),
      detectFrameworks(rootPath),
      detectBuildSystem(rootPath),
      detectTestFramework(rootPath),
      detectCIConfig(rootPath),
      detectPackageManager(rootPath),
    ]);

  return {
    rootPath,
    languages,
    frameworks,
    buildSystem,
    testFramework,
    ciConfig,
    packageManager,
  };
}

async function detectLanguages(rootPath: string): Promise<LanguageInfo[]> {
  const counts = new Map<string, number>();
  await walkForExtensions(rootPath, counts, 0, 3); // max depth 3

  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  return Array.from(counts.entries())
    .map(([name, fileCount]) => ({
      name,
      percentage: Math.round((fileCount / total) * 100),
      fileCount,
    }))
    .sort((a, b) => b.fileCount - a.fileCount);
}

async function walkForExtensions(
  dir: string,
  counts: Map<string, number>,
  depth: number,
  maxDepth: number,
): Promise<void> {
  if (depth > maxDepth) return;

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }

      if (entry.isDirectory()) {
        await walkForExtensions(join(dir, entry.name), counts, depth + 1, maxDepth);
      } else {
        const ext = '.' + entry.name.split('.').pop();
        const lang = LANGUAGE_EXTENSIONS[ext];
        if (lang) {
          counts.set(lang, (counts.get(lang) ?? 0) + 1);
        }
      }
    }
  } catch {
    // Directory not readable — skip
  }
}

async function detectFrameworks(rootPath: string): Promise<string[]> {
  const frameworks: string[] = [];

  // Check package.json dependencies
  try {
    const pkgJson = JSON.parse(await readFile(join(rootPath, 'package.json'), 'utf-8'));
    const allDeps = {
      ...(pkgJson.dependencies ?? {}),
      ...(pkgJson.devDependencies ?? {}),
    };

    for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
      if (indicators.some((ind) => ind in allDeps)) {
        frameworks.push(framework);
      }
    }
  } catch {
    // No package.json
  }

  // Check requirements.txt for Python frameworks
  try {
    const requirements = await readFile(join(rootPath, 'requirements.txt'), 'utf-8');
    for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
      if (indicators.some((ind) => requirements.toLowerCase().includes(ind))) {
        frameworks.push(framework);
      }
    }
  } catch {
    // No requirements.txt
  }

  return [...new Set(frameworks)];
}

async function detectBuildSystem(rootPath: string): Promise<string | undefined> {
  for (const [file, system] of Object.entries(BUILD_INDICATORS)) {
    if (await fileExists(join(rootPath, file))) {
      return system;
    }
  }
  return undefined;
}

async function detectTestFramework(rootPath: string): Promise<string | undefined> {
  for (const [file, framework] of Object.entries(TEST_INDICATORS)) {
    if (await fileExists(join(rootPath, file))) {
      return framework;
    }
  }
  return undefined;
}

async function detectCIConfig(rootPath: string): Promise<string | undefined> {
  for (const [path, ci] of Object.entries(CI_INDICATORS)) {
    if (await fileExists(join(rootPath, path))) {
      return ci;
    }
  }
  return undefined;
}

async function detectPackageManager(rootPath: string): Promise<string | undefined> {
  if (await fileExists(join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(join(rootPath, 'yarn.lock'))) return 'yarn';
  if (await fileExists(join(rootPath, 'bun.lockb'))) return 'bun';
  if (await fileExists(join(rootPath, 'package-lock.json'))) return 'npm';
  if (await fileExists(join(rootPath, 'Pipfile.lock'))) return 'pipenv';
  if (await fileExists(join(rootPath, 'poetry.lock'))) return 'poetry';
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
