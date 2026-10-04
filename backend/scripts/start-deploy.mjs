import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error('Configure DATABASE_URL and DIRECT_URL before starting a deployment');
}
if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters');
}

// Never serve a newer binary against an older schema. Prisma uses an advisory
// lock to protect migration execution; only one gateway instance is supported.
execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
  cwd: backendDirectory,
  stdio: 'inherit',
  timeout: 120_000,
});

await import('../dist/src/main.js');
