import { AlertTriangle, CheckCircle2, Film, LockKeyhole, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { DirectorResponse } from '../../../shared/directorSchemas';
import { describeReelActionReceipt } from '../reel/project';

export function DirectorArtifact({ response }: { response: DirectorResponse }) {
  return (
    <div className="director-artifacts">
      {response.directionContract && (
        <article className="artifact-card">
          <header><Sparkles size={13} /><span>DIRECTION CONTRACT</span><strong>{response.directionContract.coherence}%</strong></header>
          <h4>{response.directionContract.title}</h4>
          <p>{response.directionContract.objective}</p>
          <div className="artifact-chip-row">
            {response.directionContract.locks.slice(0, 5).map((lock) => <span key={lock}><LockKeyhole size={9} /> {lock}</span>)}
          </div>
          {response.directionContract.conflicts[0] && (
            <div className="conflict-resolution">
              <span><AlertTriangle size={10} /> Conflict resolved</span>
              <p>{response.directionContract.conflicts[0].resolution}</p>
            </div>
          )}
        </article>
      )}
      {response.sequence && (
        <article className="artifact-card">
          <header><Film size={13} /><span>VISUAL STORY</span><strong>{response.sequence.beats.length} beats</strong></header>
          <h4>{response.sequence.title}</h4>
          <p>{response.sequence.arc}</p>
          <div className="beat-strip">
            {response.sequence.beats.map((beat) => <span key={beat.id}><b>{String(beat.order).padStart(2, '0')}</b>{beat.title}</span>)}
          </div>
        </article>
      )}
      {response.continuity && (
        <article className="artifact-card">
          <header><CheckCircle2 size={13} /><span>CONTINUITY</span><strong>{response.continuity.score}%</strong></header>
          {response.continuity.findings.length === 0 ? (
            <p>No material drift found in the current sequence.</p>
          ) : response.continuity.findings.map((finding) => (
            <div className={`finding ${finding.severity}`} key={`${finding.beatId}-${finding.issue}`}>
              <b>{finding.beatId.toUpperCase()}</b>
              <p>{finding.issue}</p>
              <span>{finding.repair}</span>
            </div>
          ))}
        </article>
      )}
      {response.reelActions.length > 0 && (
        <article className="artifact-card reel-plan-artifact">
          <header><SlidersHorizontal size={13} /><span>LOCAL EDIT PLAN</span><strong>{response.reelActions.length} tools</strong></header>
          <p>Only the validated changes shown here were applied to the browser timeline. Final media rendering requires your confirmation and stays on this device.</p>
          <div className="artifact-chip-row">
            {response.reelActions.map((action, index) => {
              return <span key={`${action.type}-${index}`}>{describeReelActionReceipt(action)}</span>;
            })}
          </div>
        </article>
      )}
    </div>
  );
}
