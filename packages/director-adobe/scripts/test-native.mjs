import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(packageRoot, 'native', 'director-pixel-sort');
const compiler = process.env.CXX || 'c++';

function compileAndRun(name, sources) {
  const executable = path.join(tmpdir(), `${name}-${process.pid}`);
  const compile = spawnSync(compiler, [
    '-std=c++17',
    '-O2',
    '-Wall',
    '-Wextra',
    '-pedantic',
    ...sources.map((source) => path.join(sourceRoot, source)),
    '-o',
    executable,
  ], { stdio: 'inherit' });
  if (compile.status !== 0) {
    throw new Error(`${name} did not compile with ${compiler}.`);
  }

  try {
    const run = spawnSync(executable, [], { stdio: 'inherit' });
    if (run.status !== 0) throw new Error(`${name} failed.`);
  } finally {
    try {
      unlinkSync(executable);
    } catch {
      // The OS temp cleaner remains a safe fallback.
    }
  }
}

compileAndRun('director-pixel-sort-core-test', [
  'director_pixel_sort_core.cpp',
  'director_pixel_sort_core_test.cpp',
]);
compileAndRun('director-pixel-sort-plugin-bridge-test', [
  'director_pixel_sort_core.cpp',
  'director_pixel_sort_plugin_bridge.cpp',
  'director_pixel_sort_plugin_bridge_test.cpp',
]);
