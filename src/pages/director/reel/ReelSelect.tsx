import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export type ReelSelectOption<T extends string> = {
  id: T;
  label: string;
  description?: string;
};

type Props<T extends string> = {
  label: string;
  value: T;
  options: readonly ReelSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

export function ReelSelect<T extends string>({ label, value, options, onChange, disabled = false, className = '' }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const labelId = useId();
  const listboxId = useId();
  const current = options.find((option) => option.id === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = Math.min(340, Math.max(96, options.length * 52));
      const menuWidth = Math.min(window.innerWidth - 16, Math.max(rect.width, 190));
      const roomBelow = window.innerHeight - rect.bottom - 12;
      const top = roomBelow >= Math.min(menuHeight, 220)
        ? rect.bottom + 7
        : Math.max(8, rect.top - menuHeight - 7);
      setMenuStyle({
        position: 'fixed',
        zIndex: 140,
        top,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
        width: menuWidth,
        maxHeight: Math.min(menuHeight, window.innerHeight - 16),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  return (
    <div className={`reel-select-field ${className}`.trim()}>
      <span id={labelId} className="reel-field-label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="reel-select-trigger"
        role="combobox"
        aria-labelledby={labelId}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if ((event.key === 'ArrowDown' || event.key === 'Enter') && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{current?.label || value}</span>
        <ChevronDown size={14} className={open ? 'open' : ''} />
      </button>
      {open && createPortal(
        <>
          <button type="button" className="reel-select-backdrop" aria-label={`Close ${label} menu`} onClick={() => setOpen(false)} />
          <div id={listboxId} className="reel-select-menu" role="listbox" aria-labelledby={labelId} style={menuStyle}>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                className={option.id === value ? 'selected' : ''}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  requestAnimationFrame(() => triggerRef.current?.focus());
                }}
              >
                <span className="reel-select-check">{option.id === value ? <Check size={14} /> : null}</span>
                <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
