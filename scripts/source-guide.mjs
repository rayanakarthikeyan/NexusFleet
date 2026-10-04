import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const paths = [
  'package.json',
  'compose.yaml',
  'render.yaml',
  '.prettierrc.json',
  '.editorconfig',
  '.prettierignore',
  '.env.example',
  '.gitignore',
  '.dockerignore',
];
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      ['node_modules', 'dist', '.expo', 'android', 'ios'].includes(entry.name) ||
      (entry.name.startsWith('.env') && entry.name !== '.env.example')
    )
      continue;
    const path = join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) await visit(path);
    else if (
      ['.ts', '.tsx', '.json', '.js', '.mjs', '.prisma', '.sql', '.toml', '.yml', '.yaml'].includes(
        extname(path),
      ) ||
      ['Dockerfile', '.env.example'].includes(entry.name)
    )
      paths.push(path);
  }
}
await visit('backend');
await visit('mobile');
await visit('scripts');
await visit('.github');
paths.sort();
const language = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.json': 'json',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.prisma': 'prisma',
};
const blocks = await Promise.all(
  paths.map(
    async (path) =>
      `## ${path}\n\n\`\`\`${language[extname(path)] ?? 'text'}\n${(await readFile(path, 'utf8')).trimEnd()}\n\`\`\`\n`,
  ),
);
await writeFile(
  'IMPLEMENTATION.md',
  '# NexusFleet complete implementation\n\n' +
    'This listing contains the complete source and configuration, file by file, with inline comments. ' +
    'See [README.md](README.md) for setup, protocol, interpolation math, verification, and operating limits. ' +
    'The runnable files are the source of truth; regenerate this listing with `node scripts/source-guide.mjs` after edits. ' +
    'The generated dependency lockfile is provided separately as `package-lock.json`.\n\n' +
    blocks.join('\n'),
);
console.log(`Wrote IMPLEMENTATION.md with ${paths.length} complete files`);
