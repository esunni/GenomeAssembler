import { ChangeEvent, useMemo, useState } from 'react';

import { createAspirationPlate } from '../utils/janusState';
import { createAspirationTemplateCsv, parseAspirationTemplateCsv, validateAspirationTemplateRows } from '../utils/janusFiles';
import { getSequentialWellIds, getWellIds } from '../utils/plateUtils';
import type { AspirationPlate, AvailableSource, ExperimentProject, FillDirection, LabwareId } from '../types';

interface AspirationPlatesSectionProps {
  project: ExperimentProject;
  availableSources: AvailableSource[];
  onProjectChange: (updater: (current: ExperimentProject) => ExperimentProject) => void;
  onDownloadTextFile: (filename: string, content: string) => void;
  isEcho?: boolean;
}

interface PlateAutofillState {
  familyId: string;
  direction: FillDirection;
  interval: number;
}

export function AspirationPlatesSection({
  project,
  availableSources,
  onProjectChange,
  onDownloadTextFile,
  isEcho,
}: AspirationPlatesSectionProps) {
  const [selectedWells, setSelectedWells] = useState<Record<string, string>>({});
  const [autofillState, setAutofillState] = useState<Record<string, PlateAutofillState>>({});
  const [importMessages, setImportMessages] = useState<Record<string, string>>({});

  const groupedSources = useMemo(
    () =>
      availableSources.reduce(
        (groups, source) => {
          const current = groups.get(source.familyId) ?? {
            familyId: source.familyId,
            familyLabel: source.familyLabel,
            items: [] as AvailableSource[],
          };
          current.items.push(source);
          groups.set(source.familyId, current);
          return groups;
        },
        new Map<string, { familyId: string; familyLabel: string; items: AvailableSource[] }>(),
      ),
    [availableSources],
  );

  const updateAspirationPlate = (plateId: string, updater: (plate: AspirationPlate) => AspirationPlate) => {
    onProjectChange((current) => ({
      ...current,
      aspirationPlates: current.aspirationPlates.map((plate) => (plate.id === plateId ? updater(plate) : plate)),
    }));
  };

  const setAspirationWell = (plateId: string, wellId: string, source: AvailableSource) => {
    updateAspirationPlate(plateId, (plate) => {
      const nextWells = { ...plate.wells };
      
      for (const [id, assignment] of Object.entries(nextWells)) {
        if (assignment.sourceId === source.sourceId && assignment.sourceType === source.sourceType) {
          delete nextWells[id];
        }
      }

      nextWells[wellId] = {
        sourceId: source.sourceId,
        sourceType: source.sourceType,
        displayName: source.displayName,
        componentId: source.componentId,
        parentColor: source.parentColor,
        wellLabel: plate.wells[wellId]?.wellLabel ?? '',
      };

      return {
        ...plate,
        wells: nextWells,
      };
    });
  };

  const handleTemplateImport = async (plate: AspirationPlate, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const rows = parseAspirationTemplateCsv(await file.text());
    const errors = validateAspirationTemplateRows(project, plate.id, rows);

    if (errors.length > 0) {
      setImportMessages((current) => ({ ...current, [plate.id]: errors.join(' ') }));
      event.target.value = '';
      return;
    }

    const sourceLookup = new Map(
      availableSources.map((source) => [
        `${source.familyLabel.toLowerCase()}::${(source.displayName || source.familyLabel).toLowerCase()}`,
        source,
      ]),
    );

    updateAspirationPlate(plate.id, (currentPlate) => {
      const nextWells = { ...currentPlate.wells };
      
      const importedSources = new Set<string>();
      rows.forEach((row) => {
        const key = `${row.component.toLowerCase()}::${(row.itemName || row.component).toLowerCase()}`;
        const source = sourceLookup.get(key);
        if (source) {
          importedSources.add(`${source.sourceType}:${source.sourceId}`);
        }
      });

      for (const [id, assignment] of Object.entries(nextWells)) {
        if (importedSources.has(`${assignment.sourceType}:${assignment.sourceId}`)) {
          delete nextWells[id];
        }
      }

      rows.forEach((row) => {
        const key = `${row.component.toLowerCase()}::${(row.itemName || row.component).toLowerCase()}`;
        const source = sourceLookup.get(key);

        if (source) {
          nextWells[row.well] = {
            sourceId: source.sourceId,
            sourceType: source.sourceType,
            displayName: source.displayName,
            componentId: source.componentId,
            parentColor: source.parentColor,
            wellLabel: row.wellLabel,
          };
        }
      });

      return {
        ...currentPlate,
        wells: nextWells,
      };
    });

    setImportMessages((current) => ({ ...current, [plate.id]: `Imported ${rows.length} template rows.` }));
    event.target.value = '';
  };

  const handleFamilyAutofill = (plate: AspirationPlate) => {
    const config = autofillState[plate.id];
    if (!config) {
      return;
    }

    const group = groupedSources.get(config.familyId);
    if (!group) {
      return;
    }

    const wellOptions = getWellIds(plate.labware);
    const startWell = selectedWells[plate.id] ?? wellOptions[0] ?? 'A1';

    const interval = config.interval || 0;
    const neededWellsCount = group.items.length + Math.max(0, group.items.length - 1) * interval;
    const wells = getSequentialWellIds(plate.labware, startWell, config.direction, neededWellsCount);

    updateAspirationPlate(plate.id, (currentPlate) => {
      const nextWells = { ...currentPlate.wells };

      const familySourceKeys = new Set(group.items.map(s => `${s.sourceType}:${s.sourceId}`));
      for (const [id, assignment] of Object.entries(nextWells)) {
        if (familySourceKeys.has(`${assignment.sourceType}:${assignment.sourceId}`)) {
          delete nextWells[id];
        }
      }

      group.items.forEach((source, index) => {
        const wellId = wells[index * (1 + interval)];
        if (!wellId) {
          return;
        }

        nextWells[wellId] = {
          sourceId: source.sourceId,
          sourceType: source.sourceType,
          displayName: source.displayName,
          componentId: source.componentId,
          parentColor: source.parentColor,
          wellLabel: nextWells[wellId]?.wellLabel ?? '',
        };
      });

      return {
        ...currentPlate,
        wells: nextWells,
      };
    });
  };

  return (
    <section className="section-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>{isEcho ? 'Source Plates' : 'Aspiration Plates'}</h2>
          <p className="section-lead">
            Place one source per well by drag-and-drop, template import, or family autofill. Each plate needs a name for export.
          </p>
        </div>
        <div className="button-row" style={{ marginTop: 0, alignItems: 'stretch' }}>
          <button type="button" className="secondary" onClick={() => onDownloadTextFile('aspiration_template.csv', createAspirationTemplateCsv())}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Template
          </button>
          <button
            type="button"
            className="icon-button icon-add"
            title="Add aspiration plate"
            style={{ height: 'auto', width: 'auto', aspectRatio: '1 / 1' }}
            onClick={() =>
              onProjectChange((current) => ({
                ...current,
                aspirationPlates: [...current.aspirationPlates, createAspirationPlate(isEcho ? 'plate-384' : 'plate-96')],
              }))
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </div>

      <div className="content-grid" style={{ padding: '1rem 0 0' }}>
        {project.aspirationPlates.map((plate) => {
          const wellOptions = getWellIds(isEcho ? 'plate-384' : plate.labware);
          const selectedWell = selectedWells[plate.id] ?? wellOptions[0] ?? 'A1';
          const selectedAssignment = plate.wells[selectedWell];
          const currentAutofill = autofillState[plate.id] ?? {
            familyId: Array.from(groupedSources.keys())[0] ?? '',
            direction: 'horizontal' as FillDirection,
            interval: 0,
          };

          return (
            <div key={plate.id} className="plate-box" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.25rem' }}>
                <label className="icon-button" title="Template CSV import" style={{ cursor: 'pointer', width: '24px', height: '24px' }}>
                  <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(event) => void handleTemplateImport(plate, event)} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </label>
                <button
                  type="button"
                  className="icon-button icon-remove"
                  title="Remove plate"
                  style={{ width: '24px', height: '24px' }}
                  onClick={() =>
                    onProjectChange((current) => ({
                      ...current,
                      aspirationPlates: current.aspirationPlates.filter((candidate) => candidate.id !== plate.id),
                      mappingSplitGroups: current.mappingSplitGroups.map((group) => ({
                        ...group,
                        plateIds: group.plateIds.filter((plateId) => plateId !== plate.id),
                      })),
                    }))
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
              </div>

              <div className="inline-grid" style={{ paddingRight: '4rem' }}>
                <label>
                  {isEcho ? 'Source plate name' : 'Plate name'}
                  <input
                    value={plate.name}
                    onChange={(event) =>
                      updateAspirationPlate(plate.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder={isEcho ? 'Source plate name' : 'Aspiration plate name'}
                  />
                </label>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end' }}>
                  <label style={{ flex: 1 }}>
                    Labware
                    <select
                      value={isEcho ? 'plate-384' : plate.labware}
                      disabled={isEcho}
                      onChange={(event) =>
                        updateAspirationPlate(plate.id, (current) => ({
                          ...current,
                          labware: event.target.value as LabwareId,
                          wells: {},
                        }))
                      }
                    >
                      {isEcho ? (
                        <option value="plate-384">384-well plate</option>
                      ) : (
                        <>
                          <option value="plate-96">96-well plate</option>
                          <option value="rack-4x6">4x6 rack</option>
                        </>
                      )}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-like"
                    style={{ backgroundColor: 'white', color: '#dc3545', border: '1px solid #dc3545', padding: '0.74rem 1rem', borderRadius: '10px', height: '48px', fontWeight: 600 }}
                    onClick={() => updateAspirationPlate(plate.id, (current) => ({ ...current, wells: {} }))}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {importMessages[plate.id] ? <p className="muted">{importMessages[plate.id]}</p> : null}

              <div className="helper-box" style={{ padding: '0.5rem 0.75rem', border: 'none', marginTop: '1rem', backgroundColor: '#f5edfc', fontSize: '0.85rem' }}>
                <div className="inline-grid" style={{ alignItems: 'end', gap: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem' }}>
                    Autofill family
                  <select
                    style={{ padding: '0.4rem 2rem 0.4rem 0.75rem', fontSize: '0.85rem' }}
                    value={currentAutofill.familyId}
                    onChange={(event) =>
                      setAutofillState((current) => ({
                        ...current,
                        [plate.id]: { ...currentAutofill, familyId: event.target.value },
                      }))
                    }
                  >
                    {Array.from(groupedSources.values()).map((group) => (
                      <option key={group.familyId} value={group.familyId}>
                        {group.familyLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: '0.85rem' }}>
                  Direction
                  <select
                    style={{ padding: '0.4rem 2rem 0.4rem 0.75rem', fontSize: '0.85rem' }}
                    value={currentAutofill.direction}
                    onChange={(event) =>
                      setAutofillState((current) => ({
                        ...current,
                        [plate.id]: { ...currentAutofill, direction: event.target.value as FillDirection },
                      }))
                    }
                  >
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                  </select>
                </label>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem' }}>
                  <label style={{ fontSize: '0.85rem' }}>
                    Interval
                    <input
                      type="number"
                      min="0"
                      step="1"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', width: '4rem', boxSizing: 'border-box' }}
                      value={currentAutofill.interval}
                      onChange={(event) => {
                        const val = parseInt(event.target.value, 10);
                        setAutofillState((current) => ({
                          ...current,
                          [plate.id]: { ...currentAutofill, interval: isNaN(val) ? 0 : Math.max(0, val) },
                        }));
                      }}
                    />
                  </label>
                  <button type="button" className="primary-cta" style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', fontWeight: 500, height: '34px' }} onClick={() => handleFamilyAutofill(plate)}>
                    Autofill
                  </button>
                </div>
              </div>
            </div>

              <div className="plate-grid-wrap" style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="plate-grid" data-labware={plate.labware}>
                    {wellOptions.map((wellId) => {
                      const assignment = plate.wells[wellId];
                      const selected = selectedWell === wellId;
                      return (
                        <button
                          key={wellId}
                          type="button"
                          className={`well-button${assignment ? ' filled' : ''}${selected ? ' selected' : ''}`}
                          style={{ background: assignment ? assignment.parentColor : undefined }}
                          title={assignment ? `Well: ${assignment.wellLabel || wellId}\nSource: ${assignment.displayName}` : `Well: ${wellId}`}
                          onClick={() =>
                            setSelectedWells((current) => ({
                              ...current,
                              [plate.id]: wellId,
                            }))
                          }
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const payload = event.dataTransfer.getData('application/janus-source');
                            const source = availableSources.find((candidate) => `${candidate.sourceType}:${candidate.sourceId}` === payload);
                            if (source) {
                              setAspirationWell(plate.id, wellId, source);
                            }
                          }}
                        >
                          <strong>{wellId}</strong>
                          {assignment ? <small>{assignment.displayName}</small> : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="helper-box" style={{ backgroundColor: '#ffffff' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{selectedWell}</h3>
                    {selectedAssignment ? (
                      <>
                        <div className="well-chip-row" style={{ marginBottom: '1rem' }}>
                          <span className="chip" style={{ background: selectedAssignment.parentColor, fontWeight: 600 }}>
                            {selectedAssignment.displayName}
                            <button
                              type="button"
                              onClick={() =>
                                updateAspirationPlate(plate.id, (current) => {
                                  const nextWells = { ...current.wells };
                                  delete nextWells[selectedWell];
                                  return {
                                    ...current,
                                    wells: nextWells,
                                  };
                                })
                              }
                            >
                              ×
                            </button>
                          </span>
                        </div>
                        <label style={{ marginBottom: '1rem' }}>
                          Label
                          <input
                            value={selectedAssignment.wellLabel}
                            onChange={(event) =>
                              updateAspirationPlate(plate.id, (current) => ({
                                ...current,
                                wells: {
                                  ...current.wells,
                                  [selectedWell]: {
                                    ...selectedAssignment,
                                    wellLabel: event.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <p className="muted">Select or drop a source to edit this aspiration well.</p>
                    )}
                  </div>
                </div>

                <div className="editor-box" style={{ backgroundColor: '#f8f9fa', border: 'none' }}>
                  <div className="palette">
                    {Array.from(groupedSources.values()).map((group) => (
                      <div key={group.familyId} className="palette-group">
                        <strong style={{ fontSize: '0.85rem' }}>{group.familyLabel}</strong>
                        <div className="chip-row">
                          {group.items.map((source) => (
                            <button
                              key={`${source.sourceType}:${source.sourceId}`}
                              type="button"
                              className="drag-chip"
                              style={{ background: source.parentColor }}
                              draggable
                              onDragStart={(event) => event.dataTransfer.setData('application/janus-source', `${source.sourceType}:${source.sourceId}`)}
                              onClick={() => setAspirationWell(plate.id, selectedWell, source)}
                            >
                              {source.displayName}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
