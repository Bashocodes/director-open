import { describe, expect, it } from 'vitest';
import { DirectorResponseSchema, type DirectorContext } from '../shared/directorSchemas';
import { createDemoResponse } from './demo';

const emptySummary = {
  emotion: [], materials: [], composition: [], palette: [], lighting: [],
  camera: [], world: [], style: [], subjects: [],
};

const context: DirectorContext = {
  mode: 'combine',
  goal: 'Create a controlled visual story.',
  exclusions: ['neon'],
  canvas: [{
    id: 'a', assetId: null, title: 'Emotion reference', source: 'UPLOAD',
    kind: 'upload', selected: true, inherit: ['emotion'], locks: [], decodedSummary: emptySummary,
  }],
  visibleSearch: null,
  recentConversation: [],
  directionContract: null,
  sequence: null,
  reelProject: null,
};

const reelContext: DirectorContext = {
  ...context,
  reelProject: {
    open: true,
    aspectRatio: '9:16',
    fps: 30,
    quality: 'balanced',
    selectedClipIds: ['clip-2', 'stale-clip-id'],
    clips: [
      { id: 'clip-1', objectId: 'a', title: 'Arrival', duration: 3, effect: 'clean', visualEffect: 'none', transition: 'cut', motion: 'still', intensity: 50, caption: '' },
      { id: 'clip-2', objectId: 'b', title: 'Signal', duration: 3, effect: 'clean', visualEffect: 'none', transition: 'crossfade', motion: 'still', intensity: 50, caption: '' },
      { id: 'clip-3', objectId: null, title: 'Local image', duration: 3, effect: 'clean', visualEffect: 'none', transition: 'crossfade', motion: 'still', intensity: 50, caption: '' },
    ],
  },
};

function validResponse(message: string, directorContext: DirectorContext = context) {
  return DirectorResponseSchema.parse(createDemoResponse(message, directorContext));
}

describe('deterministic Director fixtures', () => {
  it('produces a valid Direction Contract response', () => {
    const response = validResponse('Compile the direction');
    expect(response.directionContract?.inheritance[0].objectId).toBe('a');
    expect(response.canvasActions).toEqual([]);
  });

  it('produces a valid six-beat story response', () => {
    const response = validResponse(
      'Turn the approved Direction Contract into a six-beat visual story with emotional progression and continuity locks.',
    );
    expect(response.mode).toBe('animate');
    expect(response.sequence?.beats).toHaveLength(6);
    expect(response.continuity).toBeNull();
  });

  it('invites local uploads instead of producing a corpus search action', () => {
    const response = validResponse('Find and place warrior references');
    expect(response.canvasActions).toEqual([]);
    expect(response.message).toContain('Upload your own images');
  });

  it('produces a bounded continuity repair', () => {
    const response = createDemoResponse('Check continuity drift', context);
    expect(response.continuity?.findings).toHaveLength(1);
    expect(response.continuity?.findings[0].repair).toContain('preserve identity');
  });

  it('turns a reel request into executable local editing tools', () => {
    const response = validResponse('Make a cinematic vertical reel with blur and dip to black transitions');
    expect(response.reelActions.map((action) => action.type)).toEqual([
      'open_reel_studio', 'set_project', 'style_clips',
    ]);
    expect(response.reelActions[2]).toMatchObject({
      effect: 'cinematic', visualEffect: 'blur', transition: 'dip-black',
    });
  });

  it('recognizes every current effect plus retired compatibility vocabulary', () => {
    for (const [request, visualEffect] of [
      ['Apply pixel sort', 'pixel-sort'],
      ['Apply glitch burst', 'glitch-burst'],
      ['Apply CRT scan', 'crt-scan'],
      ['Apply halftone reveal', 'halftone-reveal'],
      ['Apply ripple drift', 'ripple-drift'],
      ['Apply motion echo', 'motion-echo'],
      ['Apply threshold melt', 'threshold-melt'],
      ['Apply RGB split', 'rgb-split'],
      ['Apply scanlines', 'scanlines'],
      ['Apply soft glow', 'glow'],
    ] as const) {
      const response = validResponse(`${request} to the selected clips`, reelContext);
      expect(response.reelActions.at(-1)?.visualEffect).toBe(visualEffect);
    }
  });

  it('routes Add local music to the local picker instead of visual search', () => {
    const response = validResponse('Add local music', reelContext);
    expect(response.canvasActions).toEqual([]);
    expect(response.reelActions.map((action) => action.type)).toEqual(['open_reel_studio']);
    expect(response.message).toContain('selected directly from your device');
    expect(response.message).toContain('did not upload or add audio');
  });

  it('turns Use high quality into the executable 1080p project setting', () => {
    const response = validResponse('Use high quality', reelContext);
    expect(response.canvasActions).toEqual([]);
    expect(response.reelActions.map((action) => action.type)).toEqual(['open_reel_studio', 'set_project']);
    expect(response.reelActions[1]).toMatchObject({ quality: 'high' });
  });

  it('requires a confirmed local step for both render phrasings', () => {
    for (const request of ['Render this reel as an MP4', 'Render on this device']) {
      const response = validResponse(request, reelContext);
      expect(response.reelActions.map((action) => action.type)).toEqual(['open_reel_studio', 'request_render']);
      expect(response.message).toContain('only after you approve Render on this device');
      expect(response.message).not.toMatch(/\bI (?:have )?rendered\b/i);
    }
  });

  it('targets every real clip ID and understands hyphenated camera moves', () => {
    const response = validResponse('Make every clip HDR with a slow pull-out', reelContext);
    expect(response.reelActions).toHaveLength(2);
    expect(response.reelActions[1]).toMatchObject({
      clipIds: ['clip-1', 'clip-2', 'clip-3'], effect: 'hdr', motion: 'pull-out',
    });
    expect(response.message).toContain('entire reel');
  });

  it('targets only current selected clip IDs for combined style edits', () => {
    const response = validResponse(
      'Give the selected clips a warm look, slide right transition, and pan-down motion',
      reelContext,
    );
    expect(response.reelActions[1]).toMatchObject({
      type: 'style_clips',
      clipIds: ['clip-2'],
      effect: 'warm',
      transition: 'slide-right',
      motion: 'pan-down',
    });
    expect(response.reelActions[1].clipIds).not.toContain('stale-clip-id');
  });

  it('applies caption and timing edits without adding unrelated style defaults', () => {
    const response = validResponse(
      'Set selected clips to 4.5 seconds with caption “Hold the line”',
      reelContext,
    );
    expect(response.reelActions[1]).toMatchObject({
      type: 'style_clips', clipIds: ['clip-2'], duration: 4.5, caption: 'Hold the line',
    });
    expect(response.reelActions[1]).toMatchObject({ effect: null, transition: null, motion: null });
  });

  it('turns a restrained-transition suggestion into a transition-only edit', () => {
    const response = validResponse('Make transitions more restrained across the entire reel', reelContext);
    expect(response.reelActions[1]).toMatchObject({
      type: 'style_clips',
      clipIds: ['clip-1', 'clip-2', 'clip-3'],
      effect: null,
      transition: 'crossfade',
      motion: null,
      duration: null,
    });
  });

  it('removes selected clips or all clips using only current IDs', () => {
    const selected = validResponse('Remove selected clips', reelContext);
    expect(selected.reelActions[1]).toMatchObject({ type: 'remove_clips', clipIds: ['clip-2'] });

    const all = validResponse('Delete the entire reel', reelContext);
    expect(all.reelActions[1]).toMatchObject({
      type: 'remove_clips', clipIds: ['clip-1', 'clip-2', 'clip-3'],
    });
  });

  it('does not turn an empty explicit selection into an all-clips edit', () => {
    const response = validResponse('Blur the selected clips', {
      ...reelContext,
      reelProject: { ...reelContext.reelProject!, selectedClipIds: ['stale-clip-id'] },
    });
    expect(response.reelActions.map((action) => action.type)).toEqual(['open_reel_studio']);
    expect(response.message).toContain('No current reel clip is selected');
  });

  it('reverses or moves clips with a complete current-ID order', () => {
    const reversed = validResponse('Reverse the clip order', reelContext);
    expect(reversed.reelActions[1]).toMatchObject({
      type: 'reorder_clips', clipIds: ['clip-3', 'clip-2', 'clip-1'],
    });

    const moved = validResponse('Move clip 3 first', reelContext);
    expect(moved.reelActions[1]).toMatchObject({
      type: 'reorder_clips', clipIds: ['clip-3', 'clip-1', 'clip-2'],
    });
  });

  it('keeps every reel suggestion on a deterministic response path', () => {
    const source = validResponse('Apply blur to selected clips', reelContext);
    const routed = source.suggestedActions.map((suggestion) => validResponse(suggestion, reelContext));
    expect(routed.map((response) => response.reelActions.map((action) => action.type))).toEqual([
      ['open_reel_studio', 'set_project'],
      ['open_reel_studio'],
      ['open_reel_studio', 'request_render'],
    ]);
    expect(routed.every((response) => response.canvasActions.length === 0)).toBe(true);
  });

  it('is deterministic and credential-free at the response layer', () => {
    const first = validResponse('Apply iris reveal to all clips', reelContext);
    const second = validResponse('Apply iris reveal to all clips', reelContext);
    expect(second).toEqual(first);
    expect(first.reelActions[1]).toMatchObject({ transition: 'zoom' });
    expect(JSON.stringify(first)).not.toMatch(/\b(?:openai|gemini|api[_ -]?key|provider key)\b/i);
  });
});
