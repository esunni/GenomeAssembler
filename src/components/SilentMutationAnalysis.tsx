import { ChangeEvent, DragEvent, useState, useEffect } from 'react';
import { ParsedCircularFasta, EnzymeSite } from '../utils/designTools';
import { defaultCodonUsageCsv } from '../utils/defaultCodonUsage';
import {
  parseCdsAnnotations,
  parseCodonUsage,
  analyzeEnzymeSites,
  recommendSilentMutations,
  applyMutations,
  reverseComplement,
  SiteAnalysis,
  CdsRegion,
  CodonUsage
} from '../utils/mutationTools';

interface SilentMutationAnalysisProps {
  uploadedGenome: ParsedCircularFasta;
  detectedSites: EnzymeSite[];
  onCdsRegionsChange?: (regions: CdsRegion[]) => void;
  onSiteAnalysesChange?: (analyses: SiteAnalysis[]) => void;
  isLinear?: boolean;
}

export function SilentMutationAnalysis({ uploadedGenome, detectedSites, onCdsRegionsChange, onSiteAnalysesChange, isLinear }: SilentMutationAnalysisProps) {
  const [annotationFileName, setAnnotationFileName] = useState<string>('');
  const [codonFileName, setCodonFileName] = useState<string>('E.coli_codon_usage_table.csv (Default)');
  const [useCustomCodonTable, setUseCustomCodonTable] = useState(false);
  const [isPhastestDragActive, setIsPhastestDragActive] = useState(false);
  const [isCodonDragActive, setIsCodonDragActive] = useState(false);
  
  const [cdsRegions, setCdsRegions] = useState<CdsRegion[]>([]);
  const [codonUsage, setCodonUsage] = useState<Map<string, CodonUsage[]>>(() => parseCodonUsage(defaultCodonUsageCsv || ''));
  const [siteAnalyses, setSiteAnalyses] = useState<SiteAnalysis[]>([]);

  const [showCodonInfo, setShowCodonInfo] = useState(false);

  useEffect(() => {
    if (codonUsage.size > 0 && detectedSites.length > 0) {
      const analyses = analyzeEnzymeSites(detectedSites, cdsRegions, uploadedGenome.sequence, isLinear);
      
      // Add suggested mutations
      const analysesWithSuggestions = analyses.map(analysis => ({
        ...analysis,
        suggestedMutation: recommendSilentMutations(analysis, codonUsage),
        userMutation: ''
      }));
      
      setSiteAnalyses(analysesWithSuggestions);
      if (onSiteAnalysesChange) onSiteAnalysesChange(analysesWithSuggestions);
    }
  }, [cdsRegions, codonUsage, detectedSites, uploadedGenome.sequence, onSiteAnalysesChange, isLinear]);

  const handlePhastestFile = async (file: File) => {
    const text = await file.text();
    const regions = parseCdsAnnotations(text);
    setCdsRegions(regions);
    if (onCdsRegionsChange) onCdsRegionsChange(regions);
    setAnnotationFileName(file.name);
  };

  const handleCodonFile = async (file: File) => {
    const text = await file.text();
    const usage = parseCodonUsage(text);
    setCodonUsage(usage);
    setCodonFileName(file.name);
  };

  const handlePhastestUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handlePhastestFile(file);
    event.target.value = '';
  };

  const handleCodonUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleCodonFile(file);
    event.target.value = '';
  };

  const handlePhastestDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsPhastestDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handlePhastestFile(file);
  };

  const handleCodonDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsCodonDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleCodonFile(file);
  };

  const handleCustomMutationChange = (sitePosition: number, value: string) => {
    const updated = siteAnalyses.map((site) =>
      site.sitePosition === sitePosition ? { ...site, userMutation: value } : site
    );
    setSiteAnalyses(updated);
    if (onSiteAnalysesChange) onSiteAnalysesChange(updated);
  };

  const [showWarning, setShowWarning] = useState(false);

  const handleDownloadFasta = () => {
    // Check if there are any sites missing mutations
    const missingMutation = siteAnalyses.some(
      (site) => !site.userMutation && !site.suggestedMutation
    );

    if (missingMutation) {
      setShowWarning(true);
      return;
    }

    const mutationsToApply = siteAnalyses.map(site => {
      // Priority: User's typed mutation, otherwise Suggested mutation, otherwise original sequence.
      const mutated = site.userMutation ? site.userMutation : (site.suggestedMutation || site.matchSequence);
      
      // The mutated string must match the length of the original motif string to apply cleanly.
      if (mutated && mutated.length === site.matchSequence.length && mutated.toUpperCase() !== site.matchSequence.toUpperCase()) {
        return {
          position: site.sitePosition,
          original: site.matchSequence.toUpperCase(),
          mutated: mutated.toUpperCase()
        };
      }
      return null;
    }).filter(Boolean) as { position: number; original: string; mutated: string }[];

    const newSequence = applyMutations(uploadedGenome.sequence, mutationsToApply, isLinear);
    
    // Create and download FASTA
    const fastaContent = `>${uploadedGenome.name}_mutated\n${newSequence.match(/.{1,80}/g)?.join('\n') || newSequence}`;
    const blob = new Blob([fastaContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${uploadedGenome.name}_mutated.fasta`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="section-card">
      <div className="section-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Silent Mutation Analysis</h2>
        <p className="page-copy">
          Upload a CDS annotation file — either <a href="https://phastest.ca/submissions/new" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-600)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>PHASTEST</a> results (detail.txt) or a GenBank flat file (.gb/.gbk) — together with Codon usage data to analyze and resolve recognition sites via silent mutations (the default codon usage table is for <i>E. coli</i>). The format is detected automatically.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
          <div className="toggle-switch">
            <input
              type="checkbox"
              checked={useCustomCodonTable}
              onChange={(e) => {
                setUseCustomCodonTable(e.target.checked);
                if (!e.target.checked) {
                  setCodonUsage(parseCodonUsage(defaultCodonUsageCsv || ''));
                  setCodonFileName('E.coli_codon_usage_table.csv (Default)');
                } else {
                  setCodonUsage(new Map());
                  setCodonFileName('');
                }
              }}
            />
            <span className="toggle-slider"></span>
          </div>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            Use custom host's codon usage table
            <div style={{ position: 'relative', display: 'inline-block', marginLeft: '0.5rem' }}>
              <button
                type="button"
                className="icon-button"
                style={{ width: '18px', height: '18px', padding: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Codon Usage Table Format Info"
                onClick={(e) => {
                  e.preventDefault();
                  setShowCodonInfo(!showCodonInfo);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </button>
              {showCodonInfo && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: '8px',
                  width: '440px',
                  maxWidth: 'calc(100vw - 32px)',
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
                      setShowCodonInfo(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#111' }}>Custom Codon Usage Format</h4>
                  <p style={{ margin: '0 0 8px 0' }}><strong>Extensions:</strong> .csv</p>
                  <p style={{ margin: '0 0 4px 0' }}><strong>Required Columns (in order, with a header row):</strong></p>
                  <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px', color: '#555' }}>
                    <li>Column 1 — codon: DNA or RNA triplet (e.g., CTG or CUG)</li>
                    <li>Column 2 — aminoAcid: single- or three-letter code (e.g., L or Leu; use * for stop)</li>
                    <li>Column 3 — fraction: usage within the amino acid (e.g., 0.47)</li>
                    <li>Column 4 — frequency: per-1000 codons, used for ranking (e.g., 51.1)</li>
                    <li>Column 5 — number: observed count (0 if unknown)</li>
                  </ul>
                  <p style={{ margin: '0 0 4px 0' }}><strong>Example:</strong></p>
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', border: '1px solid #eee' }}>
                    <thead style={{ backgroundColor: '#f5edfc', color: '#333' }}>
                      <tr>
                        <th style={{ border: '1px solid #eee', padding: '5px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>codon</th>
                        <th style={{ border: '1px solid #eee', padding: '5px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>aminoAcid</th>
                        <th style={{ border: '1px solid #eee', padding: '5px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>fraction</th>
                        <th style={{ border: '1px solid #eee', padding: '5px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>frequency</th>
                        <th style={{ border: '1px solid #eee', padding: '5px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>number</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: '#555' }}>
                      <tr>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>CTG</td>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>L</td>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>0.47</td>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>51.1</td>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>0</td>
                      </tr>
                      <tr>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>CTA</td>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>L</td>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>0.04</td>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>3.8</td>
                        <td style={{ border: '1px solid #eee', padding: '5px 6px' }}>0</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          </span>
        </label>
      </div>

      <div className="design-controls" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <label
          className={`design-upload-zone${isPhastestDragActive ? ' is-drag-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsPhastestDragActive(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsPhastestDragActive(true); }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setIsPhastestDragActive(false);
          }}
          onDrop={handlePhastestDrop}
        >
          <input
            aria-label="Upload PHASTEST or GenBank annotation file"
            className="design-file-input"
            type="file"
            accept=".txt,.gb,.gbk,.genbank,.gbff,text/plain"
            onChange={handlePhastestUpload}
          />
          {annotationFileName ? (
            <span className="design-upload-file">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {annotationFileName}
            </span>
          ) : (
            <span className="design-upload-placeholder">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 16V4M12 4L8 8M12 4L16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Drop PHASTEST detail.txt or GenBank .gb file here
            </span>
          )}
        </label>

        {useCustomCodonTable && (
          <label
            className={`design-upload-zone${isCodonDragActive ? ' is-drag-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsCodonDragActive(true); }}
            onDragEnter={(e) => { e.preventDefault(); setIsCodonDragActive(true); }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setIsCodonDragActive(false);
            }}
            onDrop={handleCodonDrop}
          >
            <input
              aria-label="Upload Codon usage CSV file"
              className="design-file-input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleCodonUpload}
            />
            {codonFileName ? (
              <span className="design-upload-file">
                <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {codonFileName}
              </span>
            ) : (
              <span className="design-upload-placeholder">
                <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 16V4M12 4L8 8M12 4L16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 15V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Drop Codon usage .csv file here
              </span>
            )}
          </label>
        )}
      </div>

      {siteAnalyses.length > 0 && (
        <div className="design-results-panel" style={{ marginTop: '2rem', borderTop: 'none', paddingTop: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Mutation Sites</h3>
            <button 
              type="button" 
              className="primary-cta" 
              onClick={handleDownloadFasta}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Download Mutated FASTA
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th style={{ textAlign: 'center' }}>Annotation</th>
                  <th>Context Window</th>
                  <th>Suggested Mutation</th>
                  <th>Custom Mutation</th>
                </tr>
              </thead>
              <tbody>
                {siteAnalyses.map((site) => (
                  <tr key={site.sitePosition}>
                    <td>{site.sitePosition}</td>
                    <td style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                      {site.inCds ? (
                        <span className="chip" style={{ background: 'var(--accent-600)' }}>
                          CDS {site.cdsId} {site.cdsStrand === '-' ? '(− strand)' : '(+ strand)'}
                        </span>
                      ) : cdsRegions.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                          <span className="chip" style={{ background: 'var(--muted)', opacity: 0.8 }}>
                            Unannotated
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                          <span className="chip" style={{ background: 'var(--muted)' }}>
                            Intergenic
                          </span>
                          {site.intergenicLabel && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                              {site.intergenicLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ letterSpacing: '0.05em' }}>
                      {site.contextCodons.length > 0 ? (
                        (() => {
                          const joinedCodons = site.contextCodons.map(c => c.codon).join('');
                          const isReverseCds = site.cdsStrand === '-' && site.inCds;
                          const motifInWindow = isReverseCds
                            ? reverseComplement(site.matchSequence)
                            : site.matchSequence;
                          let matchIdx = joinedCodons.toUpperCase().indexOf(motifInWindow.toUpperCase());
                          const matchLen = motifInWindow.length;

                          let globalCharIdx = 0;

                          return (
                            <div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {site.contextCodons.map((c, i) => {
                                const codonChars = c.codon.split('').map((char, j) => {
                                  const isHighlighted = matchIdx !== -1 && globalCharIdx >= matchIdx && globalCharIdx < matchIdx + matchLen;
                                  globalCharIdx++;
                                  return (
                                    <span key={j} style={{ 
                                      color: isHighlighted ? '#d73a49' : 'inherit',
                                      fontWeight: isHighlighted ? 700 : 'normal'
                                    }}>
                                      {char}
                                    </span>
                                  );
                                });
                                
                                return (
                                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.85rem' }}>{codonChars}</span>
                                    <span style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem', fontWeight: 600 }}>
                                      {c.aminoAcid}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            </div>
                          );
                        })()
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td style={{ color: 'var(--accent-700)', fontWeight: 600 }}>
                      {site.suggestedMutation}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-inline-input"
                        style={{ border: '1px solid var(--line-strong)' }}
                        value={site.userMutation !== undefined ? site.userMutation : (site.suggestedMutation || site.matchSequence)}
                        onChange={(e) => handleCustomMutationChange(site.sitePosition, e.target.value)}
                        placeholder={site.matchSequence}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <h3 style={{ marginTop: 0, color: 'var(--accent-700)' }}>Missing Mutations</h3>
            <p>Cannot download FASTA: some unannotated or intergenic sites lack an automated suggestion.</p>
            <p>Please enter a custom mutation for these sites to break the restriction enzyme sequence.</p>
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
