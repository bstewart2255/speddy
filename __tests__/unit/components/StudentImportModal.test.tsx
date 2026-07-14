import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '../../../test-utils';
import { StudentImportModal } from '@/app/components/students/student-import-modal';
import * as detectModule from '@/lib/import/detect-import-file';

// Wrap detectImportFile in a jest.fn that defaults to the real implementation,
// so most tests exercise real detection while a few can force specific
// resolution order / failures (ESM exports aren't spy-able directly).
jest.mock('@/lib/import/detect-import-file', () => {
  const actual = jest.requireActual('@/lib/import/detect-import-file');
  return { ...actual, detectImportFile: jest.fn(actual.detectImportFile) };
});

const detectMock = () => detectModule.detectImportFile as jest.Mock;

// SPE-231: the unified drop zone detects each dropped file's type client-side,
// routes it to the right /api/import-students form key, and never nags about
// missing files (additive framing, no Required/Optional tags).

const DELIVERIES_HEADER =
  'Name,SEIS ID,Service,Delivery,Start Date,End Date,Sessions / Frequency,Location,Total Minutes (min/year),Total Delivered,Medi-Cal Billing Consent';
const ROSTER_HEADER = 'Initials,Grade,Teacher,Sessions Per Week,Minutes Per Session';
const SEIS_HEADER = 'SEIS ID,District ID,Last Name,First Name,Birthdate,Grade,School of Attendance';

const makeFile = (content: string, name: string, type = 'text/csv') => new File([content], name, { type });

const fileInput = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('file input not found');
  return input;
};

const school = { school_id: 's1', school_site: 'Mt Diablo Elementary', display_name: 'Mt Diablo Elementary' };

const renderModal = (props: Partial<React.ComponentProps<typeof StudentImportModal>> = {}) =>
  render(
    <StudentImportModal
      isOpen
      onClose={() => {}}
      onUploadComplete={() => {}}
      currentSchool={school}
      {...props}
    />
  );

describe('StudentImportModal (SPE-231)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the additive empty state with no Required/Optional tags and Import disabled', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Import Students' })).toBeInTheDocument();
    expect(screen.getByText(/Any one file is enough to start/i)).toBeInTheDocument();
    expect(screen.getByText(/Download the roster template/i)).toBeInTheDocument();
    expect(screen.getByText(/Importing to:/i).closest('div')).toHaveTextContent('Importing to: Mt Diablo Elementary');

    // Additive framing: never any requiredness tags.
    expect(screen.queryByText(/Optional/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Required/i)).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled();
  });

  it('detects a Deliveries CSV, labels its contribution, and enables Import', async () => {
    const { container } = renderModal();
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile(`${DELIVERIES_HEADER}\n"A, B",1,330`, 'deliveries.csv')] },
    });

    expect(await screen.findByText('deliveries.csv')).toBeInTheDocument();
    expect(screen.getByText(/Fills in schedules/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Import 1 file/i })).toBeEnabled());
  });

  it('detects a SEIS student/goals CSV as students & goals', async () => {
    const { container } = renderModal();
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile(`${SEIS_HEADER}\n1,2,Doe,Jane,,3,Mt Diablo`, 'goals.csv')] },
    });

    expect(await screen.findByText('goals.csv')).toBeInTheDocument();
    expect(screen.getByText(/Fills in students & goals/i)).toBeInTheDocument();
  });

  it('flags a roster template as not importable here and keeps Import disabled', async () => {
    const { container } = renderModal();
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile(`${ROSTER_HEADER}\nJD,3,Smith`, 'roster.csv')] },
    });

    expect(await screen.findByText('roster.csv')).toBeInTheDocument();
    expect(screen.getByText(/Import CSV.*for now/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled();
  });

  it('rejects an unsupported file with an actionable error and keeps Import disabled', async () => {
    const { container } = renderModal();
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile('whatever', 'ParentLetter.docx', 'application/octet-stream')] },
    });

    expect(await screen.findByText('ParentLetter.docx')).toBeInTheDocument();
    expect(screen.getByText(/Accepted: \.xlsx, \.xls, \.csv, \.txt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled();
  });

  it('replace-last: a second file of the same type replaces the first, with a notice', async () => {
    const { container } = renderModal();
    const input = fileInput(container);

    fireEvent.change(input, { target: { files: [makeFile(DELIVERIES_HEADER, 'first.csv')] } });
    expect(await screen.findByText('first.csv')).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [makeFile(DELIVERIES_HEADER, 'second.csv')] } });
    expect(await screen.findByText('second.csv')).toBeInTheDocument();
    expect(screen.queryByText('first.csv')).not.toBeInTheDocument();
    expect(screen.getByText(/replaced first\.csv/i)).toBeInTheDocument();
  });

  it('replace-last honors pick order even when header detection resolves out of order', async () => {
    // Force the FIRST-picked file's detection to resolve LAST (Codex P2 race):
    // the older pick must never splice out the newer one.
    let resolveFirst!: (t: detectModule.DetectedImportType) => void;
    const firstPending = new Promise<detectModule.DetectedImportType>((r) => {
      resolveFirst = r;
    });
    detectMock()
      .mockImplementationOnce(() => firstPending) // A (picked first) — pending
      .mockImplementationOnce(() => Promise.resolve('deliveries')); // B (picked second) — immediate

    const { container } = renderModal();
    const input = fileInput(container);

    fireEvent.change(input, { target: { files: [makeFile(DELIVERIES_HEADER, 'A.csv')] } });
    fireEvent.change(input, { target: { files: [makeFile(DELIVERIES_HEADER, 'B.csv')] } });

    // B (last picked) shows first because its detection resolved first.
    expect(await screen.findByText('B.csv')).toBeInTheDocument();

    // A's detection lands late — it must NOT replace B.
    resolveFirst('deliveries');
    await waitFor(() => expect(screen.getByRole('button', { name: /Import 1 file/i })).toBeEnabled());
    expect(screen.getByText('B.csv')).toBeInTheDocument();
    expect(screen.queryByText('A.csv')).not.toBeInTheDocument();
  });

  it('surfaces a per-file error when detection fails, without dropping the rest of the batch', async () => {
    detectMock()
      .mockRejectedValueOnce(new Error('read failed')) // bad.csv
      .mockResolvedValueOnce('deliveries'); // good.csv

    const { container } = renderModal();
    fireEvent.change(fileInput(container), {
      target: { files: [makeFile('x', 'bad.csv'), makeFile(DELIVERIES_HEADER, 'good.csv')] },
    });

    expect(await screen.findByText('good.csv')).toBeInTheDocument();
    expect(screen.getByText('bad.csv')).toBeInTheDocument();
    expect(screen.getByText(/Could not read this file/i)).toBeInTheDocument();
    // The readable file is still importable.
    await waitFor(() => expect(screen.getByRole('button', { name: /Import 1 file/i })).toBeEnabled());
  });

  it('discards a detection result when the modal is reset mid-detection', async () => {
    let resolveDetect!: (t: detectModule.DetectedImportType) => void;
    detectMock().mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveDetect = r;
        })
    );

    const { container } = renderModal();
    fireEvent.change(fileInput(container), { target: { files: [makeFile(DELIVERIES_HEADER, 'x.csv')] } });

    // Reset the modal (Cancel) before detection resolves.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // The stale detection lands afterward — it must not repopulate the modal.
    await act(async () => {
      resolveDetect('deliveries');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('x.csv')).not.toBeInTheDocument();
  });

  it('submits detected files under the right form keys and reports the result', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { summary: { total: 1 } } }),
    });
    const onUploadComplete = jest.fn();
    const { container } = renderModal({ onUploadComplete });

    fireEvent.change(fileInput(container), {
      target: { files: [makeFile(DELIVERIES_HEADER, 'deliveries.csv')] },
    });
    await screen.findByText('deliveries.csv');

    fireEvent.click(screen.getByRole('button', { name: /Import 1 file/i }));

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith({ summary: { total: 1 } }));

    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as FormData;
    expect(body.get('deliveriesFile')).toBeInstanceOf(File);
    expect(body.get('studentsFile')).toBeNull();
    expect(body.get('currentSchoolId')).toBe('s1');
  });
});
