import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Check, Expand, LockKeyhole, Sparkles, TriangleAlert, X } from 'lucide-react';
import type {
  ContinuityReport,
  DirectionContract,
  InheritanceChannel,
  StoryBeat,
} from '../../../shared/directorSchemas';
import type { CanvasMode, CanvasObject } from '../types';
import { INHERITANCE_LABELS } from '../types';

export type DirectorNodeData = {
  object: CanvasObject;
  mode: CanvasMode;
  contract?: DirectionContract | null;
  beat?: StoryBeat;
  continuity?: ContinuityReport['findings'][number];
  onToggleChannel: (objectId: string, channel: InheritanceChannel) => void;
  onRemove: (objectId: string) => void;
} & Record<string, unknown>;

export type DirectorFlowNode = Node<DirectorNodeData, 'director-object'>;

export function DirectorNode({ data, selected }: NodeProps<DirectorFlowNode>) {
  const { object, mode, contract, beat, continuity, onToggleChannel, onRemove } = data;
  const isContract = object.kind === 'contract';
  const isBeat = object.kind === 'beat';
  const isVisualSource = ['reference', 'upload', 'created'].includes(object.kind);
  const inspectTags = [...new Set([
    ...object.summary.subjects,
    ...object.summary.emotion,
    ...object.summary.style,
    ...object.summary.materials,
    ...object.summary.lighting,
    ...object.summary.world,
  ])].slice(0, 7);

  return (
    <article className={`director-node ${object.kind} ${selected ? 'selected' : ''} ${continuity ? 'drift' : ''}`}>
      <Handle type="target" position={Position.Left} className="director-node-handle" />
      <div className="director-node-origin">
        <span className={`origin ${object.source.toLowerCase()}`}>{object.source}</span>
        {continuity ? (
          <span className="drift-badge"><TriangleAlert size={10} /> drift</span>
        ) : object.locks.length > 0 ? (
          <span className="lock-count"><LockKeyhole size={10} /> {object.locks.length}</span>
        ) : null}
        {isVisualSource && <div className="director-node-actions">
          {object.imageUrl && <a href={object.imageUrl} target="_blank" rel="noreferrer" title="View full image" aria-label={`View full ${object.title} image`} onClick={(event) => event.stopPropagation()}><Expand size={11} /></a>}
          <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(object.id); }} aria-label={`Remove ${object.title}`}><X size={11} /></button>
        </div>}
      </div>

      {isContract ? (
        <div className="contract-node-body">
          <span className="node-kicker"><Sparkles size={11} /> Direction Contract</span>
          <h3>{contract?.title || object.title}</h3>
          <p>{contract?.objective || object.subtitle}</p>
          <div className="lock-grid">
            {(contract?.locks || object.locks).slice(0, 4).map((lock) => <span key={lock}><LockKeyhole size={9} /> {lock}</span>)}
          </div>
          {contract && <div className="coherence"><span>Coherence</span><strong>{contract.coherence}%</strong></div>}
        </div>
      ) : isBeat && beat ? (
        <div className="beat-node-body">
          <span className="beat-number">BEAT {String(beat.order).padStart(2, '0')}</span>
          <h3>{beat.title}</h3>
          <strong>{beat.emotion}</strong>
          <p>{beat.visualAction}</p>
          <div className="beat-meta"><span>{beat.camera}</span><span>{beat.motion}</span></div>
        </div>
      ) : (
        <>
          {object.imageUrl && <img className="director-node-image" src={object.previewUrl || object.imageUrl} alt={object.title} draggable={false} decoding="async" />}
          <div className="director-node-copy">
            <h3>{object.title}</h3>
            <p>{object.subtitle}</p>
            {mode === 'inspect' && inspectTags.length > 0 && (
              <div className="inspect-tags" aria-label={`Decoded attributes for ${object.title}`}>
                {inspectTags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            )}
          </div>
        </>
      )}

      {mode === 'inherit' && isVisualSource && (
        <div className="inherit-controls" aria-label={`Inheritance for ${object.title}`}>
          {(Object.keys(INHERITANCE_LABELS) as InheritanceChannel[]).map((channel) => {
            const active = object.inherit.includes(channel);
            return (
              <button
                key={channel}
                type="button"
                className={active ? 'active' : ''}
                onClick={(event) => { event.stopPropagation(); onToggleChannel(object.id, channel); }}
              >
                {active && <Check size={9} />}{INHERITANCE_LABELS[channel]}
              </button>
            );
          })}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="director-node-handle" />
    </article>
  );
}
