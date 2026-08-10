import { useState, ChangeEvent, DragEvent } from 'react';
import { CdsRegion, SiteAnalysis } from '../utils/mutationTools';
import { Promoter, parsePromoters, calculateSearchWindows, SearchWindow } from '../utils/searchWindowTools';

import { LinearGenomeMap } from './LinearGenomeMap';

interface SearchWindowFinderProps {
  sequenceLength: number;
  cdsRegions: CdsRegion[];
  siteAnalyses: SiteAnalysis[];
  isLinear?: boolean;
}

export function SearchWindowFinder({ sequenceLength, cdsRegions, siteAnalyses, isLinear }: SearchWindowFinderProps) {
  const [promoterFileName, setPromoterFileName] = useState('');
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  const [maxFragmentLength, setMaxFragmentLength] = useState(1800);
  const [useMaxFragmentCount, setUseMaxFragmentCount] = useState(false);
  const [maxFragmentCount, setMaxFragmentCount] = useState(25);
  const [promoterFirst, setPromoterFirst] = useState(false);
  const [orfConservation, setOrfConservation] = useState(false);
  const [cutAtSilentMutations, setCutAtSilentMutations] = useState(false);
  const [showPromoterInfo, setShowPromoterInfo] = useState(false);

  const [searchWindows, setSearchWindows] = useState<SearchWindow[] | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState({ title: '', message: '', action: '' });

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
    if (useMaxFragmentCount && maxFragmentLength * maxFragmentCount < sequenceLength) {
      setWarningMessage({
        title: 'Impossible Configuration',
        message: `Cannot satisfy constraints: max length (${maxFragmentLength}bp) \u00D7 max count (${maxFragmentCount}) < total genome length (${sequenceLength}bp).`,
        action: 'Please increase the max length or max count.'
      });
      setShowWarning(true);
      return;
    }

    if (promoterFirst && promoters.length === 0) {
      setWarningMessage({
        title: 'Missing Promoters',
        message: 'Promoter-first option requires a promoter file.',
        action: 'Please upload a promoter file or disable the option.'
      });
      setShowWarning(true);
      return;
    }

    if (orfConservation && cdsRegions.length === 0) {
      setWarningMessage({
        title: 'Missing CDS Data',
        message: 'ORF-conservation option requires PHASTEST results.',
        action: 'Please upload PHASTEST results (detail.txt) or disable the option.'
      });
      setShowWarning(true);
      return;
    }

    const mutationSites = siteAnalyses.map(site => site.sitePosition);
    const windows = calculateSearchWindows(sequenceLength, maxFragmentLength, cdsRegions, promoters, {
      promoterFirst,
      orfConservation,
      cutAtSilentMutations,
      mutationSites,
      isLinear,
      maxFragmentCount: useMaxFragmentCount ? maxFragmentCount : undefined
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

      <div className="design-controls" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none', display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(200px, 1fr) minmax(280px, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label
            className={`design-upload-zone${isDragActive ? ' is-drag-active' : ''}`}
            style={{ minHeight: '140px', margin: 0 }}
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
              accept=".txt,.csv,.tsv,text/plain,text/tab-separated-values"
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
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label className="design-select-field">
            <span>Max fragment length (bp)</span>
            <input 
              type="number" 
              value={maxFragmentLength} 
              onChange={(e) => setMaxFragmentLength(Number(e.target.value))}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--line-strong)' }}
            />
          </label>

          <div className="design-select-field" style={{ gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={useMaxFragmentCount}
                  onChange={(e) => setUseMaxFragmentCount(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </div>
              Max fragment count
            </label>
            <input 
              type="number" 
              value={maxFragmentCount} 
              disabled={!useMaxFragmentCount}
              onChange={(e) => setMaxFragmentCount(Number(e.target.value))}
              style={{ 
                padding: '0.5rem', 
                borderRadius: '4px', 
                border: '1px solid var(--line-strong)',
                opacity: useMaxFragmentCount ? 1 : 0.5,
                pointerEvents: useMaxFragmentCount ? 'auto' : 'none'
              }}
            />
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '2px' }}>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={promoterFirst}
                  onChange={(e) => setPromoterFirst(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <div>
              <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                Promoter-first option
                <div style={{ position: 'relative', display: 'inline-block', marginLeft: '0.5rem' }}>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ width: '18px', height: '18px', padding: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Promoter Format Info"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPromoterInfo(!showPromoterInfo);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                  </button>
                  {showPromoterInfo && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginTop: '8px',
                      width: '340px',
                      padding: '16px',
                      backgroundColor: '#fff',
                      border: '1px solid #e0d4f5',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      zIndex: 100,
                      fontSize: '0.85rem',
                      color: '#333',
                      textAlign: 'left',
                      cursor: 'default',
                      fontWeight: 'normal'
                    }}>
                      <button
                        type="button"
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#6c757d'
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          setShowPromoterInfo(false);
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#111' }}>Promoter File Format</h4>
                      <p style={{ margin: '0 0 8px 0' }}><strong>Extensions:</strong> .txt, .csv, .tsv</p>
                      <p style={{ margin: '0 0 4px 0' }}><strong>Required Content:</strong></p>
                      <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px', color: '#555' }}>
                        <li>Line-by-line format or comma-separated values.</li>
                        <li>Requires promoter name and start position (or start-end range).</li>
                      </ul>
                      <p style={{ margin: '0 0 4px 0' }}><strong>Examples:</strong></p>
                      
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', border: '1px solid #eee' }}>
                        <thead style={{ backgroundColor: '#f5edfc', color: '#333' }}>
                          <tr>
                            <th style={{ border: '1px solid #eee', padding: '6px', textAlign: 'left' }}>Format</th>
                            <th style={{ border: '1px solid #eee', padding: '6px', textAlign: 'left' }}>Example Content</th>
                          </tr>
                        </thead>
                        <tbody style={{ color: '#555' }}>
                          <tr>
                            <td style={{ border: '1px solid #eee', padding: '6px', fontWeight: 'bold' }}>Text</td>
                            <td style={{ border: '1px solid #eee', padding: '6px', fontFamily: 'monospace' }}>T7 promoter: 154-173</td>
                          </tr>
                          <tr>
                            <td style={{ border: '1px solid #eee', padding: '6px', fontWeight: 'bold' }}>CSV/TSV</td>
                            <td style={{ border: '1px solid #eee', padding: '6px', fontFamily: 'monospace' }}>Name,Start,End<br/>lac,405,439</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </span>
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Find the range in the promoter region if possible.</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '2px' }}>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={orfConservation}
                  onChange={(e) => setOrfConservation(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <div>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>ORF-conservation option</span>
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Cut fragments in intergenic/unannotated region if possible.</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '2px' }}>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={cutAtSilentMutations}
                  onChange={(e) => setCutAtSilentMutations(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <div>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Cut at silent mutation sites</span>
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Set search window on silent mutation if fragment length &ge; 800bp.</p>
            </div>
          </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h3 style={{ margin: 0 }}>Recommended Search Windows</h3>
              <span className="chip" style={{ background: 'var(--accent-500)', color: '#ffffff', fontWeight: 600, fontSize: '0.85rem' }}>
                {searchWindows.length + (isLinear && searchWindows.length > 0 && searchWindows[0].start > 1 ? 1 : 0)} fragments
              </span>
            </div>
          </div>
          
          <div className="table-wrap" style={{ marginBottom: '1.5rem' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Fragment Name</th>
                  <th style={{ textAlign: 'center' }}>Window Start</th>
                  <th style={{ textAlign: 'center' }}>Window End</th>
                  <th style={{ textAlign: 'center' }}>Window Size</th>
                  <th style={{ textAlign: 'center' }}>Reason</th>
                  <th style={{ textAlign: 'center', width: '13%' }}>Predicted Fragment Length</th>
                  <th style={{ textAlign: 'center', width: '15%' }}>Mutations in Fragment</th>
                  {promoters.length > 0 && <th style={{ textAlign: 'center', width: '15%' }}>Promoters in Fragment</th>}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sortedSearchWindows = [...searchWindows].sort((a, b) => a.start - b.start);
                  return (
                    <>
                      {isLinear && sortedSearchWindows.length > 0 && sortedSearchWindows[0].start > 1 && (
                        <tr>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>Frag 1</td>
                          <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Initial Segment (Start of sequence to first window)</td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>~ {sortedSearchWindows[0].start - 1} bp</td>
                          <td style={{ textAlign: 'center' }}>
                            {siteAnalyses.filter(site => site.sitePosition >= 1 && site.sitePosition < sortedSearchWindows[0].start).length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontWeight: 600, color: '#ef4444' }}>
                                  {siteAnalyses.filter(site => site.sitePosition >= 1 && site.sitePosition < sortedSearchWindows[0].start).length} site(s)
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                  Pos: {siteAnalyses.filter(site => site.sitePosition >= 1 && site.sitePosition < sortedSearchWindows[0].start).map(m => m.sitePosition).join(', ')}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--muted-foreground)' }}>None</span>
                            )}
                          </td>
                          {promoters.length > 0 && (
                            <td style={{ textAlign: 'center' }}>
                              {promoters.filter(p => p.position >= 1 && p.position < sortedSearchWindows[0].start).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontWeight: 600, color: '#f59e0b' }}>
                                    {promoters.filter(p => p.position >= 1 && p.position < sortedSearchWindows[0].start).length} promoter(s)
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                    {promoters.filter(p => p.position >= 1 && p.position < sortedSearchWindows[0].start)
                                      .map(p => `${p.name} (${p.originalStart ?? p.position}-${p.originalEnd ?? p.end})`)
                                      .join(', ')}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--muted-foreground)' }}>None</span>
                              )}
                            </td>
                          )}
                        </tr>
                      )}
                      {sortedSearchWindows.map((win, idx) => {
                        const len = win.start <= win.end 
                          ? win.end - win.start + 1 
                          : (sequenceLength - win.start + 1) + win.end;
                          
                        let fragLen = 0;
                        let fragStart = win.start;
                        let fragEnd = win.end;
                        
                        if (idx < sortedSearchWindows.length - 1) {
                          const nextWin = sortedSearchWindows[idx + 1];
                          fragLen = nextWin.start - win.start;
                          if (fragLen <= 0) fragLen += sequenceLength;
                          fragEnd = nextWin.start - 1 < 0 ? sequenceLength - 1 : nextWin.start - 1;
                        } else {
                          // Last window
                          if (isLinear) {
                            fragLen = sequenceLength - win.start + 1;
                            fragEnd = sequenceLength;
                          } else {
                            const firstWin = sortedSearchWindows[0];
                            fragLen = firstWin.start - win.start;
                            if (fragLen <= 0) fragLen += sequenceLength;
                            fragEnd = firstWin.start - 1 < 0 ? sequenceLength - 1 : firstWin.start - 1;
                          }
                        }

                        // Find mutations inside the predicted fragment
                        
                        const fragMutations = siteAnalyses.filter(site => {
                          const pos = site.sitePosition;
                          if (fragStart <= fragEnd) {
                            return pos >= fragStart && pos <= fragEnd;
                          } else {
                            return pos >= fragStart || pos <= fragEnd; // Wrap-around case
                          }
                        });

                        const fragPromoters = promoters.filter(p => {
                          const pos = p.position;
                          if (fragStart <= fragEnd) {
                            return pos >= fragStart && pos <= fragEnd;
                          } else {
                            return pos >= fragStart || pos <= fragEnd; // Wrap-around case
                          }
                        });

                        const isMutationInWindow = (pos: number) => {
                          if (win.start <= win.end) {
                            return pos >= win.start && pos <= win.end;
                          } else {
                            return pos >= win.start || pos <= win.end;
                          }
                        };

                        return (
                          <tr key={idx}>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>Frag {isLinear && sortedSearchWindows[0].start > 1 ? idx + 2 : idx + 1}</td>
                            <td style={{ textAlign: 'center' }}>{win.start}</td>
                            <td style={{ textAlign: 'center' }}>{win.end}</td>
                            <td style={{ textAlign: 'center' }}>{len} bp</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="chip" style={{ 
                                background: win.reason === 'promoter' ? 'var(--accent-600)' 
                                          : win.reason === 'intergenic' ? '#10b981' 
                                          : win.reason === 'unannotated' ? 'var(--muted-foreground)' 
                                          : win.reason === 'silent_mutation' ? '#8b5cf6'
                                          : 'var(--muted)' 
                              }}>
                                {win.reason === 'promoter' ? 'Promoter' 
                               : win.reason === 'intergenic' ? 'Intergenic' 
                               : win.reason === 'unannotated' ? 'Unannotated' 
                               : win.reason === 'silent_mutation' ? 'Silent Mutation'
                               : 'Max Length'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>~ {fragLen} bp</td>
                            <td style={{ textAlign: 'center' }}>
                              {fragMutations.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ 
                                    fontWeight: 600, 
                                    color: fragMutations.some(m => isMutationInWindow(m.sitePosition)) ? '#8b5cf6' : '#ef4444' 
                                  }}>
                                    {fragMutations.length} site(s)
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                    Pos: {fragMutations.map(m => m.sitePosition).join(', ')}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--muted-foreground)' }}>None</span>
                              )}
                            </td>
                            {promoters.length > 0 && (
                              <td style={{ textAlign: 'center' }}>
                                {fragPromoters.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontWeight: 600, color: '#f59e0b' }}>
                                      {fragPromoters.length} promoter(s)
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                      {fragPromoters.map(p => `${p.name} (${p.originalStart ?? p.position}-${p.originalEnd ?? p.end})`).join(', ')}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--muted-foreground)' }}>None</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>

          <LinearGenomeMap 
            sequenceLength={sequenceLength}
            cdsRegions={cdsRegions}
            promoters={promoters}
            searchWindows={searchWindows}
            siteAnalyses={siteAnalyses}
            isLinear={isLinear}
          />

          <div style={{ padding: '1.5rem', background: 'var(--surface)', border: '1px solid var(--line-subtle)', borderRadius: '8px', marginTop: '2rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Next Step: Design Overhangs
            </h4>
            <p style={{ margin: '0 0 1rem', lineHeight: '1.5' }}>
              Use these recommended 30bp windows to design your actual cut sites. 
            </p>
            <a 
              href="https://ligasefidelity.neb.com/splitset/run.cgi" 
              target="_blank" 
              rel="noreferrer"
              className="primary-cta"
              style={{ display: 'inline-flex', textDecoration: 'none', background: '#0284c7', border: 'none', outline: 'none', boxShadow: 'none' }}
            >
              Open NEBridge SplitSet
            </a>
          </div>
        </div>
      )}
      {showWarning && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--surface)',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '400px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-700)' }}>{warningMessage.title}</h3>
            <p>{warningMessage.message}</p>
            <p>{warningMessage.action}</p>
            <button 
              onClick={() => setShowWarning(false)}
              className="primary-cta"
              style={{ width: '100%', marginTop: '1rem' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
