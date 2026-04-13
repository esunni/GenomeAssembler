import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

import { AspirationPlatesSection } from './components/AspirationPlatesSection';
import { DesignPage } from './components/DesignPage';
import { DispensingPlateSection } from './components/DispensingPlateSection';
import { ReactionSetupSection } from './components/ReactionSetupSection';
import type { ExperimentProject } from './types';
import { exportProjectJson, generateMappingCsvFiles, importProjectJson, validateMappingExport } from './utils/janusFiles';
import {
  buildAvailableSources,
  buildPreparationSummaries,
  createDefaultProject,
  createProtocolComponent,
} from './utils/janusState';

const defaultProtocolPaste = 'component,transfer_volume\nBuffer,2\nPrimer,1';

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

type PortalView = 'design' | 'janus';

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [project, setProject] = useState<ExperimentProject>(() => createDefaultProject());
  const [activeView, setActiveView] = useState<PortalView>('design');
  const [buildMenuOpen, setBuildMenuOpen] = useState(false);
  const [buildMenuPinned, setBuildMenuPinned] = useState(false);
  const [bulkProtocolText, setBulkProtocolText] = useState(defaultProtocolPaste);
  const [exportErrors, setExportErrors] = useState<string[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<Array<{ filename: string; content: string }>>([]);
  const [splitSelection, setSplitSelection] = useState<string[]>([]);
  const buildMenuRef = useRef<HTMLDivElement | null>(null);
  const loadInputRef = useRef<HTMLInputElement | null>(null);

  const availableSources = useMemo(() => buildAvailableSources(project), [project]);
  const preparationSummaries = useMemo(() => buildPreparationSummaries(project), [project]);
  const dispensingAssignments = useMemo(() => Object.values(project.dispensingPlate.wells), [project.dispensingPlate.wells]);
  const filledDispensingWellCount = useMemo(
    () => dispensingAssignments.filter((assignment) => assignment.items.length > 0).length,
    [dispensingAssignments],
  );

  const closeBuildMenu = () => {
    setBuildMenuOpen(false);
    setBuildMenuPinned(false);
  };

  const openBuildMenu = () => {
    setBuildMenuOpen(true);
  };

  const toggleBuildMenuPin = () => {
    if (buildMenuPinned) {
      closeBuildMenu();
      return;
    }

    setBuildMenuOpen(true);
    setBuildMenuPinned(true);
  };

  useEffect(() => {
    if (!buildMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!buildMenuRef.current?.contains(event.target)) {
        setBuildMenuOpen(false);
        setBuildMenuPinned(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeBuildMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [buildMenuOpen]);

  const updateProject = (updater: (current: ExperimentProject) => ExperimentProject) => {
    setProject((current) => updater(current));
    setExportErrors([]);
  };

  const handleProjectLoad = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const content = await file.text();
    setProject(importProjectJson(content));
    setGeneratedFiles([]);
    setExportErrors([]);
    event.target.value = '';
  };

  const handleProtocolPasteImport = () => {
    const lines = bulkProtocolText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const [, ...rows] = lines;
    const nextComponents = rows
      .map((line) => {
        const [name = '', transferVolume = ''] = line.split(',').map((value) => value.trim());
        return {
          ...createProtocolComponent(),
          name,
          transferVolume: Number(transferVolume) || 0,
        };
      })
      .filter((component) => component.name.trim() !== '');

    if (nextComponents.length === 0) {
      return;
    }

    updateProject((current) => ({
      ...current,
      protocolComponents: nextComponents,
    }));
  };

  const handleGenerateMappingFiles = () => {
    const errors = validateMappingExport(project);
    setExportErrors(errors);

    if (errors.length > 0) {
      setGeneratedFiles([]);
      return;
    }

    setGeneratedFiles(generateMappingCsvFiles(project));
  };

  const openDesign = () => {
    setActiveView('design');
    closeBuildMenu();
  };

  const openJanus = () => {
    setActiveView('janus');
    closeBuildMenu();
  };

  return (
    <div className="app-shell">
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="brand-lockup">
            <p className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </p>
            <div>
              <p className="brand-overline">Genome assembly portal</p>
              <h1 className="brand-title">GenomeAssembler</h1>
            </div>
          </div>

          <nav className="portal-nav" aria-label="Primary">
            <button
              type="button"
              className="nav-button"
              aria-current={activeView === 'design' ? 'page' : undefined}
              onClick={openDesign}
            >
              Design
            </button>

            <div
              className="nav-item"
              ref={buildMenuRef}
              onMouseEnter={openBuildMenu}
              onMouseLeave={() => {
                if (!buildMenuPinned) {
                  setBuildMenuOpen(false);
                }
              }}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                  return;
                }
                if (!buildMenuPinned) {
                  setBuildMenuOpen(false);
                }
              }}
            >
              <button
                type="button"
                className="nav-button nav-button--trigger"
                aria-current={activeView === 'janus' ? 'page' : undefined}
                aria-haspopup="menu"
                aria-expanded={buildMenuOpen}
                aria-controls="build-submenu"
                onMouseEnter={openBuildMenu}
                onFocus={openBuildMenu}
                onClick={toggleBuildMenuPin}
              >
                Build
              </button>

              {buildMenuOpen ? (
                <div id="build-submenu" className="nav-menu" role="menu" aria-label="Build submenu" onMouseEnter={openBuildMenu}>
                  <button type="button" className="menu-item" role="menuitem" onClick={openJanus}>
                    JANUS
                  </button>
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      </header>

      <main className="portal-body">
        <div className="page-canvas">
          {activeView === 'design' ? (
            <DesignPage onOpenJanus={openJanus} />
          ) : (
            <>
                <section className="portal-surface janus-hero">
                <div className="page-header">
                  <div>
                    <p className="page-eyebrow">Build / JANUS</p>
                    <h2>JANUS Mapping File Generator</h2>
                    <p className="page-copy">
                      Generate mapping files for the JANUS liquid handler. Define reaction components, assign wells, and export ready-to-use mapping files for your experiment.
                    </p>
                  </div>

                  <div className="page-stat-grid">
                    <article className="stat-card">
                      <span>Aspiration plates</span>
                      <strong>{project.aspirationPlates.length}</strong>
                    </article>
                    <article className="stat-card">
                      <span>Filled dispense wells</span>
                      <strong>{filledDispensingWellCount}</strong>
                    </article>
                  </div>
                </div>

                <div className="toolbar-card">
                  <div className="inline-grid">
                    <label>
                      Experiment name
                      <input
                        aria-label="Experiment name"
                        value={project.experimentName}
                        onChange={(event) => updateProject((current) => ({ ...current, experimentName: event.target.value }))}
                        placeholder="Enter experiment name"
                      />
                    </label>
                  </div>

                  <div className="button-row toolbar-actions">
                    <button
                      type="button"
                      onClick={() =>
                        downloadTextFile(`${project.experimentName.trim() || 'janus-project'}_project.json`, exportProjectJson(project))
                      }
                    >
                      Save project JSON
                    </button>
                    <button type="button" className="secondary" onClick={() => loadInputRef.current?.click()}>
                      Load project JSON
                    </button>
                    <input ref={loadInputRef} type="file" accept=".json,application/json" hidden onChange={handleProjectLoad} />
                    <button type="button" className="ghost" onClick={openDesign} style={{ marginLeft: 'auto' }}>
                      Back to Design
                    </button>
                  </div>
                </div>
              </section>

              <div style={{ display: 'flex', alignItems: 'stretch', gap: '2rem' }}>
                <div style={{ position: 'sticky', top: 'calc(82px + 2rem)', height: 'fit-content' }}>
                  <nav className="quick-menu" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '150px' }}>
                    <a href="#reaction-setup" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.82rem' }}>Reaction Setup</a>
                    <a href="#aspiration-plates" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.82rem' }}>Aspiration Plates</a>
                    <a href="#dispensing-plate" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.82rem' }}>Dispensing Plate</a>
                    <a href="#preparation" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.82rem' }}>REAGENT PREP</a>
                    <a href="#mapping-files" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.82rem' }}>Mapping Files</a>
                  </nav>
                </div>
                
                <div style={{ width: '1px', backgroundColor: '#e5e7eb', flexShrink: 0 }}></div>

                <div className="section-stack" style={{ flex: 1, minWidth: 0, paddingBottom: '2rem' }}>
                  <div id="reaction-setup" style={{ scrollMarginTop: 'calc(82px + 2rem)' }}>
                    <ReactionSetupSection
                      project={project}
                      bulkProtocolText={bulkProtocolText}
                      onBulkProtocolTextChange={setBulkProtocolText}
                      onImportProtocolPaste={handleProtocolPasteImport}
                      onProjectChange={updateProject}
                    />
                  </div>

                  <div id="aspiration-plates" style={{ scrollMarginTop: 'calc(82px + 2rem)' }}>
                    <AspirationPlatesSection
                      project={project}
                      availableSources={availableSources}
                      onProjectChange={updateProject}
                      onDownloadTextFile={downloadTextFile}
                    />
                  </div>

                  <div id="dispensing-plate" style={{ scrollMarginTop: 'calc(82px + 2rem)' }}>
                    <DispensingPlateSection project={project} onProjectChange={updateProject} />
                  </div>

                  <div id="preparation" style={{ scrollMarginTop: 'calc(82px + 2rem)' }}>
                    <section className="section-card">
                  <h2>Preparation Volumes</h2>
                  <p className="section-lead">
                    Review required preparation volume for each source, using component-volume whole-reaction rounding and the optional remainder helper.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', marginTop: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                      <div className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={project.mixLossEnabled}
                          onChange={(event) =>
                            updateProject((current) => ({
                              ...current,
                              mixLossEnabled: event.target.checked,
                            }))
                          }
                        />
                        <span className="toggle-slider"></span>
                      </div>
                      Add mix loss (0.5 rxns for every 5 rxns)
                    </label>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th style={{ textAlign: 'center' }}>Vol for 1 rxn (ul)</th>
                          <th style={{ textAlign: 'center' }}>Dispensing count</th>
                          <th style={{ textAlign: 'center' }}>Mix loss (Rxns)</th>
                          <th style={{ textAlign: 'center' }}>Whole required rxn</th>
                          <th style={{ textAlign: 'center' }}>Dead vol (ul)</th>
                          <th style={{ textAlign: 'center' }}>Total prep volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preparationSummaries.map((summary) => (
                          <tr 
                            key={`${summary.sourceType}:${summary.sourceId}`}
                            style={summary.isPremixRow ? { backgroundColor: '#f5edfc', fontWeight: 600 } : {}}
                          >
                            <td style={{ fontWeight: 600 }}>{summary.displayName}</td>
                            <td style={{ textAlign: 'center' }}>{summary.componentVolume}</td>
                            <td style={{ textAlign: 'center' }}>{summary.isPremixRow ? summary.usageCount : (summary.displayName.startsWith('↳') ? '' : summary.usageCount)}</td>
                            <td style={{ textAlign: 'center' }}>{summary.isPremixRow || !summary.displayName.startsWith('↳') ? summary.mixLoss : ''}</td>
                            <td style={{ textAlign: 'center' }}>{summary.wholeReactionCount}</td>
                            <td style={{ textAlign: 'center' }}>{summary.isPremixRow || !summary.displayName.startsWith('↳') ? summary.deadVolume : ''}</td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{summary.totalPreparationVolume}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                </div>

                <section id="mapping-files" className="section-card" style={{ scrollMarginTop: 'calc(82px + 2rem)' }}>
                  <h2>Mapping Files</h2>
                  <p className="section-lead">Generate one combined CSV or partition aspiration plates into custom groupings.</p>

                  <div className="helper-box">
                    <h3 style={{ marginBottom: '1rem' }}>Aspiration Plate Groupings</h3>
                    <div className="chip-row">
                      {project.aspirationPlates.map((plate) => (
                        <button
                          key={plate.id}
                          type="button"
                          className="drag-chip"
                          style={{
                            background: splitSelection.includes(plate.id) ? '#4a1b74' : '#f4edfb',
                            color: splitSelection.includes(plate.id) ? '#fff' : '#2c1047',
                          }}
                          onClick={() =>
                            setSplitSelection((current) =>
                              current.includes(plate.id) ? current.filter((plateId) => plateId !== plate.id) : [...current, plate.id],
                            )
                          }
                        >
                          {plate.name || 'Unnamed aspiration plate'}
                        </button>
                      ))}
                    </div>

                    <div className="button-row" style={{ marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          if (splitSelection.length === 0) {
                            return;
                          }

                          updateProject((current) => ({
                            ...current,
                            mappingSplitGroups: [
                              ...current.mappingSplitGroups,
                              {
                                id: `group-${current.mappingSplitGroups.length + 1}`,
                                plateIds: splitSelection,
                              },
                            ],
                          }));
                          setSplitSelection([]);
                        }}
                      >
                        Add selected grouping
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          updateProject((current) => ({
                            ...current,
                            mappingSplitGroups: [],
                          }))
                        }
                      >
                        Use one combined mapping file
                      </button>
                    </div>

                    <div className="chip-row" style={{ paddingTop: '1rem' }}>
                      {project.mappingSplitGroups.map((group, index) => (
                        <span key={group.id} className="chip" style={{ background: 'var(--accent-700)', color: '#ffffff', fontWeight: 600 }}>
                          Group {index + 1}:&nbsp;&nbsp;&nbsp;{group.plateIds.map((plateId) => project.aspirationPlates.find((plate) => plate.id === plateId)?.name || 'Unnamed').join(', ')}
                          <button
                            type="button"
                            onClick={() =>
                              updateProject((current) => ({
                                ...current,
                                mappingSplitGroups: current.mappingSplitGroups.filter((g) => g.id !== group.id),
                              }))
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="button-row" style={{ marginTop: '1rem' }}>
                    <button type="button" onClick={handleGenerateMappingFiles}>
                      Generate mapping files
                    </button>
                  </div>

                  {exportErrors.length > 0 ? (
                    <ul className="error-list" style={{ marginTop: '1rem' }}>
                      {exportErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mapping-preview-grid" style={{ marginTop: '1rem' }}>
                    {generatedFiles.map((file) => (
                      <div key={file.filename} className="helper-box" style={{ border: 'none', padding: 0 }}>
                        <div className="button-row" style={{ marginBottom: '1rem' }}>
                          <button type="button" className="secondary" onClick={() => downloadTextFile(file.filename, file.content)}>
                            Download {file.filename}
                          </button>
                        </div>
                        <pre className="code-preview" style={{ borderRadius: '6px' }}>{file.content}</pre>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
