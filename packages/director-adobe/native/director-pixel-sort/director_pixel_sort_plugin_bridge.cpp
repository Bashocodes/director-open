#include "director_pixel_sort_plugin_bridge.h"

#include <algorithm>
#include <cstddef>
#include <cstring>
#include <stdexcept>
#include <vector>

namespace director_pixel_sort {
namespace {

struct ArgbFloatPixel {
  float alpha;
  float red;
  float green;
  float blue;
};

static_assert(sizeof(ArgbFloatPixel) == sizeof(float) * 4);

float clamp_percent(float value) {
  return std::max(0.0f, std::min(100.0f, value));
}

} // namespace

Params map_plugin_parameters(const PluginParameters& parameters) {
  Params mapped;
  mapped.intensity = clamp_percent(
    parameters.intensity_percent + parameters.beat_amount_percent
  ) / 100.0f;
  mapped.phase = clamp_percent(parameters.phase_percent) / 100.0f;
  mapped.seed = parameters.seed;
  return mapped;
}

void render_argb_float_rows(
  const void* source,
  std::ptrdiff_t source_row_bytes,
  void* destination,
  std::ptrdiff_t destination_row_bytes,
  std::int32_t width,
  std::int32_t height,
  const PluginParameters& parameters
) {
  if (source == nullptr || destination == nullptr || width <= 0 || height <= 0) return;

  const auto packed_row_bytes = static_cast<std::ptrdiff_t>(
    static_cast<std::size_t>(width) * sizeof(ArgbFloatPixel)
  );
  if (source_row_bytes < packed_row_bytes || destination_row_bytes < packed_row_bytes) {
    throw std::invalid_argument("Director Pixel Sort received an invalid float row stride.");
  }

  const auto pixel_count = static_cast<std::size_t>(width) * height;
  std::vector<float> source_rgba(pixel_count * 4);
  std::vector<float> destination_rgba(pixel_count * 4);
  const auto* source_bytes = static_cast<const std::byte*>(source);

  for (std::int32_t y = 0; y < height; ++y) {
    const auto* source_row = source_bytes + static_cast<std::ptrdiff_t>(y) * source_row_bytes;
    for (std::int32_t x = 0; x < width; ++x) {
      ArgbFloatPixel pixel;
      std::memcpy(
        &pixel,
        source_row + static_cast<std::ptrdiff_t>(x) * sizeof(ArgbFloatPixel),
        sizeof(pixel)
      );
      const auto index = (static_cast<std::size_t>(y) * width + x) * 4;
      source_rgba[index] = pixel.red;
      source_rgba[index + 1] = pixel.green;
      source_rgba[index + 2] = pixel.blue;
      source_rgba[index + 3] = pixel.alpha;
    }
  }

  render_rgba_float(
    source_rgba.data(),
    destination_rgba.data(),
    width,
    height,
    map_plugin_parameters(parameters)
  );

  auto* destination_bytes = static_cast<std::byte*>(destination);
  for (std::int32_t y = 0; y < height; ++y) {
    auto* destination_row =
      destination_bytes + static_cast<std::ptrdiff_t>(y) * destination_row_bytes;
    for (std::int32_t x = 0; x < width; ++x) {
      const auto index = (static_cast<std::size_t>(y) * width + x) * 4;
      const ArgbFloatPixel pixel = {
        destination_rgba[index + 3],
        destination_rgba[index],
        destination_rgba[index + 1],
        destination_rgba[index + 2],
      };
      std::memcpy(
        destination_row + static_cast<std::ptrdiff_t>(x) * sizeof(ArgbFloatPixel),
        &pixel,
        sizeof(pixel)
      );
    }
  }
}

} // namespace director_pixel_sort
