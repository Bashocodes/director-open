import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { pluginRegistry } from '../../../plugins/registry';
import type { AnyDirectorPlugin, PluginKind } from '../../../plugins/types';
import { PluginThumbnail } from './PluginThumbnail';

type Props = {
  label: string;
  kind: PluginKind;
  surface?: 'visual' | 'grade';
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

function categorize(kind: PluginKind, plugin: AnyDirectorPlugin): string {
  if (kind === 'transition') return plugin.kind === 'transition' && plugin.renderFrame ? 'Cinematic' : 'Classic';
  if (kind === 'motion') {
    const id = plugin.id;
    if (id === 'still') return 'Static';
    if (/push|pull|hero|pulse/.test(id)) return 'Push & pull';
    if (/pan/.test(id)) return 'Pans';
    if (/drift|arc|float|tilt/.test(id)) return 'Drifts';
    if (/shake/.test(id)) return 'Accents';
    return 'Camera';
  }
  return 'Effects';
}

export function PluginPicker({ label, kind, surface = 'visual', value, onChange, disabled = false, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const labelId = useId();

  const allPlugins = useMemo(() => (
    kind === 'effect' ? pluginRegistry.listEffects(surface) : pluginRegistry.list(kind).filter((plugin) => !plugin.hidden)
  ), [kind, surface]);

  const current = allPlugins.find((plugin) => plugin.id === value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allPlugins.filter((plugin) => (
      !needle
      || plugin.displayName.toLowerCase().includes(needle)
      || plugin.description.toLowerCase().includes(needle)
      || plugin.id.includes(needle)
    ));
  }, [allPlugins, query]);

  // Group the filtered items while keeping a flat index for keyboard nav.
  const groups = useMemo(() => {
    const map = new Map<string, AnyDirectorPlugin[]>();
    for (const plugin of filtered) {
      const key = categorize(kind, plugin);
      (map.get(key) ?? map.set(key, []).get(key)!).push(plugin);
    }
    return [...map.entries()];
  }, [filtered, kind]);

  const flatOrder = useMemo(() => groups.flatMap(([, plugins]) => plugins), [groups]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, flatOrder.findIndex((plugin) => plugin.id === value)));
    const focus = requestAnimationFrame(() => searchRef.current?.focus());
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = Math.min(window.innerWidth - 16, Math.max(rect.width, 268));
      const menuHeight = Math.min(420, window.innerHeight - 24);
      const roomBelow = window.innerHeight - rect.bottom - 12;
      const top = roomBelow >= 240 ? rect.bottom + 7 : Math.max(8, rect.top - menuHeight - 7);
      setMenuStyle({
        position: 'fixed', zIndex: 141, top,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
        width: menuWidth, maxHeight: menuHeight,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(focus);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, flatOrder, value]);

  function commit(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(flatOrder.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = flatOrder[activeIndex];
      if (target) commit(target.id);
    }
  }

  return (
    <div className={`reel-select-field ${className}`.trim()}>
      <span id={labelId} className="reel-field-label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="reel-select-trigger"
        aria-labelledby={labelId}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span>{current?.displayName || value}</span>
        <ChevronDown size={14} className={open ? 'open' : ''} />
      </button>
      {open && createPortal(
        <>
          <button type="button" className="reel-select-backdrop" aria-label={`Close ${label} picker`} onClick={() => setOpen(false)} />
          <div className="plugin-picker" role="dialog" aria-label={`${label} picker`} style={menuStyle} onKeyDown={onKeyDown}>
            <div className="plugin-picker-search">
              <Search size={14} />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label}`}
                onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              />
            </div>
            <div className="plugin-picker-list">
              {flatOrder.length === 0 && <p className="plugin-picker-empty">No matches.</p>}
              {groups.map(([groupName, plugins]) => (
                <section key={groupName}>
                  <h4 className="plugin-picker-group">{groupName}</h4>
                  {plugins.map((plugin) => {
                    const flatIndex = flatOrder.indexOf(plugin);
                    return (
                      <button
                        key={plugin.id}
                        type="button"
                        className={`plugin-picker-item ${plugin.id === value ? 'selected' : ''} ${flatIndex === activeIndex ? 'active' : ''}`}
                        aria-current={plugin.id === value}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => commit(plugin.id)}
                      >
                        <PluginThumbnail kind={kind} surface={surface} pluginId={plugin.id} />
                        <span className="plugin-picker-meta">
                          <strong>{plugin.displayName}</strong>
                          <small>{plugin.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
