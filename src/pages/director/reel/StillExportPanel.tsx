import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Image as ImageIcon, LoaderCircle, X } from 'lucide-react';
import type { ReelAspectRatio } from '../../../shared/directorSchemas';
import {
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

type StillExportPanelProps = {
  clip: ReelClip | null;
  aspectRatio: ReelAspectRatio;
  fps: number;
  /** Position inside the clip, 0..1, taken from the player. */
  progress: number;
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

export function StillExportPanel({ clip, aspectRatio, fps, progress, onClose }: StillExportPanelProps) {
  const [sizeId, setSizeId] = useState<StillSizeId>('source');
  const [format, setFormat] = useState<StillFormat>('png');
  const [state, setState] = useState<PanelState>({ stage: 'idle' });
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const urlRef = useRef<string | null>(null);

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
  }, [sizeId, format, clip?.id, progress, aspectRatio]);

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
    if (!clip) return;
    setState({ stage: 'working' });
    try {
      const image = await loadImage(clip.imageUrl);
      const result = await renderStill({
        image,
        clip,
        aspectRatio,
        fps,
        size,
        format,
        progress,
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
      });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(result.blob);
      urlRef.current = url;
      setState({
        stage: 'ready',
        url,
        fileName: stillFileName(clip.title, formatEntry.extension),
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
            <p className="still-export-dimensions">{predicted.width}×{predicted.height} px</p>
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
