import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Image as ImageIcon, LoaderCircle, X } from 'lucide-react';
import type { ReelAspectRatio } from '../../../shared/directorSchemas';
import {
  effectPhaseAt,
  peakEffectProgress,
  renderStill,
  stillDimensions,
  stillFileName,
  STILL_FORMATS,
  STILL_SIZES,
  type StillFormat,
  type StillSizeId,
} from './stillExport';
import type { ReelClip } from './types';

/**
 * Still export UI.
 *
 * Deliberately separate from the render bar: a person applying a look to one
 * picture should never touch the video encoder, wait for a WASM core, or think
 * about frame rate.
 */

type StillExportTarget = { clip: ReelClip; progress: number };

type StillExportPanelProps = {
  /**
   * Reads the clip and moment under the playhead. Called on open and again at
   * export time, so a still always matches the frame on screen without the
   * playhead re-rendering the studio while the reel plays.
   */
  resolveTarget: () => StillExportTarget | null;
  aspectRatio: ReelAspectRatio;
  fps: number;
  onClose: () => void;
};

type PanelState =
  | { stage: 'idle' }
  | { stage: 'working' }
  | { stage: 'error'; message: string }
  | {
    stage: 'ready';
    url: string;
    fileName: string;
    bytes: number;
    width: number;
    height: number;
    elapsedMs: number;
  };

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Director could not read that image.'));
    image.src = source;
  });
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_024)} KB`;
  return `${bytes} B`;
}

export function StillExportPanel({ resolveTarget, aspectRatio, fps, onClose }: StillExportPanelProps) {
  const [sizeId, setSizeId] = useState<StillSizeId>('source');
  const [format, setFormat] = useState<StillFormat>('png');
  const [state, setState] = useState<PanelState>({ stage: 'idle' });
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const urlRef = useRef<string | null>(null);
  // Snapshot on open so the panel can describe its subject; export re-reads the
  // playhead so a scrub made while the panel is open is still honoured.
  const [openedTarget] = useState<StillExportTarget | null>(() => resolveTarget());
  // Overrides the playhead when someone chooses to capture the effect peak.
  const [progressOverride, setProgressOverride] = useState<number | null>(null);
  const clip = openedTarget?.clip ?? null;

  const captureProgress = progressOverride ?? openedTarget?.progress ?? 0;
  // Effects fade to nothing at a clip's edges so reels loop cleanly. Capturing
  // there would silently drop them, which reads as a broken export.
  const phase = clip ? effectPhaseAt(clip, captureProgress, fps) : null;
  const effectsAreDormant = phase !== null && phase < 0.05;

  const size = STILL_SIZES.find((entry) => entry.id === sizeId) ?? STILL_SIZES[0];
  const formatEntry = STILL_FORMATS.find((entry) => entry.id === format) ?? STILL_FORMATS[0];

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  // Any change to the inputs invalidates a produced file; never let a stale
  // download sit under changed settings.
  useEffect(() => {
    setState((current) => {
      if (current.stage !== 'ready') return current;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      return { stage: 'idle' };
    });
  }, [sizeId, format, clip?.id, aspectRatio, progressOverride]);

  useEffect(() => {
    let active = true;
    if (!clip) {
      setSourceSize(null);
      return () => { active = false; };
    }
    void loadImage(clip.imageUrl)
      .then((image) => {
        if (active) setSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
      })
      .catch(() => { if (active) setSourceSize(null); });
    return () => { active = false; };
  }, [clip]);

  const predicted = useMemo(() => {
    if (!sourceSize) return null;
    return stillDimensions({
      aspectRatio,
      size,
      sourceWidth: sourceSize.width,
      sourceHeight: sourceSize.height,
    });
  }, [aspectRatio, size, sourceSize]);

  async function exportStill() {
    // Re-read the playhead: the frame on screen right now is the one to save,
    // unless the person explicitly chose to capture the effect peak instead.
    const target = resolveTarget() ?? openedTarget;
    if (!target) return;
    setState({ stage: 'working' });
    try {
      const image = await loadImage(target.clip.imageUrl);
      const result = await renderStill({
        image,
        clip: target.clip,
        aspectRatio,
        fps,
        size,
        format,
        progress: progressOverride ?? target.progress,
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
      });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(result.blob);
      urlRef.current = url;
      setState({
        stage: 'ready',
        url,
        fileName: stillFileName(target.clip.title, formatEntry.extension),
        bytes: result.blob.size,
        width: result.width,
        height: result.height,
        elapsedMs: result.elapsedMs,
      });
    } catch (error) {
      setState({
        stage: 'error',
        message: error instanceof Error ? error.message : 'Director could not export that still.',
      });
    }
  }

  return (
    <div className="still-export-panel" role="dialog" aria-label="Export still image">
      <header>
        <h4><ImageIcon size={14} /> Export still image</h4>
        <button type="button" onClick={onClose} aria-label="Close still export"><X size={14} /></button>
      </header>

      {!clip ? (
        <p className="still-export-empty">Select a clip to export its look as an image.</p>
      ) : (
        <>
          <p className="still-export-note">
            The current frame, at full quality, with every grade, effect and text layer applied.
            No video is encoded.
          </p>

          <label className="still-export-field">
            <span>Size</span>
            <select value={sizeId} onChange={(event) => setSizeId(event.target.value as StillSizeId)}>
              {STILL_SIZES.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </label>
          <p className="still-export-hint">{size.description}</p>

          <label className="still-export-field">
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as StillFormat)}>
              {STILL_FORMATS.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </label>
          <p className="still-export-hint">{formatEntry.description}</p>

          {predicted && (
            <p className="still-export-dimensions">
              {predicted.width}×{predicted.height} px
              <span> · at {(captureProgress * clip.duration).toFixed(1)}s</span>
            </p>
          )}

          {effectsAreDormant && (
            <div className="still-export-warn" role="status">
              <p>
                This clip&rsquo;s effects fade out at its edges so the reel loops
                cleanly, so they are not visible at this moment.
              </p>
              <button
                type="button"
                onClick={() => setProgressOverride(peakEffectProgress(clip, fps))}
              >Capture where effects peak</button>
            </div>
          )}

          {progressOverride !== null && (
            <p className="still-export-hint">
              Capturing the effect peak rather than the playhead.
              {' '}
              <button type="button" className="linklike" onClick={() => setProgressOverride(null)}>
                Use the playhead instead
              </button>
            </p>
          )}

          {state.stage === 'error' && (
            <p className="still-export-error" role="alert">{state.message}</p>
          )}

          {state.stage === 'ready' ? (
            <>
              <p className="still-export-result">
                <Check size={12} /> {state.width}×{state.height} · {formatBytes(state.bytes)} · {Math.round(state.elapsedMs)} ms
              </p>
              <a className="still-export-download" href={state.url} download={state.fileName}>
                <Download size={14} /> Save {formatEntry.label}
              </a>
            </>
          ) : (
            <button
              type="button"
              className="still-export-action"
              onClick={() => { void exportStill(); }}
              disabled={state.stage === 'working'}
            >
              {state.stage === 'working'
                ? <><LoaderCircle size={14} className="spin" /> Rendering…</>
                : <><ImageIcon size={14} /> Export this frame</>}
            </button>
          )}
        </>
      )}
    </div>
  );
}
