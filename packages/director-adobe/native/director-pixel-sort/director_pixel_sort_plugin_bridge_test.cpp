#include "director_pixel_sort_core.h"
#include "director_pixel_sort_plugin_bridge.h"

#include <cassert>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <vector>

namespace {

struct ArgbFloatPixel {
  float alpha;
  float red;
  float green;
  float blue;
};

static_assert(sizeof(ArgbFloatPixel) == sizeof(float) * 4);

} // namespace

int main() {
  constexpr std::int32_t width = 320;
  constexpr std::int32_t height = 80;
  constexpr std::size_t padding = 32;
  const std::size_t row_bytes = static_cast<std::size_t>(width) * sizeof(ArgbFloatPixel) + padding;
  std::vector<std::byte> source_rows(row_bytes * height, std::byte{0x4d});
  std::vector<std::byte> plugin_rows(row_bytes * height, std::byte{0x2a});
  std::vector<float> source_rgba(static_cast<std::size_t>(width) * height * 4);

  for (std::int32_t y = 0; y < height; ++y) {
    auto* row = source_rows.data() + static_cast<std::size_t>(y) * row_bytes;
    for (std::int32_t x = 0; x < width; ++x) {
      const float red = x == 0 && y == 0 ? 1.75f : (x % 7 < 3 ? 0.24f : 0.74f);
      const float blue = x == 0 && y == 0 ? 1.25f : (x % 11 < 5 ? 0.35f : 0.65f);
      const float green = (0.5f - red * 0.2126f - blue * 0.0722f) / 0.7152f;
      const float alpha = 0.35f + static_cast<float>(x % 5) * 0.1f;
      const ArgbFloatPixel pixel = {alpha, red, green, blue};
      std::memcpy(row + static_cast<std::size_t>(x) * sizeof(pixel), &pixel, sizeof(pixel));

      const auto index = (static_cast<std::size_t>(y) * width + x) * 4;
      source_rgba[index] = red;
      source_rgba[index + 1] = green;
      source_rgba[index + 2] = blue;
      source_rgba[index + 3] = alpha;
    }
  }

  director_pixel_sort::PluginParameters plugin_parameters;
  plugin_parameters.intensity_percent = 43.0f;
  plugin_parameters.phase_percent = 88.0f;
  plugin_parameters.beat_amount_percent = 22.0f;
  plugin_parameters.seed = 17.0f;

  const auto core_parameters = director_pixel_sort::map_plugin_parameters(plugin_parameters);
  assert(core_parameters.intensity == 0.65f);
  assert(core_parameters.phase == 0.88f);
  assert(core_parameters.seed == 17.0f);

  std::vector<float> expected_rgba(source_rgba.size());
  director_pixel_sort::render_rgba_float(
    source_rgba.data(),
    expected_rgba.data(),
    width,
    height,
    core_parameters
  );
  director_pixel_sort::render_argb_float_rows(
    source_rows.data(),
    static_cast<std::ptrdiff_t>(row_bytes),
    plugin_rows.data(),
    static_cast<std::ptrdiff_t>(row_bytes),
    width,
    height,
    plugin_parameters
  );

  std::size_t exact_channels = 0;
  for (std::int32_t y = 0; y < height; ++y) {
    const auto* plugin_row = plugin_rows.data() + static_cast<std::size_t>(y) * row_bytes;
    for (std::int32_t x = 0; x < width; ++x) {
      ArgbFloatPixel actual;
      std::memcpy(
        &actual,
        plugin_row + static_cast<std::size_t>(x) * sizeof(actual),
        sizeof(actual)
      );
      const auto index = (static_cast<std::size_t>(y) * width + x) * 4;
      const float expected_argb[4] = {
        expected_rgba[index + 3],
        expected_rgba[index],
        expected_rgba[index + 1],
        expected_rgba[index + 2],
      };
      const float actual_argb[4] = {actual.alpha, actual.red, actual.green, actual.blue};
      assert(std::memcmp(expected_argb, actual_argb, sizeof(expected_argb)) == 0);
      exact_channels += 4;
    }

    for (std::size_t offset = static_cast<std::size_t>(width) * sizeof(ArgbFloatPixel);
         offset < row_bytes;
         ++offset) {
      assert(plugin_row[offset] == std::byte{0x2a});
    }
  }

  std::cout
    << "plugin_path_parity_pixels=" << static_cast<std::size_t>(width) * height
    << " exact_float_channels=" << exact_channels
    << " bit_depth=32\n";
  return 0;
}
