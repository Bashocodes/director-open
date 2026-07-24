import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DirectorResponse } from '../../../shared/directorSchemas';
import { DirectorArtifact } from './DirectorArtifact';

const response: DirectorResponse = {
  message: 'Receipt',
  mode: 'animate',
  suggestedActions: [],
  canvasActions: [],
  directionContract: null,
  sequence: null,
  continuity: null,
  reelActions: [{
    type: 'style_clips',
    objectIds: [],
    clipIds: ['clip-a', 'clip-b'],
    aspectRatio: null,
    fps: null,
      quality: null,
      effect: 'warm',
      visualEffect: 'pixel-sort',
    transition: 'crossfade',
    motion: 'push-in',
    duration: 3,
    intensity: 55,
    layerId: null,
    content: null,
    textX: null,
    textY: null,
    fontId: null,
    sizePreset: null,
    textColor: null,
    align: null,
    inSec: null,
    outSec: null,
  }],
};

describe('Director reel action artifact', () => {
  it('shows every setting in the validated local action receipt', () => {
    render(<DirectorArtifact response={response} />);
    const receipt = screen.getByText(/updated 2 clips/);
    expect(receipt).toHaveTextContent('warm grade');
    expect(receipt).toHaveTextContent('pixel-sort visual effect');
    expect(receipt).toHaveTextContent('crossfade transition');
    expect(receipt).toHaveTextContent('push-in motion');
    expect(receipt).toHaveTextContent('3s duration');
    expect(receipt).toHaveTextContent('55% strength');
  });
});
