import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Workspace packages ship TypeScript source, so bundle them into the output.
  noExternal: [/^@nexus\//],
  // See apps/api/tsup.config.ts: Prisma and other workspace-only deps must stay external.
  external: ['@prisma/client', '.prisma/client', 'nodemailer', 'fractional-indexing'],
});
