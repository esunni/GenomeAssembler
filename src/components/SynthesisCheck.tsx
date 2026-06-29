import { ChangeEvent, DragEvent, ReactNode, useMemo, useState } from 'react';

import {
  analyzeSynthesis,
  CONSTRAINTS,
  CONSTRAINT_ORDER,
  parseSequenceInput,
  type ConstraintType,
  type SequenceIssue,
  type SynthesisReport,
} from '../utils/synthesisConstraints';

const LINE_LENGTH = 60;
const FULL_VIEW_LIMIT = 20000;
const FLANK = 20;

// averageGc spans the whole sequence, so it is reported in the summary/table
// rather than painted onto every base.
const HIGHLIGHTABLE = CONSTRAINT_ORDER.filter((type) => type !== 'averageGc');

function formatRange(start: number, end: number): string {
  return start + 1 === end ? `${end}` : `${start + 1}–${end}`;
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

  const handleFile = async (file: File) => {
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Unable to read the file.'));
        reader.readAsText(file);
      });
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

  const handleClear = () => {
    setInputText('');
    setFileName('');
    setReport(null);
    setErrorMessage(null);
    setFocusedIssue(null);
  };

  const toggleType = (type: ConstraintType) => {
    setEnabledTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Issues that are painted onto the sequence (excludes averageGc), filtered by
  // the legend toggles.
  const highlightIssues = useMemo(() => {
    if (!report) return [] as SequenceIssue[];
    return report.issues.filter(
      (issue) => issue.type !== 'averageGc' && enabledTypes.has(issue.type),
    );
  }, [report, enabledTypes]);

  // For every base, the index (into highlightIssues) of the highest-priority
  // issue covering it, or -1.
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

  const jumpToIssue = (issue: SequenceIssue) => {
    setFocusedIssue(issue);
    if (issue.type === 'averageGc') return;
    if (viewMode !== 'full') {
      setViewMode('full');
    }
    const index = highlightIssues.indexOf(issue);
    if (index < 0) return;
    // Defer so the element exists if we just switched to full view.
    window.setTimeout(() => {
      document.getElementById(`syn-issue-${index}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 0);
  };

  const renderSegment = (
    seq: string,
    from: number,
    to: number,
    issueIndex: number,
    key: string,
  ): ReactNode => {
    const text = seq.slice(from, to);
    if (issueIndex < 0) return <span key={key}>{text}</span>;
    const issue = highlightIssues[issueIndex];
    const meta = CONSTRAINTS[issue.type];
    const isStart = from === issue.start;
    const focused = focusedIssue === issue;
    return (
      <span
        key={key}
        id={isStart ? `syn-issue-${issueIndex}` : undefined}
        className={`syn-hl${focused ? ' is-focused' : ''}`}
        style={{ backgroundColor: `${meta.color}26`, borderBottom: `2px solid ${meta.color}` }}
        title={`${meta.label}: ${issue.reason}`}
      >
        {text}
      </span>
    );
  };

  const renderFullView = (seq: string): ReactNode => {
    const lines: ReactNode[] = [];
    for (let lineStart = 0; lineStart < seq.length; lineStart += LINE_LENGTH) {
      const lineEnd = Math.min(lineStart + LINE_LENGTH, seq.length);
      const segments: ReactNode[] = [];
      let segStart = lineStart;
      while (segStart < lineEnd) {
        const issueIndex = baseToIssue[segStart];
        let segEnd = segStart + 1;
        while (segEnd < lineEnd && baseToIssue[segEnd] === issueIndex) segEnd += 1;
        segments.push(renderSegment(seq, segStart, segEnd, issueIndex, `${segStart}`));
        segStart = segEnd;
      }
      lines.push(
        <div className="syn-line" key={lineStart}>
          <span className="syn-gutter">{(lineStart + 1).toLocaleString()}</span>
          <span className="syn-line-seq">{segments}</span>
        </div>,
      );
    }
    return <div className="syn-sequence">{lines}</div>;
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

        <div className="synthesis-input">
          <textarea
            className="synthesis-textarea"
            aria-label="Paste sequence"
            placeholder="…or paste a raw sequence / FASTA here"
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
        </>
      ) : (
        <p className="muted" style={{ marginTop: '1.5rem' }}>
          Paste a sequence or upload a FASTA file to check it for features that block gene synthesis.
        </p>
      )}
    </div>
  );
}
