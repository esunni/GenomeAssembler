import { useState } from 'react';

import { createId, createProtocolComponent } from '../utils/janusState';
import type { ExperimentProject, ProtocolComponent } from '../types';

interface ReactionSetupSectionProps {
  project: ExperimentProject;
  bulkProtocolText: string;
  onBulkProtocolTextChange: (value: string) => void;
  onImportProtocolPaste: () => void;
  onProjectChange: (updater: (current: ExperimentProject) => ExperimentProject) => void;
  isEcho?: boolean;
}

export function ReactionSetupSection({
  project,
  bulkProtocolText,
  onBulkProtocolTextChange,
  onImportProtocolPaste,
  onProjectChange,
  isEcho,
}: ReactionSetupSectionProps) {
  const [patternConfig, setPatternConfig] = useState<Record<string, { prefix: string; start: number | string; end: number | string; suffix: string }>>({});
  const [expandedSubitems, setExpandedSubitems] = useState<Record<string, boolean>>({});
  const [selectedForPremix, setSelectedForPremix] = useState<string[]>([]);
  const [premixModal, setPremixModal] = useState<{ isOpen: boolean; comp1Id: string; comp2Id: string; name: string; vol: number } | null>(null);
  const [draggedSubitem, setDraggedSubitem] = useState<{ componentId: string; index: number } | null>(null);
  const [volumeWarning, setVolumeWarning] = useState<{ isOpen: boolean; message: string } | null>(null);

  const updateProtocolComponent = (componentId: string, updater: (component: ProtocolComponent) => ProtocolComponent) => {
    onProjectChange((current) => {
      let newComponents = current.protocolComponents.map((component) =>
        component.id === componentId ? updater(component) : component,
      );
      
      const updatedComponent = newComponents.find(c => c.id === componentId);
      if (updatedComponent && updatedComponent.isPremixComponent && updatedComponent.premixParentId) {
        const premixId = updatedComponent.premixParentId;
        const premix = newComponents.find(c => c.id === premixId);
        if (premix && premix.premixInfo) {
          const comp1 = newComponents.find(c => c.id === premix.premixInfo!.comp1Id);
          const comp2 = newComponents.find(c => c.id === premix.premixInfo!.comp2Id);
          
          if (comp1 && comp2) {
            let newSubItems: any[] = [];
            if (comp1.subItems.length === 0 && comp2.subItems.length === 0) {
              newSubItems = [{ id: createId('item'), name: `${comp1.name}+${comp2.name}` }];
            } else if (comp1.subItems.length > 0 && comp2.subItems.length === 0) {
              newSubItems = comp1.subItems.map(item => ({ id: createId('item'), name: `${item.name}+${comp2.name}` }));
            } else if (comp2.subItems.length > 0 && comp1.subItems.length === 0) {
              newSubItems = comp2.subItems.map(item => ({ id: createId('item'), name: `${comp1.name}+${item.name}` }));
            } else if (comp1.subItems.length > 0 && comp2.subItems.length > 0) {
              comp1.subItems.forEach(i1 => {
                comp2.subItems.forEach(i2 => {
                  newSubItems.push({ id: createId('item'), name: `${i1.name}+${i2.name}` });
                });
              });
            }
            
            newComponents = newComponents.map(c => 
              c.id === premixId ? { ...c, subItems: newSubItems } : c
            );
          }
        }
      }
      
      return {
        ...current,
        protocolComponents: newComponents,
      };
    });
  };

  const handlePatternGenerate = (componentId: string) => {
    const config = patternConfig[componentId];
    if (!config) {
      return;
    }

    const start = Number(config.start) || 1;
    const end = Number(config.end) || 3;

    updateProtocolComponent(componentId, (component) => {
      const newSubItems = Array.from({ length: Math.max(end - start + 1, 0) }, (_, index) => ({
        id: createId('item'),
        name: `${config.prefix}${start + index}${config.suffix}`,
      }));

      return {
        ...component,
        subItems: [...(component.subItems || []), ...newSubItems],
      };
    });
  };

  const handleClearSubitems = (componentId: string) => {
    updateProtocolComponent(componentId, (component) => ({
      ...component,
      subItems: [],
    }));
    setPatternConfig((current) => {
      const newState = { ...current };
      delete newState[componentId];
      return newState;
    });
  };

  const toggleSubitems = (componentId: string) => {
    setExpandedSubitems((current) => ({
      ...current,
      [componentId]: !current[componentId],
    }));
  };

  const handleCreatePremix = () => {
    if (!premixModal) return;
    
    onProjectChange((current) => {
      const components = [...current.protocolComponents];
      const idx1 = components.findIndex(c => c.id === premixModal.comp1Id);
      const idx2 = components.findIndex(c => c.id === premixModal.comp2Id);
      
      if (idx1 === -1 || idx2 === -1) return current;
      
      const comp1 = components[idx1];
      const comp2 = components[idx2];
      
      const filtered = components.filter(c => c.id !== comp1.id && c.id !== comp2.id);
      const insertIdx = Math.min(idx1, idx2);
      
      let newSubItems: any[] = [];
      if (comp1.subItems.length === 0 && comp2.subItems.length === 0) {
        newSubItems = [{ id: createId('item'), name: `${comp1.name}+${comp2.name}` }];
      } else if (comp1.subItems.length > 0 && comp2.subItems.length === 0) {
        newSubItems = comp1.subItems.map(item => ({ id: createId('item'), name: `${item.name}+${comp2.name}` }));
      } else if (comp2.subItems.length > 0 && comp1.subItems.length === 0) {
        newSubItems = comp2.subItems.map(item => ({ id: createId('item'), name: `${comp1.name}+${item.name}` }));
      } else if (comp1.subItems.length > 0 && comp2.subItems.length > 0) {
        comp1.subItems.forEach(i1 => {
          comp2.subItems.forEach(i2 => {
            newSubItems.push({ id: createId('item'), name: `${i1.name}+${i2.name}` });
          });
        });
      }
      
      const newPremix: ProtocolComponent = {
        id: createId('premix'),
        name: premixModal.name,
        transferVolume: premixModal.vol,
        color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
        deadVolumeMode: 'global',
        customDeadVolume: null,
        subItems: newSubItems,
        isPremix: true,
        premixInfo: { comp1Id: comp1.id, comp2Id: comp2.id }
      };
      
      const updatedComp1 = { ...comp1, isPremixComponent: true, premixParentId: newPremix.id };
      const updatedComp2 = { ...comp2, isPremixComponent: true, premixParentId: newPremix.id };
      
      filtered.splice(insertIdx, 0, updatedComp1, updatedComp2, newPremix);
      
      return {
        ...current,
        protocolComponents: filtered
      };
    });
    
    setSelectedForPremix([]);
    setPremixModal(null);
  };

  return (
    <section className="section-card">
      <h2>Reaction Setup</h2>
      <p className="section-lead">
        Define components, transfer volumes, dead-volume behavior, reusable subitem lists, and premix groups.
      </p>

      <div className="protocol-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Protocol</h3>
          <button
            type="button"
            className="primary-cta"
            disabled={selectedForPremix.length !== 2}
            onClick={() => {
              if (selectedForPremix.length === 2) {
                const comp1 = project.protocolComponents.find(c => c.id === selectedForPremix[0]);
                const comp2 = project.protocolComponents.find(c => c.id === selectedForPremix[1]);
                if (comp1 && comp2) {
                  setPremixModal({
                    isOpen: true,
                    comp1Id: comp1.id,
                    comp2Id: comp2.id,
                    name: `${comp1.name || 'comp1'}+${comp2.name || 'comp2'}`,
                    vol: comp1.transferVolume + comp2.transferVolume
                  });
                }
              }
            }}
          >
            Premix
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Component</th>
                <th style={{ width: '200px', textAlign: 'center' }}>Volume ({isEcho ? 'nL' : 'uL'})</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {project.protocolComponents.map((component) => {
                const isSelected = selectedForPremix.includes(component.id);
                const isPremix = component.isPremix;
                const isPremixComponent = component.isPremixComponent;
                const rowColor = isPremix ? '#e0d4f5' : isPremixComponent ? '#f5edfc' : 'transparent';
                
                return (
                <tr key={component.id} style={{ backgroundColor: rowColor }}>
                  <td style={{ textAlign: 'center' }}>
                    {!isPremix && !isPremixComponent && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            if (selectedForPremix.length < 2) {
                              setSelectedForPremix([...selectedForPremix, component.id]);
                            }
                          } else {
                            setSelectedForPremix(selectedForPremix.filter(id => id !== component.id));
                          }
                        }}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      className="table-inline-input"
                      style={{ backgroundColor: 'transparent', fontWeight: 600 }}
                      value={component.name}
                      onChange={(event) => updateProtocolComponent(component.id, (current) => ({ ...current, name: event.target.value }))}
                      placeholder="Component name"
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {isPremixComponent ? (
                      <span className="table-inline-value">
                        {component.id === project.protocolComponents.find(c => c.id === component.premixParentId)?.premixInfo?.comp1Id 
                          ? "X" 
                          : `${project.protocolComponents.find(c => c.id === component.premixParentId)?.transferVolume ?? 0} - X`}
                      </span>
                    ) : (
                        <input
                          className="table-inline-input"
                          style={{ textAlign: 'center', backgroundColor: 'transparent' }}
                          type="number"
                          min="0"
                          step="0.1"
                          value={component.transferVolume}
                          onChange={(event) => {
                            const val = event.target.value;
                            const numVal = val === '' ? '' : Number(val);
                            
                            if (typeof numVal === 'number' && numVal > 0) {
                              if (isEcho) {
                                if (numVal < 25) {
                                  setVolumeWarning({
                                    isOpen: true,
                                    message: `Echo minimum transfer volume is 25 nL.\nLower volumes cannot be accurately transferred.`
                                  });
                                } else if (numVal > 500) {
                                  setVolumeWarning({
                                    isOpen: true,
                                    message: `Echo maximum single transfer volume is 500 nL.\nVolumes above 500 nL will be automatically divided in the mapping file.`
                                  });
                                }
                              } else {
                                if (numVal < 2) {
                                  setVolumeWarning({
                                    isOpen: true,
                                    message: `Janus minimum transfer volume is 2 μL.\nLower volumes may cause inaccurate pipetting.`
                                  });
                                }
                              }
                            }
                            
                            updateProtocolComponent(component.id, (current) => ({
                              ...current,
                              transferVolume: numVal as unknown as number,
                            }));
                          }}
                        />
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="icon-button icon-remove"
                      onClick={() => {
                        if (isPremix) {
                          onProjectChange((current) => {
                            const comp1Id = component.premixInfo?.comp1Id;
                            const comp2Id = component.premixInfo?.comp2Id;
                            return {
                              ...current,
                              protocolComponents: current.protocolComponents
                                .filter((candidate) => candidate.id !== component.id)
                                .map(c => (c.id === comp1Id || c.id === comp2Id) ? { ...c, isPremixComponent: false, premixParentId: undefined } : c)
                            };
                          });
                        } else if (isPremixComponent) {
                          onProjectChange((current) => {
                            const premixId = component.premixParentId;
                            const premix = current.protocolComponents.find(c => c.id === premixId);
                            const otherCompId = premix?.premixInfo?.comp1Id === component.id ? premix?.premixInfo?.comp2Id : premix?.premixInfo?.comp1Id;
                            return {
                              ...current,
                              protocolComponents: current.protocolComponents
                                .filter((candidate) => candidate.id !== component.id && candidate.id !== premixId)
                                .map(c => c.id === otherCompId ? { ...c, isPremixComponent: false, premixParentId: undefined } : c)
                            };
                          });
                        } else {
                          onProjectChange((current) => ({
                            ...current,
                            protocolComponents: current.protocolComponents.filter((candidate) => candidate.id !== component.id),
                          }));
                        }
                      }}
                      disabled={project.protocolComponents.length <= 1}
                      title="Remove"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="icon-button icon-add"
          onClick={() =>
            onProjectChange((current) => ({
              ...current,
              protocolComponents: [...current.protocolComponents, createProtocolComponent(current.protocolComponents)],
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
          Global dead volume ({isEcho ? 'nL' : 'uL'})
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
              <th style={{ width: '187px' }}>Component</th>
              <th style={{ width: '75px', textAlign: 'center' }}>Vol ({isEcho ? 'nl' : 'ul'})</th>
              <th style={{ width: '40px', textAlign: 'center' }}>Color</th>
              {project.useGlobalDeadVolume ? null : (
                <th style={{ width: '96px', textAlign: 'center' }}>Dead vol ({isEcho ? 'nl' : 'ul'})</th>
              )}
              <th>Subitems</th>
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {project.protocolComponents.map((component) => {
              const isPremix = component.isPremix;
              const isPremixComponent = component.isPremixComponent;
              const rowColor = isPremix ? '#e0d4f5' : isPremixComponent ? '#f5edfc' : 'transparent';
              
              return (
              <tr key={component.id} style={{ backgroundColor: rowColor }}>
                <td>
                  <span className="table-inline-value" style={{ fontWeight: 600 }}>{component.name || '—'}</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className="table-inline-value">
                    {isPremixComponent
                      ? (component.id === project.protocolComponents.find(c => c.id === component.premixParentId)?.premixInfo?.comp1Id
                        ? "X"
                        : `${project.protocolComponents.find(c => c.id === component.premixParentId)?.transferVolume ?? 0} - X`)
                      : component.transferVolume}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="color"
                    value={component.color}
                    onChange={(event) => updateProtocolComponent(component.id, (current) => ({ ...current, color: event.target.value }))}
                    className="color-circle-input"
                    title="Pick color"
                  />
                </td>
                {!project.useGlobalDeadVolume && (
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={component.customDeadVolume ?? ''}
                      onChange={(event) =>
                        updateProtocolComponent(component.id, (current) => ({
                          ...current,
                          customDeadVolume: event.target.value === '' ? null : Number(event.target.value),
                          deadVolumeMode: 'custom',
                        }))
                      }
                      className="table-inline-input"
                      style={{ padding: '0.2rem 0.5rem', height: '28px', backgroundColor: 'transparent' }}
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
                        {component.subItems.map((item, index) => (
                          <span
                            key={item.id}
                            className="chip"
                            style={{
                              background: component.color,
                              cursor: 'grab',
                              opacity: draggedSubitem?.componentId === component.id && draggedSubitem.index === index ? 0.5 : 1
                            }}
                            draggable={true}
                            onDragStart={() => setDraggedSubitem({ componentId: component.id, index })}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedSubitem && draggedSubitem.componentId === component.id) {
                                const fromIndex = draggedSubitem.index;
                                const toIndex = index;
                                if (fromIndex !== toIndex) {
                                  updateProtocolComponent(component.id, (current) => {
                                    const newSubItems = [...current.subItems];
                                    const [movedItem] = newSubItems.splice(fromIndex, 1);
                                    newSubItems.splice(toIndex, 0, movedItem);
                                    return { ...current, subItems: newSubItems };
                                  });
                                }
                              }
                              setDraggedSubitem(null);
                            }}
                            onDragEnd={() => setDraggedSubitem(null)}
                          >
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
                        <div className="subitems-row">
                          <input
                            type="text"
                            className="subitem-name-input"
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
                          <label>
                            <span>Prefix</span>
                            <input
                              type="text"
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
                                    start: event.target.value === '' ? '' : Number(event.target.value),
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
                                    end: event.target.value === '' ? '' : Number(event.target.value),
                                    suffix: current[component.id]?.suffix ?? '',
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            <span>Suffix</span>
                            <input
                              type="text"
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
                          <button
                            type="button"
                            className="btn-generate"
                            onClick={() => handlePatternGenerate(component.id)}
                          >
                            Generate
                          </button>
                            <button
                              type="button"
                              className="btn-generate"
                              style={{ backgroundColor: '#dc3545', color: 'white', border: '1px solid white', marginLeft: '0.6rem' }}
                              onClick={() => handleClearSubitems(component.id)}
                            >
                              Clear
                            </button>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="icon-button icon-remove"
                    onClick={() => {
                      if (isPremix) {
                        onProjectChange((current) => {
                          const comp1Id = component.premixInfo?.comp1Id;
                          const comp2Id = component.premixInfo?.comp2Id;
                          return {
                            ...current,
                            protocolComponents: current.protocolComponents
                              .filter((candidate) => candidate.id !== component.id)
                              .map(c => (c.id === comp1Id || c.id === comp2Id) ? { ...c, isPremixComponent: false, premixParentId: undefined } : c)
                          };
                        });
                      } else if (isPremixComponent) {
                        onProjectChange((current) => {
                          const premixId = component.premixParentId;
                          const premix = current.protocolComponents.find(c => c.id === premixId);
                          const otherCompId = premix?.premixInfo?.comp1Id === component.id ? premix?.premixInfo?.comp2Id : premix?.premixInfo?.comp1Id;
                          return {
                            ...current,
                            protocolComponents: current.protocolComponents
                              .filter((candidate) => candidate.id !== component.id && candidate.id !== premixId)
                              .map(c => c.id === otherCompId ? { ...c, isPremixComponent: false, premixParentId: undefined } : c)
                          };
                        });
                      } else {
                        onProjectChange((current) => ({
                          ...current,
                          protocolComponents: current.protocolComponents.filter((candidate) => candidate.id !== component.id),
                        }));
                      }
                    }}
                    disabled={project.protocolComponents.length === 1}
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {premixModal && premixModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', width: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>Create Premix</h3>
            <label>
              Name
              <input
                type="text"
                value={premixModal.name}
                onChange={(e) => setPremixModal({ ...premixModal, name: e.target.value })}
              />
            </label>
            <label>
              Volume (uL)
              <input
                type="number"
                min="0"
                step="0.1"
                value={premixModal.vol}
                onChange={(e) => setPremixModal({ ...premixModal, vol: Number(e.target.value) || 0 })}
              />
            </label>
            <div className="button-row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="secondary" onClick={() => setPremixModal(null)}>Cancel</button>
              <button type="button" className="primary-cta" onClick={handleCreatePremix}>Create</button>
            </div>
          </div>
        </div>
      )}

      {volumeWarning && volumeWarning.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', width: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, color: '#ef4444' }}>Warning</h3>
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{volumeWarning.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="button"
                className="primary-cta"
                onClick={() => setVolumeWarning(null)}
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
