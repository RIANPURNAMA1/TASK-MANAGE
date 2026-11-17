import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // DB-backed policy tests share one database; keep files sequential.
    fileParallelism: false,
  },
});
