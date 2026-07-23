import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, Upload } from 'lucide-react';

type Props = {
  onUpload: (files: File[]) => void;
};

export function DirectorLibrary({ onUpload }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <aside className={`director-search ${collapsed ? 'collapsed' : ''}`} aria-label="Local image library">
      <button
        type="button"
        className="search-collapse"
        onClick={() => setCollapsed((current) => !current)}
        aria-label={collapsed ? 'Open local library' : 'Collapse local library'}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>
      {collapsed ? (
        <div className="search-rail"><Images size={15} /><span>Library</span></div>
      ) : (
        <>
          <header className="search-head">
            <span><Images size={13} /> LOCAL LIBRARY</span>
            <strong>Your media</strong>
          </header>
          <div className="corpus-results">
            <div className="search-empty">
              <Upload size={20} />
              <p>Your library starts empty. Upload your own images to place private, browser-local references on the canvas.</p>
              <button type="button" onClick={() => inputRef.current?.click()}>Upload images</button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                aria-label="Upload local images"
                onChange={(event) => {
                  onUpload(Array.from(event.target.files || []));
                  event.target.value = '';
                }}
              />
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
