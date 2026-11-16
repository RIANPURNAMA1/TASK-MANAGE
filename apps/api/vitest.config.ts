import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
