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
  const [expandedSubitems, setExpandedSubitems] = useState<Record<string, boolean>>({});

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

  const toggleSubitems = (componentId: string) => {
    setExpandedSubitems((current) => ({
      ...current,
      [componentId]: !current[componentId],
    }));
  };

  return (
    <section className="section-card">
      <h2>Reaction Setup</h2>
      <p className="section-lead">
        Define components, transfer volumes, dead-volume behavior, reusable subitem lists, and premix groups.
      </p>

      <div className="protocol-box">
        <h3>Protocol</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th style={{ width: '100px' }}>Volume (uL)</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {project.protocolComponents.map((component) => (
                <tr key={component.id}>
                  <td>
                    <input
                      className="table-inline-input"
                      value={component.name}
                      onChange={(event) => updateProtocolComponent(component.id, (current) => ({ ...current, name: event.target.value }))}
                      placeholder="Component name"
                    />
                  </td>
                  <td>
                    <input
                      className="table-inline-input"
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
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() =>
                        onProjectChange((current) => ({
                          ...current,
                          protocolComponents: current.protocolComponents.filter((candidate) => candidate.id !== component.id),
                        }))
                      }
                      disabled={project.protocolComponents.length <= 2}
                      title="Remove"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() =>
            onProjectChange((current) => ({
              ...current,
              protocolComponents: [...current.protocolComponents, createProtocolComponent()],
            }))
          }
          title="Add row"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <h3 style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>Transfer Settings</h3>
      <div className="transfer-settings-row">
        <label className="transfer-settings-label">
          Global dead volume (uL)
          <input
            className="transfer-settings-input"
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
        <label className="transfer-settings-label">
          Use global dead volume
          <select
            className="transfer-settings-input"
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
              <th style={{ width: '150px' }}>Component</th>
              <th style={{ width: '50px' }}>Vol</th>
              <th style={{ width: '40px' }}>Color</th>
              {project.useGlobalDeadVolume ? null : (
                <th style={{ width: '100px' }}>Dead vol</th>
              )}
              <th>Subitems</th>
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {project.protocolComponents.map((component) => (
              <tr key={component.id}>
                <td>
                  <span className="table-inline-value">{component.name || '—'}</span>
                </td>
                <td>
                  <span className="table-inline-value">{component.transferVolume}</span>
                </td>
                <td>
                  <input
                    type="color"
                    value={component.color}
                    onChange={(event) => updateProtocolComponent(component.id, (current) => ({ ...current, color: event.target.value }))}
                    className="color-circle-input"
                    title="Pick color"
                  />
                </td>
                {!project.useGlobalDeadVolume && (
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={component.customDeadVolume ?? 0}
                      onChange={(event) =>
                        updateProtocolComponent(component.id, (current) => ({
                          ...current,
                          customDeadVolume: Number(event.target.value) || 0,
                          deadVolumeMode: 'custom',
                        }))
                      }
                      className="table-inline-input"
                      placeholder="0"
                    />
                  </td>
                )}
                <td>
                  <div className="subitems-cell">
                    <div className="subitems-header">
                      <button
                        type="button"
                        className="toggle-button"
                        onClick={() => toggleSubitems(component.id)}
                        title={expandedSubitems[component.id] ? 'Collapse' : 'Expand'}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{ transform: expandedSubitems[component.id] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
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
                    </div>

                    {expandedSubitems[component.id] && (
                      <div className="subitems-expanded">
                        <div className="subitems-add-row">
                          <input
                            type="text"
                            placeholder="Name"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                const input = event.target as HTMLInputElement;
                                const name = input.value.trim();
                                updateProtocolComponent(component.id, (current) => ({
                                  ...current,
                                  subItems: [
                                    ...current.subItems,
                                    { id: createId('item'), name: name || `${current.name}_${current.subItems.length + 1}` },
                                  ],
                                }));
                                input.value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn-like"
                            onClick={(event) => {
                              const input = (event.target as HTMLElement).parentElement?.querySelector('input') as HTMLInputElement;
                              const name = input?.value.trim();
                              updateProtocolComponent(component.id, (current) => ({
                                ...current,
                                subItems: [
                                  ...current.subItems,
                                  { id: createId('item'), name: name || `${current.name}_${current.subItems.length + 1}` },
                                ],
                              }));
                              if (input) input.value = '';
                            }}
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            className="btn-generate"
                            onClick={() => handlePatternGenerate(component.id)}
                          >
                            Generate
                          </button>
                        </div>
                        <div className="pattern-row">
                          <label>
                            <span>Prefix</span>
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
                            <span>Start</span>
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
                            <span>End</span>
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
                            <span>Suffix</span>
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
                      </div>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="icon-button"
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
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                    color: current.protocolComponents[0]?.color ?? '#63239a',
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
