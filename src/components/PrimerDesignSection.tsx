import { useState, useRef, useEffect } from 'react';
import { parseSplitSetResult, designPrimers, type AssemblyFragment, type Primer, calculateTm, reverseComplement } from '../utils/primerDesign';
import { ENZYMES, type ParsedCircularFasta } from '../utils/designTools';
import type { SiteAnalysis } from '../utils/mutationTools';

interface PrimerDesignSectionProps {
  uploadedGenome: ParsedCircularFasta | null;
  isLinear: boolean;
  siteAnalyses: SiteAnalysis[];
}

const revStr = (str: string) => Array.from(str).reverse().join('');

// Bending Primer Visualizer Component
// Bending Primer Visualizer Component
function ColoredPrimerInput({ primer, onChange }: { primer: Primer, onChange: (val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const typeIisSpan = primer.typeIisSpan || [0, 0];
  const part1 = primer.sequence.substring(0, typeIisSpan[0]);
  const part2 = primer.sequence.substring(typeIisSpan[0], typeIisSpan[1]);
  const part3 = primer.sequence.substring(typeIisSpan[1]);

  if (isEditing) {
    return (
      <input 
        ref={inputRef}
        style={{ width: '100%', fontFamily: 'monospace', padding: '0.5rem', fontSize: '1rem', border: '1px solid #0284c7', borderRadius: '4px' }} 
        value={primer.sequence}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div 
      style={{ width: '100%', fontFamily: 'monospace', padding: '0.5rem', fontSize: '1rem', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'text', background: '#fff', minHeight: '38px', boxSizing: 'border-box' }}
      onClick={() => setIsEditing(true)}
    >
      <span>{part1}</span>
      <span style={{ color: '#ea580c', fontWeight: 600 }}>{part2}</span>
      <span>{part3}</span>
    </div>
  );
}

function VisualizerFrame({ primerF, primerR, originalDna, offsetF, offsetR }: { primerF: Primer, primerR: Primer, originalDna: string, offsetF: number, offsetR: number }) {
  const fTypeIisSpan = primerF.typeIisSpan || [0, 0];
  const rTypeIisSpan = primerR.typeIisSpan || [0, 0];

  const fOverhang1 = primerF.sequence.substring(0, fTypeIisSpan[0]);
  const fTypeIis = primerF.sequence.substring(fTypeIisSpan[0], fTypeIisSpan[1]);
  const fOverhang2 = primerF.sequence.substring(fTypeIisSpan[1], primerF.bindingStart || 0);
  const fBind = primerF.sequence.substring(primerF.bindingStart || 0, primerF.bindingEnd || primerF.sequence.length);

  const rOverhang1 = primerR.sequence.substring(0, rTypeIisSpan[0]);
  const rTypeIis = primerR.sequence.substring(rTypeIisSpan[0], rTypeIisSpan[1]);
  const rOverhang2 = primerR.sequence.substring(rTypeIisSpan[1], primerR.bindingStart || 0);
  const rBind = primerR.sequence.substring(primerR.bindingStart || 0, primerR.bindingEnd || primerR.sequence.length);

  // Compute mismatch pipes against originalDna instead of primer's templateSeq
  const fTarget = originalDna.substring(offsetF, offsetF + fBind.length);
  const fPipes = fBind.split('').map((char, i) => char === (fTarget[i]?.toUpperCase() || char) ? '|' : ' ').join('');
  
  // For R primer, it binds to the bottom strand, so we must RC the originalDna region
  const rTarget = reverseComplement(originalDna.substring(offsetR, offsetR + rBind.length));
  const rPipes = rBind.split('').map((char, i) => char === (rTarget[i]?.toUpperCase() || char) ? '|' : ' ').join('');

  // Top strand display for R primer area
  const rTopStrand = originalDna.substring(offsetR, offsetR + rBind.length);

  return (
    <div style={{ 
      background: '#fff', 
      padding: '1.5rem', 
      borderRadius: '8px', 
      overflowX: 'auto', 
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace', 
      whiteSpace: 'pre', 
      border: '1px solid #e2e8f0',
      fontSize: '0.9rem',
      lineHeight: '1.5'
    }}>
      {/* Forward Primer */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ color: '#8430bf', fontWeight: 600 }}>{primerF.name}</div>
        <div>
          <span style={{ color: '#94a3b8' }}>5' </span>
          <span style={{ visibility: 'hidden' }}>{' '.repeat(offsetF)}</span>
          <span style={{ color: '#8430bf' }}>{fOverhang1}</span>
          <span style={{ color: '#ea580c', fontWeight: 600 }}>{fTypeIis}</span>
          <span style={{ color: '#8430bf' }}>{fOverhang2}</span>
          <span style={{ color: '#4a1b74', fontWeight: 'bold' }}>{fBind}</span>
          <span style={{ color: '#94a3b8' }}> 3'</span>
        </div>
        <div>
          <span style={{ visibility: 'hidden' }}>5' </span>
          <span style={{ visibility: 'hidden' }}>{' '.repeat(offsetF)}{fOverhang1}{fTypeIis}{fOverhang2}</span>
          <span style={{ color: '#cbd5e1' }}>{fPipes}</span>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>5' </span>
          <span style={{ color: '#4f4558' }}>{originalDna}</span>
          <span style={{ color: '#94a3b8' }}> 3'</span>
        </div>
      </div>

      {/* Reverse Primer */}
      <div style={{ marginTop: '2rem' }}>
        <div style={{ color: '#059669', fontWeight: 600 }}>{primerR.name}</div>
        <div>
          <span style={{ color: '#94a3b8' }}>5' </span>
          <span style={{ color: '#4f4558' }}>{originalDna}</span>
          <span style={{ color: '#94a3b8' }}> 3'</span>
        </div>
        <div>
          <span style={{ visibility: 'hidden' }}>5' </span>
          <span style={{ visibility: 'hidden' }}>{' '.repeat(offsetR)}</span>
          <span style={{ color: '#cbd5e1' }}>{revStr(rPipes)}</span>
        </div>
        <div>
          <span style={{ visibility: 'hidden' }}>5' </span>
          <span style={{ visibility: 'hidden' }}>{' '.repeat(offsetR)}</span>
          <span style={{ color: '#047857', fontWeight: 'bold' }}>{revStr(rBind)}</span>
          <span style={{ color: '#10b981' }}>{revStr(rOverhang2)}</span>
          <span style={{ color: '#ea580c', fontWeight: 600 }}>{revStr(rTypeIis)}</span>
          <span style={{ color: '#10b981' }}>{revStr(rOverhang1)}</span>
          <span style={{ color: '#94a3b8' }}> 5'</span>
        </div>
      </div>
    </div>
  );
}

export function PrimerDesignSection({ uploadedGenome, isLinear, siteAnalyses }: PrimerDesignSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [splitsetText, setSplitsetText] = useState('');
  const [vectorName, setVectorName] = useState('Vector');
  const [vectorSeq, setVectorSeq] = useState('');
  const [restrictionSite, setRestrictionSite] = useState('GGTCTC');
  const [spacer, setSpacer] = useState('A');
  const [results, setResults] = useState<{ vectorPrimers: Primer[], fragmentAssemblies: AssemblyFragment[] } | null>(null);
  
  const [activeFragIndex, setActiveFragIndex] = useState(0);
  const [activeVisIndex, setActiveVisIndex] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tabsRef.current) {
      const activeTab = tabsRef.current.children[activeFragIndex] as HTMLElement;
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeFragIndex]);

  const handleDesign = () => {
    if (!uploadedGenome) return alert("Please upload a genome sequence first.");
    
    const unmutatedSites = siteAnalyses.filter(site => !site.userMutation && !site.suggestedMutation);
    if (unmutatedSites.length > 0) {
      alert(`Warning: ${unmutatedSites.length} site(s) (including intergenic) have no silent mutation specified. The design will NOT include mutations for these sites, which may cause assembly failure.`);
    }
    
    const cutIndex = vectorSeq.indexOf('↓') !== -1 ? vectorSeq.indexOf('↓') : vectorSeq.indexOf('|');
    if (cutIndex === -1) return alert("Please mark the insertion site in the vector sequence with '↓' or '|'.");

    const cleanVec = vectorSeq.replace(/[↓|]/g, '').toUpperCase();
    const vecLeft = cleanVec.substring(0, cutIndex);
    const vecRight = cleanVec.substring(cutIndex);

    if (vecLeft.length < 20 || vecRight.length < 20) {
      return alert("Please provide at least 20bp of vector sequence on both sides of the cut site.");
    }

    const fragments = parseSplitSetResult(splitsetText);
    if (fragments.length === 0) return alert("Could not parse SplitSet result.");

    const res = designPrimers(fragments, uploadedGenome.sequence, {
      vectorName,
      vectorLeft: vecLeft,
      vectorRight: vecRight,
      restrictionSite,
      spacer
    }, isLinear);

    setResults(res);
    setActiveFragIndex(0);
    setActiveVisIndex(0);
  };

  const handleDownload = () => {
    if (!results) return;
    let fasta = '';
    for (const p of results.vectorPrimers) {
      fasta += `>${p.name}\n${p.sequence}\n`;
    }
    for (const frag of results.fragmentAssemblies) {
      for (const p of frag.primers) {
        fasta += `>${p.name}\n${p.sequence}\n`;
      }
    }
    const blob = new Blob([fasta], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'primers.fasta';
    a.click();
    URL.revokeObjectURL(url);
  };

  const updatePrimerSequence = (fragIndex: number, primerIndex: number, newSeq: string) => {
    setResults(curr => {
      if (!curr) return curr;
      const newRes = { ...curr };
      const frag = { ...newRes.fragmentAssemblies[fragIndex] };
      const primers = [...frag.primers];
      const p = primers[primerIndex];
      // For manual edits, if it's a fragment/vector primer we assume the newly typed portion modifies the binding region if it's at the 3' end.
      // But calculating exactly where the overhang ends dynamically is hard.
      // We will re-calculate Tm assuming the last N bases bind, where N is the original binding length.
      let bindingLen = p.sequence.length;
      if (p.type === 'fragment') bindingLen = 24;
      if (p.type === 'vector') bindingLen = 20;

      let bStart = 0;
      let bEnd = newSeq.length;
      if (p.type === 'fragment' || (p.type === 'vector' && p.direction !== 'R')) {
        // Forward/fragment primers bind at their 3' end
        bStart = Math.max(0, newSeq.length - bindingLen);
      } else if (p.type === 'vector' && p.direction === 'R') {
        // R vector primer binds at its 5' end
        bEnd = Math.min(newSeq.length, bindingLen);
      }

      primers[primerIndex] = { ...p, sequence: newSeq.toUpperCase(), tm: calculateTm(newSeq, bStart, bEnd, p.templateSeq) };
      frag.primers = primers;
      newRes.fragmentAssemblies[fragIndex] = frag;
      return newRes;
    });
  };

  return (
    <>
      <button 
        type="button" 
        className="primary-cta" 
        style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#a855f7', borderColor: '#a855f7' }} 
        onClick={() => setIsOpen(true)}
      >
        Advanced Primer Design
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            background: 'white', padding: '2rem', borderRadius: '8px',
            width: '900px', maxHeight: '90vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Primer Design</h2>
              <button type="button" className="icon-button" onClick={() => setIsOpen(false)} title="Close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {!results ? (
              <>
                <label>
                  <strong>NEB SplitSet Result</strong>
                  <textarea 
                    rows={10} 
                    style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', fontFamily: 'inherit' }}
                    placeholder={`Paste NEB SplitSet output here...
ex. >MyAssembly_F1 length=1083 coord=1..1083 5'-overhang=TGTA 3'-overhang=AACT
TGTATTGATTCACTTGAAGTACGAAAAAAACCGGGAGGACATTGGATTATTCGGGATCTGATGGGATTAGATTTGGTGG...`}
                    value={splitsetText}
                    onChange={e => setSplitsetText(e.target.value)}
                  />
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ flex: 1 }}>
                    <strong>Vector Name</strong>
                    <input 
                      style={{ width: '100%', marginTop: '0.5rem', fontFamily: 'inherit' }} 
                      value={vectorName} 
                      onChange={e => setVectorName(e.target.value)} 
                    />
                  </label>
                  <label style={{ flex: 2 }}>
                    <strong>Vector Sequence around insert</strong>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <input 
                        ref={inputRef}
                        style={{ flex: 1, fontFamily: 'inherit' }} 
                        value={vectorSeq} 
                        onChange={e => {
                          const val = e.target.value;
                          const arrowCount = (val.match(/↓/g) || []).length;
                          if (arrowCount <= 1) {
                            setVectorSeq(val);
                          }
                        }} 
                        placeholder="e.g. GATCGATC↓GATCGATC"
                      />
                      <button type="button" className="primary-cta" style={{ background: '#8430bf', borderColor: '#8430bf', padding: '0.4rem 0.75rem' }} onClick={() => {
                        if (vectorSeq.includes('↓')) return;
                        const input = inputRef.current;
                        if (input) {
                          const start = input.selectionStart ?? vectorSeq.length;
                          setVectorSeq(vectorSeq.slice(0, start) + '↓' + vectorSeq.slice(start));
                          setTimeout(() => {
                            input.focus();
                            input.setSelectionRange(start + 1, start + 1);
                          }, 0);
                        } else {
                          setVectorSeq(vectorSeq + '↓');
                        }
                      }}>Insert ↓</button>
                    </div>
                  </label>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label className="design-select-field" style={{ flex: 1 }}>
                    <span>Enzyme Site</span>
                    <select value={restrictionSite} onChange={e => setRestrictionSite(e.target.value)}>
                      {ENZYMES.map(enzyme => (
                        <option key={enzyme.id} value={enzyme.recognitionSite}>
                          {enzyme.name} ({enzyme.cutPattern})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="design-select-field" style={{ flex: 1 }}>
                    <span>Spacer Base</span>
                    <input style={{ width: '100%', fontFamily: 'inherit' }} value={spacer} onChange={e => setSpacer(e.target.value)} maxLength={1} />
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                  <button type="button" className="icon-button" onClick={() => { setSplitsetText(''); setVectorSeq(''); }} title="Reset">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                  </button>
                  <button type="button" className="primary-cta" onClick={handleDesign}>Generate Primers</button>
                </div>
              </>
            ) : (
              <>
                {/* Results View */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button type="button" className="icon-button" onClick={() => setResults(null)} title="Back to Settings">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <button type="button" className="primary-cta" onClick={handleDownload}>Download All (FASTA)</button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem' }}>
                  <button className="icon-button" onClick={() => setActiveFragIndex(i => Math.max(0, i - 1))} disabled={activeFragIndex === 0}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  
                  <div ref={tabsRef} style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', flex: 1, scrollbarWidth: 'none', scrollBehavior: 'smooth' }}>
                    {results.fragmentAssemblies.map((frag, idx) => (
                      <button 
                        key={frag.name}
                        type="button" 
                        style={{
                          padding: '0.5rem 1rem',
                          border: 'none',
                          background: idx === activeFragIndex ? '#f5edfc' : 'transparent',
                          color: idx === activeFragIndex ? '#4a1b74' : '#4f4558',
                          fontWeight: idx === activeFragIndex ? 600 : 400,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                        onClick={() => {
                          setActiveFragIndex(idx);
                          setActiveVisIndex(0);
                        }}
                      >
                        {frag.name}
                      </button>
                    ))}
                  </div>

                  <button className="icon-button" onClick={() => setActiveFragIndex(i => Math.min(results.fragmentAssemblies.length - 1, i + 1))} disabled={activeFragIndex === results.fragmentAssemblies.length - 1}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>

                {results.fragmentAssemblies[activeFragIndex] && (
                  <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0 }}>
                        {results.fragmentAssemblies[activeFragIndex].bindingVisualizations[activeVisIndex]?.title}
                      </h3>
                      
                      {results.fragmentAssemblies[activeFragIndex].bindingVisualizations.length > 1 && (
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <button className="icon-button" style={{ padding: '4px' }} disabled={activeVisIndex === 0} onClick={() => setActiveVisIndex(i => i - 1)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                          </button>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4f4558', margin: '0 0.25rem' }}>
                            {activeVisIndex + 1} / {results.fragmentAssemblies[activeFragIndex].bindingVisualizations.length}
                          </span>
                          <button className="icon-button" style={{ padding: '4px' }} disabled={activeVisIndex === results.fragmentAssemblies[activeFragIndex].bindingVisualizations.length - 1} onClick={() => setActiveVisIndex(i => i + 1)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const vis = results.fragmentAssemblies[activeFragIndex].bindingVisualizations[activeVisIndex];
                      if (!vis) return null;
                      const pF = results.fragmentAssemblies[activeFragIndex].primers.find(p => p.name === vis.primerF);
                      const pR = results.fragmentAssemblies[activeFragIndex].primers.find(p => p.name === vis.primerR);
                      
                      if (!pF || !pR) return null;

                      return (
                        <VisualizerFrame 
                          primerF={pF}
                          primerR={pR}
                          originalDna={vis.originalDna}
                          offsetF={vis.offsetF}
                          offsetR={vis.offsetR}
                        />
                      );
                    })()}

                    {/* Primer Editable Boxes */}
                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {results.fragmentAssemblies[activeFragIndex].primers.map((p, pIdx) => {
                        // Only show the two primers relevant to current visualization
                        const vis = results.fragmentAssemblies[activeFragIndex].bindingVisualizations[activeVisIndex];
                        const isRelevant = vis && vis.title.includes(p.name);
                        if (!isRelevant) return null;

                        const otherPrimer = results.fragmentAssemblies[activeFragIndex].primers.find(op => 
                          vis.title.includes(op.name) && op.name !== p.name
                        );
                        
                        const tmDiff = otherPrimer ? Math.abs(p.tm - otherPrimer.tm) : 0;
                        const tmColor = tmDiff > 10 ? '#ef4444' : 'inherit';

                        return (
                          <div key={p.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <strong>{p.name}</strong>
                              <span style={{ color: tmColor, fontWeight: tmDiff > 10 ? 600 : 400 }}>
                                Tm: {p.tm.toFixed(1)}°C {tmDiff > 10 && `(Diff > 10°C)`}
                              </span>
                            </div>
                            <ColoredPrimerInput 
                              primer={p}
                              onChange={(val) => updatePrimerSequence(activeFragIndex, pIdx, val)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Vector Primers Display */}
                <div style={{ background: '#eef2f5', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0' }}>Vector Primers</h3>
                  {results.vectorPrimers.map((p, idx) => (
                    <div key={p.name} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <strong>{p.name}</strong>
                        <span>Tm: {p.tm.toFixed(1)}°C</span>
                      </div>
                      <ColoredPrimerInput 
                        primer={p}
                        onChange={(newSeq) => {
                          setResults(curr => {
                            if (!curr) return curr;
                            const newRes = { ...curr };
                            const vPrimers = [...newRes.vectorPrimers];
                            const oldP = vPrimers[idx];
                            
                            let bStart = 0;
                            let bEnd = newSeq.length;
                            if (oldP.name.endsWith('_F')) {
                               bStart = Math.max(0, newSeq.length - 20);
                            } else {
                               bEnd = Math.min(newSeq.length, 20);
                            }

                            vPrimers[idx] = { ...oldP, sequence: newSeq.toUpperCase(), tm: calculateTm(newSeq, bStart, bEnd) };
                            newRes.vectorPrimers = vPrimers;
                            return newRes;
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
