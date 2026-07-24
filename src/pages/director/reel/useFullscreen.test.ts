import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFullscreen } from './useFullscreen';

/** Minimal Fullscreen API mock over jsdom, which ships none of it. */
function installFullscreenMock() {
  const requestFullscreen = vi.fn(function (this: HTMLElement) {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this });
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  const exitFullscreen = vi.fn(function () {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });
  (HTMLElement.prototype as HTMLElement & { requestFullscreen: typeof requestFullscreen }).requestFullscreen = requestFullscreen;
  return { requestFullscreen, exitFullscreen };
}

describe('useFullscreen', () => {
  let mock: ReturnType<typeof installFullscreenMock>;

  beforeEach(() => {
    mock = installFullscreenMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error cleanup of the ad-hoc mock
    delete HTMLElement.prototype.requestFullscreen;
  });

  it('reports support and default collapsed state', () => {
    const element = document.createElement('div');
    const ref = { current: element };
    const { result } = renderHook(() => useFullscreen(ref));
    expect(result.current.supported).toBe(true);
    expect(result.current.isFullscreen).toBe(false);
  });

  it('toggles into and out of fullscreen, tracking the API events', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const ref = { current: element };
    const { result } = renderHook(() => useFullscreen(ref));

    act(() => result.current.toggle());
    expect(mock.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(true);

    act(() => result.current.toggle());
    expect(mock.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(false);

    element.remove();
  });

  it('ignores fullscreen changes for a different element', () => {
    const element = document.createElement('div');
    const other = document.createElement('div');
    const ref = { current: element };
    const { result } = renderHook(() => useFullscreen(ref));
    act(() => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: other });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(false);
  });
});
