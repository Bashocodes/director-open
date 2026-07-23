import { useEffect, useRef } from 'react';
import { pluginRegistry, resolvedPluginParams } from '../../../plugins/registry';
import type { PluginKind } from '../../../plugins/types';
import { renderTransitionFrame } from '../../../plugins/transitions/transitionKit';
import { previewGradeFilter } from './previewEffects';

/**
 * A tiny live thumbnail that loops the ACTUAL plugin on two built-in synthetic
 * gradient frames — the real algorithm from the registry, not a GIF. Adding a
 * new plugin lights up here automatically.
 */
function gradientFrame(width: number, height: number, warm: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const u = x / Math.max(1, width - 1);
      const v = y / Math.max(1, height - 1);
      // A bright corner so bloom/highlight effects have something to grab.
      const spark = warm && u > 0.75 && v < 0.25 ? 90 : 0;
      out[o] = Math.min(255, Math.round(warm ? 210 * u + 40 : 60 + 60 * v) + spark);
      out[o + 1] = Math.min(255, Math.round(warm ? 120 * v + 30 : 120 * u + 40) + spark);
      out[o + 2] = Math.min(255, Math.round(warm ? 70 + 40 * v : 210 * v + 30) + spark);
      out[o + 3] = 255;
    }
  }
  return out;
}

type Props = { kind: PluginKind; surface?: 'visual' | 'grade'; pluginId: string; width?: number; height?: number };

export function PluginThumbnail({ kind, surface = 'visual', pluginId, width = 46, height = 62 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const w = canvas.width;
    const h = canvas.height;
    const frameA = gradientFrame(w, h, true);
    const frameB = gradientFrame(w, h, false);
    const put = (rgba: Uint8ClampedArray) => {
      const image = context.createImageData(w, h);
      image.data.set(rgba);
      context.putImageData(image, 0, 0);
    };
    // A source image (frameA) for the motion + grade thumbnails.
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = w;
    sourceCanvas.height = h;
    const sourceContext = sourceCanvas.getContext('2d');
    if (sourceContext) {
      const image = sourceContext.createImageData(w, h);
      image.data.set(frameA);
      sourceContext.putImageData(image, 0, 0);
    }

    let raf = 0;
    let start = 0;
    const render = (timestamp: number) => {
      if (!start) start = timestamp;
      const t = (((timestamp - start) / 2200) % 1);
      if (kind === 'transition') {
        const plugin = pluginRegistry.getTransition(pluginId);
        if (plugin?.renderFrame) {
          put(renderTransitionFrame(plugin, { frameA, frameB, rawProgress: t, width: w, height: h, params: resolvedPluginParams(plugin) }));
        } else {
          const blended = new Uint8ClampedArray(frameA.length);
          for (let i = 0; i < blended.length; i += 1) blended[i] = frameA[i] + (frameB[i] - frameA[i]) * t;
          put(blended);
        }
      } else if (kind === 'effect') {
        const plugin = pluginRegistry.getEffect(pluginId, surface);
        if (plugin?.frameTransform) {
          put(plugin.frameTransform({
            sourceRgba: frameA, width: w, height: h, phase: 1, progress: 0.15 + t * 0.7,
            seed: 7, frameIndex: Math.floor(t * 30), frameCount: 30, baseSeed: 7,
            intensity: 70, params: resolvedPluginParams(plugin, {}, { intensity: 70 }),
          }));
        } else if (plugin?.surface === 'grade') {
          context.filter = previewGradeFilter(pluginId, 70) || 'none';
          context.drawImage(sourceCanvas, 0, 0);
          context.filter = 'none';
        }
      } else if (kind === 'motion') {
        const plugin = pluginRegistry.getMotion(pluginId);
        const pose = plugin ? plugin.cameraPose({ progress: t, params: resolvedPluginParams(plugin) }) : { zoom: 1, focusX: 0.5, focusY: 0.5 };
        const drawW = w * pose.zoom;
        const drawH = h * pose.zoom;
        const overflowX = Math.max(0, drawW - w);
        const overflowY = Math.max(0, drawH - h);
        context.clearRect(0, 0, w, h);
        context.drawImage(sourceCanvas, -overflowX * pose.focusX, -overflowY * pose.focusY, drawW, drawH);
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [kind, surface, pluginId]);

  return <canvas ref={canvasRef} width={width} height={height} className="plugin-thumb" aria-hidden="true" />;
}
