import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pixelSortRgba, PIXEL_SORT_PHASES } from '../src/pages/director/reel/pixelSortEngine.ts';

const [inputPath, widthValue, heightValue, outputRoot, intensityValue = '79', seedValue = '0.42'] = process.argv.slice(2);
const width = Number(widthValue);
const height = Number(heightValue);
const intensity = Number(intensityValue);
const seed = Number(seedValue);

if (!inputPath || !width || !height || !outputRoot) {
  throw new Error('Usage: vite-node tools/render-pixel-sort-reference.ts input.rgba width height output-root [intensity] [seed]');
}

const bytes = readFileSync(resolve(inputPath));
const source = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength);
for (const [index, phase] of PIXEL_SORT_PHASES.entries()) {
  const output = pixelSortRgba(source, width, height, { intensity, seed, phase });
  writeFileSync(`${outputRoot}-${index}.rgba`, output);
}
