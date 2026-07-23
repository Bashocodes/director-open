import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { ReelSelect, type ReelSelectOption } from './ReelSelect';

type Props<T extends string> = {
  label: string;
  values: readonly T[];
  emptyValue?: T;
  fallbackValue: T;
  options: readonly ReelSelectOption<T>[];
  onChange: (values: T[]) => void;
};

export function ReelStackControl<T extends string>({
  label,
  values,
  emptyValue,
  fallbackValue,
  options,
  onChange,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const addRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const active = values.filter((value, index) => value !== emptyValue && values.indexOf(value) === index).slice(0, 5);
  const current = active[0] || fallbackValue;
  const available = options.filter((option) => option.id !== emptyValue && !active.includes(option.id));

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = addRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(238, window.innerWidth - 16);
      const height = Math.min(290, Math.max(72, available.length * 38 + 10));
      const roomBelow = window.innerHeight - rect.bottom - 10;
      setMenuStyle({
        position: 'fixed',
        zIndex: 142,
        width,
        maxHeight: Math.min(height, window.innerHeight - 16),
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: roomBelow >= Math.min(height, 190) ? rect.bottom + 7 : Math.max(8, rect.top - height - 7),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [available.length, open]);

  function setPrimary(value: T) {
    if (value === emptyValue) {
      onChange([]);
      return;
    }
    onChange([value, ...active.filter((item) => item !== value)].slice(0, 5));
  }

  function remove(value: T) {
    const next = active.filter((item) => item !== value);
    onChange(next.length || emptyValue ? next : [fallbackValue]);
  }

  return (
    <div className="reel-stack-control">
      <div className="reel-stack-picker">
        <ReelSelect label={label} value={current} options={options} onChange={setPrimary} />
        <button
          ref={addRef}
          type="button"
          className="reel-stack-add"
          aria-label={`Add ${label.toLowerCase()} layer`}
          aria-controls={menuId}
          aria-expanded={open}
          disabled={!available.length || active.length >= 5}
          onClick={() => setOpen((value) => !value)}
          title={`Stack another ${label.toLowerCase()}`}
        >
          <Plus size={15} />
        </button>
      </div>
      {active.length > 0 && (
        <div className="reel-stack-chips" aria-label={`${label} layers`}>
          {active.map((value, index) => (
            <span key={value}>
              <b>{String(index + 1).padStart(2, '0')}</b>
              {options.find((option) => option.id === value)?.label || value}
              {(active.length > 1 || emptyValue) && (
                <button type="button" aria-label={`Remove ${value}`} onClick={() => remove(value)}><X size={9} /></button>
              )}
            </span>
          ))}
        </div>
      )}
      {open && createPortal(
        <>
          <button type="button" className="reel-select-backdrop reel-stack-backdrop" aria-label={`Close add ${label} menu`} onClick={() => setOpen(false)} />
          <div id={menuId} className="reel-stack-menu" role="listbox" aria-label={`Add ${label} layer`} style={menuStyle}>
            <div className="reel-stack-menu-title">ADD LAYER · {active.length}/5 ACTIVE</div>
            {available.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onChange([...active, option.id].slice(0, 5));
                  setOpen(false);
                  requestAnimationFrame(() => addRef.current?.focus());
                }}
              >
                <Plus size={11} />
                <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
