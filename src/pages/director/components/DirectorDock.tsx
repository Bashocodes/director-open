import { Combine, Download, Eye, Film, Sparkles, WandSparkles } from 'lucide-react';
import type { CanvasMode } from '../types';

const items: Array<{ mode: CanvasMode; label: string; icon: typeof Eye }> = [
  { mode: 'inspect', label: 'Inspect', icon: Eye },
  { mode: 'inherit', label: 'Inherit', icon: WandSparkles },
  { mode: 'combine', label: 'Combine', icon: Combine },
  { mode: 'create', label: 'Create', icon: Sparkles },
  { mode: 'animate', label: 'Animate', icon: Film },
  { mode: 'export', label: 'Export', icon: Download },
];

export function DirectorDock({ mode, onChange }: { mode: CanvasMode; onChange: (mode: CanvasMode) => void }) {
  return (
    <div className="director-dock" aria-label="Director canvas modes">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.mode} type="button" className={mode === item.mode ? 'active' : ''} aria-label={item.label} title={item.mode === 'animate' ? 'Open Reel Studio and add canvas or local images' : item.label} onClick={() => onChange(item.mode)}>
            <Icon size={15} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
