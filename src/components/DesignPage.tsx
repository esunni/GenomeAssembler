import { ChangeEvent, DragEvent, useMemo, useState } from 'react';

import { CircularGenomeMap } from './CircularGenomeMap';
import { SilentMutationAnalysis } from './SilentMutationAnalysis';
import { ENZYMES, findCircularEnzymeSites, parseSingleCircularFasta, type ParsedCircularFasta } from '../utils/designTools';

interface DesignPageProps {
  onOpenJanus: () => void;
}

export function DesignPage({ onOpenJanus }: DesignPageProps) {
  const [selectedEnzymeId, setSelectedEnzymeId] = useState(ENZYMES[0]?.id ?? '');
  const [uploadedGenome, setUploadedGenome] = useState<ParsedCircularFasta | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const selectedEnzyme = useMemo(
    () => ENZYMES.find((enzyme) => enzyme.id === selectedEnzymeId) ?? ENZYMES[0],
    [selectedEnzymeId],
  );
  const detectedSites = useMemo(
    () => (uploadedGenome && selectedEnzyme ? findCircularEnzymeSites(uploadedGenome.sequence, selectedEnzyme) : []),
    [selectedEnzyme, uploadedGenome],
  );

  const handleGenomeFile = async (file: File) => {
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Unable to read the FASTA file.'));
        reader.readAsText(file);
      });
      const parsedGenome = parseSingleCircularFasta(text);
      setUploadedGenome(parsedGenome);
      setSelectedFileName(file.name);
      setErrorMessage(null);
    } catch (error) {
      setUploadedGenome(null);
      setSelectedFileName(file.name);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to read the FASTA file.');
    }
  };

  const handleGenomeUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await handleGenomeFile(file);
    } finally {
      event.target.value = '';
    }
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    await handleGenomeFile(file);
  };

  return (
    <section className="portal-surface design-page">
      <div className="page-header design-header">
        <div>
          <p className="page-eyebrow">Design</p>
          <h2>Fragment Design</h2>
          <p className="page-copy">
            Upload a circular genome sequence and design optimal fragmentation strategies. Plan Type IIS recognition site placements to create
            assembly-ready fragments that can be experimentally validated and assembled into a complete genome.
          </p>
        </div>

        <div className="design-header-actions">
          <p className="cta-label">Move into the build workflow when the fragments are ready.</p>
          <button type="button" className="primary-cta" onClick={onOpenJanus}>
            Mapping File Generator
          </button>
        </div>
      </div>

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
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setIsDragActive(false);
          }}
          onDrop={(event) => void handleDrop(event)}
        >
          <input
            aria-label="Upload genome FASTA"
            className="design-file-input"
            type="file"
            accept=".fa,.fasta,.fna,text/plain"
            onChange={(event) => void handleGenomeUpload(event)}
          />
          {selectedFileName ? (
            <span className="design-upload-file">
              <svg className="design-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {selectedFileName}
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

        <label className="design-select-field">
          <span>Type IIS enzyme</span>
          <select aria-label="Type IIS enzyme" value={selectedEnzymeId} onChange={(event) => setSelectedEnzymeId(event.target.value)}>
            {ENZYMES.map((enzyme) => (
              <option key={enzyme.id} value={enzyme.id}>
                {enzyme.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errorMessage ? <p className="design-error">{errorMessage}</p> : null}

      {uploadedGenome && selectedEnzyme && (
        <>
          <section className="design-summary">
            <p className="design-summary-line">
              <span className="design-summary-count">{detectedSites.length} sites found</span>
              <span className="design-summary-pattern">{selectedEnzyme.cutPattern}</span>
            </p>
          </section>

          <div className="design-map-layout">
            <div className="design-map-panel">
              <CircularGenomeMap
                sequenceName={uploadedGenome.name}
                sequenceLength={uploadedGenome.length}
                enzymeName={selectedEnzyme.name}
                sites={detectedSites}
              />
            </div>

            <div className="design-results-panel">
              <h3>Site Positions</h3>
              {detectedSites.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th>Strand</th>
                        <th>Matched motif</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detectedSites.map((site) => (
                        <tr key={`${site.position}-${site.strand}`}>
                          <td>{site.position}</td>
                          <td>{site.strand}</td>
                          <td>{site.matchSequence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No recognition sites were found for this enzyme in the uploaded circular sequence.</p>
              )}
            </div>
          </div>

          <SilentMutationAnalysis uploadedGenome={uploadedGenome} detectedSites={detectedSites} />
        </>
      )}
    </section>
  );
}
