import { useMemo, useState } from 'react';

import { getSequentialWellIds, getWellIds } from '../utils/plateUtils';
import type { DispensingWellAssignment, DispensingWellItem, ExperimentProject, FillDirection, LabwareId } from '../types';

interface DispensingPlateSectionProps {
  project: ExperimentProject;
  onProjectChange: (updater: (current: ExperimentProject) => ExperimentProject) => void;
}

interface DispenseAutofillState {
  sourceKey: string;
  direction: FillDirection;
  count: number;
  wellNamePrefix: string;
}

function createDispensingAssignment(existing?: DispensingWellAssignment): DispensingWellAssignment {
  return existing ?? { wellName: '', items: [] };
}

export function DispensingPlateSection({ project, onProjectChange }: DispensingPlateSectionProps) {
  const [selectedWell, setSelectedWell] = useState('A1');
  const [autofillState, setAutofillState] = useState<DispenseAutofillState>({
    sourceKey: '',
    direction: 'horizontal',
    count: 8,
    wellNamePrefix: 'Sample',
  });

  const aspirationPlacedSources = useMemo(
    () =>
      project.aspirationPlates.flatMap((plate) =>
        Object.entries(plate.wells).map(([wellId, assignment]) => ({
          ...assignment,
          displayName: assignment.wellLabel ? assignment.wellLabel : assignment.displayName,
          plateId: plate.id,
          plateName: plate.name,
          wellId,
        })),
      ),
    [project.aspirationPlates],
  );
  const wellOptions = useMemo(() => getWellIds(project.dispensingPlate.labware), [project.dispensingPlate.labware]);

  const setDispensingWellItems = (wellId: string, items: DispensingWellItem[]) => {
    onProjectChange((current) => ({
      ...current,
      dispensingPlate: {
        ...current.dispensingPlate,
        wells: {
          ...current.dispensingPlate.wells,
          [wellId]: {
            ...createDispensingAssignment(current.dispensingPlate.wells[wellId]),
            items,
          },
        },
      },
    }));
  };

  const addItemToDispensingWell = (wellId: string, item: DispensingWellItem) => {
    const currentItems = createDispensingAssignment(project.dispensingPlate.wells[wellId]).items;
    
    // Prevent duplicate source from being added to the same well
    if (currentItems.some(i => i.sourceId === item.sourceId && i.sourceType === item.sourceType)) {
      return;
    }
    
    setDispensingWellItems(wellId, [...currentItems, item]);
  };

  const handleSourceAutofill = () => {
    const source = aspirationPlacedSources.find(
      (candidate) => `${candidate.sourceType}:${candidate.sourceId}` === autofillState.sourceKey,
    );

    if (!source) {
      return;
    }

    const targetWells = getSequentialWellIds(
      project.dispensingPlate.labware,
      selectedWell,
      autofillState.direction,
      autofillState.count,
    );

    onProjectChange((current) => ({
      ...current,
      dispensingPlate: {
        ...current.dispensingPlate,
        wells: targetWells.reduce<Record<string, DispensingWellAssignment>>((wells, wellId) => {
          const existing = createDispensingAssignment(current.dispensingPlate.wells[wellId]);
          
          if (existing.items.some(i => i.sourceId === source.sourceId && i.sourceType === source.sourceType)) {
            wells[wellId] = existing;
            return wells;
          }

          wells[wellId] = {
            ...existing,
            items: [
              ...existing.items,
              {
                sourceId: source.sourceId,
                sourceType: source.sourceType,
                displayName: `${source.displayName} (${source.plateName ? `${source.plateName}, ` : ''}${source.wellId})`,
                componentId: source.componentId,
                parentColor: source.parentColor,
              },
            ],
          };
          return wells;
        }, { ...current.dispensingPlate.wells }),
      },
    }));
  };

  const handleSampleAutofill = () => {
    const targetWells = getSequentialWellIds(
      project.dispensingPlate.labware,
      selectedWell,
      autofillState.direction,
      autofillState.count,
    );

    onProjectChange((current) => ({
      ...current,
      dispensingPlate: {
        ...current.dispensingPlate,
        wells: targetWells.reduce<Record<string, DispensingWellAssignment>>((wells, wellId, index) => {
          const existing = createDispensingAssignment(current.dispensingPlate.wells[wellId]);
          wells[wellId] = {
            ...existing,
            wellName: autofillState.wellNamePrefix.trim() === ''
                ? existing.wellName
                : `${autofillState.wellNamePrefix}_${index + 1}`
          };
          return wells;
        }, { ...current.dispensingPlate.wells }),
      },
    }));
  };

  return (
    <section className="section-card">
      <h2>Dispensing Plate</h2>
      <p className="section-lead">
        Use one dispensing plate, allow multiple source items per well, and autofill target wells from aspiration sources.
      </p>

      <div className="plate-box" style={{ position: 'relative', marginTop: '1.5rem' }}>
        <div className="inline-grid" style={{ paddingRight: '4rem' }}>
          <label>
            Dispensing plate name
            <input
              value={project.dispensingPlate.name}
              onChange={(event) =>
                onProjectChange((current) => ({
                  ...current,
                  dispensingPlate: {
                    ...current.dispensingPlate,
                    name: event.target.value,
                  },
                }))
              }
              placeholder="Dispensing plate name"
            />
          </label>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end' }}>
            <label style={{ flex: 1 }}>
              Labware
              <select
                value={project.dispensingPlate.labware}
                onChange={(event) =>
                  onProjectChange((current) => ({
                    ...current,
                    dispensingPlate: {
                      ...current.dispensingPlate,
                      labware: event.target.value as LabwareId,
                      wells: {},
                    },
                  }))
                }
              >
                <option value="plate-96">96-well plate</option>
                <option value="rack-4x6">4x6 rack</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-like"
              style={{ backgroundColor: 'white', color: '#dc3545', border: '1px solid #dc3545', padding: '0.74rem 1rem', borderRadius: '10px', height: '48px', fontWeight: 600 }}
              onClick={() => onProjectChange((current) => ({ ...current, dispensingPlate: { ...current.dispensingPlate, wells: {} } }))}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="helper-box" style={{ padding: '0.5rem 0.75rem', border: 'none', marginTop: '1rem', backgroundColor: '#f5edfc', fontSize: '0.85rem' }}>
          <div className="inline-grid" style={{ alignItems: 'end', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem' }}>
              Autofill source
              <select
                style={{ padding: '0.4rem 2rem 0.4rem 0.75rem', fontSize: '0.85rem' }}
                value={autofillState.sourceKey}
                onChange={(event) => setAutofillState((current) => ({ ...current, sourceKey: event.target.value }))}
              >
                <option value="">Choose source</option>
                {aspirationPlacedSources.map((source) => (
                  <option key={`${source.sourceType}:${source.sourceId}`} value={`${source.sourceType}:${source.sourceId}`}>
                    {source.displayName} ({source.plateName ? `${source.plateName}, ` : ''}{source.wellId})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '0.85rem' }}>
              Direction
              <select
                style={{ padding: '0.4rem 2rem 0.4rem 0.75rem', fontSize: '0.85rem' }}
                value={autofillState.direction}
                onChange={(event) => setAutofillState((current) => ({ ...current, direction: event.target.value as FillDirection }))}
              >
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem' }}>
              <label style={{ fontSize: '0.85rem' }}>
                Count
                <input
                  type="number"
                  min="1"
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', width: '4rem', boxSizing: 'border-box' }}
                  value={autofillState.count}
                  onChange={(event) => setAutofillState((current) => ({ ...current, count: Number(event.target.value) || 1 }))}
                />
              </label>
              <button type="button" className="primary-cta" style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', fontWeight: 500, height: '34px' }} onClick={handleSourceAutofill}>
                Autofill Sources
              </button>
            </div>
            
            <label style={{ fontSize: '0.85rem' }}>
              Well name prefix
              <input
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', boxSizing: 'border-box' }}
                value={autofillState.wellNamePrefix}
                onChange={(event) => setAutofillState((current) => ({ ...current, wellNamePrefix: event.target.value }))}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem' }}>
              <button type="button" className="primary-cta" style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', fontWeight: 500, height: '34px', backgroundColor: '#8430bf', borderColor: '#8430bf' }} onClick={handleSampleAutofill}>
                Autofill Sample Names
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="plate-grid-wrap" style={{ marginTop: '1rem' }}>
        <div className="plate-grid" data-labware={project.dispensingPlate.labware}>
          {wellOptions.map((wellId) => {
            const assignment = project.dispensingPlate.wells[wellId];
            const selected = selectedWell === wellId;
            return (
              <button
                key={wellId}
                type="button"
                className={`well-button${assignment ? ' filled' : ''}${selected ? ' selected' : ''}`}
                style={{ background: '#f8f9fa' }}
                onClick={() => setSelectedWell(wellId)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const payload = event.dataTransfer.getData('application/janus-source');
                  const source = aspirationPlacedSources.find((candidate) => `${candidate.sourceType}:${candidate.sourceId}` === payload);

                  if (source) {
                    addItemToDispensingWell(wellId, {
                      sourceId: source.sourceId,
                      sourceType: source.sourceType,
                      displayName: `${source.displayName} (${source.plateName ? `${source.plateName}, ` : ''}${source.wellId})`,
                      componentId: source.componentId,
                      parentColor: source.parentColor,
                    });
                  }
                }}
              >
                <strong style={{ color: 'var(--text)' }}>{wellId}</strong>
                {assignment?.wellName ? (
                  <small style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '100%' }}>
                    {assignment.wellName}
                  </small>
                ) : null}
                {assignment?.items?.length ? (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {assignment.items.map((item, idx) => (
                      <div key={idx} style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.parentColor }} title={item.displayName} />
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="editor-box" style={{ border: 'none', backgroundColor: '#f8f9fa' }}>
          <div className="chip-row">
            {aspirationPlacedSources.map((source) => (
              <button
                key={`${source.sourceType}:${source.sourceId}`}
                type="button"
                className="drag-chip"
                style={{ background: source.parentColor }}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('application/janus-source', `${source.sourceType}:${source.sourceId}`)}
                onClick={() =>
                  addItemToDispensingWell(selectedWell, {
                    sourceId: source.sourceId,
                    sourceType: source.sourceType,
                    displayName: `${source.displayName} (${source.plateName ? `${source.plateName}, ` : ''}${source.wellId})`,
                    componentId: source.componentId,
                    parentColor: source.parentColor,
                  })
                }
              >
                {source.displayName} ({source.plateName ? `${source.plateName}, ` : ''}{source.wellId})
              </button>
            ))}
          </div>

          <div className="helper-box" style={{ backgroundColor: '#ffffff', border: 'none', marginTop: '1rem' }}>
            <h3>{selectedWell}</h3>
            <label>
              Label
              <input
                value={createDispensingAssignment(project.dispensingPlate.wells[selectedWell]).wellName}
                onChange={(event) =>
                  onProjectChange((current) => ({
                    ...current,
                    dispensingPlate: {
                      ...current.dispensingPlate,
                      wells: {
                        ...current.dispensingPlate.wells,
                        [selectedWell]: {
                          ...createDispensingAssignment(current.dispensingPlate.wells[selectedWell]),
                          wellName: event.target.value,
                        },
                      },
                    },
                  }))
                }
              />
            </label>

            <div className="well-chip-row" style={{ marginTop: '0.75rem' }}>
              {createDispensingAssignment(project.dispensingPlate.wells[selectedWell]).items.map((item, index) => (
                <span key={`${item.sourceType}:${item.sourceId}:${index}`} className="chip" style={{ background: item.parentColor }}>
                  {item.displayName}
                  <button
                    type="button"
                    onClick={() =>
                      setDispensingWellItems(
                        selectedWell,
                        createDispensingAssignment(project.dispensingPlate.wells[selectedWell]).items.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
