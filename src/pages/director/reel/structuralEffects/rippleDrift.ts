import { clamp01, deterministicHash, effectStrength, mix } from '../effectRecipes';
import type { StructuralEffectFrameOptions } from '../structuralEffects';

const TAU = Math.PI * 2;
const PEAK_INTENSITY_STRENGTH = effectStrength(90);

function hash01(value: number) {
  return (deterministicHash(value) + 1) * 0.5;
}

function sampleBilinear(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  destinationOffset: number,
  width: number,
  height: number,
  sampleX: number,
  sampleY: number,
) {
  const x = Math.max(0, Math.min(width - 1, sampleX));
  const y = Math.max(0, Math.min(height - 1, sampleY));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const xMix = x - x0;
  const yMix = y - y0;
  const upperLeft = (y0 * width + x0) * 4;
  const upperRight = (y0 * width + x1) * 4;
  const lowerLeft = (y1 * width + x0) * 4;
  const lowerRight = (y1 * width + x1) * 4;

  for (let channel = 0; channel < 4; channel += 1) {
    const upper = source[upperLeft + channel]
      + (source[upperRight + channel] - source[upperLeft + channel]) * xMix;
    const lower = source[lowerLeft + channel]
      + (source[lowerRight + channel] - source[lowerLeft + channel]) * xMix;
    output[destinationOffset + channel] = upper + (lower - upper) * yMix;
  }
}

/**
 * Two crossed travelling waves bend the source in perpendicular directions.
 * Wavelengths and axes are stable for a seed; only their phase advances, which
 * keeps neighboring morphology frames continuous instead of re-randomizing.
 */
export const rippleDriftPlugin = {
  id: 'ripple-drift' as const,
  renderFrame(
    sourceRgba: Uint8ClampedArray,
    width: number,
    height: number,
    options: StructuralEffectFrameOptions,
  ) {
    if (sourceRgba.length !== width * height * 4) {
      throw new Error('Ripple-drift source dimensions do not match.');
    }

    const envelope = clamp01(options.phase);
    const progress = clamp01(options.progress);
    const strength = effectStrength(options.intensity);
    if (width <= 0 || height <= 0 || envelope <= 0 || strength <= 0 || progress <= 0 || progress >= 1) {
      return sourceRgba.slice();
    }

    const baseSeed = options.baseSeed ?? options.seed;
    const wavelengthA = Math.max(2, width * mix(0.18, 0.3, hash01(baseSeed + 1.37)));
    const wavelengthB = Math.max(2, width * mix(0.18, 0.3, hash01(baseSeed + 5.83)));
    const axisA = mix(0.48, 0.88, hash01(baseSeed + 9.41));
    const axisB = axisA + mix(1.28, 1.72, hash01(baseSeed + 13.19));
    const cosAxisA = Math.cos(axisA);
    const sinAxisA = Math.sin(axisA);
    const cosAxisB = Math.cos(axisB);
    const sinAxisB = Math.sin(axisB);
    const waveNumberA = TAU / wavelengthA;
    const waveNumberB = TAU / wavelengthB;

    // The shared engine advances seed by 0.003 per morphology frame. Fold that
    // convention into the same gentle travel used by preview and export.
    const seedTravel = (options.seed - baseSeed) * TAU * 1.6;
    const travelA = progress * TAU * 0.78 + seedTravel;
    const travelB = -progress * TAU * 0.61 - seedTravel * 0.73;
    const phaseA = hash01(baseSeed + 17.53) * TAU + travelA;
    const phaseB = hash01(baseSeed + 21.07) * TAU + travelB;

    const intensityScale = Math.min(1, strength / PEAK_INTENSITY_STRENGTH);
    const amplitude = width * 0.018 * envelope * intensityScale;
    const output = new Uint8ClampedArray(sourceRgba.length);
    const stepA = waveNumberA * cosAxisA;
    const stepB = waveNumberB * cosAxisB;
    const sinStepA = Math.sin(stepA);
    const cosStepA = Math.cos(stepA);
    const sinStepB = Math.sin(stepB);
    const cosStepB = Math.cos(stepB);

    for (let y = 0; y < height; y += 1) {
      const angleA = waveNumberA * y * sinAxisA + phaseA;
      const angleB = waveNumberB * y * sinAxisB + phaseB;
      let sineA = Math.sin(angleA);
      let cosineA = Math.cos(angleA);
      let sineB = Math.sin(angleB);
      let cosineB = Math.cos(angleB);

      for (let x = 0; x < width; x += 1) {
        // Displace perpendicular to each wave's propagation axis. The weights
        // sum to one, so the combined field never exceeds the amplitude budget.
        const displacementX = amplitude * (
          -sinAxisA * sineA * 0.62
          - sinAxisB * sineB * 0.38
        );
        const displacementY = amplitude * (
          cosAxisA * sineA * 0.62
          + cosAxisB * sineB * 0.38
        );
        sampleBilinear(
          sourceRgba,
          output,
          (y * width + x) * 4,
          width,
          height,
          x + displacementX,
          y + displacementY,
        );

        const nextSineA = sineA * cosStepA + cosineA * sinStepA;
        cosineA = cosineA * cosStepA - sineA * sinStepA;
        sineA = nextSineA;
        const nextSineB = sineB * cosStepB + cosineB * sinStepB;
        cosineB = cosineB * cosStepB - sineB * sinStepB;
        sineB = nextSineB;
      }
    }

    return output;
  },
};
