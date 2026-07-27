#pragma once

#include <cstdint>

namespace director_pixel_sort {

struct Params {
  float intensity = 1.0f;
  float phase = 1.0f;
  float seed = 0.0f;
  std::int32_t minimum_run = 5;
  std::int32_t maximum_run = 384;
};

/**
 * Sorts selected contiguous horizontal source-pixel intervals in-place into
 * an RGBA float destination. The kernel intentionally never quantizes to
 * 8-bit; the Adobe adapter passes PF_PixelFloat buffers through unchanged.
 */
void render_rgba_float(
  const float* source,
  float* destination,
  std::int32_t width,
  std::int32_t height,
  const Params& params
);

} // namespace director_pixel_sort
