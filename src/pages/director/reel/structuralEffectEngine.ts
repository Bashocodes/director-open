import { structuralEffectSampleAtFrame } from './effectRecipes';
import { canvasPngBlob, decodeRgbaWorkspace } from './rgbaWorkspace';
import {
  renderStructuralEffectStackFrame,
  type StructuralEffectId,
} from './structuralEffects';

export async function makeStructuralEffectFrameSequence(options: {
  effectIds: readonly StructuralEffectId[];
  bytes: Uint8Array;
  extension: string;
  width: number;
  height: number;
  intensity: number;
  seed: number;
  effectSeeds?: Partial<Record<StructuralEffectId, number>>;
  duration: number;
  outputFps: number;
  signal?: AbortSignal;
  shouldCancel?: () => boolean;
  yieldEvery?: number;
  onFrame: (frame: {
    bytes: Uint8Array;
    frameIndex: number;
    frameCount: number;
    phase: number;
    effectMs: number;
  }) => void | Promise<void>;
}) {
  if (options.effectIds.length === 0) throw new Error('A structural-effect sequence needs at least one plugin.');
  const firstSample = structuralEffectSampleAtFrame(
    0,
    options.duration,
    options.outputFps,
    options.seed,
  );
  const { frameRate, frameCount } = firstSample;
  const yieldEvery = Math.max(1, Math.round(options.yieldEvery ?? 3));
  const cancelled = () => Boolean(options.signal?.aborted || options.shouldCancel?.());
  const workspace = await decodeRgbaWorkspace(options);
  let maximumEffectMs = 0;
  let totalEffectMs = 0;
  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (cancelled()) throw new Error('Render cancelled.');
      const sample = structuralEffectSampleAtFrame(
        frameIndex,
        options.duration,
        options.outputFps,
        options.seed,
      );
      const started = performance.now();
      const rendered = renderStructuralEffectStackFrame(
        options.effectIds,
        workspace.source,
        options.width,
        options.height,
        {
          intensity: options.intensity,
          phase: sample.phase,
          progress: sample.progress,
          seed: sample.seed,
          baseSeed: options.seed,
          effectSeeds: options.effectSeeds,
          frameIndex,
          frameCount,
        },
      );
      const effectMs = performance.now() - started;
      maximumEffectMs = Math.max(maximumEffectMs, effectMs);
      totalEffectMs += effectMs;
      if (cancelled()) throw new Error('Render cancelled.');
      workspace.frame.data.set(rendered);
      workspace.context.putImageData(workspace.frame, 0, 0);
      const bytes = new Uint8Array(await (await canvasPngBlob(workspace.canvas)).arrayBuffer());
      if (cancelled()) throw new Error('Render cancelled.');
      await options.onFrame({ bytes, frameIndex, frameCount, phase: sample.phase, effectMs });
      if (cancelled()) throw new Error('Render cancelled.');
      if ((frameIndex + 1) % yieldEvery === 0 && frameIndex + 1 < frameCount) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    return {
      frameRate,
      frameCount,
      maximumEffectMs,
      averageEffectMs: totalEffectMs / frameCount,
    };
  } finally {
    workspace.bitmap.close();
  }
}
