#pragma once

#include <cstddef>
#include <cstdint>

#include "director_pixel_sort_core.h"

namespace director_pixel_sort {

/**
 * Public After Effects parameter values before normalization.
 *
 * Beat Amount is deliberately additive: a Director beat pulse increases the
 * base Intensity without changing the deterministic Phase or Seed controls.
 */
struct PluginParameters {
  float intensity_percent = 100.0f;
  float phase_percent = 100.0f;
  float beat_amount_percent = 0.0f;
  float seed = 1.0f;
};

Params map_plugin_parameters(const PluginParameters& parameters);

/**
 * The Adobe-facing 32-bit float adapter.
 *
 * After Effects stores PF_PixelFloat channels as ARGB and permits padding at
 * the end of each row. The portable core consumes tightly packed RGBA. This
 * function is the one conversion path used by SmartFX and by the parity test.
 * It never clamps, quantizes, or changes floating-point bit depth.
 */
void render_argb_float_rows(
  const void* source,
  std::ptrdiff_t source_row_bytes,
  void* destination,
  std::ptrdiff_t destination_row_bytes,
  std::int32_t width,
  std::int32_t height,
  const PluginParameters& parameters
);

} // namespace director_pixel_sort
