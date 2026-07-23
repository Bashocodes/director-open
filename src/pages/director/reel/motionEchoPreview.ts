export function motionEchoRgba(
  sourceRgba: Uint8ClampedArray,
  previousTrail: Uint8ClampedArray | undefined,
  decay: number,
  mixAmount: number,
) {
  if (previousTrail && previousTrail.length !== sourceRgba.length) {
    throw new Error('Motion-echo trail dimensions do not match.');
  }
  const trail = sourceRgba.slice();
  const output = sourceRgba.slice();
  const boundedDecay = Math.min(1, Math.max(0, decay));
  const boundedMix = Math.min(1, Math.max(0, mixAmount));
  for (let offset = 0; offset < sourceRgba.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = sourceRgba[offset + channel];
      const retained = previousTrail
        ? Math.max(value, Math.round(previousTrail[offset + channel] * boundedDecay))
        : value;
      trail[offset + channel] = retained;
      output[offset + channel] = Math.round(value + (retained - value) * boundedMix);
    }
    trail[offset + 3] = sourceRgba[offset + 3];
    output[offset + 3] = sourceRgba[offset + 3];
  }
  return { output, trail };
}
