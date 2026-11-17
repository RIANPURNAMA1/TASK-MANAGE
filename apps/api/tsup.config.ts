import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Workspace packages ship TypeScript source, so bundle them into the output.
  noExternal: [/^@nexus\//],
  // Dependencies declared only by workspace packages must NOT be bundled: Prisma and jsdom use
  // dynamic require()/native files that break in an ESM bundle ("Dynamic require of fs").
  // They are resolved from node_modules at runtime (hoisted by npm workspaces).
  // Do NOT add cron-parser / ipaddr.js: packages/agent needs v5 / v2 while the root has v4 / v1
  // (bullmq, express), so externalizing them would load the wrong version. They bundle fine.
  external: ['@prisma/client', '.prisma/client', '@mozilla/readability', 'jsdom', 'nodemailer', 'fractional-indexing'],
});
