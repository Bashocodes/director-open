import { describe, expect, it } from 'vitest';
import {
  opticalFfmpegRecipe,
  pixelSortMorphologyFps,
  premiumLoopEnvelope,
  premiumLoopEnvelopeAtFrame,
  premiumLoopFrameBoundaries,
  structuralEffectFps,
  structuralEffectFrameCount,
  structuralEffectPhase,
  structuralEffectSampleAtFrame,
  structuralEffectSampleAtProgress,
  structuralEffectSeed,
} from './effectRecipes';

describe('premium reel effect recipes', () => {
  it('uses absolute, frame-quantized segment boundaries at 3.2s, 6.4s, and 12s', () => {
    expect(premiumLoopFrameBoundaries(3.2, 24)).toEqual({
      frameCount: 77,
      leadEndFrame: 12,
      riseEndFrame: 41,
      holdEndFrame: 42,
      fallEndFrame: 71,
      leadFrames: 12,
      riseFrames: 29,
      holdFrames: 1,
      fallFrames: 29,
      tailFrames: 6,
    });
    expect(premiumLoopFrameBoundaries(6.4, 24)).toEqual({
      frameCount: 154,
      leadEndFrame: 12,
      riseEndFrame: 41,
      holdEndFrame: 119,
      fallEndFrame: 148,
      leadFrames: 12,
      riseFrames: 29,
      holdFrames: 78,
      fallFrames: 29,
      tailFrames: 6,
    });
    expect(premiumLoopFrameBoundaries(12, 24)).toEqual({
      frameCount: 288,
      leadEndFrame: 12,
      riseEndFrame: 41,
      holdEndFrame: 253,
      fallEndFrame: 282,
      leadFrames: 12,
      riseFrames: 29,
      holdFrames: 212,
      fallFrames: 29,
      tailFrames: 6,
    });
  });

  it('keeps the first and final output frames exactly clean at every required duration', () => {
    for (const duration of [3.2, 6.4, 12]) {
      const timing = premiumLoopFrameBoundaries(duration, 24);
      expect(premiumLoopEnvelopeAtFrame(0, timing)).toBe(0);
      expect(premiumLoopEnvelopeAtFrame(timing.frameCount - 1, timing)).toBe(0);
      expect(premiumLoopEnvelope(0, duration, 24)).toBe(0);
      expect(premiumLoopEnvelope(1, duration, 24)).toBe(0);
    }
  });

  it('compiles the same absolute-time boundaries into FFmpeg optical expressions', () => {
    const recipe = opticalFfmpegRecipe({ intensity: 64, duration: 3.2, fps: 30 });
    expect(recipe.envelope).toContain('if(lt(N,15),0');
    expect(recipe.envelope).toContain('if(lt(N,51)');
    expect(recipe.envelope).toContain('if(lt(N,52),1');
    expect(recipe.envelope).toContain('if(lt(N,88)');
    expect(recipe.envelope).not.toContain('sin(');
    expect(recipe.blend).toContain('*(B-A)');
  });

  it('budgets every structural-effect sequence at half the output frame rate', () => {
    expect(structuralEffectFps(24)).toBe(12);
    expect(structuralEffectFps(30)).toBe(15);
    expect(structuralEffectFrameCount(3.2, 24)).toBe(39);
    expect(structuralEffectFrameCount(8, 24)).toBe(96);
    expect(pixelSortMorphologyFps).toBe(structuralEffectFps);
  });

  it('samples the shared clean-build-peak-recover envelope into structural frames', () => {
    const duration = 6.4;
    const fps = 24;
    const frameCount = structuralEffectFrameCount(duration, fps);
    expect(structuralEffectPhase(0, frameCount, duration, fps)).toBe(0);
    expect(structuralEffectPhase(9, frameCount, duration, fps)).toBeGreaterThan(0);
    expect(structuralEffectPhase(38, frameCount, duration, fps)).toBe(1);
    expect(structuralEffectPhase(67, frameCount, duration, fps)).toBeGreaterThan(0);
    expect(structuralEffectPhase(frameCount - 1, frameCount, duration, fps)).toBe(0);
    expect(structuralEffectSeed(0.42, 10)).toBeCloseTo(0.45, 8);
  });

  it('maps preview output frames onto the exact half-rate export samples', () => {
    const duration = 6.4;
    const fps = 24;
    const seed = 0.42;
    const atOutputFrame = (frame: number) => structuralEffectSampleAtProgress(
      frame / fps / duration,
      duration,
      fps,
      seed,
    );
    expect(atOutputFrame(0)).toEqual(structuralEffectSampleAtFrame(0, duration, fps, seed));
    expect(atOutputFrame(1).frameIndex).toBe(0);
    expect(atOutputFrame(2).frameIndex).toBe(1);
    expect(atOutputFrame(3).frameIndex).toBe(1);
    expect(atOutputFrame(2).seed).toBeCloseTo(seed + 0.003, 8);
    expect(atOutputFrame(76).phase).toBe(1);
    expect(structuralEffectSampleAtProgress(1, duration, fps, seed)).toMatchObject({
      frameIndex: 76,
      progress: 1,
      phase: 0,
    });
  });
});
