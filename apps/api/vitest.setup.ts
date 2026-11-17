import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Prisma snapshots process.env when its client is constructed, which happens while the test file's
// imports are evaluated — so DATABASE_URL must already be there. (CI sets real env vars; dotenv
// never overrides them.)
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });
