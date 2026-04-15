import { useState, ChangeEvent, DragEvent } from 'react';
import { CdsRegion } from '../utils/mutationTools';
import { Promoter, parsePromoters, calculateSearchWindows, SearchWindow } from '../utils/searchWindowTools';

interface SearchWindowFinderProps {
  sequenceLength: number;
  cdsRegions: CdsRegion[];
}

export function SearchWindowFinder({ sequenceLength, cdsRegions }: SearchWindowFinderProps) {
  const [promoterFileName, setPromoterFileName] = useState('');
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  const [maxFragmentLength, setMaxFragmentLength] = useState(1800);
  const [promoterFirst, setPromoterFirst] = useState(false);
  const [orfConservation, setOrfConservation] = useState(false);

  const [searchWindows, setSearchWindows] = useState<SearchWindow[] | null>(null);

  const handlePromoterFile = async (file: File) => {
    const text = await file.text();
    const parsed = parsePromoters(text);
    setPromoters(parsed);
    setPromoterFileName(file.name);
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handlePromoterFile(file);
    event.target.value = '';
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handlePromoterFile(file);
  };

  const handleFindWindows = () => {
    const windows = calculateSearchWindows(sequenceLength, maxFragmentLength, cdsRegions, promoters, {
      promoterFirst,
      orfConservation
    });
    setSearchWindows(windows);
  };

  return (
    <section className="section-card" style={{ marginTop: '2rem' }}>
      <div className="section-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Search Window Finding</h2>
        <p className="page-copy">
          Upload genome promoter info and configure constraints to find optimal regions (30bp) for splitting your fragments.
        </p>
      </div>

      <div className="design-controls" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <label
          className={`design-upload-zone${isDragActive ? ' is-drag-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragActive(true); }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setIsDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <input
            aria-label="Upload promoter info"
            className="design-file-input"
            type="file"
            accept=".txt,.csv,text/plain"
            onChange={handleUpload}
          />
          {promoterFileName ? (
            <span className="design-upload-file">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"/><path d="M14 2V8H20"/></svg>
              {promoterFileName} ({promoters.length} found)
            </span>
          ) : (
            <span className="design-upload-placeholder">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M12 4L8 8M12 4L16 8"/><path d="M3 15V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V15"/></svg>
              Drop Promoter info file here
            </span>
          )}
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '300px' }}>
          <label className="design-select-field">
            <span>Max fragment length (bp)</span>
            <input 
              type="number" 
              value={maxFragmentLength} 
              onChange={(e) => setMaxFragmentLength(Number(e.target.value))}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--line-strong)' }}
            />
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={promoterFirst}
                onChange={(e) => setPromoterFirst(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </div>
            Promoter-first option
          </label>
          <p className="muted" style={{ margin: '-0.5rem 0 0 2.5rem', fontSize: '0.8rem' }}>Find the range in the promoter region if possible.</p>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={orfConservation}
                onChange={(e) => setOrfConservation(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </div>
            ORF-conservation option
          </label>
          <p className="muted" style={{ margin: '-0.5rem 0 0 2.5rem', fontSize: '0.8rem' }}>Cut fragments in intergenic region if possible.</p>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-start' }}>
        <button 
          className="primary-cta"
          onClick={handleFindWindows}
        >
          Find Search Windows
        </button>
      </div>

      {searchWindows && (
        <div className="design-results-panel" style={{ marginTop: '2rem', borderTop: 'none', paddingTop: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Recommended Search Windows</h3>
          </div>
          
          <div className="table-wrap" style={{ marginBottom: '1.5rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Window Start</th>
                  <th>Window End</th>
                  <th>Length</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {searchWindows.map((win, idx) => {
                  const len = win.start <= win.end 
                    ? win.end - win.start + 1 
                    : (sequenceLength - win.start + 1) + win.end;
                  return (
                    <tr key={idx}>
                      <td>{win.start}</td>
                      <td>{win.end}</td>
                      <td>{len} bp</td>
                      <td>
                        <span className="chip" style={{ 
                          background: win.reason === 'promoter' ? 'var(--accent-600)' 
                                    : win.reason === 'intergenic' ? '#10b981' 
                                    : 'var(--muted)' 
                        }}>
                          {win.reason === 'promoter' ? 'Promoter' 
                         : win.reason === 'intergenic' ? 'Intergenic' 
                         : 'Max Length'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '1.5rem', background: 'var(--surface)', border: '1px solid var(--line-subtle)', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Next Step: Design Overhangs
            </h4>
            <p style={{ margin: '0 0 1rem', lineHeight: '1.5' }}>
              Use these recommended 30bp windows to design your actual cut sites. 
              Goto NEBridge SplitSet Tool?
            </p>
            <a 
              href="https://ligasefidelity.neb.com/splitset/run.cgi" 
              target="_blank" 
              rel="noreferrer"
              className="primary-cta"
              style={{ display: 'inline-flex', textDecoration: 'none', background: '#0284c7' }}
            >
              Open NEBridge SplitSet
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
