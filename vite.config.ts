import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

function resolveBasePath() {
  const explicitBase = process.env.VITE_BASE_PATH?.trim();

  if (explicitBase) {
    return explicitBase.endsWith('/') ? explicitBase : `${explicitBase}/`;
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';

  if (repositoryName === '' || repositoryName.endsWith('.github.io')) {
    return '/';
  }

  return `/${repositoryName}/`;
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
