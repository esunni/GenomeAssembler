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
}

interface PlateAutofillState {
  familyId: string;
  startWell: string;
  direction: FillDirection;
}

export function AspirationPlatesSection({
  project,
  availableSources,
  onProjectChange,
  onDownloadTextFile,
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
    updateAspirationPlate(plateId, (plate) => ({
      ...plate,
      wells: {
        ...plate.wells,
        [wellId]: {
          sourceId: source.sourceId,
          sourceType: source.sourceType,
          displayName: source.displayName,
          componentId: source.componentId,
          parentColor: source.parentColor,
          wellLabel: plate.wells[wellId]?.wellLabel ?? '',
        },
      },
    }));
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

    const wells = getSequentialWellIds(plate.labware, config.startWell, config.direction, group.items.length);

    updateAspirationPlate(plate.id, (currentPlate) => {
      const nextWells = { ...currentPlate.wells };
      wells.forEach((wellId, index) => {
        const source = group.items[index];
        if (!source) {
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
      <h2>Aspiration Plates</h2>
      <p className="section-lead">
        Place one source per well by drag-and-drop, template import, or family autofill. Each plate needs a name for export.
      </p>

      <div className="button-row">
        <button
          type="button"
          onClick={() =>
            onProjectChange((current) => ({
              ...current,
              aspirationPlates: [...current.aspirationPlates, createAspirationPlate()],
            }))
          }
        >
          Add aspiration plate
        </button>
        <button type="button" className="secondary" onClick={() => onDownloadTextFile('aspiration_template.csv', createAspirationTemplateCsv())}>
          Download aspiration template
        </button>
      </div>

      <div className="content-grid" style={{ padding: '1rem 0 0' }}>
        {project.aspirationPlates.map((plate) => {
          const wellOptions = getWellIds(plate.labware);
          const selectedWell = selectedWells[plate.id] ?? wellOptions[0] ?? 'A1';
          const selectedAssignment = plate.wells[selectedWell];
          const currentAutofill = autofillState[plate.id] ?? {
            familyId: Array.from(groupedSources.keys())[0] ?? '',
            startWell: wellOptions[0] ?? 'A1',
            direction: 'horizontal' as FillDirection,
          };

          return (
            <div key={plate.id} className="plate-box">
              <div className="inline-grid">
                <label>
                  Plate name
                  <input
                    value={plate.name}
                    onChange={(event) =>
                      updateAspirationPlate(plate.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Aspiration plate name"
                  />
                </label>
                <label>
                  Labware
                  <select
                    value={plate.labware}
                    onChange={(event) =>
                      updateAspirationPlate(plate.id, (current) => ({
                        ...current,
                        labware: event.target.value as LabwareId,
                        wells: {},
                      }))
                    }
                  >
                    <option value="plate-96">96-well plate</option>
                    <option value="rack-4x6">4x6 rack</option>
                  </select>
                </label>
                <label>
                  Template CSV import
                  <input type="file" accept=".csv,text/csv" onChange={(event) => void handleTemplateImport(plate, event)} />
                </label>
              </div>

              {importMessages[plate.id] ? <p className="muted">{importMessages[plate.id]}</p> : null}

              <div className="inline-grid" style={{ marginTop: '1rem' }}>
                <label>
                  Autofill family
                  <select
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
                <label>
                  Start well
                  <select
                    value={currentAutofill.startWell}
                    onChange={(event) =>
                      setAutofillState((current) => ({
                        ...current,
                        [plate.id]: { ...currentAutofill, startWell: event.target.value },
                      }))
                    }
                  >
                    {wellOptions.map((wellId) => (
                      <option key={wellId} value={wellId}>
                        {wellId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Direction
                  <select
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
                <div className="button-row">
                  <button type="button" className="secondary" onClick={() => handleFamilyAutofill(plate)}>
                    Autofill family
                  </button>
                  <button
                    type="button"
                    className="ghost"
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
                    Remove plate
                  </button>
                </div>
              </div>

              <div className="plate-grid-wrap" style={{ marginTop: '1rem' }}>
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
                        <small>{assignment?.displayName ?? 'Drop source'}</small>
                      </button>
                    );
                  })}
                </div>

                <div className="editor-box">
                  <h3>Palette and selected well</h3>
                  <div className="palette">
                    {Array.from(groupedSources.values()).map((group) => (
                      <div key={group.familyId} className="palette-group">
                        <strong>{group.familyLabel}</strong>
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

                  <div className="helper-box" style={{ marginTop: '1rem' }}>
                    <h3>Selected well {selectedWell}</h3>
                    {selectedAssignment ? (
                      <>
                        <p className="muted">{selectedAssignment.displayName}</p>
                        <label>
                          Optional well label
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
                        <div className="button-row" style={{ marginTop: '0.75rem' }}>
                          <button
                            type="button"
                            className="ghost"
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
                            Clear selected well
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="muted">Select or drop a source to edit this aspiration well.</p>
                    )}
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
