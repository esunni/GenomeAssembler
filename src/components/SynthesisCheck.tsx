import { ChangeEvent, CSSProperties, DragEvent, ReactNode, useMemo, useState } from 'react';

import {
  analyzeSynthesis,
  CONSTRAINTS,
  CONSTRAINT_ORDER,
  parseSequenceInput,
  type ConstraintType,
  type SequenceIssue,
  type SynthesisReport,
} from '../utils/synthesisConstraints';
import {
  locateOrfs,
  parseProdigalCds,
  translateCodon,
  type LocatedOrf,
  type LocationResult,
  type ProdigalOrf,
} from '../utils/prodigalTools';

const LINE_LENGTH = 60;
const FULL_VIEW_LIMIT = 20000;
const FLANK = 20;

// Strand colours for the ORF overlay (distinct from the constraint palette).
const ORF_PLUS = '#1d4ed8';
const ORF_MINUS = '#db2777';

function formatRange(start: number, end: number): string {
  return start + 1 === end ? `${end}` : `${start + 1}–${end}`;
}

function orfShortLabel(orf: ProdigalOrf): string {
  const i = orf.id.lastIndexOf('_');
  return i >= 0 ? `ORF${orf.id.slice(i + 1)}` : orf.id;
}

function orfTitle(orf: LocatedOrf): string {
  const flags = [];
  if (orf.startType) flags.push(`start ${orf.startType}`);
  if (orf.partial && orf.partial !== '00') flags.push('partial');
  if (orf.clipped) flags.push('clipped to view');
  return `${orf.id} (${orf.strand}) · genome ${orf.genomeStart}–${orf.genomeEnd}${
    flags.length ? ` · ${flags.join(', ')}` : ''
  }`;
}

export function SynthesisCheck() {
  const [inputText, setInputText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<SynthesisReport | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<ConstraintType>>(
    () => new Set(CONSTRAINT_ORDER),
  );
  const [viewMode, setViewMode] = useState<'full' | 'issues'>('full');
  const [focusedIssue, setFocusedIssue] = useState<SequenceIssue | null>(null);

  // Prodigal ORF overlay.
  const [prodigalOrfs, setProdigalOrfs] = useState<ProdigalOrf[] | null>(null);
  const [prodigalFileName, setProdigalFileName] = useState('');
  const [prodigalError, setProdigalError] = useState<string | null>(null);
  const [showOrfs, setShowOrfs] = useState(true);

  const runAnalysis = (text: string) => {
    try {
      const parsed = parseSequenceInput(text);
      const result = analyzeSynthesis(parsed);
      setReport(result);
      setErrorMessage(null);
      setFocusedIssue(null);
      setViewMode(result.length > FULL_VIEW_LIMIT ? 'issues' : 'full');
    } catch (error) {
      setReport(null);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to analyse the sequence.');
    }
  };

  const readFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read the file.'));
      reader.readAsText(file);
    });

  const handleFile = async (file: File) => {
    try {
      const text = await readFile(file);
      setInputText(text);
      setFileName(file.name);
      runAnalysis(text);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to read the file.');
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await handleFile(file);
    } finally {
      event.target.value = '';
    }
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleFile(file);
  };

  const handleProdigalUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFile(file);
      const orfs = parseProdigalCds(text);
      setProdigalOrfs(orfs);
      setProdigalFileName(file.name);
      setProdigalError(null);
      setShowOrfs(true);
    } catch (error) {
      setProdigalOrfs(null);
      setProdigalFileName(file.name);
      setProdigalError(error instanceof Error ? error.message : 'Unable to read the CDS file.');
    } finally {
      event.target.value = '';
    }
  };

  const clearProdigal = () => {
    setProdigalOrfs(null);
    setProdigalFileName('');
    setProdigalError(null);
  };

  const handleClear = () => {
    setInputText('');
    setFileName('');
    setReport(null);
    setErrorMessage(null);
    setFocusedIssue(null);
    clearProdigal();
  };

  const toggleType = (type: ConstraintType) => {
    setEnabledTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Issues painted onto the sequence (excludes averageGc), filtered by toggles.
  const highlightIssues = useMemo(() => {
    if (!report) return [] as SequenceIssue[];
    return report.issues.filter(
      (issue) => issue.type !== 'averageGc' && enabledTypes.has(issue.type),
    );
  }, [report, enabledTypes]);

  const baseToIssue = useMemo(() => {
    if (!report) return new Int32Array(0);
    const map = new Int32Array(report.length).fill(-1);
    const order = highlightIssues
      .map((_, index) => index)
      .sort(
        (a, b) =>
          CONSTRAINTS[highlightIssues[a].type].priority -
          CONSTRAINTS[highlightIssues[b].type].priority,
      );
    for (const index of order) {
      const issue = highlightIssues[index];
      for (let p = issue.start; p < issue.end; p += 1) map[p] = index;
    }
    return map;
  }, [report, highlightIssues]);

  const tableIssues = useMemo(() => {
    if (!report) return [] as SequenceIssue[];
    return report.issues.filter((issue) => enabledTypes.has(issue.type));
  }, [report, enabledTypes]);

  // Locate the Prodigal ORFs within the analysed sequence.
  const location = useMemo<LocationResult | null>(() => {
    if (!report || !prodigalOrfs) return null;
    return locateOrfs(report.sequence, prodigalOrfs);
  }, [report, prodigalOrfs]);

  const locatedOrfs = useMemo(() => (location?.located ? location.orfs : []), [location]);
  const orfsActive = showOrfs && locatedOrfs.length > 0;

  const baseToOrf = useMemo(() => {
    if (!report) return new Int32Array(0);
    const map = new Int32Array(report.length).fill(-1);
    locatedOrfs.forEach((orf, index) => {
      for (let p = orf.visibleStart; p < orf.visibleEnd; p += 1) map[p] = index;
    });
    return map;
  }, [report, locatedOrfs]);

  // Amino acid to display under each base. A codon's residue is placed under its
  // middle base, mapped onto the (plus-strand) pasted coordinates for both
  // strands.
  const aaCells = useMemo(() => {
    if (!report) return [] as ({ char: string; orfIndex: number } | null)[];
    const cells: ({ char: string; orfIndex: number } | null)[] = new Array(report.length).fill(null);
    locatedOrfs.forEach((orf, oi) => {
      const codons = Math.floor(orf.sequence.length / 3);
      for (let c = 0; c < codons; c += 1) {
        let aa = translateCodon(orf.sequence.slice(c * 3, c * 3 + 3));
        if (c === 0 && orf.startType) aa = 'M'; // alternative start codons read as M
        const mid =
          orf.strand === '+' ? orf.pastedStart + 3 * c + 1 : orf.pastedEnd - 2 - 3 * c;
        if (mid >= 0 && mid < report.length) cells[mid] = { char: aa, orfIndex: oi };
      }
    });
    return cells;
  }, [report, locatedOrfs]);

  const jumpToIssue = (issue: SequenceIssue) => {
    setFocusedIssue(issue);
    if (issue.type === 'averageGc') return;
    if (viewMode !== 'full') setViewMode('full');
    const index = highlightIssues.indexOf(issue);
    if (index < 0) return;
    window.setTimeout(() => {
      document
        .getElementById(`syn-issue-${index}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const jumpToOrf = (orf: LocatedOrf) => {
    if (viewMode !== 'full') setViewMode('full');
    const line = Math.floor(orf.visibleStart / LINE_LENGTH) * LINE_LENGTH;
    window.setTimeout(() => {
      document
        .getElementById(`syn-line-${line}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const renderSegment = (
    seq: string,
    from: number,
    to: number,
    issueIndex: number,
    orfIndex: number,
    key: string,
  ): ReactNode => {
    const text = seq.slice(from, to);
    const issue = issueIndex >= 0 ? highlightIssues[issueIndex] : null;
    const orf = orfIndex >= 0 ? locatedOrfs[orfIndex] : null;
    if (!issue && !orf) return <span key={key}>{text}</span>;

    const issueMeta = issue ? CONSTRAINTS[issue.type] : null;
    const strandColor = orf ? (orf.strand === '+' ? ORF_PLUS : ORF_MINUS) : '';
    const style: CSSProperties = {};
    if (issueMeta) style.backgroundColor = `${issueMeta.color}26`;
    else if (orf) style.backgroundColor = `${strandColor}12`;
    if (issueMeta) style.borderBottom = `2px solid ${issueMeta.color}`;
    if (orf) style.borderTop = `2px solid ${strandColor}`;

    const titleParts: string[] = [];
    if (issue && issueMeta) titleParts.push(`${issueMeta.label}: ${issue.reason}`);
    if (orf) titleParts.push(orfTitle(orf));

    return (
      <span
        key={key}
        id={issue && from === issue.start ? `syn-issue-${issueIndex}` : undefined}
        className={`syn-hl${issue && focusedIssue === issue ? ' is-focused' : ''}`}
        style={style}
        title={titleParts.join(' | ')}
      >
        {text}
      </span>
    );
  };

  const renderTrackLine = (lineStart: number, lineEnd: number): ReactNode => {
    const cols = lineEnd - lineStart;
    const cells = Array.from({ length: cols }, () => ({ char: ' ', orfIndex: -1 }));

    for (let c = 0; c < cols; c += 1) {
      const pos = lineStart + c;
      const oi = baseToOrf[pos];
      if (oi < 0) continue;
      const orf = locatedOrfs[oi];
      let char = '─';
      if (orf.strand === '+' && pos === orf.pastedEnd - 1) char = '▶';
      else if (orf.strand === '-' && pos === orf.pastedStart) char = '◀';
      cells[c] = { char, orfIndex: oi };
    }

    // Stamp a short ORF label near the centre of each ORF (when there is room).
    locatedOrfs.forEach((orf, oi) => {
      const label = orfShortLabel(orf);
      if (orf.visibleEnd - orf.visibleStart < label.length + 2) return;
      const labelStart = Math.floor((orf.visibleStart + orf.visibleEnd) / 2 - label.length / 2);
      for (let k = 0; k < label.length; k += 1) {
        const pos = labelStart + k;
        if (pos < lineStart || pos >= lineEnd) continue;
        const c = pos - lineStart;
        if (cells[c].char === '▶' || cells[c].char === '◀') continue;
        cells[c] = { char: label[k], orfIndex: oi };
      }
    });

    const spans: ReactNode[] = [];
    let i = 0;
    while (i < cols) {
      const oi = cells[i].orfIndex;
      let j = i + 1;
      while (j < cols && cells[j].orfIndex === oi) j += 1;
      const text = cells
        .slice(i, j)
        .map((cell) => cell.char)
        .join('');
      if (oi < 0) {
        spans.push(<span key={i}>{text}</span>);
      } else {
        const orf = locatedOrfs[oi];
        spans.push(
          <span
            key={i}
            className="syn-orf-track-seg"
            style={{ color: orf.strand === '+' ? ORF_PLUS : ORF_MINUS }}
            title={orfTitle(orf)}
          >
            {text}
          </span>,
        );
      }
      i = j;
    }

    return (
      <div className="syn-line syn-track-line">
        <span className="syn-gutter" />
        <span className="syn-line-seq">{spans}</span>
      </div>
    );
  };

  const renderAaLine = (lineStart: number, lineEnd: number): ReactNode => {
    const cols = lineEnd - lineStart;
    const spans: ReactNode[] = [];
    let i = 0;
    while (i < cols) {
      const cell = aaCells[lineStart + i];
      const oi = cell ? cell.orfIndex : -1;
      let j = i + 1;
      while (j < cols) {
        const next = aaCells[lineStart + j];
        if ((next ? next.orfIndex : -1) !== oi) break;
        j += 1;
      }
      const text = Array.from({ length: j - i }, (_, c) => aaCells[lineStart + i + c]?.char ?? ' ').join('');
      if (oi < 0) {
        spans.push(<span key={i}>{text}</span>);
      } else {
        const orf = locatedOrfs[oi];
        spans.push(
          <span
            key={i}
            className="syn-aa-seg"
            style={{ color: orf.strand === '+' ? ORF_PLUS : ORF_MINUS }}
            title={orfTitle(orf)}
          >
            {text}
          </span>,
        );
      }
      i = j;
    }
    return (
      <div className="syn-line syn-aa-line">
        <span className="syn-gutter" />
        <span className="syn-line-seq">{spans}</span>
      </div>
    );
  };

  const renderFullView = (seq: string): ReactNode => {
    const groups: ReactNode[] = [];
    for (let lineStart = 0; lineStart < seq.length; lineStart += LINE_LENGTH) {
      const lineEnd = Math.min(lineStart + LINE_LENGTH, seq.length);

      let trackRow: ReactNode = null;
      let aaRow: ReactNode = null;
      if (orfsActive) {
        let hasOrf = false;
        for (let p = lineStart; p < lineEnd; p += 1) {
          if (baseToOrf[p] >= 0) {
            hasOrf = true;
            break;
          }
        }
        if (hasOrf) {
          trackRow = renderTrackLine(lineStart, lineEnd);
          aaRow = renderAaLine(lineStart, lineEnd);
        }
      }

      const segments: ReactNode[] = [];
      let segStart = lineStart;
      while (segStart < lineEnd) {
        const issueIndex = baseToIssue[segStart];
        const orfIndex = orfsActive ? baseToOrf[segStart] : -1;
        let segEnd = segStart + 1;
        while (
          segEnd < lineEnd &&
          baseToIssue[segEnd] === issueIndex &&
          (orfsActive ? baseToOrf[segEnd] : -1) === orfIndex
        ) {
          segEnd += 1;
        }
        segments.push(renderSegment(seq, segStart, segEnd, issueIndex, orfIndex, `${segStart}`));
        segStart = segEnd;
      }

      groups.push(
        <div className="syn-line-group" id={`syn-line-${lineStart}`} key={lineStart}>
          {trackRow}
          <div className="syn-line">
            <span className="syn-gutter">{(lineStart + 1).toLocaleString()}</span>
            <span className="syn-line-seq">{segments}</span>
          </div>
          {aaRow}
        </div>,
      );
    }
    return <div className="syn-sequence">{groups}</div>;
  };

  const renderIssuesView = (seq: string): ReactNode => {
    if (highlightIssues.length === 0) {
      return <p className="muted">No highlighted regions for the selected categories.</p>;
    }
    return (
      <div className="syn-snippets">
        {highlightIssues.map((issue, index) => {
          const meta = CONSTRAINTS[issue.type];
          const ctxStart = Math.max(0, issue.start - FLANK);
          const ctxEnd = Math.min(seq.length, issue.end + FLANK);
          const focused = focusedIssue === issue;
          return (
            <div
              key={`${issue.type}-${issue.start}-${index}`}
              id={`syn-issue-${index}`}
              className={`syn-snippet${focused ? ' is-focused' : ''}`}
            >
              <div className="syn-snippet-header">
                <span className="syn-color-dot" style={{ backgroundColor: meta.color }} />
                <strong>{meta.label}</strong>
                <span className="syn-snippet-pos">
                  {formatRange(issue.start, issue.end)} · {issue.length} bp
                </span>
              </div>
              <code className="syn-snippet-seq">
                {ctxStart > 0 ? '…' : ''}
                <span className="muted">{seq.slice(ctxStart, issue.start)}</span>
                <span
                  className="syn-hl"
                  style={{
                    backgroundColor: `${meta.color}26`,
                    borderBottom: `2px solid ${meta.color}`,
                  }}
                >
                  {seq.slice(issue.start, issue.end)}
                </span>
                <span className="muted">{seq.slice(issue.end, ctxEnd)}</span>
                {ctxEnd < seq.length ? '…' : ''}
              </code>
              <p className="syn-snippet-reason">{issue.reason}</p>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="synthesis-page">
      <div className="design-controls">
        <div className="synthesis-input">
          <textarea
            className="synthesis-textarea"
            aria-label="Paste sequence"
            placeholder="Paste a raw sequence / FASTA here…"
            value={inputText}
            spellCheck={false}
            onChange={(event) => {
              setInputText(event.target.value);
              if (fileName) setFileName('');
            }}
          />
          <div className="synthesis-input-actions">
            <button type="button" className="synthesis-analyze" onClick={() => runAnalysis(inputText)}>
              Analyze
            </button>
            <button type="button" className="ghost" onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>

        <label
          className={`design-upload-zone${isDragActive ? ' is-drag-active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setIsDragActive(false);
          }}
          onDrop={(event) => void handleDrop(event)}
        >
          <input
            aria-label="Upload sequence FASTA"
            className="design-file-input"
            type="file"
            accept=".fa,.fasta,.fna,.txt,text/plain"
            onChange={(event) => void handleUpload(event)}
          />
          {fileName ? (
            <span className="design-upload-file">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {fileName}
            </span>
          ) : (
            <span className="design-upload-placeholder">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 16V4M12 4L8 8M12 4L16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Drop FASTA file here
            </span>
          )}
        </label>
      </div>

      <div className="synthesis-prodigal">
        <div className="synthesis-prodigal-head">
          <div className="synthesis-prodigal-title">
            <strong>ORF overlay</strong>
            <span className="muted"> · Prodigal CDS nucleotide file (*_cds.fna)</span>
          </div>
          <label className="synthesis-prodigal-upload">
            <input
              type="file"
              accept=".fna,.fasta,.fa,.txt,text/plain"
              onChange={(event) => void handleProdigalUpload(event)}
            />
            <span>{prodigalFileName || 'Choose CDS file…'}</span>
          </label>
          {prodigalOrfs ? (
            <button type="button" className="ghost" onClick={clearProdigal}>
              Remove
            </button>
          ) : null}
        </div>

        {prodigalError ? <p className="design-error">{prodigalError}</p> : null}
        {prodigalOrfs && !report ? (
          <p className="muted">Analyze a sequence above to overlay its ORFs.</p>
        ) : null}
        {prodigalOrfs && report && location ? (
          location.located ? (
            <div className="synthesis-prodigal-status">
              <label className="syn-orf-toggle">
                <input
                  type="checkbox"
                  checked={showOrfs}
                  onChange={(event) => setShowOrfs(event.target.checked)}
                />
                Show ORFs
              </label>
              <span className="muted">
                ✓ Located {locatedOrfs.length} ORF{locatedOrfs.length === 1 ? '' : 's'} in view ·
                genome offset {((location.offset ?? 0) + 1).toLocaleString()} ·{' '}
                <span style={{ color: ORF_PLUS }}>▶ + strand</span>,{' '}
                <span style={{ color: ORF_MINUS }}>◀ − strand</span>
              </span>
            </div>
          ) : (
            <p className="synthesis-note">
              Could not locate this sequence within the Prodigal genome. Make sure the pasted
              sequence is an exact part of the assembly Prodigal was run on (no edits) and long
              enough to contain at least one complete ORF.
            </p>
          )
        ) : null}
      </div>

      {errorMessage ? <p className="design-error">{errorMessage}</p> : null}

      {report ? (
        <>
          <section className="design-summary synthesis-summary">
            <p className="design-summary-line">
              <span
                className="design-summary-count"
                style={{ color: report.passed ? '#15803d' : '#b91c1c' }}
              >
                {report.passed
                  ? 'Synthesizable'
                  : `${report.issues.length} issue${report.issues.length === 1 ? '' : 's'} found`}
              </span>
              <span className="design-summary-pattern">
                {report.length.toLocaleString()} bp · GC {(report.gcContent * 100).toFixed(1)}%
              </span>
            </p>

            <div className="synthesis-cards">
              {CONSTRAINT_ORDER.map((type) => {
                const meta = CONSTRAINTS[type];
                const count = report.countsByType[type];
                const enabled = enabledTypes.has(type);
                return (
                  <button
                    type="button"
                    key={type}
                    className={`synthesis-card${count > 0 ? ' has-issues' : ''}${
                      enabled ? '' : ' is-disabled'
                    }`}
                    onClick={() => toggleType(type)}
                    aria-pressed={enabled}
                    title={`${enabled ? 'Hide' : 'Show'} ${meta.label}`}
                  >
                    <span className="synthesis-card-top">
                      <span className="syn-color-dot" style={{ backgroundColor: meta.color }} />
                      <span className="synthesis-card-label">{meta.label}</span>
                      <span className={`synthesis-card-count${count > 0 ? ' bad' : ' ok'}`}>
                        {count > 0 ? count : '✓'}
                      </span>
                    </span>
                    <span className="synthesis-card-range">{meta.range}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="synthesis-view-controls">
            <h3>Sequence</h3>
            <div className="synthesis-view-toggle" role="group" aria-label="Sequence view mode">
              <button
                type="button"
                className={viewMode === 'full' ? 'is-active' : ''}
                onClick={() => setViewMode('full')}
              >
                Full sequence
              </button>
              <button
                type="button"
                className={viewMode === 'issues' ? 'is-active' : ''}
                onClick={() => setViewMode('issues')}
              >
                Problem regions
              </button>
            </div>
          </div>

          {viewMode === 'full' && report.length > FULL_VIEW_LIMIT ? (
            <p className="synthesis-note">
              This sequence is {report.length.toLocaleString()} bp. Rendering the full sequence may be
              slow — switch to <strong>Problem regions</strong> for a focused view.
            </p>
          ) : null}

          {viewMode === 'full' ? renderFullView(report.sequence) : renderIssuesView(report.sequence)}

          <section className="synthesis-table-section">
            <h3>Issues ({tableIssues.length})</h3>
            {tableIssues.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Region (bp)</th>
                      <th>Length</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableIssues.map((issue, index) => {
                      const meta = CONSTRAINTS[issue.type];
                      return (
                        <tr
                          key={`${issue.type}-${issue.start}-${index}`}
                          className={`synthesis-issue-row${focusedIssue === issue ? ' is-focused' : ''}`}
                          onClick={() => jumpToIssue(issue)}
                        >
                          <td>
                            <span className="syn-color-dot" style={{ backgroundColor: meta.color }} />
                            {meta.label}
                          </td>
                          <td>{issue.type === 'averageGc' ? 'whole sequence' : formatRange(issue.start, issue.end)}</td>
                          <td>{issue.length.toLocaleString()}</td>
                          <td className="synthesis-issue-reason">{issue.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                {report.passed
                  ? 'No synthesis constraints were violated. This sequence looks synthesizable.'
                  : 'No issues for the selected categories. Re-enable categories above to see more.'}
              </p>
            )}
          </section>

          {location?.located ? (
            <section className="synthesis-table-section">
              <h3>ORFs ({locatedOrfs.length})</h3>
              {locatedOrfs.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ORF</th>
                        <th>Region (bp)</th>
                        <th>Strand</th>
                        <th>Length</th>
                        <th>Start</th>
                        <th>Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locatedOrfs.map((orf) => (
                        <tr
                          key={orf.id}
                          className="synthesis-issue-row"
                          onClick={() => jumpToOrf(orf)}
                        >
                          <td>
                            <span
                              className="syn-color-dot"
                              style={{ backgroundColor: orf.strand === '+' ? ORF_PLUS : ORF_MINUS }}
                            />
                            {orf.id}
                          </td>
                          <td>{formatRange(orf.visibleStart, orf.visibleEnd)}</td>
                          <td>{orf.strand}</td>
                          <td>{(orf.genomeEnd - orf.genomeStart + 1).toLocaleString()}</td>
                          <td>{orf.startType || '—'}</td>
                          <td>
                            {orf.partial && orf.partial !== '00' ? (
                              <span className="syn-orf-tag">partial</span>
                            ) : null}
                            {orf.clipped ? <span className="syn-orf-tag">clipped</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No ORFs fall within this sequence.</p>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
