import { ChangeEvent, DragEvent, useState } from 'react';

interface MutationSite {
  siteNumber: number;
  position: number;
  regionType: 'CDS' | 'Intergenic';
  surroundingSequence: string;
  suggestedMutation: string;
  customMutation: string;
}

export function SilentMutationAnalysis() {
  const [phastestFileName, setPhastestFileName] = useState<string>('');
  const [codonFileName, setCodonFileName] = useState<string>('');
  const [isPhastestDragActive, setIsPhastestDragActive] = useState(false);
  const [isCodonDragActive, setIsCodonDragActive] = useState(false);
  const [mutationSites, setMutationSites] = useState<MutationSite[]>([]);

  const handlePhastestUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhastestFileName(file.name);
    // TODO: Parse PHASTEST file
    
    // Mock data for demonstration
    setMutationSites([
      {
        siteNumber: 1,
        position: 1452,
        regionType: 'CDS',
        surroundingSequence: 'ATGCGT...GCTAGC...TTAGCA',
        suggestedMutation: 'GCTAGC -> GCCAGC',
        customMutation: '',
      },
      {
        siteNumber: 2,
        position: 3891,
        regionType: 'Intergenic',
        surroundingSequence: 'CCGATA...GCTAGC...AATTGC',
        suggestedMutation: 'GCTAGC -> GCAAGC',
        customMutation: '',
      }
    ]);
    
    event.target.value = '';
  };

  const handleCodonUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCodonFileName(file.name);
    // TODO: Parse Codon usage CSV
    event.target.value = '';
  };

  const handlePhastestDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsPhastestDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setPhastestFileName(file.name);
    // TODO: Parse PHASTEST file
  };

  const handleCodonDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsCodonDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setCodonFileName(file.name);
    // TODO: Parse Codon usage CSV
  };

  const handleCustomMutationChange = (siteNumber: number, value: string) => {
    setMutationSites((prev) =>
      prev.map((site) =>
        site.siteNumber === siteNumber ? { ...site, customMutation: value } : site
      )
    );
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

      {mutationSites.length > 0 && (
        <div className="design-results-panel" style={{ marginTop: '2rem', borderTop: 'none', paddingTop: 0 }}>
          <h3 style={{ marginBottom: '1rem' }}>Mutation Sites</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site #</th>
                  <th>Position</th>
                  <th>CDS / Intergenic</th>
                  <th>Surrounding Sequence</th>
                  <th>Suggested Mutation</th>
                  <th>Custom Mutation</th>
                </tr>
              </thead>
              <tbody>
                {mutationSites.map((site) => (
                  <tr key={site.siteNumber}>
                    <td>{site.siteNumber}</td>
                    <td>{site.position}</td>
                    <td>
                      <span className="chip" style={{ background: site.regionType === 'CDS' ? 'var(--accent-600)' : 'var(--muted)' }}>
                        {site.regionType}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                      {site.surroundingSequence}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--accent-700)', fontWeight: 600 }}>
                      {site.suggestedMutation}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-inline-input"
                        style={{ border: '1px solid var(--line-strong)' }}
                        value={site.customMutation}
                        onChange={(e) => handleCustomMutationChange(site.siteNumber, e.target.value)}
                        placeholder="Enter custom mutation"
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
