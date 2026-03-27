import { ChangeEvent, useMemo, useRef, useState } from 'react';

import { buildAvailableSources, buildPreparationSummaries, buildRemainderCalculation, createDefaultProject, createProtocolComponent } from './utils/janusState';
import { exportProjectJson, generateMappingCsvFiles, importProjectJson, validateMappingExport } from './utils/janusFiles';
import { ReactionSetupSection } from './components/ReactionSetupSection';
import { AspirationPlatesSection } from './components/AspirationPlatesSection';
import { DispensingPlateSection } from './components/DispensingPlateSection';
import type { ExperimentProject } from './types';

const defaultProtocolPaste = 'component,transfer_volume\nBuffer,2\nPrimer,1';

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});

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
  const [bulkProtocolText, setBulkProtocolText] = useState(defaultProtocolPaste);
  const [exportErrors, setExportErrors] = useState<string[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<Array<{ filename: string; content: string }>>([]);
  const [splitSelection, setSplitSelection] = useState<string[]>([]);
  const loadInputRef = useRef<HTMLInputElement | null>(null);

  const availableSources = useMemo(() => buildAvailableSources(project), [project]);
  const preparationSummaries = useMemo(() => buildPreparationSummaries(project), [project]);
  const remainderCalculation = useMemo(() => buildRemainderCalculation(project), [project]);

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

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="hero">
          <div className="hero-top">
            <div>
              <p className="hero-eyebrow">Static GitHub Pages workflow for Janus reaction setup and mapping export.</p>
              <h1>GenomeAssembler</h1>
            </div>
            <nav className="menu-tabs" aria-label="Primary">
              <button type="button" aria-current="page">
                Janus
              </button>
              <button type="button" disabled>
                Design
              </button>
            </nav>
          </div>

          <div className="hero-grid">
            <label>
              Experiment name
              <input
                aria-label="Experiment name"
                value={project.experimentName}
                onChange={(event) => updateProject((current) => ({ ...current, experimentName: event.target.value }))}
                placeholder="Enter experiment name"
              />
            </label>
            <div className="button-row">
              <button type="button" onClick={() => downloadTextFile(`${project.experimentName.trim() || 'janus-project'}_project.json`, exportProjectJson(project))}>
                Save project JSON
              </button>
              <button type="button" className="secondary" onClick={() => loadInputRef.current?.click()}>
                Load project JSON
              </button>
              <input ref={loadInputRef} type="file" accept=".json,application/json" hidden onChange={handleProjectLoad} />
            </div>
          </div>
        </header>

        <main className="content-grid">
          <ReactionSetupSection
            project={project}
            bulkProtocolText={bulkProtocolText}
            onBulkProtocolTextChange={setBulkProtocolText}
            onImportProtocolPaste={handleProtocolPasteImport}
            onProjectChange={updateProject}
          />

          <AspirationPlatesSection
            project={project}
            availableSources={availableSources}
            onProjectChange={updateProject}
            onDownloadTextFile={downloadTextFile}
          />

          <DispensingPlateSection project={project} onProjectChange={updateProject} />

          <section className="section-card">
            <h2>Preparation Volumes</h2>
            <p className="section-lead">Review calculated preparation summaries and the remainder-component helper outputs.</p>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Kind</th>
                    <th>Dispensing count</th>
                    <th>Component volume</th>
                    <th>Dead volume</th>
                    <th>Whole required rxn</th>
                    <th>Total prep volume</th>
                  </tr>
                </thead>
                <tbody>
                  {preparationSummaries.map((summary) => (
                    <tr key={`${summary.sourceType}:${summary.sourceId}`}>
                      <td>{summary.displayName}</td>
                      <td>{summary.sourceKind}</td>
                      <td>{summary.usageCount}</td>
                      <td>{summary.componentVolume}</td>
                      <td>{summary.deadVolume}</td>
                      <td>{summary.wholeReactionCount}</td>
                      <td>{summary.totalPreparationVolume}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="helper-box" style={{ marginTop: '1rem' }}>
              <h3>Remainder-component helper</h3>
              <div className="inline-grid">
                <label>
                  Enable helper
                  <select
                    value={project.remainderConfig.enabled ? 'yes' : 'no'}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        remainderConfig: {
                          ...current.remainderConfig,
                          enabled: event.target.value === 'yes',
                        },
                      }))
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label>
                  Fixed/manual component
                  <select
                    value={project.remainderConfig.fixedComponentId ?? ''}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        remainderConfig: {
                          ...current.remainderConfig,
                          fixedComponentId: event.target.value || null,
                        },
                      }))
                    }
                  >
                    <option value="">Choose component</option>
                    {project.protocolComponents.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.name || 'Unnamed component'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Remainder component
                  <select
                    value={project.remainderConfig.remainderComponentId ?? ''}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        remainderConfig: {
                          ...current.remainderConfig,
                          remainderComponentId: event.target.value || null,
                        },
                      }))
                    }
                  >
                    <option value="">Choose component</option>
                    {project.protocolComponents.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.name || 'Unnamed component'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Total reaction volume (uL)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={project.remainderConfig.targetReactionVolume}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        remainderConfig: {
                          ...current.remainderConfig,
                          targetReactionVolume: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Manual batch volume (uL)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={project.remainderConfig.manualBatchVolume}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        remainderConfig: {
                          ...current.remainderConfig,
                          manualBatchVolume: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  DNA concentration (ng/uL)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={project.remainderConfig.dnaConcentration}
                    onChange={(event) =>
                      updateProject((current) => ({
                        ...current,
                        remainderConfig: {
                          ...current.remainderConfig,
                          dnaConcentration: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>

              {remainderCalculation ? (
                <div className="inline-grid">
                  <div className="helper-box">
                    <strong>Required dispensing count</strong>
                    <p>{remainderCalculation.requiredReactionCount}</p>
                  </div>
                  <div className="helper-box">
                    <strong>Whole required rxn</strong>
                    <p>{remainderCalculation.wholeReactionCount}</p>
                  </div>
                  <div className="helper-box">
                    <strong>Total batch target volume</strong>
                    <p>{numberFormatter.format(remainderCalculation.totalBatchTargetVolume)} uL</p>
                  </div>
                  <div className="helper-box">
                    <strong>Remainder volume</strong>
                    <p>{numberFormatter.format(remainderCalculation.remainderVolume)} uL</p>
                  </div>
                  {remainderCalculation.dnaMassPerReaction !== null ? (
                    <div className="helper-box">
                      <strong>DNA mass per reaction</strong>
                      <p>{numberFormatter.format(remainderCalculation.dnaMassPerReaction)} ng</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="muted">Choose the fixed and remainder components, then enter the batch targets to calculate the remainder volume.</p>
              )}
            </div>
          </section>

          <section className="section-card">
            <h2>Mapping Files</h2>
            <p className="section-lead">Generate one combined CSV or partition aspiration plates into custom split groups.</p>

            <div className="helper-box">
              <h3>Split groups</h3>
              <div className="chip-row">
                {project.aspirationPlates.map((plate) => (
                  <button
                    key={plate.id}
                    type="button"
                    className="drag-chip"
                    style={{
                      background: splitSelection.includes(plate.id) ? '#0b6e4f' : '#d9e2ec',
                      color: splitSelection.includes(plate.id) ? '#fff' : '#183b56',
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
                  Add selected split group
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

              <div className="content-grid" style={{ padding: '1rem 0 0' }}>
                {project.mappingSplitGroups.map((group) => (
                  <div key={group.id} className="helper-box">
                    <strong>
                      {group.plateIds
                        .map((plateId) => project.aspirationPlates.find((plate) => plate.id === plateId)?.name || 'Unnamed')
                        .join(', ')}
                    </strong>
                  </div>
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
                <div key={file.filename} className="helper-box">
                  <div className="button-row">
                    <button type="button" className="secondary" onClick={() => downloadTextFile(file.filename, file.content)}>
                      Download {file.filename}
                    </button>
                  </div>
                  <pre className="code-preview">{file.content}</pre>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
