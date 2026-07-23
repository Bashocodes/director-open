#!/usr/bin/env node

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const DURATION = 4;
const FPS = 24;
const INTENSITY = 60;
const FIXED_SEED = 0.417_3;
const CONTACT_PROGRESS = [0, 0.25, 0.5, 0.75, 1];
const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

function usage() {
  return `Usage: node tools/render-effect-suite.mjs <source-image> --out <empty-directory>

Renders every current Director hero effect from REEL_VISUAL_EFFECTS as a
4-second, intensity-60, 1080-short-edge High-quality MP4. Each effect gets a
labeled five-frame contact sheet, and the output directory gets an index.html
and machine-readable manifest.json.
`;
}

function parseArguments(argv) {
  let source;
  let output;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') return { help: true };
    if (value === '--out') {
      output = argv[index + 1];
      if (!output) throw new Error('--out needs a directory path.');
      index += 1;
      continue;
    }
    if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    if (source) throw new Error('Pass exactly one source-image positional argument.');
    source = value;
  }
  if (!source) throw new Error('Pass exactly one source-image positional argument.');
  if (!output) throw new Error('Pass an output directory with --out <directory>.');
  return { help: false, source: resolve(source), output: resolve(output) };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1_048_576,
    stdio: options.capture === false ? 'inherit' : undefined,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} failed with exit code ${result.status}.${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

function ensureNativeTools() {
  run('ffmpeg', ['-hide_banner', '-version']);
  run('ffprobe', ['-hide_banner', '-version']);
  run('git', ['-C', REPOSITORY_ROOT, 'rev-parse', '--is-inside-work-tree']);
}

function prepareOutputDirectory(output) {
  mkdirSync(output, { recursive: true });
  if (readdirSync(output).length > 0) {
    throw new Error(`Output directory must be empty: ${output}`);
  }
  return output;
}

function decodeSource(source, rawPath, width, height) {
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', source,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}`,
    '-frames:v', '1',
    '-pix_fmt', 'rgba',
    '-f', 'rawvideo',
    rawPath,
  ]);
  const bytes = readFileSync(rawPath);
  const expected = width * height * 4;
  if (bytes.byteLength !== expected) {
    throw new Error(`Decoded source has ${bytes.byteLength} bytes; expected ${expected}.`);
  }
  return new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

let activeChild = null;
let activeWorkRoot = null;

process.once('exit', () => {
  if (activeChild && activeChild.exitCode === null) activeChild.kill('SIGTERM');
  if (activeWorkRoot) rmSync(activeWorkRoot, { recursive: true, force: true });
});

function startPngSequenceEncoder(directory, frameRate, frameCount, width, height) {
  const child = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo',
    '-pixel_format', 'rgba',
    '-video_size', `${width}x${height}`,
    '-framerate', String(frameRate),
    '-i', 'pipe:0',
    '-frames:v', String(frameCount),
    '-start_number', '0',
    '-compression_level', '2',
    'structural-effect-0-%04d.png',
  ], {
    cwd: directory,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  activeChild = child;
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    child.once('error', rejectCompletion);
    child.once('close', (code, signal) => {
      activeChild = null;
      if (code === 0) resolveCompletion();
      else rejectCompletion(new Error(
        `PNG sequence encoder failed (${signal || `exit ${code}`}).${stderr.trim() ? `\n${stderr.trim()}` : ''}`,
      ));
    });
  });
  child.stdin.on('error', () => {});
  return {
    async write(frame) {
      if (child.exitCode !== null) await completion;
      const accepted = child.stdin.write(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
      if (!accepted) {
        await Promise.race([
          once(child.stdin, 'drain'),
          completion.then(() => { throw new Error('PNG sequence encoder closed before all frames were written.'); }),
        ]);
      }
    },
    async finish() {
      child.stdin.end();
      await completion;
    },
  };
}

function gitRevision() {
  const sha = run('git', ['-C', REPOSITORY_ROOT, 'rev-parse', '--short=8', 'HEAD']).stdout.trim();
  const dirty = run('git', ['-C', REPOSITORY_ROOT, 'status', '--porcelain']).stdout.trim().length > 0;
  return { sha, dirty, label: `${sha}${dirty ? '-dirty' : ''}` };
}

function projectFor(effect, source) {
  return {
    id: `effect-evidence-${effect}`,
    title: `Effect evidence · ${effect}`,
    aspectRatio: '9:16',
    fps: FPS,
    quality: 'high',
    clips: [{
      id: `evidence-${effect}`,
      objectId: null,
      title: `${effect} evidence`,
      imageUrl: source,
      duration: DURATION,
      durationWasUserSet: true,
      effect: 'clean',
      gradeStack: ['clean'],
      visualEffect: effect,
      visualEffectStack: [effect],
      transition: 'cut',
      transitionDuration: 0,
      motion: effect === 'motion-echo' ? 'push-in' : 'still',
      intensity: INTENSITY,
      caption: '',
    }],
    selectedClipIds: [],
    audio: null,
    renderRequested: false,
  };
}

function renderVideo(buildFfmpegCommand, project, source, structuralInputIndex, workDirectory, output) {
  const plan = buildFfmpegCommand(project, [source], [structuralInputIndex], [null], null);
  const args = [...plan.args];
  args[args.length - 1] = output;
  const started = performance.now();
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: workDirectory });
  return {
    planDurationSeconds: plan.duration,
    renderWallTimeSeconds: (performance.now() - started) / 1_000,
  };
}

function videoMetadata(videoPath) {
  const result = run('ffprobe', [
    '-v', 'error',
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames,nb_read_frames:format=duration,size,bit_rate',
    '-of', 'json',
    videoPath,
  ]);
  const parsed = JSON.parse(result.stdout);
  const stream = parsed.streams?.[0] || {};
  const format = parsed.format || {};
  const frameCount = Number(stream.nb_read_frames || stream.nb_frames);
  if (!Number.isInteger(frameCount) || frameCount < CONTACT_PROGRESS.length) {
    throw new Error(`Could not determine a valid frame count for ${videoPath}.`);
  }
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    frameCount,
    durationSeconds: Number(format.duration),
    bytes: Number(format.size),
    averageBitrateKbps: Number(format.bit_rate) / 1_000,
  };
}

function contactFrameIndexes(frameCount) {
  return CONTACT_PROGRESS.map((progress) => Math.round((frameCount - 1) * progress));
}

function extractContactFrames(videoPath, frameIndexes, outputDirectory) {
  mkdirSync(outputDirectory);
  const select = frameIndexes.map((frame) => `eq(n\\,${frame})`).join('+');
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', videoPath,
    '-vf', `select=${select}`,
    '-fps_mode', 'vfr',
    '-start_number', '0',
    '-compression_level', '2',
    join(outputDirectory, 'frame-%02d.png'),
  ]);
  const frames = readdirSync(outputDirectory)
    .filter((name) => /^frame-\d\d\.png$/.test(name))
    .sort()
    .map((name) => join(outputDirectory, name));
  if (frames.length !== frameIndexes.length) {
    throw new Error(`Extracted ${frames.length} contact frames; expected ${frameIndexes.length}.`);
  }
  return frames;
}

const FONT = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '%': ['11001', '11010', '00100', '01000', '10110', '00110', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
};

function drawBitmapText(pixels, width, height, text, centerX, centerY, scale) {
  const normalized = text.toUpperCase();
  const advance = 6 * scale;
  const textWidth = Math.max(0, normalized.length * advance - scale);
  const originX = Math.round(centerX - textWidth / 2);
  const originY = Math.round(centerY - 7 * scale / 2);
  [...normalized].forEach((character, characterIndex) => {
    const glyph = FONT[character] || FONT[' '];
    glyph.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell !== '1') return;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const pixelX = originX + characterIndex * advance + x * scale + dx;
            const pixelY = originY + y * scale + dy;
            if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) continue;
            const offset = (pixelY * width + pixelX) * 3;
            pixels[offset] = 235;
            pixels[offset + 1] = 239;
            pixels[offset + 2] = 247;
          }
        }
      });
    });
  });
}

function writeTextStrip(path, width, height, labels, scale) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let offset = 0; offset < pixels.length; offset += 3) {
    pixels[offset] = 8;
    pixels[offset + 1] = 9;
    pixels[offset + 2] = 13;
  }
  labels.forEach(({ text, centerX }) => {
    drawBitmapText(pixels, width, height, text, centerX, height / 2, scale);
  });
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii');
  writeFileSync(path, Buffer.concat([header, pixels]));
}

function makeContactSheet(effect, git, frames, workDirectory, destination, width, height) {
  // Preserve enough spatial detail to judge raster, dot, streak, and echo
  // texture. The HTML can scale this down for scanning; reviewers can open
  // the sheet itself to inspect each half-resolution frame.
  const headerHeight = 64;
  const footerHeight = 36;
  const frameWidth = Math.min(width, 540);
  const frameHeight = Math.round(frameWidth * height / width);
  const header = join(workDirectory, 'header.ppm');
  const footer = join(workDirectory, 'footer.ppm');
  writeTextStrip(header, frameWidth * frames.length, headerHeight, [{
    text: `${effect}  intensity ${INTENSITY}  sha ${git.label}`,
    centerX: frameWidth * frames.length / 2,
  }], 4);
  writeTextStrip(footer, frameWidth * frames.length, footerHeight, CONTACT_PROGRESS.map((progress, index) => ({
    text: `${Math.round(progress * 100)}%`,
    centerX: frameWidth * (index + 0.5),
  })), 3);
  const inputs = [header, ...frames, footer].flatMap((path) => ['-i', path]);
  const frameFilters = frames.map(
    (_, index) => `[${index + 1}:v]scale=${frameWidth}:${frameHeight}:flags=lanczos[frame-${index}]`,
  );
  const stackInputs = frames.map((_, index) => `[frame-${index}]`).join('');
  const footerInputIndex = frames.length + 1;
  const filters = [
    ...frameFilters,
    `${stackInputs}hstack=inputs=${frames.length}[frames]`,
    `[0:v][frames][${footerInputIndex}:v]vstack=inputs=3[contact]`,
  ];
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[contact]',
    '-frames:v', '1',
    '-compression_level', '2',
    destination,
  ]);
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function webPath(outputDirectory, path) {
  return relative(outputDirectory, path).split('\\').join('/');
}

function writeIndex(outputDirectory, source, git, jobs, totalRuntimeSeconds) {
  const cards = jobs.map((job) => `
      <article>
        <h2>${htmlEscape(job.label)}</h2>
        <a href="${htmlEscape(job.contactSheet)}"><img src="${htmlEscape(job.contactSheet)}" alt="${htmlEscape(job.label)} contact sheet at 0, 25, 50, 75, and 100 percent"></a>
        <p><a href="${htmlEscape(job.contactSheet)}">Open full-resolution contact sheet</a> · <a href="${htmlEscape(job.video)}">Play MP4</a> · ${job.metadata.durationSeconds.toFixed(2)} s · ${(job.metadata.bytes / 1_048_576).toFixed(1)} MiB</p>
      </article>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Director Open visual-effect evidence</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #08090d; color: #ebeff7; }
    body { max-width: 1180px; margin: 0 auto; padding: 32px 20px 64px; }
    header { margin-bottom: 28px; }
    h1 { margin-bottom: 8px; }
    header p, article p { color: #aeb7c8; }
    main { display: grid; gap: 24px; }
    article { padding: 18px; border: 1px solid #252b37; border-radius: 12px; background: #10131a; }
    article h2 { margin: 0 0 14px; }
    img { display: block; width: 100%; height: auto; border-radius: 6px; background: #08090d; }
    a { color: #8cc8ff; }
  </style>
</head>
<body>
  <header>
    <h1>Director visual-effect evidence</h1>
    <p>Source: ${htmlEscape(basename(source))} · intensity ${INTENSITY} · High quality · 1080 short edge · git ${htmlEscape(git.label)} · ${totalRuntimeSeconds.toFixed(1)} s total</p>
  </header>
  <main>${cards}
  </main>
</body>
</html>
`;
  writeFileSync(join(outputDirectory, 'index.html'), html);
}

function outputListing(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      const label = `${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`;
      return entry.isDirectory() ? [label, ...outputListing(path, `${prefix}${entry.name}/`)] : [label];
    });
}

async function main() {
  const cli = parseArguments(process.argv.slice(2));
  if (cli.help) {
    process.stdout.write(usage());
    return;
  }
  try {
    if (!statSync(cli.source).isFile()) throw new Error('Not a file.');
  } catch {
    throw new Error(`Source image does not exist or is not a file: ${cli.source}`);
  }
  ensureNativeTools();
  // Capture this before creating output: untracked source changes count as
  // dirty, while an evidence directory inside the repo must not dirty its own label.
  const git = gitRevision();
  const suiteStarted = performance.now();
  const outputDirectory = prepareOutputDirectory(cli.output);
  const videoDirectory = join(outputDirectory, 'videos');
  const sheetDirectory = join(outputDirectory, 'contact-sheets');
  mkdirSync(videoDirectory);
  mkdirSync(sheetDirectory);
  const workRoot = mkdtempSync(join(tmpdir(), 'director-open-effect-evidence.'));
  activeWorkRoot = workRoot;
  let server;
  try {
    server = await createServer({
      configFile: false,
      root: REPOSITORY_ROOT,
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'custom',
      logLevel: 'error',
    });
    const { REEL_VISUAL_EFFECTS, reelDimensions } = await server.ssrLoadModule(
      '/src/pages/director/reel/catalog.ts',
    );
    const effects = REEL_VISUAL_EFFECTS.filter((item) => item.id !== 'none');
    if (effects.length === 0) throw new Error('REEL_VISUAL_EFFECTS contains no hero effects.');
    const ids = effects.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error('REEL_VISUAL_EFFECTS contains duplicate ids.');
    const { width, height } = reelDimensions('9:16', 'high');
    const rawPath = join(workRoot, 'source.rgba');
    process.stderr.write(`Decoding ${basename(cli.source)} to ${width}x${height} RGBA…\n`);
    const sourceRgba = decodeSource(cli.source, rawPath, width, height);
    const { buildFfmpegCommand } = await server.ssrLoadModule('/src/pages/director/reel/ffmpegRenderer.ts');
    const {
      isStructuralEffect,
      renderStructuralEffectFrame,
    } = await server.ssrLoadModule('/src/pages/director/reel/structuralEffects.ts');
    const {
      structuralEffectFrameCount,
      structuralEffectFps,
      structuralEffectSampleAtFrame,
    } = await server.ssrLoadModule('/src/pages/director/reel/effectRecipes.ts');

    const morphologyFrameCount = structuralEffectFrameCount(DURATION, FPS);
    const morphologyFps = structuralEffectFps(FPS);
    const jobs = [];
    for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
      const item = effects[effectIndex];
      const effect = item.id;
      const workDirectory = join(workRoot, effect);
      mkdirSync(workDirectory);
      const structural = isStructuralEffect(effect);
      let structuralGenerationSeconds = null;
      if (structural) {
        const sequenceStarted = performance.now();
        const encoder = startPngSequenceEncoder(
          workDirectory,
          morphologyFps,
          morphologyFrameCount,
          width,
          height,
        );
        try {
          for (let frameIndex = 0; frameIndex < morphologyFrameCount; frameIndex += 1) {
            const sample = structuralEffectSampleAtFrame(
              frameIndex,
              DURATION,
              FPS,
              FIXED_SEED,
            );
            const rendered = renderStructuralEffectFrame(effect, sourceRgba, width, height, {
              intensity: INTENSITY,
              phase: sample.phase,
              progress: sample.progress,
              seed: sample.seed,
              baseSeed: FIXED_SEED,
              frameIndex,
              frameCount: morphologyFrameCount,
            });
            await encoder.write(rendered);
          }
        } finally {
          await encoder.finish();
        }
        structuralGenerationSeconds = (performance.now() - sequenceStarted) / 1_000;
      }

      process.stderr.write(`[${effectIndex + 1}/${effects.length}] Rendering ${effect}…\n`);
      const videoPath = join(videoDirectory, `${effect}-intensity-${INTENSITY}.mp4`);
      const project = projectFor(effect, cli.source);
      const render = renderVideo(
        buildFfmpegCommand,
        project,
        cli.source,
        structural ? 1 : null,
        workDirectory,
        videoPath,
      );
      const metadata = videoMetadata(videoPath);
      const indexes = contactFrameIndexes(metadata.frameCount);
      const extractedDirectory = join(workDirectory, 'contact-frames');
      const frames = extractContactFrames(videoPath, indexes, extractedDirectory);
      const contactPath = join(sheetDirectory, `${effect}-intensity-${INTENSITY}.png`);
      makeContactSheet(effect, git, frames, workDirectory, contactPath, width, height);
      jobs.push({
        effect,
        label: item.label,
        motion: effect === 'motion-echo' ? 'push-in' : 'still',
        renderer: structural ? 'production-structural-renderFrame-sequence' : 'production-ffmpeg-filter',
        video: webPath(outputDirectory, videoPath),
        contactSheet: webPath(outputDirectory, contactPath),
        contactProgress: CONTACT_PROGRESS,
        contactFrameIndexes: indexes,
        structuralGenerationSeconds,
        ...render,
        metadata,
      });
      rmSync(workDirectory, { recursive: true, force: true });
    }

    const totalRuntimeSeconds = (performance.now() - suiteStarted) / 1_000;
    writeIndex(outputDirectory, cli.source, git, jobs, totalRuntimeSeconds);
    const manifest = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      git,
      source: cli.source,
      rosterSource: 'src/pages/director/reel/catalog.ts#REEL_VISUAL_EFFECTS (excluding none)',
      effects: effects.map(({ id, label, description }) => ({ id, label, description })),
      render: {
        intensity: INTENSITY,
        durationSeconds: DURATION,
        outputFps: FPS,
        width,
        height,
        shortEdge: Math.min(width, height),
        quality: 'high',
        fixedSeed: FIXED_SEED,
        morphologyFps,
        morphologyFrameCount,
      },
      totalRuntimeSeconds,
      jobs,
    };
    writeFileSync(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const files = outputListing(outputDirectory);
    process.stdout.write(`${JSON.stringify({
      outputDirectory,
      totalRuntimeSeconds,
      effectCount: effects.length,
      files,
    }, null, 2)}\n`);
  } finally {
    if (activeChild && activeChild.exitCode === null) activeChild.kill('SIGTERM');
    if (server) await server.close();
    rmSync(workRoot, { recursive: true, force: true });
    activeWorkRoot = null;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
