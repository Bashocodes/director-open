/**
 * Shared primitives for effect plugins.
 *
 * Every helper here is pure and resolution-independent: spatial quantities are
 * expressed as fractions of the frame so a 540-wide preview and a 4096-wide
 * still export are the same effect at different sampling densities.
 */

export function clamp8(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Rec. 709 luma, the weighting used everywhere else in this codebase. */
export function luma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function screenBlend(base: number, add: number): number {
  const a = clamp8(add);
  return 255 - ((255 - base) * (255 - a)) / 255;
}

/**
 * Bilinear sample with edge clamping. Coordinates are in pixels; out-of-range
 * reads clamp rather than wrap so displacement effects never mirror content
 * from the opposite edge.
 */
export function sampleBilinear(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
): number {
  const cx = x < 0 ? 0 : x > width - 1 ? width - 1 : x;
  const cy = y < 0 ? 0 : y > height - 1 ? height - 1 : y;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = x0 + 1 > width - 1 ? width - 1 : x0 + 1;
  const y1 = y0 + 1 > height - 1 ? height - 1 : y0 + 1;
  const fx = cx - x0;
  const fy = cy - y0;
  const topLeft = src[(y0 * width + x0) * 4 + channel];
  const topRight = src[(y0 * width + x1) * 4 + channel];
  const bottomLeft = src[(y1 * width + x0) * 4 + channel];
  const bottomRight = src[(y1 * width + x1) * 4 + channel];
  const top = topLeft + (topRight - topLeft) * fx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Separable box blur over an interleaved RGB Float32Array (3 floats per pixel).
 * Two passes approximate a gaussian closely enough for glow work and cost O(n)
 * regardless of radius.
 */
export function boxBlurRgb(
  source: Float32Array,
  width: number,
  height: number,
  radiusX: number,
  radiusY: number,
): Float32Array {
  const temp = new Float32Array(source.length);
  const out = new Float32Array(source.length);
  blurHorizontal(source, temp, width, height, Math.max(0, Math.round(radiusX)));
  blurVertical(temp, out, width, height, Math.max(0, Math.round(radiusY)));
  return out;
}

function blurHorizontal(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  if (radius <= 0) {
    dst.set(src);
    return;
  }
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let x = -radius; x <= radius; x += 1) {
        const cx = x < 0 ? 0 : x > width - 1 ? width - 1 : x;
        sum += src[(row + cx) * 3 + c];
      }
      for (let x = 0; x < width; x += 1) {
        dst[(row + x) * 3 + c] = sum / window;
        const outX = x - radius < 0 ? 0 : x - radius;
        const inRaw = x + radius + 1;
        const inX = inRaw > width - 1 ? width - 1 : inRaw;
        sum += src[(row + inX) * 3 + c] - src[(row + outX) * 3 + c];
      }
    }
  }
}

function blurVertical(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  if (radius <= 0) {
    dst.set(src);
    return;
  }
  const window = radius * 2 + 1;
  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let y = -radius; y <= radius; y += 1) {
        const cy = y < 0 ? 0 : y > height - 1 ? height - 1 : y;
        sum += src[(cy * width + x) * 3 + c];
      }
      for (let y = 0; y < height; y += 1) {
        dst[(y * width + x) * 3 + c] = sum / window;
        const outY = y - radius < 0 ? 0 : y - radius;
        const inRaw = y + radius + 1;
        const inY = inRaw > height - 1 ? height - 1 : inRaw;
        sum += src[(inY * width + x) * 3 + c] - src[(outY * width + x) * 3 + c];
      }
    }
  }
}

/** Extracts the amount each channel sits above a 0..255 luma threshold. */
export function highlightPass(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): Float32Array {
  const pixels = width * height;
  const out = new Float32Array(pixels * 3);
  const headroom = Math.max(1, 255 - threshold);
  for (let p = 0; p < pixels; p += 1) {
    const o = p * 4;
    const value = luma(source[o], source[o + 1], source[o + 2]);
    if (value <= threshold) continue;
    const scale = (value - threshold) / headroom;
    out[p * 3] = source[o] * scale;
    out[p * 3 + 1] = source[o + 1] * scale;
    out[p * 3 + 2] = source[o + 2] * scale;
  }
  return out;
}

/**
 * Deterministic hash-based noise in 0..1. Effects must never call Math.random:
 * the same frame has to render identically in the player and in the export.
 */
export function hashNoise(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smoothstep between two edges. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 === edge0) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
