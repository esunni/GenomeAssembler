import { useState, useMemo } from 'react';
import { parseSplitSetResult, designPrimers, type AssemblyFragment, type Primer, calculateTm, reverseComplement } from '../utils/primerDesign';
import type { ParsedCircularFasta } from '../utils/designTools';

interface PrimerDesignSectionProps {
  uploadedGenome: ParsedCircularFasta | null;
  isLinear: boolean;
}

// Bending Primer Visualizer Component
function VisualizerFrame({ primerF, primerR, originalDna, offsetF, offsetR }: { primerF: Primer, primerR: Primer, originalDna: string, offsetF: number, offsetR: number }) {
  // Compute dynamic alignment for F
  const computeF = () => {
    let pSeq = primerF.sequence;
    let overhang = '';
    let binding = '';
    let mismatchMask = '';
    
    // Heuristic: start aligning from 3' end. Find longest match in originalDna.
    const searchTarget = originalDna;
    let matchIdx = -1;
    let matchLen = 0;
    
    // We assume the last 10-15bp must bind.
    for (let i = pSeq.length - 10; i >= 0; i--) {
      const chunk = pSeq.substring(i);
      const idx = searchTarget.indexOf(chunk);
      if (idx !== -1) {
        matchIdx = idx;
        matchLen = chunk.length;
        // Expand backwards allowing mismatches
        let pI = i - 1;
        let dI = idx - 1;
        while (pI >= 0 && dI >= 0) {
          pI--;
          dI--;
        }
        
        overhang = pSeq.substring(0, pI + 1);
        binding = pSeq.substring(pI + 1);
        const dnaCompare = searchTarget.substring(dI + 1, dI + 1 + binding.length);
        
        mismatchMask = binding.split('').map((char, i) => char === dnaCompare[i] ? char : char.toLowerCase()).join('');
        
        return { overhang, binding: mismatchMask, space: dI + 1 };
      }
    }
    
    // Fallback if completely no match
    return { overhang: pSeq, binding: '', space: 0 };
  };

  // Compute dynamic alignment for R
  const computeR = () => {
    let pSeq = primerR.sequence; // R primer is reverse complement of bottom strand
    let pSeqRC = reverseComplement(pSeq); // Forward strand equivalent
    
    let overhang = '';
    let binding = '';
    let mismatchMask = '';
    
    const searchTarget = originalDna;
    
    // R primer binds to bottom strand, its 3' end is at the left of the forward strand view.
    // So the 3' end of R primer is the 5' end of its reverse complement.
    for (let i = 10; i <= pSeqRC.length; i++) {
      const chunk = pSeqRC.substring(0, i);
      const idx = searchTarget.indexOf(chunk);
      if (idx !== -1) {
        // Expand forwards
        let pI = i;
        let dI = idx + i;
        while (pI < pSeqRC.length && dI < searchTarget.length) {
          pI++;
          dI++;
        }
        
        binding = pSeqRC.substring(0, pI);
        overhang = pSeqRC.substring(pI);
        const dnaCompare = searchTarget.substring(idx, idx + binding.length);
        
        mismatchMask = binding.split('').map((char, i) => char === dnaCompare[i] ? char : char.toLowerCase()).join('');
        
        return { overhang, binding: mismatchMask, space: idx };
      }
    }
    
    return { overhang: pSeqRC, binding: '', space: 0 };
  };

  const fData = computeF();
  const rData = computeR();

  return (
    <div style={{ 
      background: '#fff', 
      padding: '1.5rem 1rem', 
      borderRadius: '4px', 
      overflowX: 'auto', 
      fontFamily: 'monospace', 
      whiteSpace: 'pre', 
      border: '1px solid #e2e8f0',
      fontSize: '0.9rem',
      lineHeight: '1.2'
    }}>
      {/* F Primer Overhang Bending Up */}
      {fData.overhang && (
        <div style={{ color: '#8430bf', display: 'flex' }}>
          <span style={{ width: `${fData.space}ch`, display: 'inline-block' }}></span>
          <span style={{ transform: 'translateY(-4px)', display: 'inline-block' }}>{fData.overhang.split('').join(' ')}</span>
        </div>
      )}
      
      {/* F Primer Binding */}
      <div style={{ color: '#4a1b74', fontWeight: 'bold' }}>
        {' '.repeat(fData.space)}
        {fData.binding.split('').map((c, i) => (
          <span key={i} style={{ color: c === c.toUpperCase() ? '#4a1b74' : '#ef4444' }}>{c.toUpperCase()}</span>
        ))}
      </div>
      
      {/* Original DNA */}
      <div style={{ color: '#4f4558', padding: '0.2rem 0' }}>
        {originalDna}
      </div>
      
      {/* R Primer Binding */}
      <div style={{ color: '#059669', fontWeight: 'bold' }}>
        {' '.repeat(rData.space)}
        {rData.binding.split('').map((c, i) => (
          <span key={i} style={{ color: c === c.toUpperCase() ? '#059669' : '#ef4444' }}>{c.toUpperCase()}</span>
        ))}
      </div>
      
      {/* R Primer Overhang Bending Down */}
      {rData.overhang && (
        <div style={{ color: '#10b981', display: 'flex' }}>
          <span style={{ width: `${rData.space + rData.binding.length}ch`, display: 'inline-block' }}></span>
          <span style={{ transform: 'translateY(4px)', display: 'inline-block' }}>{rData.overhang.split('').join(' ')}</span>
        </div>
      )}
    </div>
  );
}

export function PrimerDesignSection({ uploadedGenome, isLinear }: PrimerDesignSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [splitsetText, setSplitsetText] = useState('');
  const [vectorName, setVectorName] = useState('Vector');
  const [vectorSeq, setVectorSeq] = useState('');
  const [restrictionSite, setRestrictionSite] = useState('GGTCTC');
  const [spacer, setSpacer] = useState('A');
  const [results, setResults] = useState<{ vectorPrimers: Primer[], fragmentAssemblies: AssemblyFragment[] } | null>(null);
  
  const [activeFragIndex, setActiveFragIndex] = useState(0);
  const [activeVisIndex, setActiveVisIndex] = useState(0);

  const handleDesign = () => {
    if (!uploadedGenome) return alert("Please upload a genome sequence first.");
    
    const cutIndex = vectorSeq.indexOf('↓') !== -1 ? vectorSeq.indexOf('↓') : vectorSeq.indexOf('|');
    if (cutIndex === -1) return alert("Please mark the insertion site in the vector sequence with '↓' or '|'.");

    const cleanVec = vectorSeq.replace(/[↓\|]/g, '').toUpperCase();
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
        style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} 
        onClick={() => setIsOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h20M12 2v20M2 12c0-5.52 4.48-10 10-10s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12z"/>
        </svg>
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
                        style={{ flex: 1, fontFamily: 'inherit' }} 
                        value={vectorSeq} 
                        onChange={e => setVectorSeq(e.target.value)} 
                        placeholder="e.g. GATCGATC↓GATCGATC"
                      />
                      <button type="button" className="primary-cta" style={{ background: '#8430bf', borderColor: '#8430bf', padding: '0.4rem 0.75rem' }} onClick={() => {
                        const input = document.activeElement as HTMLInputElement;
                        if (input && input.tagName === 'INPUT') {
                          const start = input.selectionStart || vectorSeq.length;
                          setVectorSeq(vectorSeq.slice(0, start) + '↓' + vectorSeq.slice(start));
                        } else {
                          setVectorSeq(vectorSeq + '↓');
                        }
                      }}>Insert ↓</button>
                    </div>
                  </label>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ flex: 1 }}>
                    <strong>Enzyme Site</strong>
                    <select style={{ width: '100%', marginTop: '0.5rem' }} value={restrictionSite} onChange={e => setRestrictionSite(e.target.value)}>
                      <option value="GGTCTC">BsaI (GGTCTC)</option>
                      <option value="CGTCTC">BsmBI (CGTCTC)</option>
                      <option value="ACCTGC">BspQI (ACCTGC)</option>
                      <option value="GAGACG">BsmAI (GAGACG)</option>
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    <strong>Spacer Base</strong>
                    <input style={{ width: '100%', marginTop: '0.5rem', fontFamily: 'inherit' }} value={spacer} onChange={e => setSpacer(e.target.value)} maxLength={1} />
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                  <button type="button" className="clear-btn" onClick={() => { setSplitsetText(''); setVectorSeq(''); }}>Reset</button>
                  <button type="button" className="primary-cta" onClick={handleDesign}>Generate Primers</button>
                </div>
              </>
            ) : (
              <>
                {/* Results View */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button type="button" className="ghost" onClick={() => setResults(null)}>Back to Settings</button>
                    <button type="button" className="primary-cta" onClick={handleDownload}>Download All (FASTA)</button>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select style={{ padding: '0.2rem 0.5rem' }} value={restrictionSite} onChange={e => { setRestrictionSite(e.target.value); setTimeout(handleDesign, 0); }}>
                      <option value="GGTCTC">BsaI</option>
                      <option value="CGTCTC">BsmBI</option>
                      <option value="ACCTGC">BspQI</option>
                      <option value="GAGACG">BsmAI</option>
                    </select>
                    <input style={{ width: '40px', padding: '0.2rem 0.5rem', textAlign: 'center' }} value={spacer} onChange={e => { setSpacer(e.target.value); setTimeout(handleDesign, 0); }} maxLength={1} />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem' }}>
                  <button className="icon-button" onClick={() => setActiveFragIndex(i => Math.max(0, i - 1))} disabled={activeFragIndex === 0}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  
                  <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', flex: 1, scrollbarWidth: 'none' }}>
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
                            <input 
                              style={{ width: '100%', fontFamily: 'monospace', padding: '0.5rem', fontSize: '1rem' }} 
                              value={p.sequence}
                              onChange={(e) => updatePrimerSequence(activeFragIndex, pIdx, e.target.value)}
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
                      <input 
                        style={{ width: '100%', fontFamily: 'monospace', padding: '0.5rem', fontSize: '1rem' }} 
                        value={p.sequence}
                        onChange={(e) => {
                          setResults(curr => {
                            if (!curr) return curr;
                            const newRes = { ...curr };
                            const vPrimers = [...newRes.vectorPrimers];
                            const oldP = vPrimers[idx];
                            const newSeq = e.target.value.toUpperCase();
                            
                            let bStart = 0;
                            let bEnd = newSeq.length;
                            if (oldP.name.endsWith('_F')) {
                               bStart = Math.max(0, newSeq.length - 20);
                            } else {
                               bEnd = Math.min(newSeq.length, 20);
                            }

                            vPrimers[idx] = { ...oldP, sequence: newSeq, tm: calculateTm(newSeq, bStart, bEnd) };
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
