import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifyReport } from '../../../lib/verify';
import { ExportVerifyPanel } from './ExportVerifyPanel';

const report = {
  version: 1,
  verdict: 'ok',
  entries: [
    {
      field: 'duration',
      value: '9.87 s',
      sourceBox: 'moov/mvhd',
      status: 'ok',
      message: 'Duration 9.87s, expected 10.00s ± 0.25s — ok.',
    },
    {
      field: 'audio',
      value: null,
      sourceBox: null,
      status: 'warn',
      message: 'No audio track is present; this export was expected to be silent.',
    },
  ],
} as unknown as VerifyReport;

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('ExportVerifyPanel', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export-verify-report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a compact verdict and expands to an accessible field table', () => {
    render(<ExportVerifyPanel report={report} />);

    const summary = screen.getByText('Export checks passed');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');

    fireEvent.click(summary);

    expect(details).toHaveAttribute('open');
    expect(screen.getByRole('table', { name: 'Export verification fields' })).toBeVisible();
    expect(screen.getByRole('rowheader', { name: 'duration' })).toBeInTheDocument();
    expect(screen.getByText('moov/mvhd')).toBeInTheDocument();
    expect(screen.getByText('Duration 9.87s, expected 10.00s ± 0.25s — ok.')).toBeInTheDocument();
    expect(screen.getByText(/MP4 download remains available regardless of the verdict/)).toBeInTheDocument();
  });

  it.each([
    ['warn', 'Export checks need review'],
    ['fail', 'Export checks found issues'],
  ] as const)('uses precise informational copy for a %s verdict', (verdict, label) => {
    render(<ExportVerifyPanel report={{ ...report, verdict }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(label).closest('details')).toHaveAttribute('data-verdict', verdict);
  });

  it('downloads the complete report as JSON and revokes its temporary object URL', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<ExportVerifyPanel report={report} downloadName="studio-export-report.json" />);
    fireEvent.click(screen.getByText('Export checks passed'));

    fireEvent.click(screen.getByRole('button', { name: 'Download report JSON' }));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const jsonBlob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(jsonBlob.type).toBe('application/json');
    await expect(readBlob(jsonBlob)).resolves.toContain('"verdict": "ok"');
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('studio-export-report.json');
    expect(anchor.href).toBe('blob:export-verify-report');
    expect(anchor.isConnected).toBe(false);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export-verify-report'));
  });
});
