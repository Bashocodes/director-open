import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import {
  structuralEffectFps,
  structuralEffectFrameCount,
  structuralEffectSampleAtFrame,
} from '../src/pages/director/reel/effectRecipes.ts';
import { buildFfmpegCommand } from '../src/pages/director/reel/ffmpegRenderer.ts';
import { renderStructuralEffectFrame } from '../src/pages/director/reel/structuralEffects.ts';
import type { ReelProject } from '../src/pages/director/reel/types.ts';

const [sourceValue, outputValue, durationValue = '3.2', fpsValue = '24', intensityValue = '62', seedValue = '0.42'] = process.argv.slice(2);
if (!sourceValue || !outputValue) {
  throw new Error('Usage: render-pixel-sort-video-reference source output [duration] [fps] [intensity] [seed]');
}

const source = resolve(sourceValue);
const output = resolve(outputValue);
const duration = Number(durationValue);
const fps = Number(fpsValue);
const intensity = Number(intensityValue);
const seed = Number(seedValue);
const width = 1_080;
const height = 1_920;
const morphologyFps = structuralEffectFps(fps);
const frameCount = structuralEffectFrameCount(duration, fps);
mkdirSync(dirname(output), { recursive: true });
const sequenceDirectory = mkdtempSync(join(tmpdir(), 'director-open-pixel-sort-sequence-'));
const sequencePattern = join(sequenceDirectory, 'structural-effect-0-%04d.png');

const decoded = spawnSync('ffmpeg', [
  '-v', 'error',
  '-i', source,
  '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
  '-frames:v', '1',
  '-pix_fmt', 'rgba',
  '-f', 'rawvideo',
  '-',
], { encoding: null, maxBuffer: width * height * 4 + 1_048_576 });
if (decoded.status !== 0 || !decoded.stdout || decoded.stdout.byteLength !== width * height * 4) {
  throw new Error(`Could not decode the reference source (${decoded.status ?? 'spawn error'}).`);
}
const sourceRgba = new Uint8ClampedArray(
  decoded.stdout.buffer,
  decoded.stdout.byteOffset,
  decoded.stdout.byteLength,
);

const encoder = spawn('ffmpeg', [
  '-y',
  '-v', 'error',
  '-f', 'rawvideo',
  '-pix_fmt', 'rgba',
  '-s', `${width}x${height}`,
  '-r', String(morphologyFps),
  '-i', '-',
  '-frames:v', String(frameCount),
  '-start_number', '0',
  sequencePattern,
], { stdio: ['pipe', 'inherit', 'inherit'] });

let maximumSortMs = 0;
let totalSortMs = 0;
for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
  const sample = structuralEffectSampleAtFrame(frameIndex, duration, fps, seed);
  const started = performance.now();
  const frame = renderStructuralEffectFrame('pixel-sort', sourceRgba, width, height, {
    intensity,
    seed: sample.seed,
    phase: sample.phase,
    progress: sample.progress,
    baseSeed: seed,
    frameIndex: sample.frameIndex,
    frameCount: sample.frameCount,
  });
  const sortMs = performance.now() - started;
  maximumSortMs = Math.max(maximumSortMs, sortMs);
  totalSortMs += sortMs;
  const bytes = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
  if (!encoder.stdin.write(bytes)) await once(encoder.stdin, 'drain');
  process.stdout.write(`\rmorphology ${frameIndex + 1}/${frameCount} · phase ${sample.phase.toFixed(3)} · ${sortMs.toFixed(1)} ms`);
}
encoder.stdin.end();
const [encodeStatus] = await once(encoder, 'close') as [number];
process.stdout.write('\n');
if (encodeStatus !== 0) throw new Error(`Morphology PNG encoding failed with status ${encodeStatus}.`);

const project: ReelProject = {
  id: 'pixel-sort-reference',
  title: 'Pixel sort reference',
  aspectRatio: '9:16',
  fps,
  quality: 'maximum',
  selectedClipIds: [],
  audio: null,
  renderRequested: false,
  clips: [{
    id: 'reference',
    objectId: null,
    title: 'Reference',
    imageUrl: source,
    duration,
    effect: 'clean',
    visualEffect: 'pixel-sort',
    visualEffectStack: ['pixel-sort'],
    transition: 'cut',
    transitionDuration: 0,
    motion: 'still',
    intensity,
    caption: '',
  }],
};

const plan = buildFfmpegCommand(project, [source], [1], [null], null);
const args = plan.args.map((value) => {
  if (value === 'structural-effect-0-%04d.png') return sequencePattern;
  if (value === plan.outputName) return output;
  return value;
});
const result = spawnSync('ffmpeg', ['-y', '-benchmark', ...args], { stdio: 'inherit' });
if (result.status !== 0) throw new Error(`Reference render failed with status ${result.status}.`);

const outputExtension = extname(output);
const outputRoot = output.slice(0, -outputExtension.length);
for (const position of [0.25, 0.5, 0.75]) {
  const label = Math.round(position * 100);
  const extracted = `${outputRoot}-${label}.png`;
  const extraction = spawnSync('ffmpeg', [
    '-y', '-v', 'error', '-ss', String(duration * position), '-i', output, '-frames:v', '1', extracted,
  ], { stdio: 'inherit' });
  if (extraction.status !== 0) throw new Error(`Could not extract the ${label}% inspection frame.`);
}

console.log(`sequence: ${frameCount} frames at ${morphologyFps} fps in ${sequenceDirectory}`);
console.log(`pixelSortRgba: ${(totalSortMs / frameCount).toFixed(2)} ms average, ${maximumSortMs.toFixed(2)} ms maximum`);
console.log(`video: ${output}`);
