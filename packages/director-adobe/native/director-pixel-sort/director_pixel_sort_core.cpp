#include "director_pixel_sort_core.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <numeric>
#include <vector>

namespace director_pixel_sort {
namespace {

constexpr float kReferenceWidth = 1080.0f;

float clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

float mix(float from, float to, float amount) {
  return from + (to - from) * amount;
}

float smoothstep(float value) {
  const float amount = clamp01(value);
  return amount * amount * (3.0f - 2.0f * amount);
}

std::uint32_t hashBits(std::uint32_t value) {
  value ^= value >> 16;
  value *= 0x7feb352dU;
  value ^= value >> 15;
  value *= 0x846ca68bU;
  value ^= value >> 16;
  return value;
}

float hash01(std::uint32_t value) {
  return static_cast<float>(hashBits(value) & 0x00ffffffU) / 16777215.0f;
}

std::uint32_t floatSeed(float seed) {
  const float finite_seed = std::isfinite(seed) ? std::abs(seed) : 0.0f;
  return hashBits(static_cast<std::uint32_t>(std::fmod(finite_seed, 4290.0f) * 1000003.0f));
}

std::uint32_t coordinateSeed(
  std::uint32_t seed,
  std::int32_t x,
  std::int32_t y,
  std::int32_t octave
) {
  return seed
    ^ static_cast<std::uint32_t>(x) * 73856093U
    ^ static_cast<std::uint32_t>(y) * 19349663U
    ^ static_cast<std::uint32_t>(octave + 1) * 83492791U;
}

float luma(const float* pixel) {
  return pixel[0] * 0.2126f + pixel[1] * 0.7152f + pixel[2] * 0.0722f;
}

float lightnessSaturationKey(const float* pixel) {
  const float maximum = std::max(pixel[0], std::max(pixel[1], pixel[2]));
  const float minimum = std::min(pixel[0], std::min(pixel[1], pixel[2]));
  const float lightness = (maximum + minimum) * 0.5f;
  const float delta = maximum - minimum;
  const float saturation = delta <= 0.000001f
    ? 0.0f
    : delta / (1.0f - std::abs(2.0f * lightness - 1.0f) + 0.000001f);
  return lightness + saturation * 0.075f;
}

std::vector<float> makeBrushField(
  std::int32_t width,
  std::int32_t height,
  std::uint32_t seed
) {
  struct Octave {
    float cell;
    float weight;
  };
  constexpr std::array<Octave, 3> octaves = {{
    {56.0f, 0.56f},
    {23.0f, 0.29f},
    {9.0f, 0.15f},
  }};

  std::vector<float> field(static_cast<std::size_t>(width) * height, 0.0f);
  std::vector<std::int32_t> x_indexes(static_cast<std::size_t>(width));
  std::vector<float> x_mixes(static_cast<std::size_t>(width));
  std::vector<std::int32_t> y_indexes(static_cast<std::size_t>(height));
  std::vector<float> y_mixes(static_cast<std::size_t>(height));

  for (std::int32_t octave = 0; octave < static_cast<std::int32_t>(octaves.size()); ++octave) {
    const float cell_size = std::max(1.0f, octaves[octave].cell * width / kReferenceWidth);
    const float phase_x = hash01(seed ^ static_cast<std::uint32_t>(octave * 193 + 17)) * cell_size;
    const float phase_y = hash01(seed ^ static_cast<std::uint32_t>(octave * 317 + 41)) * cell_size;
    std::int32_t grid_width = 2;
    std::int32_t grid_height = 2;

    for (std::int32_t x = 0; x < width; ++x) {
      const float position = (x + phase_x) / cell_size;
      const auto index = static_cast<std::int32_t>(std::floor(position));
      x_indexes[static_cast<std::size_t>(x)] = index;
      x_mixes[static_cast<std::size_t>(x)] = smoothstep(position - index);
      grid_width = std::max(grid_width, index + 2);
    }
    for (std::int32_t y = 0; y < height; ++y) {
      const float position = (y + phase_y) / cell_size;
      const auto index = static_cast<std::int32_t>(std::floor(position));
      y_indexes[static_cast<std::size_t>(y)] = index;
      y_mixes[static_cast<std::size_t>(y)] = smoothstep(position - index);
      grid_height = std::max(grid_height, index + 2);
    }

    std::vector<float> grid(static_cast<std::size_t>(grid_width) * grid_height);
    for (std::int32_t grid_y = 0; grid_y < grid_height; ++grid_y) {
      for (std::int32_t grid_x = 0; grid_x < grid_width; ++grid_x) {
        grid[static_cast<std::size_t>(grid_y) * grid_width + grid_x] = hash01(
          coordinateSeed(seed, grid_x, grid_y, octave)
        );
      }
    }

    for (std::int32_t y = 0; y < height; ++y) {
      const auto upper_y = y_indexes[static_cast<std::size_t>(y)];
      const float y_mix = y_mixes[static_cast<std::size_t>(y)];
      for (std::int32_t x = 0; x < width; ++x) {
        const auto left_x = x_indexes[static_cast<std::size_t>(x)];
        const float x_mix = x_mixes[static_cast<std::size_t>(x)];
        const auto upper = static_cast<std::size_t>(upper_y) * grid_width + left_x;
        const auto lower = static_cast<std::size_t>(upper_y + 1) * grid_width + left_x;
        const float upper_value = mix(grid[upper], grid[upper + 1], x_mix);
        const float lower_value = mix(grid[lower], grid[lower + 1], x_mix);
        field[static_cast<std::size_t>(y) * width + x] +=
          mix(upper_value, lower_value, y_mix) * octaves[octave].weight;
      }
    }
  }
  return field;
}

std::vector<float> makeGradientField(
  const std::vector<float>& luma_values,
  std::int32_t width,
  std::int32_t height
) {
  std::vector<float> gradients(static_cast<std::size_t>(width) * height, 1.0f);
  for (std::int32_t y = 1; y < height - 1; ++y) {
    for (std::int32_t x = 1; x < width - 1; ++x) {
      const auto pixel = static_cast<std::size_t>(y) * width + x;
      const auto upper = pixel - width;
      const auto lower = pixel + width;
      const float gradient_x = (
        luma_values[upper + 1] + luma_values[pixel + 1] * 2.0f + luma_values[lower + 1]
        - luma_values[upper - 1] - luma_values[pixel - 1] * 2.0f - luma_values[lower - 1]
      ) * 0.125f;
      const float gradient_y = (
        luma_values[lower - 1] + luma_values[lower] * 2.0f + luma_values[lower + 1]
        - luma_values[upper - 1] - luma_values[upper] * 2.0f - luma_values[upper + 1]
      ) * 0.125f;
      gradients[pixel] = std::sqrt(gradient_x * gradient_x + gradient_y * gradient_y);
    }
  }
  return gradients;
}

} // namespace

void render_rgba_float(
  const float* source,
  float* destination,
  std::int32_t width,
  std::int32_t height,
  const Params& params
) {
  if (source == nullptr || destination == nullptr || width <= 0 || height <= 0) return;
  const auto pixel_count = static_cast<std::size_t>(width) * height;
  std::vector<float> aliased_source;
  const float* input = source;
  if (source == destination) {
    aliased_source.assign(source, source + pixel_count * 4);
    input = aliased_source.data();
  } else {
    std::copy(source, source + pixel_count * 4, destination);
  }

  const float morphology = clamp01(params.phase) * clamp01(params.intensity);
  if (morphology <= 0.001f || width < 3 || height < 3) return;

  std::vector<float> luma_values(pixel_count);
  std::vector<float> sort_keys(pixel_count);
  for (std::size_t pixel = 0; pixel < pixel_count; ++pixel) {
    const float* rgba = input + pixel * 4;
    luma_values[pixel] = luma(rgba);
    sort_keys[pixel] = lightnessSaturationKey(rgba);
  }
  const auto brush_field = makeBrushField(width, height, floatSeed(params.seed));
  const auto gradients = makeGradientField(luma_values, width, height);

  const float lower_threshold = mix(0.09f, 0.05f, morphology);
  const float upper_threshold = mix(0.90f, 0.935f, morphology);
  const float field_threshold = mix(0.65f, 0.50f, morphology);
  const float edge_limit = 0.041f + 0.027f * morphology;
  const auto width_limit = std::max<std::int32_t>(2, width - 2);
  const auto minimum_run = std::min(
    width_limit,
    std::max<std::int32_t>(2, params.minimum_run)
  );
  const auto configured_maximum = std::min(
    width_limit,
    std::max(minimum_run, params.maximum_run)
  );
  const auto morphology_maximum = std::max<std::int32_t>(
    18,
    static_cast<std::int32_t>(std::round(
      (24.0f + 182.0f * std::pow(morphology, 1.45f)) * width / kReferenceWidth
    ))
  );
  const auto maximum_run = std::min(configured_maximum, std::max(minimum_run, morphology_maximum));
  const float interval_probability = mix(0.68f, 0.985f, morphology);
  const float pixel_mix = mix(0.74f, 0.92f, morphology);
  const auto seed = floatSeed(params.seed);

  const auto eligible = [&](std::size_t pixel) {
    const float value = sort_keys[pixel];
    return value >= lower_threshold
      && value <= upper_threshold
      && brush_field[pixel] >= field_threshold
      && gradients[pixel] <= edge_limit;
  };

  std::vector<std::int32_t> order;
  order.reserve(static_cast<std::size_t>(maximum_run));
  for (std::int32_t y = 1; y < height - 1; ++y) {
    const auto row_start = static_cast<std::size_t>(y) * width;
    std::int32_t x = 1;
    while (x < width - 1) {
      while (x < width - 1 && !eligible(row_start + x)) ++x;
      std::int32_t eligible_stop = x;
      while (eligible_stop < width - 1 && eligible(row_start + eligible_stop)) ++eligible_stop;

      std::int32_t cursor = x;
      while (cursor < eligible_stop) {
        const float length_noise = hash01(
          seed ^ static_cast<std::uint32_t>(cursor) * 31337U
          ^ static_cast<std::uint32_t>(y / 5) * 911U
        );
        const float local_field = brush_field[row_start + cursor];
        const auto target_length = std::max(
          minimum_run,
          static_cast<std::int32_t>(std::round(
            maximum_run * (0.64f + length_noise * 0.36f) * (0.76f + local_field * 0.31f)
          ))
        );
        const auto stop = std::min(eligible_stop, cursor + target_length);
        const auto run_length = stop - cursor;
        const float selection_noise = hash01(
          seed ^ static_cast<std::uint32_t>(cursor) * 104729U
          ^ static_cast<std::uint32_t>(y) * 15485863U
        );
        if (run_length >= minimum_run && selection_noise <= interval_probability) {
          order.resize(static_cast<std::size_t>(run_length));
          std::iota(order.begin(), order.end(), 0);
          const auto run_start = row_start + cursor;
          std::stable_sort(order.begin(), order.end(), [&](std::int32_t left, std::int32_t right) {
            return sort_keys[run_start + left] < sort_keys[run_start + right];
          });
          const auto direction_cell = std::max<std::int32_t>(97, static_cast<std::int32_t>(width * 0.16f));
          if (((y / 17 + cursor / direction_cell + static_cast<std::int32_t>(seed & 0x7fffffffU)) & 1) == 1) {
            std::reverse(order.begin(), order.end());
          }

          for (std::int32_t destination_index = 0; destination_index < run_length; ++destination_index) {
            const auto destination_pixel = run_start + destination_index;
            const auto source_pixel = run_start + order[static_cast<std::size_t>(destination_index)];
            const float* original = input + destination_pixel * 4;
            const float* sorted = input + source_pixel * 4;
            float* target = destination + destination_pixel * 4;
            for (std::int32_t channel = 0; channel < 3; ++channel) {
              target[channel] = original[channel] * (1.0f - pixel_mix) + sorted[channel] * pixel_mix;
            }
            target[3] = original[3];
          }
        }
        const float gap_noise = hash01(
          seed ^ static_cast<std::uint32_t>(cursor) * 32452843U
          ^ static_cast<std::uint32_t>(y) * 49979687U
        );
        const auto gap = std::max<std::int32_t>(
          1,
          static_cast<std::int32_t>(std::round(1.0f + gap_noise * mix(5.0f, 1.5f, morphology)))
        );
        cursor = stop + gap;
      }
      x = std::max(x + 1, eligible_stop + 1);
    }
  }
}

} // namespace director_pixel_sort
