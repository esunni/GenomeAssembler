import { useState, useMemo } from 'react';
import { parseSplitSetResult, designPrimers, type AssemblyFragment, type Primer, calculateTm } from '../utils/primerDesign';
import type { ParsedCircularFasta } from '../utils/designTools';

interface PrimerDesignSectionProps {
  uploadedGenome: ParsedCircularFasta | null;
  isLinear: boolean;
}

export function PrimerDesignSection({ uploadedGenome, isLinear }: PrimerDesignSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [splitsetText, setSplitsetText] = useState('');
  const [vectorName, setVectorName] = useState('Vector');
  const [vectorSeq, setVectorSeq] = useState('');
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
      restrictionSite: 'GGTCTC', // Default BsaI
      spacer: 'A' // Default
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
      primers[primerIndex] = { ...primers[primerIndex], sequence: newSeq.toUpperCase(), tm: calculateTm(newSeq) };
      frag.primers = primers;
      
      // Update visualization string
      const visualizations = [...frag.bindingVisualizations];
      // We need to find which visualization uses this primer and update it
      // For simplicity, we just update the primer arrays and let the user download it.
      // Re-calculating visualization perfectly requires matching names.
      newRes.fragmentAssemblies[fragIndex] = frag;
      return newRes;
    });
  };

  return (
    <>
      <button type="button" className="secondary" style={{ marginTop: '1rem' }} onClick={() => setIsOpen(true)}>
        Primer Design
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
              <button type="button" className="ghost" onClick={() => setIsOpen(false)}>Close</button>
            </div>

            {!results ? (
              <>
                <label>
                  <strong>NEB SplitSet Result</strong>
                  <textarea 
                    rows={10} 
                    style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', fontFamily: 'monospace' }}
                    placeholder="Paste NEB SplitSet output here..."
                    value={splitsetText}
                    onChange={e => setSplitsetText(e.target.value)}
                  />
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ flex: 1 }}>
                    <strong>Vector Name</strong>
                    <input 
                      style={{ width: '100%', marginTop: '0.5rem' }} 
                      value={vectorName} 
                      onChange={e => setVectorName(e.target.value)} 
                    />
                  </label>
                  <label style={{ flex: 2 }}>
                    <strong>Vector Sequence around insert (Use '↓' for insertion point)</strong>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <input 
                        style={{ flex: 1, fontFamily: 'monospace' }} 
                        value={vectorSeq} 
                        onChange={e => setVectorSeq(e.target.value)} 
                        placeholder="e.g. GATCGATC↓GATCGATC"
                      />
                      <button type="button" className="secondary" onClick={() => {
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
                <button type="button" className="primary-cta" onClick={handleDesign}>Generate Primers</button>
              </>
            ) : (
              <>
                {/* Results View */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #ccc', paddingBottom: '1rem' }}>
                  <button type="button" className="primary-cta" onClick={handleDownload}>Download All Primers (FASTA)</button>
                  <button type="button" className="ghost" onClick={() => setResults(null)}>Reset</button>
                </div>

                <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                  {results.fragmentAssemblies.map((frag, idx) => (
                    <button 
                      key={frag.name}
                      type="button" 
                      className={idx === activeFragIndex ? "primary-cta" : "secondary"}
                      onClick={() => {
                        setActiveFragIndex(idx);
                        setActiveVisIndex(0);
                      }}
                    >
                      {frag.name}
                    </button>
                  ))}
                </div>

                {results.fragmentAssemblies[activeFragIndex] && (
                  <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0 }}>
                        {results.fragmentAssemblies[activeFragIndex].bindingVisualizations[activeVisIndex]?.title}
                      </h3>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          disabled={activeVisIndex === 0}
                          onClick={() => setActiveVisIndex(i => i - 1)}
                        >&lt; Prev Pair</button>
                        <span>{activeVisIndex + 1} / {results.fragmentAssemblies[activeFragIndex].bindingVisualizations.length}</span>
                        <button 
                          disabled={activeVisIndex === results.fragmentAssemblies[activeFragIndex].bindingVisualizations.length - 1}
                          onClick={() => setActiveVisIndex(i => i + 1)}
                        >Next Pair &gt;</button>
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: '1rem', borderRadius: '4px', overflowX: 'auto', fontFamily: 'monospace', whiteSpace: 'pre', border: '1px solid #ccc' }}>
                      {results.fragmentAssemblies[activeFragIndex].bindingVisualizations[activeVisIndex]?.primerF}<br/>
                      {results.fragmentAssemblies[activeFragIndex].bindingVisualizations[activeVisIndex]?.originalDna}<br/>
                      {results.fragmentAssemblies[activeFragIndex].bindingVisualizations[activeVisIndex]?.primerR}
                    </div>

                    {/* Primer Editable Boxes */}
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {results.fragmentAssemblies[activeFragIndex].primers.map((p, pIdx) => {
                        // Only show the two primers relevant to current visualization
                        const vis = results.fragmentAssemblies[activeFragIndex].bindingVisualizations[activeVisIndex];
                        const isRelevant = vis && vis.title.includes(p.name);
                        if (!isRelevant) return null;

                        const otherPrimer = results.fragmentAssemblies[activeFragIndex].primers.find(op => 
                          vis.title.includes(op.name) && op.name !== p.name
                        );
                        
                        const tmDiff = otherPrimer ? Math.abs(p.tm - otherPrimer.tm) : 0;
                        const tmColor = tmDiff > 10 ? 'red' : 'inherit';

                        return (
                          <div key={p.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <strong>{p.name}</strong>
                              <span style={{ color: tmColor }}>Tm: {p.tm.toFixed(1)}°C {tmDiff > 10 && `(Diff > 10°C)`}</span>
                            </div>
                            <input 
                              style={{ width: '100%', fontFamily: 'monospace', padding: '0.5rem' }} 
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
                        style={{ width: '100%', fontFamily: 'monospace', padding: '0.5rem' }} 
                        value={p.sequence}
                        onChange={(e) => {
                          setResults(curr => {
                            if (!curr) return curr;
                            const newRes = { ...curr };
                            const vPrimers = [...newRes.vectorPrimers];
                            vPrimers[idx] = { ...vPrimers[idx], sequence: e.target.value.toUpperCase(), tm: calculateTm(e.target.value) };
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
