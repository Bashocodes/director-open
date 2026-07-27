#include "director_pixel_sort_core.h"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <iostream>
#include <limits>
#include <vector>

namespace {

bool almostEqual(float left, float right) {
  return std::abs(left - right) < 0.000001f;
}

} // namespace

int main() {
  constexpr std::int32_t width = 320;
  constexpr std::int32_t height = 80;
  const auto pixelCount = static_cast<std::size_t>(width) * height;
  std::vector<float> source(pixelCount * 4);
  for (std::int32_t y = 0; y < height; ++y) {
    for (std::int32_t x = 0; x < width; ++x) {
      const auto pixel = static_cast<std::size_t>(y) * width + x;
      const float red = (x % 7 < 3) ? 0.24f : 0.74f;
      const float blue = (x % 11 < 5) ? 0.35f : 0.65f;
      const float green = (0.5f - red * 0.2126f - blue * 0.0722f) / 0.7152f;
      source[pixel * 4] = red;
      source[pixel * 4 + 1] = green;
      source[pixel * 4 + 2] = blue;
      source[pixel * 4 + 3] = 0.35f + static_cast<float>(x % 5) * 0.1f;
    }
  }
  // HDR values outside the sorting thresholds must remain float values rather
  // than being clamped or quantized by the kernel.
  source[0] = 1.75f;
  source[1] = 1.25f;

  director_pixel_sort::Params clean;
  clean.phase = 0.0f;
  std::vector<float> cleanOutput(source.size(), 0.0f);
  director_pixel_sort::render_rgba_float(source.data(), cleanOutput.data(), width, height, clean);
  assert(cleanOutput == source);

  director_pixel_sort::Params full;
  full.intensity = 1.0f;
  full.phase = 1.0f;
  full.seed = 17.0f;
  full.minimum_run = 5;
  full.maximum_run = 160;
  std::vector<float> first(source.size(), 0.0f);
  std::vector<float> second(source.size(), 0.0f);
  director_pixel_sort::render_rgba_float(source.data(), first.data(), width, height, full);
  director_pixel_sort::render_rgba_float(source.data(), second.data(), width, height, full);
  assert(first == second);
  assert(almostEqual(first[0], 1.75f));
  assert(almostEqual(first[1], 1.25f));

  std::vector<float> inPlace = source;
  director_pixel_sort::render_rgba_float(inPlace.data(), inPlace.data(), width, height, full);
  assert(inPlace == first);

  director_pixel_sort::Params bounded = full;
  bounded.seed = std::numeric_limits<float>::quiet_NaN();
  bounded.minimum_run = std::numeric_limits<std::int32_t>::max();
  bounded.maximum_run = std::numeric_limits<std::int32_t>::max();
  std::vector<float> boundedOutput(source.size(), 0.0f);
  director_pixel_sort::render_rgba_float(
    source.data(),
    boundedOutput.data(),
    width,
    height,
    bounded
  );
  assert(boundedOutput.size() == source.size());

  std::size_t changedPixels = 0;
  std::size_t longestRun = 0;
  for (std::int32_t y = 0; y < height; ++y) {
    std::size_t currentRun = 0;
    for (std::int32_t x = 0; x < width; ++x) {
      const auto pixel = static_cast<std::size_t>(y) * width + x;
      const bool changed =
        !almostEqual(first[pixel * 4], source[pixel * 4])
        || !almostEqual(first[pixel * 4 + 1], source[pixel * 4 + 1])
        || !almostEqual(first[pixel * 4 + 2], source[pixel * 4 + 2]);
      changedPixels += changed ? 1 : 0;
      currentRun = changed ? currentRun + 1 : 0;
      longestRun = std::max(longestRun, currentRun);
      assert(almostEqual(first[pixel * 4 + 3], source[pixel * 4 + 3]));
    }
  }

  assert(changedPixels > pixelCount / 40);
  assert(longestRun >= 12);
  std::cout << "changed_pixels=" << changedPixels << " longest_run=" << longestRun << '\n';
  return 0;
}
