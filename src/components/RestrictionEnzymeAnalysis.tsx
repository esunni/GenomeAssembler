import { ChangeEvent, DragEvent, MouseEvent, useMemo, useState } from 'react';

import {
  computeFragments,
  ENZYME_PALETTE,
  findRestrictionSites,
  fragmentsToFasta,
  parseFasta,
  RESTRICTION_ENZYMES,
  type CutFragment,
  type ParsedFasta,
  type RestrictionEnzyme,
  type RestrictionSite,
} from '../utils/restrictionEnzymes';

interface SiteWithColor extends RestrictionSite {
  color: string;
}

function downloadText(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function polarToCartesian(center: number, radius: number, angleDegrees: number) {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians),
  };
}

interface MapProps {
  sequenceName: string;
  sequenceLength: number;
  sites: SiteWithColor[];
  selectedIds: Set<string>;
  hoverId: string | null;
  onSiteClick: (site: SiteWithColor, event: MouseEvent) => void;
}

function CircularMap({ sequenceName, sequenceLength, sites, selectedIds, hoverId, onSiteClick }: MapProps) {
  const center = 200;
  const radius = 140;
  const innerRadius = 122;

  const placedSites = useMemo(() => {
    return [...sites]
      .map((site) => ({
        ...site,
        angle: ((site.cutPosition - 1) / sequenceLength) * 360,
      }))
      .sort((a, b) => a.angle - b.angle);
  }, [sites, sequenceLength]);

  return (
    <svg
      className="restriction-map restriction-map--circular"
      viewBox="0 0 400 400"
      role="img"
      aria-label={`Restriction site map for ${sequenceName}`}
    >
      <circle cx={center} cy={center} r={radius} className="restriction-ring" />
      <circle cx={center} cy={center} r={innerRadius} className="restriction-ring-inner" />

      {Array.from({ length: 12 }, (_, index) => {
        const angle = index * 30;
        const outer = polarToCartesian(center, radius + 4, angle);
        const inner = polarToCartesian(center, radius - 2, angle);
        return <line key={angle} className="restriction-tick" x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
      })}

      {placedSites.map((site, index) => {
        const isSelected = selectedIds.has(site.id);
        const isHover = hoverId === site.id;
        const lineStart = polarToCartesian(center, radius - 14, site.angle);
        const lineEnd = polarToCartesian(center, radius + (isSelected ? 18 : 12), site.angle);
        const labelRadius = radius + 28 + (index % 2 === 0 ? 0 : 14);
        const labelPoint = polarToCartesian(center, labelRadius, site.angle);

        const normalizedAngle = ((site.angle % 360) + 360) % 360;
        let textAnchor: 'start' | 'middle' | 'end' = 'middle';
        if (normalizedAngle > 15 && normalizedAngle < 165) textAnchor = 'start';
        else if (normalizedAngle > 195 && normalizedAngle < 345) textAnchor = 'end';

        return (
          <g
            key={site.id}
            className={`restriction-site-marker${isSelected ? ' is-selected' : ''}${isHover ? ' is-hover' : ''}`}
            onClick={(event) => onSiteClick(site, event)}
          >
            <line
              className="restriction-site-line"
              x1={lineStart.x}
              y1={lineStart.y}
              x2={lineEnd.x}
              y2={lineEnd.y}
              stroke={site.color}
            />
            <circle
              className="restriction-site-dot"
              cx={lineEnd.x}
              cy={lineEnd.y}
              r={isSelected ? 6 : 4}
              fill={site.color}
            />
            {sites.length <= 30 ? (
              <text
                className="restriction-site-label"
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor={textAnchor}
                dy="0.35em"
              >
                {site.cutPosition}
              </text>
            ) : null}
          </g>
        );
      })}

      <g className="restriction-map-center">
        <text x={center} y={center - 14} textAnchor="middle" className="restriction-map-name">
          {sequenceName.length > 24 ? sequenceName.slice(0, 21) + '…' : sequenceName}
        </text>
        <text x={center} y={center + 8} textAnchor="middle" className="restriction-map-length">
          {sequenceLength.toLocaleString()} bp
        </text>
        <text x={center} y={center + 28} textAnchor="middle" className="restriction-map-count">
          {sites.length} site{sites.length === 1 ? '' : 's'}
        </text>
      </g>
    </svg>
  );
}

function LinearMap({ sequenceName, sequenceLength, sites, selectedIds, hoverId, onSiteClick }: MapProps) {
  const margin = 50;
  const width = 720;
  const height = 220;
  const trackY = height / 2;
  const xScale = (pos: number) => margin + ((pos - 1) / Math.max(sequenceLength - 1, 1)) * (width - margin * 2);

  const placedSites = useMemo(() => [...sites].sort((a, b) => a.cutPosition - b.cutPosition), [sites]);

  return (
    <svg
      className="restriction-map restriction-map--linear"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Restriction site map for ${sequenceName}`}
    >
      <line className="restriction-linear-track" x1={margin} y1={trackY} x2={width - margin} y2={trackY} />
      <line x1={margin} y1={trackY - 8} x2={margin} y2={trackY + 8} className="restriction-linear-cap" />
      <line
        x1={width - margin}
        y1={trackY - 8}
        x2={width - margin}
        y2={trackY + 8}
        className="restriction-linear-cap"
      />

      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const pos = Math.max(1, Math.round(sequenceLength * pct));
        const x = xScale(pos);
        return (
          <g key={pct}>
            <line x1={x} y1={trackY + 6} x2={x} y2={trackY + 12} className="restriction-linear-axis-tick" />
            <text x={x} y={trackY + 26} textAnchor="middle" className="restriction-linear-axis-label">
              {pos.toLocaleString()}
            </text>
          </g>
        );
      })}

      {placedSites.map((site, index) => {
        const isSelected = selectedIds.has(site.id);
        const isHover = hoverId === site.id;
        const x = xScale(site.cutPosition);
        const flipUp = index % 2 === 0;
        const tipY = flipUp ? trackY - 38 : trackY + 38;
        const baseY = flipUp ? trackY - 6 : trackY + 6;
        const labelY = flipUp ? tipY - 6 : tipY + 16;

        return (
          <g
            key={site.id}
            className={`restriction-site-marker${isSelected ? ' is-selected' : ''}${isHover ? ' is-hover' : ''}`}
            onClick={(event) => onSiteClick(site, event)}
          >
            <line
              x1={x}
              y1={baseY}
              x2={x}
              y2={tipY}
              stroke={site.color}
              className="restriction-site-line"
            />
            <circle
              cx={x}
              cy={tipY}
              r={isSelected ? 6 : 4}
              fill={site.color}
              className="restriction-site-dot"
            />
            <text x={x} y={labelY} textAnchor="middle" className="restriction-site-label">
              {site.cutPosition}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function RestrictionEnzymeAnalysis() {
  const [parsedGenome, setParsedGenome] = useState<ParsedFasta | null>(null);
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isLinear, setIsLinear] = useState(false);
  const [selectedEnzymeIds, setSelectedEnzymeIds] = useState<string[]>(['ecori', 'bamhi', 'hindiii']);
  const [enzymeFilter, setEnzymeFilter] = useState('');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const selectedEnzymes = useMemo<RestrictionEnzyme[]>(
    () => RESTRICTION_ENZYMES.filter((enzyme) => selectedEnzymeIds.includes(enzyme.id)),
    [selectedEnzymeIds],
  );

  const allSites = useMemo<SiteWithColor[]>(() => {
    if (!parsedGenome) return [];
    const sites = findRestrictionSites(parsedGenome.sequence, selectedEnzymes, isLinear);
    return sites.map((site) => ({
      ...site,
      color: ENZYME_PALETTE[selectedEnzymeIds.indexOf(site.enzymeId) % ENZYME_PALETTE.length],
    }));
  }, [parsedGenome, selectedEnzymes, isLinear, selectedEnzymeIds]);

  const siteById = useMemo(() => {
    const map = new Map<string, SiteWithColor>();
    for (const site of allSites) map.set(site.id, site);
    return map;
  }, [allSites]);

  const selectedSet = useMemo(() => new Set(selectedSiteIds), [selectedSiteIds]);

  const activeSites = useMemo(
    () =>
      selectedSiteIds
        .map((id) => siteById.get(id))
        .filter((site): site is SiteWithColor => Boolean(site)),
    [selectedSiteIds, siteById],
  );

  const fragments = useMemo<CutFragment[]>(() => {
    if (!parsedGenome || activeSites.length === 0) return [];
    return computeFragments(parsedGenome.sequence, activeSites, isLinear);
  }, [parsedGenome, activeSites, isLinear]);

  const filteredEnzymes = useMemo(() => {
    const query = enzymeFilter.trim().toUpperCase();
    if (!query) return RESTRICTION_ENZYMES;
    return RESTRICTION_ENZYMES.filter(
      (enzyme) =>
        enzyme.name.toUpperCase().includes(query) || enzyme.recognitionSite.includes(query),
    );
  }, [enzymeFilter]);

  const siteCountByEnzyme = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const site of allSites) {
      counts[site.enzymeId] = (counts[site.enzymeId] ?? 0) + 1;
    }
    return counts;
  }, [allSites]);

  const handleFile = async (file: File) => {
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Unable to read the FASTA file.'));
        reader.readAsText(file);
      });
      const parsed = parseFasta(text);
      setParsedGenome(parsed);
      setFileName(file.name);
      setErrorMessage(null);
      setSelectedSiteIds([]);
    } catch (error) {
      setParsedGenome(null);
      setFileName(file.name);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to read the FASTA file.');
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

  const toggleEnzyme = (enzymeId: string) => {
    setSelectedEnzymeIds((current) => {
      if (current.includes(enzymeId)) {
        return current.filter((id) => id !== enzymeId);
      }
      return [...current, enzymeId];
    });
    setSelectedSiteIds((current) => current.filter((id) => !id.startsWith(`${enzymeId}-`)));
  };

  const handleSiteClick = (site: SiteWithColor, event: MouseEvent) => {
    if (event.shiftKey) {
      setSelectedSiteIds((current) =>
        current.includes(site.id) ? current.filter((id) => id !== site.id) : [...current, site.id],
      );
    } else {
      setHoverId((current) => (current === site.id ? null : site.id));
    }
  };

  const clearSelectedCuts = () => setSelectedSiteIds([]);

  const selectAllSitesForEnzyme = (enzymeId: string) => {
    const ids = allSites.filter((site) => site.enzymeId === enzymeId).map((site) => site.id);
    setSelectedSiteIds((current) => {
      const set = new Set(current);
      for (const id of ids) set.add(id);
      return Array.from(set);
    });
  };

  const handleDownload = () => {
    if (!parsedGenome || fragments.length === 0) return;
    const fasta = fragmentsToFasta(fragments, parsedGenome.name);
    const safe = parsedGenome.name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.\-]/g, '') || 'genome';
    downloadText(`${safe}_fragments.fasta`, fasta);
  };

  return (
    <div className="restriction-page">
      <div className="design-controls">
        <div style={{ gridColumn: '1 / -1', marginBottom: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
            <div className="toggle-switch">
              <input type="checkbox" checked={isLinear} onChange={(event) => setIsLinear(event.target.checked)} />
              <span className="toggle-slider" />
            </div>
            Linear Genome
          </label>
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
            accept=".fa,.fasta,.fna,text/plain"
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

        <div className="restriction-enzyme-picker">
          <div className="restriction-enzyme-picker-header">
            <span>Restriction enzymes</span>
            <input
              type="search"
              placeholder="Filter by name or site"
              value={enzymeFilter}
              onChange={(event) => setEnzymeFilter(event.target.value)}
              className="restriction-enzyme-search"
            />
          </div>
          <div className="restriction-enzyme-list">
            {filteredEnzymes.map((enzyme) => {
              const checked = selectedEnzymeIds.includes(enzyme.id);
              const color = checked
                ? ENZYME_PALETTE[selectedEnzymeIds.indexOf(enzyme.id) % ENZYME_PALETTE.length]
                : '#94a3b8';
              const siteCount = siteCountByEnzyme[enzyme.id] ?? 0;
              return (
                <label key={enzyme.id} className={`restriction-enzyme-pill${checked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEnzyme(enzyme.id)}
                    aria-label={`Toggle ${enzyme.name}`}
                  />
                  <span className="restriction-enzyme-swatch" style={{ backgroundColor: color }} />
                  <span className="restriction-enzyme-name">{enzyme.name}</span>
                  <span className="restriction-enzyme-site">{enzyme.recognitionSite}</span>
                  {parsedGenome && checked ? (
                    <span className="restriction-enzyme-count">{siteCount}</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {errorMessage ? <p className="design-error">{errorMessage}</p> : null}

      {parsedGenome ? (
        <>
          <section className="design-summary">
            <p className="design-summary-line">
              <span className="design-summary-count">{allSites.length} sites found</span>
              <span className="design-summary-pattern">
                across {selectedEnzymes.length} enzyme{selectedEnzymes.length === 1 ? '' : 's'}
              </span>
            </p>
            <p className="restriction-helper-text">
              Shift+click a site marker (or a row in the Sites list) to mark it as a cut. Click without shift to
              highlight a site.
            </p>
          </section>

          <div className="restriction-layout">
            <div className="restriction-map-panel">
              {isLinear ? (
                <LinearMap
                  sequenceName={parsedGenome.name}
                  sequenceLength={parsedGenome.length}
                  sites={allSites}
                  selectedIds={selectedSet}
                  hoverId={hoverId}
                  onSiteClick={handleSiteClick}
                />
              ) : (
                <CircularMap
                  sequenceName={parsedGenome.name}
                  sequenceLength={parsedGenome.length}
                  sites={allSites}
                  selectedIds={selectedSet}
                  hoverId={hoverId}
                  onSiteClick={handleSiteClick}
                />
              )}

              <div className="restriction-sites-table">
                <div className="restriction-sites-table-header">
                  <h4>Detected sites</h4>
                  <span className="restriction-tip">Shift+click a row to toggle a cut</span>
                </div>
                {allSites.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th></th>
                          <th>Enzyme</th>
                          <th>Cut pos</th>
                          <th>Recog. start</th>
                          <th>Strand</th>
                          <th>Motif</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allSites.map((site) => {
                          const isSelected = selectedSet.has(site.id);
                          return (
                            <tr
                              key={site.id}
                              className={`restriction-site-row${isSelected ? ' is-selected' : ''}${
                                hoverId === site.id ? ' is-hover' : ''
                              }`}
                              onClick={(event) => handleSiteClick(site, event)}
                            >
                              <td>
                                <span
                                  className="restriction-color-dot"
                                  style={{ backgroundColor: site.color }}
                                />
                              </td>
                              <td>{site.enzymeName}</td>
                              <td>{site.cutPosition}</td>
                              <td>{site.recognitionStart}</td>
                              <td>{site.strand}</td>
                              <td className="restriction-site-motif">{site.matchSequence}</td>
                              <td>
                                <button
                                  type="button"
                                  className="restriction-row-toggle"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedSiteIds((current) =>
                                      current.includes(site.id)
                                        ? current.filter((id) => id !== site.id)
                                        : [...current, site.id],
                                    );
                                  }}
                                >
                                  {isSelected ? 'Remove cut' : 'Add cut'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">
                    No recognition sites were found. Select another enzyme or upload a different sequence.
                  </p>
                )}
              </div>
            </div>

            <aside className="restriction-side-panel">
              <div className="restriction-side-card">
                <div className="restriction-side-card-header">
                  <h4>Selected cuts</h4>
                  <div className="restriction-side-actions">
                    {selectedEnzymes.map((enzyme) => (
                      <button
                        key={enzyme.id}
                        type="button"
                        className="ghost restriction-add-all"
                        onClick={() => selectAllSitesForEnzyme(enzyme.id)}
                        title={`Add all ${enzyme.name} sites as cuts`}
                      >
                        +all {enzyme.name}
                      </button>
                    ))}
                    {selectedSiteIds.length > 0 ? (
                      <button type="button" className="ghost restriction-clear" onClick={clearSelectedCuts}>
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                {activeSites.length === 0 ? (
                  <p className="muted">
                    Shift+click a site on the map or in the table to mark it as a cut. Multiple cuts produce
                    multiple fragments.
                  </p>
                ) : (
                  <ul className="restriction-cut-list">
                    {activeSites.map((site) => (
                      <li key={site.id} className="restriction-cut-item">
                        <span className="restriction-color-dot" style={{ backgroundColor: site.color }} />
                        <span className="restriction-cut-info">
                          <strong>{site.enzymeName}</strong>
                          <span> cut at {site.cutPosition}</span>
                          <span className="restriction-cut-motif">
                            ({site.matchSequence}, {site.strand} strand)
                          </span>
                        </span>
                        <button
                          type="button"
                          className="icon-button restriction-remove"
                          aria-label="Remove cut"
                          onClick={() =>
                            setSelectedSiteIds((current) => current.filter((id) => id !== site.id))
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="restriction-side-card">
                <div className="restriction-side-card-header">
                  <h4>Fragments</h4>
                  {fragments.length > 0 ? (
                    <button type="button" onClick={handleDownload} className="restriction-download">
                      Download FASTA
                    </button>
                  ) : null}
                </div>

                {fragments.length === 0 ? (
                  <p className="muted">
                    Fragments appear here once you select one or more cut sites. Position and length are shown for
                    each piece.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Length (bp)</th>
                          <th>Boundaries</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fragments.map((fragment) => (
                          <tr key={fragment.index}>
                            <td>{fragment.index}</td>
                            <td>{fragment.start}</td>
                            <td>{fragment.end}</td>
                            <td>{fragment.length.toLocaleString()}</td>
                            <td className="restriction-fragment-bounds">
                              <span>
                                {fragment.leftCut
                                  ? `${fragment.leftCut.enzymeName}@${fragment.leftCut.position}`
                                  : 'start'}
                              </span>
                              <span> → </span>
                              <span>
                                {fragment.rightCut
                                  ? `${fragment.rightCut.enzymeName}@${fragment.rightCut.position}`
                                  : 'end'}
                              </span>
                              {fragment.wraps ? <span className="restriction-wrap-tag">wraps</span> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      ) : (
        <p className="muted" style={{ marginTop: '1.5rem' }}>
          Upload a FASTA sequence to locate restriction sites.
        </p>
      )}
    </div>
  );
}
