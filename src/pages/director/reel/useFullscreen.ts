import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Thin wrapper over the Fullscreen API for a target element. Tracks whether the
 * element is currently the fullscreen element and exposes request/exit/toggle.
 * Degrades gracefully (`supported: false`) when the API is unavailable.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const supported = typeof document !== 'undefined'
    && (typeof document.exitFullscreen === 'function'
      || 'webkitExitFullscreen' in document);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const sync = useCallback(() => {
    const active = (document.fullscreenElement
      || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) ?? null;
    setIsFullscreen(Boolean(active) && active === ref.current);
  }, [ref]);

  useEffect(() => {
    if (!supported) return;
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [supported, sync]);

  const request = useCallback(() => {
    const element = ref.current as (HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    if (!element) return;
    const run = element.requestFullscreen?.bind(element) || element.webkitRequestFullscreen?.bind(element);
    if (run) {
      void Promise.resolve(run())
        // Move keyboard focus onto the target so Space/arrow controls fire
        // without a stray click after entering fullscreen.
        .then(() => element.focus?.())
        .catch(() => undefined);
    }
  }, [ref]);

  const exit = useCallback(() => {
    const runner = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
    const run = runner.exitFullscreen?.bind(document) || runner.webkitExitFullscreen?.bind(document);
    if (run) void Promise.resolve(run()).catch(() => undefined);
  }, []);

  const toggle = useCallback(() => {
    if (isFullscreen) exit();
    else request();
  }, [isFullscreen, request, exit]);

  return { supported, isFullscreen, request, exit, toggle };
}
