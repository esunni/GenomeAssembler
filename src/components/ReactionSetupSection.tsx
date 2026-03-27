import { useState } from 'react';

import { createId, createProtocolComponent } from '../utils/janusState';
import type { ExperimentProject, PremixGroup, ProtocolComponent } from '../types';

interface ReactionSetupSectionProps {
  project: ExperimentProject;
  bulkProtocolText: string;
  onBulkProtocolTextChange: (value: string) => void;
  onImportProtocolPaste: () => void;
  onProjectChange: (updater: (current: ExperimentProject) => ExperimentProject) => void;
}

export function ReactionSetupSection({
  project,
  bulkProtocolText,
  onBulkProtocolTextChange,
  onImportProtocolPaste,
  onProjectChange,
}: ReactionSetupSectionProps) {
  const [patternConfig, setPatternConfig] = useState<Record<string, { prefix: string; start: number; end: number; suffix: string }>>({});

  const updateProtocolComponent = (componentId: string, updater: (component: ProtocolComponent) => ProtocolComponent) => {
    onProjectChange((current) => ({
      ...current,
      protocolComponents: current.protocolComponents.map((component) =>
        component.id === componentId ? updater(component) : component,
      ),
    }));
  };

  const handlePatternGenerate = (componentId: string) => {
    const config = patternConfig[componentId];
    if (!config) {
      return;
    }

    updateProtocolComponent(componentId, (component) => ({
      ...component,
      subItems: Array.from({ length: Math.max(config.end - config.start + 1, 0) }, (_, index) => ({
        id: createId('item'),
        name: `${config.prefix}${config.start + index}${config.suffix}`,
      })),
    }));
  };

  return (
    <section className="section-card">
      <h2>Reaction Setup</h2>
      <p className="section-lead">
        Define components, transfer volumes, dead-volume behavior, reusable subitem lists, and premix groups.
      </p>

      <div className="helper-box">
        <h3>Quick protocol paste</h3>
        <div className="two-column-grid">
          <label>
            Paste CSV rows as `component,transfer_volume`
            <textarea rows={4} value={bulkProtocolText} onChange={(event) => onBulkProtocolTextChange(event.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" onClick={onImportProtocolPaste}>
              Import pasted protocol rows
            </button>
          </div>
        </div>
      </div>

      <div className="inline-grid" style={{ marginTop: '1rem' }}>
        <label>
          Global dead volume (uL)
          <input
            type="number"
            min="0"
            step="0.1"
            value={project.globalDeadVolume}
            onChange={(event) =>
              onProjectChange((current) => ({
                ...current,
                globalDeadVolume: Number(event.target.value) || 0,
              }))
            }
          />
        </label>
        <label>
          Use global dead volume
          <select
            value={project.useGlobalDeadVolume ? 'yes' : 'no'}
            onChange={(event) =>
              onProjectChange((current) => ({
                ...current,
                useGlobalDeadVolume: event.target.value === 'yes',
              }))
            }
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      <div className="table-wrap" style={{ marginTop: '1rem' }}>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Transfer volume (uL)</th>
              <th>Color</th>
              <th>Dead volume</th>
              <th>Subitems and naming rule</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {project.protocolComponents.map((component) => (
              <tr key={component.id}>
                <td>
                  <input
                    value={component.name}
                    onChange={(event) => updateProtocolComponent(component.id, (current) => ({ ...current, name: event.target.value }))}
                    placeholder="Component name"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={component.transferVolume}
                    onChange={(event) =>
                      updateProtocolComponent(component.id, (current) => ({
                        ...current,
                        transferVolume: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={component.color}
                    onChange={(event) => updateProtocolComponent(component.id, (current) => ({ ...current, color: event.target.value }))}
                  />
                </td>
                <td>
                  <div className="control-stack">
                    <select
                      value={component.deadVolumeMode}
                      onChange={(event) =>
                        updateProtocolComponent(component.id, (current) => ({
                          ...current,
                          deadVolumeMode: event.target.value as ProtocolComponent['deadVolumeMode'],
                        }))
                      }
                    >
                      <option value="global">Use global</option>
                      <option value="custom">Custom</option>
                    </select>
                    {component.deadVolumeMode === 'custom' ? (
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={component.customDeadVolume ?? 0}
                        onChange={(event) =>
                          updateProtocolComponent(component.id, (current) => ({
                            ...current,
                            customDeadVolume: Number(event.target.value) || 0,
                          }))
                        }
                      />
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="subitem-box">
                    <div className="chip-row">
                      {component.subItems.map((item) => (
                        <span key={item.id} className="chip" style={{ background: component.color }}>
                          {item.name}
                          <button
                            type="button"
                            onClick={() =>
                              updateProtocolComponent(component.id, (current) => ({
                                ...current,
                                subItems: current.subItems.filter((candidate) => candidate.id !== item.id),
                              }))
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="button-row" style={{ marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          updateProtocolComponent(component.id, (current) => ({
                            ...current,
                            subItems: [
                              ...current.subItems,
                              { id: createId('item'), name: `${current.name || 'Item'}_${current.subItems.length + 1}` },
                            ],
                          }))
                        }
                      >
                        Add subitem
                      </button>
                    </div>

                    <div className="inline-grid" style={{ marginTop: '0.75rem' }}>
                      <label>
                        Prefix
                        <input
                          value={patternConfig[component.id]?.prefix ?? ''}
                          onChange={(event) =>
                            setPatternConfig((current) => ({
                              ...current,
                              [component.id]: {
                                prefix: event.target.value,
                                start: current[component.id]?.start ?? 1,
                                end: current[component.id]?.end ?? 3,
                                suffix: current[component.id]?.suffix ?? '',
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Start
                        <input
                          type="number"
                          min="1"
                          value={patternConfig[component.id]?.start ?? 1}
                          onChange={(event) =>
                            setPatternConfig((current) => ({
                              ...current,
                              [component.id]: {
                                prefix: current[component.id]?.prefix ?? '',
                                start: Number(event.target.value) || 1,
                                end: current[component.id]?.end ?? 3,
                                suffix: current[component.id]?.suffix ?? '',
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        End
                        <input
                          type="number"
                          min="1"
                          value={patternConfig[component.id]?.end ?? 3}
                          onChange={(event) =>
                            setPatternConfig((current) => ({
                              ...current,
                              [component.id]: {
                                prefix: current[component.id]?.prefix ?? '',
                                start: current[component.id]?.start ?? 1,
                                end: Number(event.target.value) || 3,
                                suffix: current[component.id]?.suffix ?? '',
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Suffix
                        <input
                          value={patternConfig[component.id]?.suffix ?? ''}
                          onChange={(event) =>
                            setPatternConfig((current) => ({
                              ...current,
                              [component.id]: {
                                prefix: current[component.id]?.prefix ?? '',
                                start: current[component.id]?.start ?? 1,
                                end: current[component.id]?.end ?? 3,
                                suffix: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="button-row" style={{ marginTop: '0.75rem' }}>
                      <button type="button" className="secondary" onClick={() => handlePatternGenerate(component.id)}>
                        Generate naming rule
                      </button>
                    </div>
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      onProjectChange((current) => ({
                        ...current,
                        protocolComponents: current.protocolComponents.filter((candidate) => candidate.id !== component.id),
                        premixGroups: current.premixGroups.map((group) => ({
                          ...group,
                          componentIds: group.componentIds.filter((componentId) => componentId !== component.id),
                        })),
                      }))
                    }
                    disabled={project.protocolComponents.length === 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="button-row" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          onClick={() =>
            onProjectChange((current) => ({
              ...current,
              protocolComponents: [...current.protocolComponents, createProtocolComponent()],
            }))
          }
        >
          Add component row
        </button>
      </div>

      <div className="premix-box" style={{ marginTop: '1rem' }}>
        <h3>Premix groups</h3>
        <p className="muted">Keep protocol rows separate, then combine selected rows into one premix source for aspiration.</p>

        <div className="button-row" style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              onProjectChange((current) => ({
                ...current,
                premixGroups: [
                  ...current.premixGroups,
                  {
                    id: createId('premix'),
                    name: `Premix_${current.premixGroups.length + 1}`,
                    componentIds: [],
                    color: current.protocolComponents[0]?.color ?? '#0b6e4f',
                  } satisfies PremixGroup,
                ],
              }))
            }
          >
            Add premix group
          </button>
        </div>

        <div className="inline-grid">
          {project.premixGroups.map((group) => (
            <div key={group.id} className="helper-box">
              <label>
                Premix name
                <input
                  value={group.name}
                  onChange={(event) =>
                    onProjectChange((current) => ({
                      ...current,
                      premixGroups: current.premixGroups.map((candidate) =>
                        candidate.id === group.id ? { ...candidate, name: event.target.value } : candidate,
                      ),
                    }))
                  }
                />
              </label>

              <div className="chip-row" style={{ marginTop: '0.75rem' }}>
                {project.protocolComponents.map((component) => {
                  const active = group.componentIds.includes(component.id);
                  return (
                    <button
                      key={component.id}
                      type="button"
                      className="drag-chip"
                      style={{ background: active ? component.color : '#d9e2ec', color: active ? '#fff' : '#183b56' }}
                      onClick={() =>
                        onProjectChange((current) => ({
                          ...current,
                          premixGroups: current.premixGroups.map((candidate) =>
                            candidate.id === group.id
                              ? {
                                  ...candidate,
                                  color: active ? candidate.color : component.color,
                                  componentIds: active
                                    ? candidate.componentIds.filter((componentId) => componentId !== component.id)
                                    : [...candidate.componentIds, component.id],
                                }
                              : candidate,
                          ),
                        }))
                      }
                    >
                      {component.name || 'Unnamed component'}
                    </button>
                  );
                })}
              </div>

              <div className="button-row" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    onProjectChange((current) => ({
                      ...current,
                      premixGroups: current.premixGroups.filter((candidate) => candidate.id !== group.id),
                    }))
                  }
                >
                  Remove premix
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
