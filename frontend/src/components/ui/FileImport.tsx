import React, { useId, useRef, useState } from 'react';
import { BUTTON_LINK_BASE, BUTTON_VARIANTS, Button } from './Button';
import { DashedCard } from './DashedCard';
import { Icon, Upload } from './Icon';
import { List } from './List';
import { Notice } from './Notice';
import { cx } from './cx';
import { formatCount } from '../../copy/format';

type Problem = { line: number; key: string; message: string };

export type FileImportProps<Row> = {
  label: string;
  accept: '.csv';
  sampleHref?: string;
  limits: string;
  parse: (file: File) => Promise<{ rows: Row[]; problems: Problem[] }>;
  onRows: (rows: Row[]) => void;
  /**
   * Asked after the file is read and before `onRows`, for example "Replace the 3 people in your list?".
   * Answer false to keep the current rows; the summary then stays as it was.
   */
  confirmReplace?: (rows: Row[]) => boolean | Promise<boolean>;
};

type ImportState =
  | { kind: 'idle' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'read'; fileName: string; rowCount: number; problems: Problem[] }
  | { kind: 'failed'; fileName: string };

const COPY = {
  choose: 'Choose a CSV file',
  reading: 'Reading the file',
  drop: 'Or drop the file here.',
  format: 'CSV file, one person per line.',
  sample: 'Download a sample file',
  problemsLabel: 'Rows that need fixing',
  lineHeader: 'Line',
  problemHeader: 'What to fix',
  failedTitle: "Couldn't read the file",
  failedLine: 'Check that it is a CSV file and try again. Nothing was sent.',
} as const;

const PROBLEM_COLUMNS = [
  { key: 'line', header: COPY.lineHeader, cell: (problem: Problem) => String(problem.line), primary: true },
  { key: 'message', header: COPY.problemHeader, cell: (problem: Problem) => problem.message },
];

function summary(rowCount: number, problemCount: number): string {
  const read = `${formatCount(rowCount, 'row', 'rows')} read.`;
  if (problemCount === 0) return read;
  return `${read} ${problemCount} need${problemCount === 1 ? 's' : ''} fixing.`;
}

export function FileImport<Row>({ label, accept, sampleHref, limits, parse, onRows, confirmReplace }: FileImportProps<Row>) {
  const inputId = useId();
  const limitsId = `${inputId}-limits`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);

  const read = async (file: File) => {
    const before = state;
    setState({ kind: 'reading', fileName: file.name });
    try {
      const result = await parse(file);
      const replace = confirmReplace ? await confirmReplace(result.rows) : true;
      if (!replace) {
        setState(before);
        return;
      }
      setState({ kind: 'read', fileName: file.name, rowCount: result.rows.length, problems: result.problems });
      onRows(result.rows);
    } catch (problem) {
      console.warn('File import failed', problem);
      setState({ kind: 'failed', fileName: file.name });
    }
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void read(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void read(file);
  };

  const busy = state.kind === 'reading';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        data-dragging={dragging || undefined}
        className="rounded-card transition-colors duration-(--duration-fast) data-dragging:bg-brand-soft"
      >
        <DashedCard className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-pill bg-sunken text-ink-secondary">
            <Icon icon={Upload} size={24} />
          </span>
          <label htmlFor={inputId} className="text-title-item text-ink">
            {label}
          </label>
          <p id={limitsId} className="text-small text-ink-secondary">
            {limits} {COPY.format}
          </p>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={accept}
            onChange={handleFile}
            aria-describedby={limitsId}
            className="sr-only"
            tabIndex={-1}
          />
          <Button
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            busy={busy}
            busyLabel={COPY.reading}
            aria-describedby={limitsId}
          >
            {COPY.choose}
          </Button>
          <p className="text-small text-ink-muted">{COPY.drop}</p>
          {sampleHref ? (
            <a href={sampleHref} download data-inline className={cx(BUTTON_LINK_BASE, BUTTON_VARIANTS.link, 'text-small')}>
              {COPY.sample}
            </a>
          ) : null}
        </DashedCard>
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {state.kind === 'read' ? (
          <>
            <p className="text-small text-ink-secondary">
              <span className="text-ink">{state.fileName}</span> · {summary(state.rowCount, state.problems.length)}
            </p>
            {state.problems.length > 0 ? (
              <List
                label={COPY.problemsLabel}
                columns={PROBLEM_COLUMNS}
                rows={state.problems}
                rowKey={(problem) => `${problem.line}-${problem.key}`}
                state="ready"
                empty={null}
                noResults={null}
                error={null}
              />
            ) : null}
          </>
        ) : null}
        {state.kind === 'failed' ? (
          <Notice tone="danger" title={COPY.failedTitle}>
            {COPY.failedLine}
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
