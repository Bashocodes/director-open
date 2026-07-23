import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import type { TextAlign, TextLayer, TextSizePreset } from '../../../shared/directorSchemas';
import { sizePresetToPx, TEXT_SIZE_PRESET_PX } from '../../../shared/textLayers';
import { FONT_LIST, fontFamily } from '../../../lib/text/fontCatalog';

type Props = {
  layers: TextLayer[];
  selectedLayerId: string | null;
  clipDuration: number;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onChange: (layer: TextLayer) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  canAdd: boolean;
};

const SIZE_PRESETS: TextSizePreset[] = ['S', 'M', 'L', 'XL', 'custom'];
const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

/** Merge a legibility-on-busy-footage look: scrim + shadow + thin outline. */
function legibilityPreset(layer: TextLayer): TextLayer {
  return {
    ...layer,
    style: {
      ...layer.style,
      background: { kind: 'scrim', color: '#000000', opacity: 0.5 },
      shadow: { color: '#000000', blur: 12, offsetX: 0, offsetY: 2 },
      outline: { color: '#000000', width: 4 },
    },
  };
}

export function TextLayerInspector(props: Props) {
  const selected = props.layers.find((layer) => layer.id === props.selectedLayerId) ?? null;

  function patchStyle(layer: TextLayer, patch: Partial<TextLayer['style']>) {
    props.onChange({ ...layer, style: { ...layer.style, ...patch } });
  }
  function patchTiming(layer: TextLayer, patch: Partial<TextLayer['timing']>) {
    props.onChange({ ...layer, timing: { ...layer.timing, ...patch } });
  }

  const timingInvalid = selected
    ? selected.timing.inSec >= selected.timing.outSec || selected.timing.outSec > props.clipDuration + 0.001
    : false;

  return (
    <div className="text-inspector">
      <div className="text-layer-list">
        {props.layers.length === 0 && <p className="text-empty">No text yet. Add a layer, then drag it on the preview.</p>}
        {props.layers.map((layer, index) => (
          <div key={layer.id} className={`text-layer-row ${layer.id === props.selectedLayerId ? 'selected' : ''}`}>
            <button type="button" className="text-layer-pick" onClick={() => props.onSelect(layer.id)} title={layer.content}>
              <Type size={12} />
              <span>{layer.content.replace(/\s+/g, ' ').trim() || 'Empty text'}</span>
            </button>
            <div className="text-layer-row-actions">
              <button type="button" title="Bring forward" disabled={index === props.layers.length - 1} onClick={() => props.onReorder(layer.id, 1)}><ArrowUp size={12} /></button>
              <button type="button" title="Send backward" disabled={index === 0} onClick={() => props.onReorder(layer.id, -1)}><ArrowDown size={12} /></button>
              <button type="button" title="Delete text layer" onClick={() => props.onRemove(layer.id)}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        <button type="button" className="text-add-button" disabled={!props.canAdd} onClick={props.onAdd}>
          <Plus size={13} /> Add text
        </button>
      </div>

      {selected && (
        <div className="text-editor">
          <label>Content
            <textarea
              rows={2}
              maxLength={400}
              value={selected.content}
              onChange={(event) => props.onChange({ ...selected, content: event.target.value })}
            />
          </label>

          <span className="text-field-label">Font</span>
          <div className="text-font-grid">
            {FONT_LIST.map((font) => (
              <button
                key={font.id}
                type="button"
                className={selected.style.fontId === font.id ? 'selected' : ''}
                style={{ fontFamily: `"${fontFamily(font.id)}", sans-serif` }}
                onClick={() => patchStyle(selected, { fontId: font.id })}
              >{font.label}</button>
            ))}
          </div>

          <span className="text-field-label">Size</span>
          <div className="text-chip-row">
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={selected.style.sizePreset === preset ? 'selected' : ''}
                onClick={() => patchStyle(selected, preset === 'custom'
                  ? { sizePreset: 'custom' }
                  : { sizePreset: preset, sizePx: sizePresetToPx(preset, selected.style.sizePx) })}
              >{preset === 'custom' ? 'Custom' : preset}</button>
            ))}
            {selected.style.sizePreset === 'custom' && (
              <input
                type="number" min={8} max={400} step={1}
                aria-label="Custom text size"
                value={Math.round(selected.style.sizePx)}
                onChange={(event) => patchStyle(selected, { sizePx: Math.min(400, Math.max(8, Number(event.target.value) || TEXT_SIZE_PRESET_PX.M)) })}
              />
            )}
          </div>

          <div className="text-toggle-row">
            <button type="button" className={selected.style.weight === 'bold' ? 'selected' : ''} onClick={() => patchStyle(selected, { weight: selected.style.weight === 'bold' ? 'regular' : 'bold' })}><b>B</b></button>
            <button type="button" className={selected.style.italic ? 'selected' : ''} onClick={() => patchStyle(selected, { italic: !selected.style.italic })}><i>I</i></button>
            <button type="button" className={selected.style.case === 'upper' ? 'selected' : ''} onClick={() => patchStyle(selected, { case: selected.style.case === 'upper' ? 'none' : 'upper' })} title="Uppercase">AA</button>
            {ALIGNS.map((align) => (
              <button key={align} type="button" className={selected.style.align === align ? 'selected' : ''} onClick={() => patchStyle(selected, { align })} title={`Align ${align}`}>
                {align === 'left' ? '⟸' : align === 'right' ? '⟹' : '⟺'}
              </button>
            ))}
          </div>

          <div className="text-color-row">
            <span className="text-field-label">Color</span>
            <input type="color" aria-label="Text color" value={selected.style.color.slice(0, 7)} onChange={(event) => patchStyle(selected, { color: event.target.value })} />
            <input
              type="text" aria-label="Text color hex" value={selected.style.color} spellCheck={false}
              onChange={(event) => { if (/^#[0-9a-fA-F]{0,8}$/.test(event.target.value)) patchStyle(selected, { color: event.target.value }); }}
            />
          </div>

          <div className="text-toggle-row wrap">
            <button type="button" className={selected.style.background.kind === 'scrim' ? 'selected' : ''} onClick={() => patchStyle(selected, { background: { ...selected.style.background, kind: selected.style.background.kind === 'scrim' ? 'none' : 'scrim' } })}>Scrim</button>
            <button type="button" className={selected.style.outline.width > 0 ? 'selected' : ''} onClick={() => patchStyle(selected, { outline: { color: selected.style.outline.color, width: selected.style.outline.width > 0 ? 0 : 4 } })}>Outline</button>
            <button type="button" className={selected.style.shadow.blur > 0 || selected.style.shadow.offsetY !== 0 ? 'selected' : ''} onClick={() => patchStyle(selected, { shadow: selected.style.shadow.blur > 0 || selected.style.shadow.offsetY !== 0 ? { ...selected.style.shadow, blur: 0, offsetX: 0, offsetY: 0 } : { color: '#000000', blur: 10, offsetX: 0, offsetY: 2 } })}>Shadow</button>
            <button type="button" className="text-preset-button" onClick={() => props.onChange(legibilityPreset(selected))} title="Legibility on busy footage">Legible</button>
          </div>

          <div className="text-timing-grid">
            <label>In (s)<input type="number" min={0} max={props.clipDuration} step={0.1} value={selected.timing.inSec} onChange={(event) => patchTiming(selected, { inSec: Math.max(0, Number(event.target.value) || 0) })} /></label>
            <label>Out (s)<input type="number" min={0} max={props.clipDuration} step={0.1} value={selected.timing.outSec} onChange={(event) => patchTiming(selected, { outSec: Math.max(0, Number(event.target.value) || 0) })} /></label>
            <label>Fade in<input type="number" min={0} max={10} step={0.05} value={selected.timing.fadeInSec} onChange={(event) => patchTiming(selected, { fadeInSec: Math.max(0, Number(event.target.value) || 0) })} /></label>
            <label>Fade out<input type="number" min={0} max={10} step={0.05} value={selected.timing.fadeOutSec} onChange={(event) => patchTiming(selected, { fadeOutSec: Math.max(0, Number(event.target.value) || 0) })} /></label>
          </div>
          {timingInvalid && <p className="text-timing-warning" role="alert">Set In before Out, and Out no later than the clip's {props.clipDuration.toFixed(1)}s.</p>}
        </div>
      )}
    </div>
  );
}
