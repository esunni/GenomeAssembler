import { ChangeEvent, useMemo, useState } from 'react';

import { CircularGenomeMap } from './CircularGenomeMap';
import { ENZYMES, findCircularEnzymeSites, parseSingleCircularFasta, type ParsedCircularFasta } from '../utils/designTools';

interface DesignPageProps {
  onOpenJanus: () => void;
}

export function DesignPage({ onOpenJanus }: DesignPageProps) {
  const [selectedEnzymeId, setSelectedEnzymeId] = useState(ENZYMES[0]?.id ?? '');
  const [uploadedGenome, setUploadedGenome] = useState<ParsedCircularFasta | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedEnzyme = useMemo(
    () => ENZYMES.find((enzyme) => enzyme.id === selectedEnzymeId) ?? ENZYMES[0],
    [selectedEnzymeId],
  );
  const detectedSites = useMemo(
    () => (uploadedGenome && selectedEnzyme ? findCircularEnzymeSites(uploadedGenome.sequence, selectedEnzyme) : []),
    [selectedEnzyme, uploadedGenome],
  );

  const handleGenomeUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Unable to read the FASTA file.'));
        reader.readAsText(file);
      });
      const parsedGenome = parseSingleCircularFasta(text);
      setUploadedGenome(parsedGenome);
      setErrorMessage(null);
    } catch (error) {
      setUploadedGenome(null);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to read the FASTA file.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <section className="portal-surface design-page">
      <div className="page-header design-header">
        <div>
          <p className="page-eyebrow">Design</p>
          <h2>Design Workspace</h2>
          <p className="page-copy">
            Upload one circular genome FASTA file, choose a Type IIS enzyme, and inspect both the number of recognition sites and their
            locations on a circular genome map.
          </p>
        </div>

        <div className="design-header-actions">
          <p className="cta-label">Move into the build workflow when this genome is ready.</p>
          <button type="button" className="primary-cta" onClick={onOpenJanus}>
            Open Janus Builder
          </button>
        </div>
      </div>

      <div className="design-controls">
        <label>
          Upload genome FASTA
          <input type="file" accept=".fa,.fasta,.fna,text/plain" onChange={(event) => void handleGenomeUpload(event)} />
        </label>

        <label>
          Type IIS enzyme
          <select value={selectedEnzymeId} onChange={(event) => setSelectedEnzymeId(event.target.value)}>
            {ENZYMES.map((enzyme) => (
              <option key={enzyme.id} value={enzyme.id}>
                {enzyme.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errorMessage ? <p className="design-error">{errorMessage}</p> : null}

      {uploadedGenome && selectedEnzyme ? (
        <>
          <section className="design-summary">
            <p className="design-summary-count">{detectedSites.length} sites found</p>
            <div className="design-summary-grid">
              <p>Sequence name: {uploadedGenome.name}</p>
              <p>Genome length: {uploadedGenome.length.toLocaleString()} bp</p>
              <p>Enzyme: {selectedEnzyme.name}</p>
              <p>Recognition sequence: {selectedEnzyme.recognitionSite}</p>
              <p>Cut pattern: {selectedEnzyme.cutPattern}</p>
            </div>
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
        </>
      ) : (
        <p className="muted">Upload one circular FASTA sequence to map Type IIS recognition sites on the genome.</p>
      )}
    </section>
  );
}
