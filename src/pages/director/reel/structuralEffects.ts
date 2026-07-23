import {
  pluginRegistry,
  resolvedPluginParams,
} from '../../../plugins/registry';
import type {
  AnyEffectPlugin,
  StructuralEffectFrameOptions,
} from '../../../plugins/types';
import { structuralEffectSeed } from './effectRecipes';

export type { StructuralEffectFrameOptions };
export type StructuralEffectId = string;

function structuralPlugins() {
  return pluginRegistry.listEffects('visual', { includeHidden: true })
    .filter((plugin) => plugin.stage === 'pre-motion' && Boolean(plugin.frameTransform));
}

/** Stable compatibility roster; new plugin files are inserted by order and id. */
export const STRUCTURAL_EFFECT_IDS = structuralPlugins().map((plugin) => plugin.id);

export type StructuralEffectPlugin = {
  id: StructuralEffectId;
  renderFrame: (
    sourceRgba: Uint8ClampedArray,
    width: number,
    height: number,
    options: StructuralEffectFrameOptions,
  ) => Uint8ClampedArray;
};

export type StructuralEffectStackOptions = StructuralEffectFrameOptions & {
  effectSeeds?: Partial<Record<StructuralEffectId, number>>;
  pluginParams?: Partial<Record<string, Readonly<Record<string, unknown>>>>;
};

export function isStructuralEffect(value: string): value is StructuralEffectId {
  const plugin = pluginRegistry.getEffect(value, 'visual');
  return plugin?.stage === 'pre-motion' && Boolean(plugin.frameTransform);
}

export function structuralEffectIds(values: readonly string[]) {
  return values.filter(isStructuralEffect);
}

function registeredStructuralEffect(id: StructuralEffectId): AnyEffectPlugin {
  const plugin = pluginRegistry.getEffect(id, 'visual');
  if (!plugin?.frameTransform || plugin.stage !== 'pre-motion') {
    throw new Error(`Unknown structural effect “${id}”.`);
  }
  return plugin;
}

/** Compatibility facade for callers of the pre-registry structural API. */
export function structuralEffectPlugin(id: StructuralEffectId): StructuralEffectPlugin {
  const plugin = registeredStructuralEffect(id);
  return {
    id: plugin.id,
    renderFrame(sourceRgba, width, height, options) {
      return plugin.frameTransform!({
        sourceRgba,
        width,
        height,
        ...options,
        params: resolvedPluginParams(plugin, {}, { intensity: options.intensity }),
      });
    },
  };
}

export function renderStructuralEffectFrame(
  id: StructuralEffectId,
  sourceRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: StructuralEffectFrameOptions & {
    pluginParams?: Readonly<Record<string, unknown>>;
  },
) {
  if (sourceRgba.length !== width * height * 4) {
    throw new Error('Structural-effect source dimensions do not match.');
  }
  if (options.phase <= 0 || options.progress <= 0 || options.progress >= 1) {
    return sourceRgba.slice();
  }
  const plugin = registeredStructuralEffect(id);
  const params = resolvedPluginParams(
    plugin,
    options.pluginParams,
    { intensity: options.intensity },
  );
  return plugin.frameTransform!({
    sourceRgba,
    width,
    height,
    ...options,
    params,
  });
}

export function renderStructuralEffectStackFrame(
  ids: readonly StructuralEffectId[],
  sourceRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: StructuralEffectStackOptions,
) {
  if (options.phase <= 0 || options.progress <= 0 || options.progress >= 1 || ids.length === 0) {
    return sourceRgba.slice();
  }
  let frame: Uint8ClampedArray = sourceRgba.slice();
  ids.forEach((id) => {
    const mappedBaseSeed = options.effectSeeds?.[id];
    const baseSeed = mappedBaseSeed ?? options.baseSeed ?? options.seed;
    const seed = mappedBaseSeed === undefined
      ? options.seed
      : structuralEffectSeed(mappedBaseSeed, options.frameIndex ?? 0);
    frame = renderStructuralEffectFrame(id, frame, width, height, {
      ...options,
      seed,
      baseSeed,
      pluginParams: options.pluginParams?.[id],
    });
  });
  return frame;
}
