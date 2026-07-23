import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasObject } from '../types';
import { EMPTY_SUMMARY } from '../types';

const mocks = vi.hoisted(() => ({
  frames: [] as Array<(time: number) => void>,
  reactFlowProps: null as Record<string, any> | null,
  setCenter: vi.fn(),
}));

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    Background: () => null,
    Controls: () => null,
    MarkerType: { ArrowClosed: 'arrowclosed' },
    ReactFlow: (props: Record<string, any>) => {
      mocks.reactFlowProps = props;
      const { onInit } = props;
      React.useEffect(() => {
        onInit?.({ setCenter: mocks.setCenter, fitView: vi.fn() });
      }, [onInit]);
      return <div>{props.children}</div>;
    },
  };
});

vi.mock('./DirectorDock', () => ({ DirectorDock: () => null }));
vi.mock('./DirectorNode', () => ({ DirectorNode: () => null }));

import { DirectorCanvas } from './DirectorCanvas';

const object: CanvasObject = {
  id: 'upload-1', title: 'Quiet Warrior', subtitle: 'Local image',
  kind: 'upload', source: 'UPLOAD', imageUrl: 'blob:https://director.test/warrior',
  position: { x: 560, y: 220 }, inherit: [], locks: [], summary: EMPTY_SUMMARY,
};

const baseProps = {
  objects: [] as CanvasObject[], selectedIds: [] as string[], mode: 'inspect' as const,
  goal: 'Build a direction', exclusions: [] as string[], contract: null, sequence: null, continuity: null,
  onGoalChange: vi.fn(), onExclusionsChange: vi.fn(), onModeChange: vi.fn(), onSelectionChange: vi.fn(),
  onPositionChange: vi.fn(), onToggleChannel: vi.fn(), onUploadFiles: vi.fn(),
  onRemoveObject: vi.fn(), onOpenLibrary: vi.fn(),
};

describe('DirectorCanvas viewport', () => {
  beforeEach(() => {
    mocks.frames.length = 0;
    mocks.reactFlowProps = null;
    mocks.setCenter.mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      mocks.frames.push(callback);
      return mocks.frames.length;
    });
  });

  it('still centers an added card when the following render only selects it', () => {
    const view = render(<DirectorCanvas {...baseProps} />);
    view.rerender(<DirectorCanvas {...baseProps} objects={[object]} />);
    view.rerender(<DirectorCanvas {...baseProps} objects={[object]} selectedIds={[object.id]} />);
    act(() => mocks.frames.forEach((callback) => callback(0)));
    expect(mocks.setCenter).toHaveBeenCalledWith(689, 370, { zoom: 0.74, duration: 520 });
  });

  it('persists React Flow measurements so controlled nodes remain visible', () => {
    render(<DirectorCanvas {...baseProps} objects={[object]} />);
    act(() => mocks.reactFlowProps?.onNodesChange([{
      id: object.id, type: 'dimensions', dimensions: { width: 258, height: 336 },
    }]));
    expect(mocks.reactFlowProps?.nodes[0].measured).toEqual({ width: 258, height: 336 });
  });

  it('uses empty-canvas dragging for panning instead of selection', () => {
    render(<DirectorCanvas {...baseProps} objects={[object]} />);
    expect(mocks.reactFlowProps).toMatchObject({ panOnDrag: true, selectionOnDrag: false });
  });
});
