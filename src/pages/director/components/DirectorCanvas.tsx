import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Focus, Images, MousePointer2, ShieldCheck } from 'lucide-react';
import type {
  ContinuityReport,
  DirectionBrief,
  InheritanceChannel,
  StorySequence,
} from '../../../shared/directorSchemas';
import type { CanvasMode, CanvasObject } from '../types';
import { loadSampleFiles } from '../reel/sampleMedia';
import { DirectorDock } from './DirectorDock';
import { DirectorNode, type DirectorFlowNode } from './DirectorNode';

const nodeTypes: NodeTypes = { 'director-object': DirectorNode };

type Props = {
  objects: CanvasObject[];
  selectedIds: string[];
  mode: CanvasMode;
  goal: string;
  exclusions: string[];
  contract: DirectionBrief | null;
  sequence: StorySequence | null;
  continuity: ContinuityReport | null;
  onGoalChange: (goal: string) => void;
  onExclusionsChange: (exclusions: string[]) => void;
  onModeChange: (mode: CanvasMode) => void;
  onSelectionChange: (ids: string[]) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onToggleChannel: (id: string, channel: InheritanceChannel) => void;
  onUploadFiles: (files: File[]) => void;
  onRemoveObject: (id: string) => void;
  onOpenLibrary: () => void;
};

export function DirectorCanvas(props: Props) {
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const flowRef = useRef<ReactFlowInstance<DirectorFlowNode, Edge> | null>(null);
  const mountedRef = useRef(true);
  const knownObjectIdsRef = useRef<Set<string>>(new Set());
  const [nodeMeasurements, setNodeMeasurements] = useState<Record<string, { width: number; height: number }>>({});
  const [exclusionText, setExclusionText] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flowRef.current = null;
    };
  }, []);

  useEffect(() => setExclusionText(props.exclusions.join(', ')), [props.exclusions]);

  const nodes = useMemo<DirectorFlowNode[]>(() => props.objects.map((object) => ({
    id: object.id,
    type: 'director-object',
    position: object.position,
    width: object.kind === 'contract' ? 320 : object.kind === 'beat' ? 230 : 258,
    measured: nodeMeasurements[object.id],
    selected: props.selectedIds.includes(object.id),
    data: {
      object,
      mode: props.mode,
      contract: object.kind === 'contract' ? props.contract : null,
      beat: object.kind === 'beat' ? props.sequence?.beats.find((beat) => beat.id === object.id) : undefined,
      continuity: object.kind === 'beat' ? props.continuity?.findings.find((finding) => finding.beatId === object.id) : undefined,
      onToggleChannel: props.onToggleChannel,
      onRemove: props.onRemoveObject,
    },
  })), [props.objects, props.selectedIds, props.mode, props.contract, props.sequence, props.continuity, props.onToggleChannel, props.onRemoveObject, nodeMeasurements]);

  const edges = useMemo<Edge[]>(() => {
    const next: Edge[] = [];
    if (props.contract && props.objects.some((object) => object.id === 'direction-contract')) {
      for (const inherited of props.contract.inheritance) {
        if (!props.objects.some((object) => object.id === inherited.objectId)) continue;
        next.push({
          id: `inherit-${inherited.objectId}`,
          source: inherited.objectId,
          target: 'direction-contract',
          animated: true,
          label: inherited.channels.join(' + '),
          style: { stroke: '#8eabc8', strokeWidth: 1.3 },
          labelStyle: { fill: '#a9b8c7', fontSize: 11 },
          labelBgStyle: { fill: '#0d0d12', fillOpacity: 0.92 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8eabc8', width: 14, height: 14 },
        });
      }
    }
    if (props.sequence) {
      props.sequence.beats.forEach((beat, index) => {
        const source = index === 0 ? 'direction-contract' : props.sequence!.beats[index - 1].id;
        if (!props.objects.some((object) => object.id === source)) return;
        next.push({
          id: `story-${beat.id}`,
          source,
          target: beat.id,
          animated: index === 0,
          style: { stroke: '#8fa29a', strokeWidth: 1.2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8fa29a', width: 12, height: 12 },
        });
      });
    }
    return next;
  }, [props.contract, props.sequence, props.objects]);

  useEffect(() => {
    const previousIds = knownObjectIdsRef.current;
    const addedNodes = nodes.filter((node) => !previousIds.has(node.id));
    knownObjectIdsRef.current = new Set(nodes.map((node) => node.id));
    if (!addedNodes.length) return;

    const minX = Math.min(...addedNodes.map((node) => node.position.x));
    const maxX = Math.max(...addedNodes.map((node) => node.position.x + (node.width || 258)));
    const minY = Math.min(...addedNodes.map((node) => node.position.y));
    const maxY = Math.max(...addedNodes.map((node) => node.position.y + 300));
    const zoom = addedNodes.length === 1 ? 0.74 : addedNodes.length <= 3 ? 0.54 : 0.48;

    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      void flowRef.current?.setCenter((minX + maxX) / 2, (minY + maxY) / 2, { zoom, duration: 520 });
    });
  }, [nodes]);

  useEffect(() => {
    if (props.mode === 'animate' && props.sequence) {
      const frame = requestAnimationFrame(() => {
        void flowRef.current?.fitView({ padding: 0.2, duration: 700, maxZoom: 0.72 });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [props.mode, props.sequence]);

  function handleNodesChange(changes: NodeChange<DirectorFlowNode>[]) {
    const dimensions = changes.flatMap((change) => (
      change.type === 'dimensions' && change.dimensions ? [{ id: change.id, ...change.dimensions }] : []
    ));
    if (dimensions.length) {
      setNodeMeasurements((current) => {
        let changed = false;
        const next = { ...current };
        for (const measurement of dimensions) {
          const previous = current[measurement.id];
          if (previous?.width === measurement.width && previous.height === measurement.height) continue;
          next[measurement.id] = { width: measurement.width, height: measurement.height };
          changed = true;
        }
        return changed ? next : current;
      });
    }
    for (const change of changes) {
      if (change.type === 'position' && change.position) props.onPositionChange(change.id, change.position);
    }
  }

  function addExclusion() {
    props.onExclusionsChange(exclusionText.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 24));
  }

  return (
    <section
      className="director-canvas"
      data-director-canvas-version="center-v3"
      aria-label="Visual direction canvas"
    >
      <button
        type="button"
        className="canvas-media-button"
        onClick={props.onOpenLibrary}
        title="Open the local media library"
      >
        <Images size={15} /> Media
      </button>
      <div className="canvas-brief">
        <span>PROJECT NORTH STAR</span>
        <input value={props.goal} onChange={(event) => props.onGoalChange(event.target.value)} />
        <div className="exclusion-line">
          <ShieldCheck size={11} />
          <input
            value={exclusionText}
            onChange={(event) => setExclusionText(event.target.value)}
            onBlur={addExclusion}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addExclusion(); } }}
            placeholder="Exclusions, comma separated"
          />
        </div>
      </div>
      <div className="canvas-status">
        <span><MousePointer2 size={11} /> {props.selectedIds.length} selected</span>
        <span><Focus size={11} /> full board context</span>
      </div>
      {props.objects.length === 0 && (
        <div className="canvas-empty-state">
          <span>01 · DIRECTION</span>
          <h2>Build the visual language.</h2>
          <p>Add your own images, then choose what the direction inherits from each.</p>
          <div className="canvas-empty-actions">
            <button type="button" onClick={props.onOpenLibrary}><Images size={15} /> Open media library</button>
            <button
              type="button"
              className="secondary"
              disabled={loadingSamples}
              onClick={() => {
                setLoadingSamples(true);
                void loadSampleFiles()
                  .then((files) => props.onUploadFiles(files))
                  .catch(() => setSampleError('Director could not load the sample images.'))
                  .finally(() => setLoadingSamples(false));
              }}
            >{loadingSamples ? 'Loading…' : 'Try sample images'}</button>
          </div>
          {sampleError && <p className="canvas-empty-error" role="alert">{sampleError}</p>}
        </div>
      )}
      <ReactFlow
        onInit={(instance) => { flowRef.current = instance; }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onSelectionChange={({ nodes: selected }) => props.onSelectionChange(selected.map((node) => node.id))}
        onPaneClick={() => props.onSelectionChange([])}
        defaultViewport={{ x: 20, y: 30, zoom: 0.7 }}
        minZoom={0.2}
        maxZoom={1.5}
        selectionOnDrag={false}
        panOnDrag
        panOnScroll
        elevateNodesOnSelect
        colorMode="dark"
      >
        <Background color="rgba(142,171,200,0.12)" gap={28} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      <DirectorDock mode={props.mode} onChange={props.onModeChange} />
    </section>
  );
}
