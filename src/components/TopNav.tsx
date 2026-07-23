import { useState } from 'react';
import { ShieldCheck, Sparkles, X } from 'lucide-react';

export function TopNav() {
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <header className="top-nav">
      <div className="brand-mark" aria-label="Director Open"><Sparkles size={20} /></div>
      <nav aria-label="Main navigation">
        <span className="active" aria-current="page"><Sparkles size={13} /> Director Open</span>
      </nav>
      <div className="nav-actions">
        <button
          type="button"
          className="local-first-badge"
          aria-expanded={privacyOpen}
          aria-controls="local-privacy-panel"
          onClick={() => setPrivacyOpen((open) => !open)}
        >
          <ShieldCheck size={12} /> 100% local — your media never leaves this browser
        </button>
      </div>
      {privacyOpen && (
        <section id="local-privacy-panel" className="local-privacy-panel" aria-label="Local media privacy">
          <header><strong>Local media privacy</strong><button type="button" aria-label="Close privacy panel" onClick={() => setPrivacyOpen(false)}><X size={14} /></button></header>
          <p>Images, audio, previews, and rendered video stay in this browser. Projects and imported media are stored in IndexedDB on this device.</p>
          <p>The Worker serves static app files only. Optional AI text goes directly from this browser to your chosen provider; media never does.</p>
          <p>There is no media upload, storage, proxy, analytics, or telemetry endpoint.</p>
        </section>
      )}
    </header>
  );
}
