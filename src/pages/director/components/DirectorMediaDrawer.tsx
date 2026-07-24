import { useEffect, useRef } from 'react';
import { HardDrive, Image as ImageIcon, Music, Trash2, Upload, X } from 'lucide-react';
import type { DirectorPersistenceResult } from '../directorPersistence';
import type { LibrarySource } from '../librarySource';

type Props = {
  open: boolean;
  source: LibrarySource;
  persistenceStatus: DirectorPersistenceResult | 'saving';
  onClose: () => void;
};

function storageNote(status: Props['persistenceStatus']) {
  if (status === 'quota') {
    return { tone: 'warn' as const, text: 'Browser storage is full — the newest media may not survive a refresh. Remove items or free space.' };
  }
  if (status === 'unavailable') {
    return { tone: 'warn' as const, text: 'This browser blocks local storage, so imported media will be lost on refresh.' };
  }
  return { tone: 'calm' as const, text: 'Imported media stays on this device and is restored after a page refresh.' };
}

export function DirectorMediaDrawer({ open, source, persistenceStatus, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    // Move focus into the drawer for keyboard users.
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const items = source.list();
  const images = items.filter((item) => item.kind === 'image');
  const audio = items.filter((item) => item.kind === 'audio');
  const note = storageNote(persistenceStatus);

  return (
    <div className="media-drawer-layer">
      <button
        type="button"
        className="media-drawer-backdrop"
        aria-label="Dismiss media drawer"
        onClick={onClose}
      />
      <aside className="media-drawer" role="dialog" aria-modal="true" aria-label="Local media library">
        <header className="media-drawer-head">
          <div>
            <span className="media-drawer-eyebrow">{source.label}</span>
            <h2>Media</h2>
          </div>
          <button ref={closeRef} type="button" className="media-drawer-close" aria-label="Close media drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="media-drawer-actions">
          <button type="button" className="media-upload-button" onClick={() => inputRef.current?.click()}>
            <Upload size={15} /> Upload images
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            aria-label="Upload local images"
            onChange={(event) => {
              source.add(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
        </div>

        <div className="media-drawer-body">
          {items.length === 0 ? (
            <div className="media-drawer-empty">
              <ImageIcon size={22} />
              <p>No local media yet. Upload images to place private references on the canvas.</p>
              <button type="button" onClick={() => inputRef.current?.click()}>Upload images</button>
            </div>
          ) : (
            <>
              {images.length > 0 && (
                <section aria-label="Images">
                  <h3 className="media-group-title">Images · {images.length}</h3>
                  <div className="media-grid">
                    {images.map((item) => (
                      <figure key={item.id} className="media-tile">
                        {item.url ? <img src={item.url} alt={item.title} /> : <div className="media-tile-fallback"><ImageIcon size={18} /></div>}
                        <figcaption>
                          <strong title={item.title}>{item.title}</strong>
                          {item.sizeLabel && <span>{item.sizeLabel}</span>}
                        </figcaption>
                        <button type="button" className="media-tile-remove" aria-label={`Remove ${item.title}`} onClick={() => source.remove(item)}>
                          <Trash2 size={13} />
                        </button>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
              {audio.length > 0 && (
                <section aria-label="Audio">
                  <h3 className="media-group-title">Audio · {audio.length}</h3>
                  <ul className="media-audio-list">
                    {audio.map((item) => (
                      <li key={item.id}>
                        <Music size={15} />
                        <span className="media-audio-name" title={item.title}>{item.title}</span>
                        {item.sizeLabel && <span className="media-audio-size">{item.sizeLabel}</span>}
                        <button type="button" aria-label={`Remove ${item.title}`} onClick={() => source.remove(item)}>
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        <footer className={`media-drawer-note ${note.tone}`}>
          <HardDrive size={13} />
          <p>{note.text}</p>
        </footer>
      </aside>
    </div>
  );
}
