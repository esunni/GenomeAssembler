import { ChangeEvent, DragEvent, useState, useEffect } from 'react';
import { ParsedCircularFasta, EnzymeSite } from '../utils/designTools';
import { 
  parsePhastestDetails, 
  parseCodonUsage, 
  analyzeEnzymeSites, 
  recommendSilentMutations, 
  applyMutations,
  SiteAnalysis,
  CdsRegion,
  CodonUsage
} from '../utils/mutationTools';

interface SilentMutationAnalysisProps {
  uploadedGenome: ParsedCircularFasta;
  detectedSites: EnzymeSite[];
}

export function SilentMutationAnalysis({ uploadedGenome, detectedSites }: SilentMutationAnalysisProps) {
  const [phastestFileName, setPhastestFileName] = useState<string>('');
  const [codonFileName, setCodonFileName] = useState<string>('');
  const [isPhastestDragActive, setIsPhastestDragActive] = useState(false);
  const [isCodonDragActive, setIsCodonDragActive] = useState(false);
  
  const [cdsRegions, setCdsRegions] = useState<CdsRegion[]>([]);
  const [codonUsage, setCodonUsage] = useState<Map<string, CodonUsage[]>>(new Map());
  const [siteAnalyses, setSiteAnalyses] = useState<SiteAnalysis[]>([]);

  useEffect(() => {
    if (cdsRegions.length > 0 && codonUsage.size > 0 && detectedSites.length > 0) {
      const analyses = analyzeEnzymeSites(detectedSites, cdsRegions, uploadedGenome.sequence);
      
      // Add suggested mutations
      const analysesWithSuggestions = analyses.map(analysis => ({
        ...analysis,
        suggestedMutation: recommendSilentMutations(analysis, codonUsage),
        userMutation: ''
      }));
      
      setSiteAnalyses(analysesWithSuggestions);
    }
  }, [cdsRegions, codonUsage, detectedSites, uploadedGenome.sequence]);

  const handlePhastestFile = async (file: File) => {
    const text = await file.text();
    const regions = parsePhastestDetails(text);
    setCdsRegions(regions);
    setPhastestFileName(file.name);
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
    setSiteAnalyses((prev) =>
      prev.map((site) =>
        site.sitePosition === sitePosition ? { ...site, userMutation: value } : site
      )
    );
  };

  const handleDownloadFasta = () => {
    const mutationsToApply = siteAnalyses.map(site => {
      // Use custom mutation if provided, otherwise try to parse suggested mutation
      let mutated = '';
      if (site.userMutation) {
        mutated = site.userMutation;
      } else if (site.suggestedMutation && site.suggestedMutation.includes('->')) {
        // Parse "Change 1452: GCT -> GCC (A)" or "GCT -> GCC (A)"
        const match = site.suggestedMutation.match(/->\s*([ACGT]+)/);
        if (match) {
          mutated = match[1];
        }
      }
      
      if (mutated) {
        // Find the original codon sequence
        const siteCodon = site.contextCodons.find(c => c.isSite);
        if (siteCodon) {
          return {
            position: siteCodon.globalStart,
            original: siteCodon.codon,
            mutated: mutated
          };
        } else if (!site.inCds) {
          // Intergenic mutation
          return {
            position: site.sitePosition + Math.floor(site.matchSequence.length / 2),
            original: site.matchSequence[Math.floor(site.matchSequence.length / 2)],
            mutated: mutated[0] || 'A'
          };
        }
      }
      return null;
    }).filter(Boolean) as { position: number; original: string; mutated: string }[];

    const newSequence = applyMutations(uploadedGenome.sequence, mutationsToApply);
    
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
          Upload PHASTEST results and Codon usage data to analyze and resolve recognition sites via silent mutations.
        </p>
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
            aria-label="Upload PHASTEST txt file"
            className="design-file-input"
            type="file"
            accept=".txt,text/plain"
            onChange={handlePhastestUpload}
          />
          {phastestFileName ? (
            <span className="design-upload-file">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {phastestFileName}
            </span>
          ) : (
            <span className="design-upload-placeholder">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 16V4M12 4L8 8M12 4L16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Drop PHASTEST .txt file here
            </span>
          )}
        </label>

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
                  <th>CDS / Intergenic</th>
                  <th>Context Window</th>
                  <th>Suggested Mutation</th>
                  <th>Custom Mutation</th>
                </tr>
              </thead>
              <tbody>
                {siteAnalyses.map((site) => (
                  <tr key={site.sitePosition}>
                    <td>{site.sitePosition}</td>
                    <td>
                      <span className="chip" style={{ background: site.inCds ? 'var(--accent-600)' : 'var(--muted)' }}>
                        {site.inCds ? `CDS ${site.cdsId}` : 'Intergenic'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', letterSpacing: '0.05em', whiteSpace: 'pre' }}>
                      {site.contextCodons.length > 0 ? (
                        <div>
                          <div>{site.contextCodons.map(c => c.codon).join(' ')}</div>
                          <div style={{ color: 'var(--muted-foreground)' }}>
                            {site.contextCodons.map(c => c.aminoAcid.padEnd(3, ' ')).join(' ')}
                          </div>
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--accent-700)', fontWeight: 600 }}>
                      {site.suggestedMutation}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-inline-input"
                        style={{ border: '1px solid var(--line-strong)' }}
                        value={site.userMutation || ''}
                        onChange={(e) => handleCustomMutationChange(site.sitePosition, e.target.value)}
                        placeholder="e.g. GCC"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
