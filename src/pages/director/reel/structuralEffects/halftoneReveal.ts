import builtinHalftoneRevealPlugin, {
  halftoneCellSize,
} from '../../../../plugins/builtin/halftone-reveal.plugin';
import type { StructuralEffectFrameOptions } from '../../../../plugins/types';

export { halftoneCellSize };

/**
 * Compatibility facade for the pre-registry module path. New code discovers
 * the reference plugin from src/plugins/builtin instead.
 */
export const halftoneRevealPlugin = {
  id: 'halftone-reveal' as const,
  renderFrame(
    sourceRgba: Uint8ClampedArray,
    width: number,
    height: number,
    options: StructuralEffectFrameOptions,
  ) {
    return builtinHalftoneRevealPlugin.frameTransform!({
      sourceRgba,
      width,
      height,
      ...options,
      params: { intensity: options.intensity },
    });
  },
};
