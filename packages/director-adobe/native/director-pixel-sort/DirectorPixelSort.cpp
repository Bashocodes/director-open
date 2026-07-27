#define PF_DEEP_COLOR_AWARE 1

#include "AEConfig.h"
#include "entry.h"
#include "AE_Effect.h"
#include "AE_Macros.h"
#include "Param_Utils.h"

#include "director_pixel_sort_plugin_bridge.h"

#include <array>
#include <cstddef>
#include <new>

namespace {

static_assert(sizeof(PF_PixelFloat) == sizeof(float) * 4);
static_assert(offsetof(PF_PixelFloat, alpha) == 0);
static_assert(offsetof(PF_PixelFloat, red) == sizeof(float));
static_assert(offsetof(PF_PixelFloat, green) == sizeof(float) * 2);
static_assert(offsetof(PF_PixelFloat, blue) == sizeof(float) * 3);

constexpr char kDisplayName[] = "Director Pixel Sort";
constexpr char kMatchName[] = "director-pixel-sort";
constexpr char kCategory[] = "Director";
constexpr char kSupportUrl[] = "https://aikizi.com";

constexpr A_long kMajorVersion = 1;
constexpr A_long kMinorVersion = 0;
constexpr A_long kBugVersion = 0;
constexpr A_long kBuildVersion = 1;

enum ParameterIndex {
  kInput = 0,
  kIntensity,
  kPhase,
  kBeatAmount,
  kSeed,
  kParameterCount,
};

enum ParameterDiskId {
  kIntensityDiskId = 1,
  kPhaseDiskId,
  kBeatAmountDiskId,
  kSeedDiskId,
};

PF_Err float_only_error(PF_InData* in_data, PF_OutData* out_data) {
  PF_STRCPY(
    out_data->return_msg,
    "Director Pixel Sort requires a 32-bpc project and the SmartFX float render path."
  );
  out_data->out_flags |= PF_OutFlag_DISPLAY_ERROR_MESSAGE;
  return PF_Err_BAD_CALLBACK_PARAM;
}

PF_Err about(PF_InData* in_data, PF_OutData* out_data) {
  PF_SPRINTF(
    out_data->return_msg,
    "%s %ld.%ld\r\rCPU SmartFX pixel sorting in 32-bit float.",
    kDisplayName,
    kMajorVersion,
    kMinorVersion
  );
  return PF_Err_NONE;
}

PF_Err global_setup(PF_OutData* out_data) {
  out_data->my_version = PF_VERSION(
    kMajorVersion,
    kMinorVersion,
    kBugVersion,
    PF_Stage_DEVELOP,
    kBuildVersion
  );
  out_data->out_flags = PF_OutFlag_DEEP_COLOR_AWARE;
  out_data->out_flags2 =
    PF_OutFlag2_SUPPORTS_SMART_RENDER |
    PF_OutFlag2_FLOAT_COLOR_AWARE |
    PF_OutFlag2_SUPPORTS_THREADED_RENDERING;
  return PF_Err_NONE;
}

PF_Err params_setup(PF_InData* in_data, PF_OutData* out_data) {
  PF_Err err = PF_Err_NONE;
  PF_ParamDef def;

  PF_ADD_FLOAT_SLIDERX(
    "Intensity",
    0.0,
    100.0,
    0.0,
    100.0,
    100.0,
    PF_Precision_TENTHS,
    PF_ValueDisplayFlag_PERCENT,
    0,
    kIntensityDiskId
  );
  PF_ADD_FLOAT_SLIDERX(
    "Phase",
    0.0,
    100.0,
    0.0,
    100.0,
    100.0,
    PF_Precision_TENTHS,
    PF_ValueDisplayFlag_PERCENT,
    0,
    kPhaseDiskId
  );
  PF_ADD_FLOAT_SLIDERX(
    "Beat Amount",
    0.0,
    100.0,
    0.0,
    100.0,
    0.0,
    PF_Precision_TENTHS,
    PF_ValueDisplayFlag_PERCENT,
    0,
    kBeatAmountDiskId
  );
  PF_ADD_FLOAT_SLIDERX(
    "Seed",
    0.0,
    1000000.0,
    0.0,
    10000.0,
    1.0,
    PF_Precision_HUNDREDTHS,
    0,
    0,
    kSeedDiskId
  );

  out_data->num_params = kParameterCount;
  return err;
}

PF_Err smart_pre_render(
  PF_InData* in_data,
  PF_OutData* out_data,
  PF_PreRenderExtra* extra
) {
  if (extra->input->bitdepth != 32) return float_only_error(in_data, out_data);

  PF_RenderRequest request = extra->input->output_request;
  request.rect.left = 0;
  request.rect.top = 0;
  request.rect.right = in_data->width;
  request.rect.bottom = in_data->height;
  request.channel_mask |= PF_ChannelMask_ARGB;
  request.preserve_rgb_of_zero_alpha = TRUE;

  PF_CheckoutResult input_result;
  AEFX_CLR_STRUCT(input_result);
  const PF_Err err = extra->cb->checkout_layer(
    in_data->effect_ref,
    kInput,
    kInput,
    &request,
    in_data->current_time,
    in_data->time_step,
    in_data->time_scale,
    &input_result
  );
  if (err != PF_Err_NONE) return err;

  // The core is row-global rather than pixel-independent. Returning the full
  // requested source prevents tile boundaries from changing preview/export.
  extra->output->result_rect = input_result.result_rect;
  extra->output->max_result_rect = input_result.max_result_rect;
  extra->output->flags |= PF_RenderOutputFlag_RETURNS_EXTRA_PIXELS;
  return PF_Err_NONE;
}

PF_Err smart_render(
  PF_InData* in_data,
  PF_OutData* out_data,
  PF_SmartRenderExtra* extra
) {
  if (extra->input->bitdepth != 32) return float_only_error(in_data, out_data);

  PF_EffectWorld* input_world = nullptr;
  PF_EffectWorld* output_world = nullptr;
  PF_Err err = extra->cb->checkout_layer_pixels(in_data->effect_ref, kInput, &input_world);
  if (err != PF_Err_NONE) return err;
  err = extra->cb->checkout_output(in_data->effect_ref, &output_world);
  if (err != PF_Err_NONE) {
    extra->cb->checkin_layer_pixels(in_data->effect_ref, kInput);
    return err;
  }

  std::array<PF_ParamDef, 4> parameter_defs;
  for (auto& parameter : parameter_defs) AEFX_CLR_STRUCT(parameter);
  const std::array<PF_ParamIndex, 4> parameter_indexes = {
    kIntensity,
    kPhase,
    kBeatAmount,
    kSeed,
  };

  std::size_t checked_out = 0;
  for (; checked_out < parameter_defs.size(); ++checked_out) {
    err = PF_CHECKOUT_PARAM(
      in_data,
      parameter_indexes[checked_out],
      in_data->current_time,
      in_data->time_step,
      in_data->time_scale,
      &parameter_defs[checked_out]
    );
    if (err != PF_Err_NONE) break;
  }

  if (err == PF_Err_NONE) {
    if (
      input_world == nullptr ||
      output_world == nullptr ||
      input_world->width != output_world->width ||
      input_world->height != output_world->height
    ) {
      err = PF_Err_BAD_CALLBACK_PARAM;
    } else {
      director_pixel_sort::PluginParameters parameters;
      parameters.intensity_percent = static_cast<float>(parameter_defs[0].u.fs_d.value);
      parameters.phase_percent = static_cast<float>(parameter_defs[1].u.fs_d.value);
      parameters.beat_amount_percent = static_cast<float>(parameter_defs[2].u.fs_d.value);
      parameters.seed = static_cast<float>(parameter_defs[3].u.fs_d.value);
      try {
        director_pixel_sort::render_argb_float_rows(
          input_world->data,
          input_world->rowbytes,
          output_world->data,
          output_world->rowbytes,
          input_world->width,
          input_world->height,
          parameters
        );
      } catch (const std::bad_alloc&) {
        err = PF_Err_OUT_OF_MEMORY;
      } catch (...) {
        err = PF_Err_INTERNAL_STRUCT_DAMAGED;
      }
    }
  }

  while (checked_out > 0) {
    --checked_out;
    const PF_Err checkin_err = PF_CHECKIN_PARAM(in_data, &parameter_defs[checked_out]);
    if (err == PF_Err_NONE) err = checkin_err;
  }
  const PF_Err layer_checkin_err =
    extra->cb->checkin_layer_pixels(in_data->effect_ref, kInput);
  if (err == PF_Err_NONE) err = layer_checkin_err;
  return err;
}

} // namespace

extern "C" DllExport PF_Err PluginDataEntryFunction2(
  PF_PluginDataPtr in_ptr,
  PF_PluginDataCB2 plugin_data_callback,
  SPBasicSuite*,
  const char*,
  const char*
) {
  PF_Err result = PF_Err_INVALID_CALLBACK;
  PF_REGISTER_EFFECT_EXT2(
    in_ptr,
    plugin_data_callback,
    kDisplayName,
    kMatchName,
    kCategory,
    AE_RESERVED_INFO,
    "EffectMain",
    kSupportUrl
  );
  return result;
}

extern "C" DllExport PF_Err EffectMain(
  PF_Cmd command,
  PF_InData* in_data,
  PF_OutData* out_data,
  PF_ParamDef*[],
  PF_LayerDef*,
  void* extra
) {
  try {
    switch (command) {
      case PF_Cmd_ABOUT:
        return about(in_data, out_data);
      case PF_Cmd_GLOBAL_SETUP:
        return global_setup(out_data);
      case PF_Cmd_PARAMS_SETUP:
        return params_setup(in_data, out_data);
      case PF_Cmd_SMART_PRE_RENDER:
        return smart_pre_render(in_data, out_data, static_cast<PF_PreRenderExtra*>(extra));
      case PF_Cmd_SMART_RENDER:
        return smart_render(in_data, out_data, static_cast<PF_SmartRenderExtra*>(extra));
      case PF_Cmd_RENDER:
        return float_only_error(in_data, out_data);
      default:
        return PF_Err_NONE;
    }
  } catch (const std::bad_alloc&) {
    return PF_Err_OUT_OF_MEMORY;
  } catch (...) {
    return PF_Err_INTERNAL_STRUCT_DAMAGED;
  }
}
