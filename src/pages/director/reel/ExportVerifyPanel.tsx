import type { VerifyReport } from '../../../lib/verify';
import './ExportVerifyPanel.css';

export type ExportVerifyPanelProps = {
  report: VerifyReport;
  downloadName?: string;
};

const VERDICT_LABELS = {
  ok: 'Export checks passed',
  warn: 'Export checks need review',
  fail: 'Export checks found issues',
} as const;

function displayValue(value: VerifyReport['entries'][number]['value']) {
  if (value === null || value === undefined || value === '') return 'Not found';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function downloadReport(report: VerifyReport, downloadName: string) {
  const contents = `${JSON.stringify(report, null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = downloadName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Let the browser claim the object URL before releasing its backing Blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportVerifyPanel({
  report,
  downloadName = 'director-open-export-verify.json',
}: ExportVerifyPanelProps) {
  return (
    <details className="export-verify" data-verdict={report.verdict}>
      <summary>
        <span className="export-verify-dot" aria-hidden="true" />
        <span>{VERDICT_LABELS[report.verdict]}</span>
        <small>Report {report.version}</small>
      </summary>
      <div className="export-verify-popover">
        <div className="export-verify-heading">
          <strong>Verification details</strong>
          <span>{report.entries.length} inspected fields</span>
        </div>
        <p className="export-verify-note">
          This check is informational. Your MP4 download remains available regardless of the verdict.
        </p>
        <div className="export-verify-table-scroll">
          <table aria-label="Export verification fields">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Value</th>
                <th scope="col">Source box</th>
                <th scope="col">Result</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.map((entry, index) => (
                <tr key={`${entry.field}-${entry.sourceBox}-${index}`} data-status={entry.status}>
                  <th scope="row">{entry.field}</th>
                  <td>{displayValue(entry.value)}</td>
                  <td><code>{entry.sourceBox || '—'}</code></td>
                  <td><span className="export-verify-result">{entry.status}</span></td>
                  <td>{entry.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="export-verify-download"
          onClick={() => downloadReport(report, downloadName)}
        >
          Download report JSON
        </button>
      </div>
    </details>
  );
}
