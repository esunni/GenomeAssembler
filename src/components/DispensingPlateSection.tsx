import { useMemo, useState } from 'react';

import { getSequentialWellIds, getWellIds } from '../utils/plateUtils';
import type { DispensingWellAssignment, DispensingWellItem, ExperimentProject, FillDirection, LabwareId } from '../types';

interface DispensingPlateSectionProps {
  project: ExperimentProject;
  onProjectChange: (updater: (current: ExperimentProject) => ExperimentProject) => void;
}

interface DispenseAutofillState {
  sourceKey: string;
  startWell: string;
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
    startWell: 'A1',
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
    setDispensingWellItems(wellId, [...currentItems, item]);
  };

  const handleAutofill = () => {
    const source = aspirationPlacedSources.find(
      (candidate) => `${candidate.sourceType}:${candidate.sourceId}` === autofillState.sourceKey,
    );

    if (!source) {
      return;
    }

    const targetWells = getSequentialWellIds(
      project.dispensingPlate.labware,
      autofillState.startWell,
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
            wellName:
              autofillState.wellNamePrefix.trim() === ''
                ? existing.wellName
                : `${autofillState.wellNamePrefix}_${index + 1}`,
            items: [
              ...existing.items,
              {
                sourceId: source.sourceId,
                sourceType: source.sourceType,
                displayName: source.displayName,
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

  return (
    <section className="section-card">
      <h2>Dispensing Plate</h2>
      <p className="section-lead">
        Use one dispensing plate, allow multiple source items per well, and autofill target wells from aspiration sources.
      </p>

      <div className="inline-grid">
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
        <label>
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
      </div>

      <div className="inline-grid" style={{ marginTop: '1rem' }}>
        <label>
          Autofill source
          <select
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
        <label>
          Start well
          <select
            value={autofillState.startWell}
            onChange={(event) => setAutofillState((current) => ({ ...current, startWell: event.target.value }))}
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
            value={autofillState.direction}
            onChange={(event) => setAutofillState((current) => ({ ...current, direction: event.target.value as FillDirection }))}
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </label>
        <label>
          Count
          <input
            type="number"
            min="1"
            value={autofillState.count}
            onChange={(event) => setAutofillState((current) => ({ ...current, count: Number(event.target.value) || 1 }))}
          />
        </label>
        <label>
          Well name prefix
          <input
            value={autofillState.wellNamePrefix}
            onChange={(event) => setAutofillState((current) => ({ ...current, wellNamePrefix: event.target.value }))}
          />
        </label>
        <div className="button-row">
          <button type="button" className="secondary" onClick={handleAutofill}>
            Autofill dispensing wells
          </button>
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
                style={{ background: assignment?.items[0]?.parentColor ? assignment.items[0].parentColor : undefined }}
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
                      displayName: source.displayName,
                      componentId: source.componentId,
                      parentColor: source.parentColor,
                    });
                  }
                }}
              >
                <strong>{wellId}</strong>
                <small>{assignment?.wellName || `${assignment?.items.length ?? 0} sources`}</small>
              </button>
            );
          })}
        </div>

        <div className="editor-box">
          <h3>Placed source palette</h3>
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
                    displayName: source.displayName,
                    componentId: source.componentId,
                    parentColor: source.parentColor,
                  })
                }
              >
                {source.displayName} ({source.plateName ? `${source.plateName}, ` : ''}{source.wellId})
              </button>
            ))}
          </div>

          <div className="helper-box" style={{ marginTop: '1rem' }}>
            <h3>Selected well {selectedWell}</h3>
            <label>
              Optional well name
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
