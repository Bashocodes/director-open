import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(packageRoot, 'native', 'director-pixel-sort');
const executable = path.join(tmpdir(), `director-pixel-sort-test-${process.pid}`);
const compiler = process.env.CXX || 'c++';
const compile = spawnSync(compiler, [
  '-std=c++17',
  '-O2',
  '-Wall',
  '-Wextra',
  '-pedantic',
  path.join(sourceRoot, 'director_pixel_sort_core.cpp'),
  path.join(sourceRoot, 'director_pixel_sort_core_test.cpp'),
  '-o',
  executable,
], { stdio: 'inherit' });
if (compile.status !== 0) {
  throw new Error(`The Director Pixel Sort native test did not compile with ${compiler}.`);
}

try {
  const run = spawnSync(executable, [], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error('The Director Pixel Sort native test failed.');
} finally {
  try {
    unlinkSync(executable);
  } catch {
    // The OS temp cleaner remains a safe fallback.
  }
}
