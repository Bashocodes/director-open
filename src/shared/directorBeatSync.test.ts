import { describe, expect, it } from 'vitest';
import { beatAtFrame, buildDirectorBeatSyncPlan } from './directorBeatSync';

describe('Director beat sync contract', () => {
  it('detects sharp energy peaks and quantizes them to output frames', () => {
    const sampleRate = 24;
    const samples = new Float32Array(24 * 4);
    samples[24] = 1;
    samples[48 + 2] = 0.8;
    const plan = buildDirectorBeatSyncPlan(samples, sampleRate, 24, 4, { threshold: 1.1, minimumGapFrames: 2 });

    expect(plan.version).toBe(1);
    expect(plan.frameCount).toBe(96);
    expect(plan.beats.map((beat) => beat.frame)).toEqual([24, 50]);
    expect(beatAtFrame(plan, 24)?.strength).toBe(1);
  });

  it('returns a stable empty map for silence', () => {
    const plan = buildDirectorBeatSyncPlan(new Float32Array(30), 30, 30, 1);
    expect(plan.beats).toEqual([]);
    expect(plan.analysis.source).toBe('decoded-audio-energy');
  });
});
