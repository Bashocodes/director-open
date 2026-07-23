import { Sparkles } from 'lucide-react';

export function TopNav() {
  return (
    <header className="top-nav">
      <div className="brand-mark" aria-label="Director Open"><Sparkles size={20} /></div>
      <nav aria-label="Main navigation">
        <span className="active" aria-current="page"><Sparkles size={13} /> Director Open</span>
      </nav>
      <div className="nav-actions">
        <span className="local-first-badge">LOCAL-FIRST CREATIVE STUDIO</span>
      </div>
    </header>
  );
}
