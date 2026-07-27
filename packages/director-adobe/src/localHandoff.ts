import { homedir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { unzipSync } from 'fflate';
import {
  MAX_DIRECTOR_ADOBE_PLAN_JSON_BYTES,
  parseDirectorAdobeRenderPlan,
  type DirectorAdobeRenderPlan,
} from '../../../src/shared/directorAdobeContract';
import { executeAdobePlan } from './runner';

export const DIRECTOR_LOCAL_OUTPUT_DIRECTORY = join(homedir(), 'Movies', 'Director');
export const DIRECTOR_LOCAL_WORKSPACE_DIRECTORY = join(
  homedir(),
  'Library',
  'Caches',
  'Director',
  'Adobe Handoffs',
);

export type DirectorLocalAdobeResult = {
  ok: true;
  packagePath: string | null;
  planPath: string | null;
  outputPath: string;
  outputBytes?: number;
  configPath: string | null;
  adobe:
    | { status: 'rendered'; receipt: Record<string, unknown> }
    | { status: 'queued'; receipt: Record<string, unknown>; warning: string }
    | { status: 'not-configured'; error: string }
    | { status: 'failed'; error: string };
};

export type PersistDirectorAdobeArchiveOptions = {
  outputRoot?: string;
  workspaceRoot?: string;
  configPath?: string;
  execute?: boolean;
  render?: boolean;
  now?: Date;
  cwd?: string;
};

export type PersistDirectorRenderedOutputOptions = {
  outputRoot?: string;
  now?: Date;
  backend?: 'ffmpeg';
};

const AERENDER_CANDIDATES = [
  '/Applications/Adobe After Effects 2026/aerender',
  '/Applications/Adobe After Effects 2025/aerender',
  '/Applications/Adobe After Effects (Beta)/aerender',
];
const FFMPEG_CANDIDATES = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/opt/local/bin/ffmpeg',
];
const FFPROBE_CANDIDATES = [
  '/opt/homebrew/bin/ffprobe',
  '/usr/local/bin/ffprobe',
  '/opt/local/bin/ffprobe',
];

export function directorAerenderArgs(projectPath: string, renderQueueIndex: number) {
  return ['-project', projectPath, '-rqindex', String(renderQueueIndex)];
}

export function directorFinderRevealArgs(target: string) {
  return ['-R', target];
}

async function findAerender() {
  return findExecutable(AERENDER_CANDIDATES);
}

async function findExecutable(candidates: readonly string[]) {
  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

async function runProcess(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  timeoutMessage: string,
) {
  const tailLimit = 64 * 1_024;
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const append = (chunk: Buffer) => {
      tail = `${tail}${chunk.toString('utf8')}`.slice(-tailLimit);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(tail);
      else reject(new Error(
        `${command} exited with code ${String(code)}.${tail.trim() ? ` ${tail.trim()}` : ''}`,
      ));
    });
  });
}

async function runAerender(
  aerender: string,
  projectPath: string,
  renderQueueIndex: number,
  outputPath: string,
) {
  await runProcess(
    aerender,
    directorAerenderArgs(projectPath, renderQueueIndex),
    30 * 60_000,
    'After Effects rendering exceeded Director’s 30-minute safety limit.',
  );
  const output = await stat(outputPath).catch(() => null);
  if (!output?.isFile() || output.size === 0) {
    throw new Error(`After Effects finished without writing the expected output: ${outputPath}`);
  }
}

export function directorHevcHlgArgs(inputPath: string, outputPath: string) {
  return [
    '-y',
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-vf', 'setparams=range=limited:color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc',
    '-c:v', 'hevc_videotoolbox',
    '-profile:v', 'main10',
    '-pix_fmt', 'p010le',
    '-b:v', '20M',
    '-maxrate:v', '24M',
    '-bufsize:v', '40M',
    '-tag:v', 'hvc1',
    '-color_range', 'tv',
    '-color_primaries', 'bt2020',
    '-color_trc', 'arib-std-b67',
    '-colorspace', 'bt2020nc',
    '-bsf:v', 'hevc_metadata=video_full_range_flag=0:colour_primaries=9:transfer_characteristics=18:matrix_coefficients=9',
    '-c:a', 'aac',
    '-b:a', '256k',
    '-movflags', '+faststart',
    outputPath,
  ];
}

async function assertHlgDelivery(ffprobe: string, outputPath: string) {
  const stdout = await runProcess(
    ffprobe,
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries',
      'stream=codec_name,profile,pix_fmt,color_space,color_transfer,color_primaries',
      '-of', 'json',
      outputPath,
    ],
    30_000,
    'Director’s HDR verification exceeded 30 seconds.',
  );
  const parsed = JSON.parse(stdout) as { streams?: Array<Record<string, unknown>> };
  const video = parsed.streams?.[0];
  const valid = video?.codec_name === 'hevc'
    && video.profile === 'Main 10'
    && typeof video.pix_fmt === 'string'
    && video.pix_fmt.includes('10')
    && video.color_space === 'bt2020nc'
    && video.color_transfer === 'arib-std-b67'
    && video.color_primaries === 'bt2020';
  if (!valid) {
    throw new Error(`Director rendered a file, but its HDR metadata is invalid: ${JSON.stringify(video)}`);
  }
}

async function createVerifiedHlgDelivery(intermediatePath: string) {
  const ffmpeg = await findExecutable(FFMPEG_CANDIDATES);
  const ffprobe = await findExecutable(FFPROBE_CANDIDATES);
  if (ffmpeg === null || ffprobe === null) {
    throw new Error('FFmpeg and ffprobe are required to finish and verify the 10-bit HLG delivery.');
  }
  const outputPath = intermediatePath.replace(/\.mov$/i, '.mp4');
  await runProcess(
    ffmpeg,
    directorHevcHlgArgs(intermediatePath, outputPath),
    30 * 60_000,
    'Director’s HLG delivery conversion exceeded 30 minutes.',
  );
  await assertHlgDelivery(ffprobe, outputPath);
  await unlink(intermediatePath);
  return outputPath;
}

export async function revealDirectorOutput(
  requestedPath: string,
  outputRoot = process.env.DIRECTOR_OUTPUT_ROOT ?? DIRECTOR_LOCAL_OUTPUT_DIRECTORY,
) {
  const root = resolve(outputRoot);
  const target = resolve(requestedPath);
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error('Director can reveal only files inside its output folder.');
  }
  const details = await stat(target).catch(() => null);
  if (!details?.isFile()) {
    throw new Error('That Director output file no longer exists.');
  }
  await runProcess(
    '/usr/bin/open',
    directorFinderRevealArgs(target),
    10_000,
    'Finder did not respond within 10 seconds.',
  );
  return target;
}

function safeStem(value: string) {
  return value
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'director-reel';
}

function timestamp(now: Date) {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);
}

async function isFile(filePath: string) {
  return stat(filePath).then((details) => details.isFile()).catch(() => false);
}

export async function resolveDirectorAdobeConfig(
  configuredPath?: string,
  cwd = process.cwd(),
) {
  const candidates = [
    configuredPath,
    process.env.DIRECTOR_ADOBE_CONFIG,
    resolve(cwd, 'conductor.config.json'),
    resolve(cwd, '..', 'conductor', 'conductor.config.json'),
    join(homedir(), 'Projects', 'conductor', 'conductor.config.json'),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  for (const candidate of [...new Set(candidates.map((value) => resolve(value)))]) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

function assertArchivePath(relativePath: string) {
  if (
    relativePath.length === 0
    || relativePath.startsWith('/')
    || relativePath.includes('\\')
    || relativePath.split('/').includes('..')
  ) {
    throw new Error(`Unsafe Director Adobe archive path: ${relativePath}`);
  }
}

function parseArchive(entries: Record<string, Uint8Array>) {
  const names = Object.keys(entries);
  if (names.length === 0 || names.length > 18) {
    throw new Error('The Director Adobe package has an unexpected number of files.');
  }
  for (const name of names) assertArchivePath(name);
  const planNames = names.filter((name) => (
    !name.includes('/') && name.endsWith('.director-adobe.json')
  ));
  if (planNames.length !== 1) {
    throw new Error('The Director Adobe package must contain exactly one handoff plan.');
  }
  const planName = planNames[0];
  const planBytes = entries[planName];
  if (!planBytes || planBytes.byteLength > MAX_DIRECTOR_ADOBE_PLAN_JSON_BYTES) {
    throw new Error('The Director Adobe handoff plan is missing or larger than 5 MB.');
  }
  let plan: DirectorAdobeRenderPlan;
  try {
    plan = parseDirectorAdobeRenderPlan(JSON.parse(Buffer.from(planBytes).toString('utf8')));
  } catch {
    throw new Error('The package does not contain a valid Director Adobe handoff plan.');
  }
  const expectedNames = new Set([planName, ...plan.media.map((entry) => entry.relativePath)]);
  if (names.some((name) => !expectedNames.has(name)) || names.length !== expectedNames.size) {
    throw new Error('The Director Adobe package contains unexpected or missing files.');
  }
  for (const media of plan.media) {
    const bytes = entries[media.relativePath];
    if (!media.available || !bytes || bytes.byteLength !== media.bytes) {
      throw new Error(`Director Adobe media is missing or changed: ${media.originalName}`);
    }
  }
  return { plan, planName };
}

async function reservePackageDirectory(outputRoot: string, folderStem: string) {
  await mkdir(outputRoot, { recursive: true });
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = join(outputRoot, suffix === 0 ? folderStem : `${folderStem}-${suffix + 1}`);
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if (
        !(error instanceof Error)
        || !('code' in error)
        || error.code !== 'EEXIST'
      ) {
        throw error;
      }
    }
  }
  throw new Error('Director could not reserve a unique local output folder.');
}

async function reserveDeliveryPath(
  outputRoot: string,
  title: string,
  backend: 'adobe',
  extension: string,
  now: Date,
) {
  await mkdir(outputRoot, { recursive: true });
  const stem = `${safeStem(title)}-${timestamp(now)}-${backend}`;
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = join(
      outputRoot,
      `${suffix === 0 ? stem : `${stem}-${suffix + 1}`}${extension}`,
    );
    if (!await isFile(candidate)) return candidate;
  }
  throw new Error('Director could not reserve a unique output filename.');
}

export async function moveDirectorDelivery(
  deliveryPath: string,
  outputRoot: string,
  title: string,
  now: Date,
) {
  const extension = extname(deliveryPath).toLowerCase() || '.mp4';
  const destination = await reserveDeliveryPath(outputRoot, title, 'adobe', extension, now);
  try {
    await rename(deliveryPath, destination);
  } catch (error) {
    if (
      !(error instanceof Error)
      || !('code' in error)
      || error.code !== 'EXDEV'
    ) {
      throw error;
    }
    await copyFile(deliveryPath, destination);
    await unlink(deliveryPath);
  }
  return destination;
}

export async function persistDirectorRenderedOutput(
  bytes: Uint8Array,
  title: string,
  options: PersistDirectorRenderedOutputOptions = {},
) {
  if (bytes.byteLength === 0) throw new Error('Director cannot save an empty rendered output.');
  const outputRoot = resolve(
    options.outputRoot
      ?? process.env.DIRECTOR_OUTPUT_ROOT
      ?? DIRECTOR_LOCAL_OUTPUT_DIRECTORY,
  );
  const backend = options.backend ?? 'ffmpeg';
  const stem = `${safeStem(title)}-${timestamp(options.now ?? new Date())}-${backend}`;
  await mkdir(outputRoot, { recursive: true });
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const outputPath = join(
      outputRoot,
      `${suffix === 0 ? stem : `${stem}-${suffix + 1}`}.mp4`,
    );
    try {
      await writeFile(outputPath, bytes, { flag: 'wx' });
      return {
        ok: true as const,
        backend,
        outputPath,
        outputBytes: bytes.byteLength,
      };
    } catch (error) {
      if (
        !(error instanceof Error)
        || !('code' in error)
        || error.code !== 'EEXIST'
      ) {
        throw error;
      }
    }
  }
  throw new Error('Director could not reserve a unique FFmpeg output filename.');
}

function containedPath(root: string, relativePath: string) {
  const absolute = resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`Unsafe Director Adobe output path: ${relativePath}`);
  }
  return absolute;
}

/**
 * Persists a browser-produced handoff in Director's private cache without
 * involving Chrome's protected directory picker, then optionally executes it
 * through the configured Adobe MCP. Only the finished movie is moved into
 * ~/Movies/Director; failed/queued packages stay in the private cache so a
 * rendering problem never destroys prepared media.
 */
export async function persistDirectorAdobeArchive(
  archive: Uint8Array,
  options: PersistDirectorAdobeArchiveOptions = {},
): Promise<DirectorLocalAdobeResult> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archive);
  } catch {
    throw new Error('Director could not read the Adobe package ZIP.');
  }
  const { plan, planName } = parseArchive(entries);
  const outputRoot = resolve(
    options.outputRoot
      ?? process.env.DIRECTOR_OUTPUT_ROOT
      ?? DIRECTOR_LOCAL_OUTPUT_DIRECTORY,
  );
  const workspaceRoot = resolve(
    options.workspaceRoot
      ?? process.env.DIRECTOR_WORKSPACE_ROOT
      ?? DIRECTOR_LOCAL_WORKSPACE_DIRECTORY,
  );
  const renderNow = options.now ?? new Date();
  const packagePath = await reservePackageDirectory(
    workspaceRoot,
    `${safeStem(plan.title)}-${timestamp(renderNow)}`,
  );
  for (const [relativePath, bytes] of Object.entries(entries)) {
    const filePath = containedPath(packagePath, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  }
  const planPath = containedPath(packagePath, planName);
  const outputPath = containedPath(join(packagePath, 'output'), plan.output.filename);
  const configPath = await resolveDirectorAdobeConfig(options.configPath, options.cwd);

  if (options.execute === false || configPath === null) {
    return {
      ok: true,
      packagePath,
      planPath,
      outputPath,
      configPath,
      adobe: {
        status: 'not-configured',
        error: configPath === null
          ? 'Director could not find the Conductor Adobe MCP configuration.'
          : 'Adobe execution was disabled.',
      },
    };
  }

  try {
    const result = await executeAdobePlan({ planPath, configPath });
    if (options.render !== false) {
      const projectPath = typeof result.receipt.projectPath === 'string'
        ? result.receipt.projectPath
        : null;
      const renderQueueIndex = typeof result.receipt.renderQueueIndex === 'number'
        ? result.receipt.renderQueueIndex
        : null;
      const aerender = await findAerender();
      if (projectPath === null || renderQueueIndex === null || aerender === null) {
        return {
          ok: true,
          packagePath,
          planPath,
          outputPath: result.outputPath,
          configPath,
          adobe: {
            status: 'queued',
            receipt: result.receipt,
            warning: aerender === null
              ? 'Director could not find aerender; the composition is queued in After Effects.'
              : 'After Effects did not return a saved project and exact queue index for automatic rendering.',
          },
        };
      }
      try {
        await runAerender(aerender, projectPath, renderQueueIndex, result.outputPath);
      } catch (error) {
        return {
          ok: true,
          packagePath,
          planPath,
          outputPath: result.outputPath,
          configPath,
          adobe: {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
      let deliveryPath = result.outputPath;
      let receipt = result.receipt;
      if (result.receipt.outputPostProcess === 'hevc-main10-hlg') {
        try {
          deliveryPath = await createVerifiedHlgDelivery(result.outputPath);
          receipt = {
            ...result.receipt,
            deliveryCodec: 'hevc-main10',
            deliveryBitDepth: 10,
            deliveryColorSpace: 'Rec.2100 HLG',
            deliveryVerified: true,
          };
        } catch (error) {
          return {
            ok: true,
            packagePath,
            planPath,
            outputPath: result.outputPath,
            configPath,
            adobe: {
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }
      let finalOutputPath: string;
      try {
        finalOutputPath = await moveDirectorDelivery(
          deliveryPath,
          outputRoot,
          plan.title,
          renderNow,
        );
      } catch (error) {
        return {
          ok: true,
          packagePath,
          planPath,
          outputPath: deliveryPath,
          configPath,
          adobe: {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
      const deliveryInfo = await stat(finalOutputPath);
      await rm(packagePath, { recursive: true, force: true }).catch(() => undefined);
      return {
        ok: true,
        packagePath: null,
        planPath: null,
        outputPath: finalOutputPath,
        outputBytes: deliveryInfo.size,
        configPath,
        adobe: {
          status: 'rendered',
          receipt: {
            ...receipt,
            deliveryPath: finalOutputPath,
          },
        },
      };
    }
    return {
      ok: true,
      packagePath,
      planPath,
      outputPath: result.outputPath,
      configPath,
      adobe: {
        status: 'queued',
        receipt: result.receipt,
        warning: 'Automatic rendering was disabled.',
      },
    };
  } catch (error) {
    return {
      ok: true,
      packagePath,
      planPath,
      outputPath,
      configPath,
      adobe: {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
