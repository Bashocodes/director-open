import { describe, expect, it, vi } from 'vitest';
import { createTextLayer } from '../../../shared/textLayers';
import {
  assertKnownMediaLimits,
  imageExtension,
  reelProjectFingerprint,
  revokeRemovedProjectObjectUrls,
  revokeProjectObjectUrls,
  validateLocalAudio,
  validateLocalImage,
} from './media';
import type { ReelProject } from './types';

function file(name: string, type: string, bytes = 3) {
  return new File([new Uint8Array(bytes)], name, { type, lastModified: 7 });
}

function project(): ReelProject {
  const sourceFile = file('private-name.png', 'image/png');
  return {
    id: 'reel-1', title: 'Test', aspectRatio: '9:16', fps: 24, quality: 'draft',
    selectedClipIds: ['clip-1'], renderRequested: false,
    audio: { name: 'track.mp3', sourceFile: file('track.mp3', 'audio/mpeg'), url: 'blob:audio' },
    clips: [{
      id: 'clip-1', objectId: null, title: 'private-name', imageUrl: 'blob:image', sourceFile,
      duration: 3, effect: 'clean', transition: 'cut', transitionDuration: 0,
      motion: 'still', intensity: 50, textLayers: [],
    }],
  };
}

describe('local reel media safeguards', () => {
  it('allows only the still-image and audio types exercised by the renderer', () => {
    expect(imageExtension(file('frame.jpeg', 'image/jpeg'), '')).toBe('jpg');
    expect(validateLocalImage(file('animation.gif', 'image/gif'))).toMatch(/JPEG/);
    expect(validateLocalAudio(file('track.mp3', 'audio/mpeg'))).toBeNull();
    expect(validateLocalAudio(file('track.wav', 'audio/vnd.wave'))).toBeNull();
    expect(validateLocalAudio(file('track.flac', 'audio/x-flac'))).toBeNull();
    expect(validateLocalAudio(file('track.ogg', 'application/ogg'))).toBeNull();
    expect(validateLocalAudio(file('track.mid', 'audio/midi'))).toMatch(/MP3/);
    expect(validateLocalImage({
      name: 'huge.jpg', type: 'image/jpeg', size: 65 * 1_048_576, lastModified: 0,
    } as File)).toMatch(/64 MB/);
  });

  it('creates a render fingerprint that changes with visible edit settings', () => {
    const initial = project();
    expect(reelProjectFingerprint(initial)).not.toBe(reelProjectFingerprint({
      ...initial,
      clips: initial.clips.map((clip) => ({ ...clip, textLayers: [createTextLayer('t-changed', { content: 'Changed' })] })),
    }));
    expect(reelProjectFingerprint(initial)).not.toBe(reelProjectFingerprint({
      ...initial,
      audio: initial.audio ? { ...initial.audio, url: 'blob:replacement-audio' } : null,
    }));
    expect(reelProjectFingerprint(initial)).not.toBe(reelProjectFingerprint({
      ...initial,
      renderBackend: 'after-effects',
    }));
    expect(reelProjectFingerprint(initial)).toBe(reelProjectFingerprint({
      ...initial,
      colorDepth: 16,
    }));
  });

  it('validates known local media before loading the engine', () => {
    expect(() => assertKnownMediaLimits(project())).not.toThrow();
    const missingLocalSource = project();
    missingLocalSource.clips = [{ ...missingLocalSource.clips[0], sourceFile: undefined }];
    expect(() => assertKnownMediaLimits(missingLocalSource)).toThrow(/missing its local source file/);
  });

  it('revokes a clip object URL when that clip is removed', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const previous = project();
    revokeRemovedProjectObjectUrls(previous, { ...previous, clips: [] });
    expect(revoke).toHaveBeenCalledWith('blob:image');
    expect(revoke).not.toHaveBeenCalledWith('blob:audio');
    revoke.mockRestore();
  });

  it('revokes all browser-local object URLs when a project is released', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    revokeProjectObjectUrls(project());
    expect(revoke).toHaveBeenCalledWith('blob:image');
    expect(revoke).toHaveBeenCalledWith('blob:audio');
    revoke.mockRestore();
  });
});
