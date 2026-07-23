import { useRef, useState } from 'react';
import type { TextLayer } from '../../../shared/directorSchemas';

type Props = {
  layers: TextLayer[];
  selectedLayerId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (layer: TextLayer) => void;
  onDelete: (id: string) => void;
};

const SNAP_X = [0.05, 1 / 3, 0.5, 2 / 3, 0.95];
const SNAP_Y = [0.05, 1 / 3, 0.5, 2 / 3, 0.95];
const SNAP_THRESHOLD = 0.018;

function snap(value: number, targets: number[]): { value: number; guide: number | null } {
  let guide: number | null = null;
  let snapped = value;
  for (const target of targets) {
    if (Math.abs(value - target) <= SNAP_THRESHOLD) {
      snapped = target;
      guide = target;
      break;
    }
  }
  return { value: Math.min(1, Math.max(0, snapped)), guide };
}

/**
 * Direct-manipulation overlay for text layers on the preview. Text is always
 * drawn by the canvas renderer (renderTextLayer); this overlay only provides
 * selection handles, dragging, snap guides, and inline content editing — no
 * contentEditable rendering of the text itself.
 */
export function TextLayerOverlay({ layers, selectedLayerId, onSelect, onChange, onDelete }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [editingId, setEditingId] = useState<string | null>(null);

  function beginDrag(event: React.PointerEvent, layer: TextLayer) {
    if (editingId) return;
    event.preventDefault();
    onSelect(layer.id);
    dragRef.current = { id: layer.id, pointerId: event.pointerId };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!drag || !rect || rect.width === 0) return;
    const layer = layers.find((item) => item.id === drag.id);
    if (!layer) return;
    const snappedX = snap((event.clientX - rect.left) / rect.width, SNAP_X);
    const snappedY = snap((event.clientY - rect.top) / rect.height, SNAP_Y);
    setGuides({ x: snappedX.guide, y: snappedY.guide });
    if (snappedX.value !== layer.x || snappedY.value !== layer.y) {
      onChange({ ...layer, x: snappedX.value, y: snappedY.value });
    }
  }

  function endDrag() {
    dragRef.current = null;
    setGuides({ x: null, y: null });
  }

  function nudge(layer: TextLayer, dx: number, dy: number) {
    onChange({ ...layer, x: Math.min(1, Math.max(0, layer.x + dx)), y: Math.min(1, Math.max(0, layer.y + dy)) });
  }

  function onHandleKeyDown(event: React.KeyboardEvent, layer: TextLayer) {
    const step = event.shiftKey ? 0.05 : 0.01;
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        event.stopPropagation();
        if (layer.content.trim().length <= 12 || window.confirm(`Delete the text layer “${layer.content.slice(0, 40)}”?`)) {
          onDelete(layer.id);
        }
        return;
      case 'Escape':
        event.stopPropagation();
        onSelect(null);
        return;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        setEditingId(layer.id);
        return;
      case 'ArrowLeft': event.preventDefault(); event.stopPropagation(); nudge(layer, -step, 0); return;
      case 'ArrowRight': event.preventDefault(); event.stopPropagation(); nudge(layer, step, 0); return;
      case 'ArrowUp': event.preventDefault(); event.stopPropagation(); nudge(layer, 0, -step); return;
      case 'ArrowDown': event.preventDefault(); event.stopPropagation(); nudge(layer, 0, step); return;
      default:
    }
  }

  return (
    <div
      ref={rootRef}
      className="text-overlay"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {guides.x !== null && <div className="text-snap-guide vertical" style={{ left: `${guides.x * 100}%` }} />}
      {guides.y !== null && <div className="text-snap-guide horizontal" style={{ top: `${guides.y * 100}%` }} />}
      {/* Title-safe margin frame (~5%). */}
      <div className="text-safe-frame" aria-hidden="true" />
      {layers.map((layer) => (
        <div
          key={layer.id}
          className={`text-handle ${layer.id === selectedLayerId ? 'selected' : ''}`}
          style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%` }}
        >
          {editingId === layer.id ? (
            <textarea
              className="text-inline-editor"
              autoFocus
              value={layer.content}
              onChange={(event) => onChange({ ...layer, content: event.target.value })}
              onBlur={() => setEditingId(null)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) setEditingId(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="text-handle-hit"
              aria-label={`Text layer: ${layer.content.slice(0, 40) || 'empty'}`}
              onPointerDown={(event) => beginDrag(event, layer)}
              onClick={() => onSelect(layer.id)}
              onDoubleClick={() => setEditingId(layer.id)}
              onKeyDown={(event) => onHandleKeyDown(event, layer)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
