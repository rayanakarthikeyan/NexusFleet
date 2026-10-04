// A small fallback runner for environments where native Expo packages cannot
// load in Node. These tests exercise platform-independent reliability logic.
import ts from 'typescript';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const sources = [
  'mobile/types.ts',
  'mobile/services/SerialQueue.ts',
  'mobile/services/interpolation.ts',
  'mobile/services/acknowledgement.ts',
  'mobile/test/reliability.test.ts',
];
for (const path of sources) {
  const output = `.verification/${path.replace(/\.ts$/, '.js')}`;
  await mkdir(dirname(output), { recursive: true });
  const compiled = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  await writeFile(output, compiled.outputText);
}
const result = spawnSync(
  process.execPath,
  ['--test', '.verification/mobile/test/reliability.test.js'],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
