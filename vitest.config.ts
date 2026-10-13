import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
