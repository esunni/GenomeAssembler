import { applyMutations, type SiteAnalysis } from './mutationTools';

export interface SplitSetFragment {
  name: string;
  length: number;
  coordStart: number;
  coordEnd: number;
  overhang5: string;
  overhang3: string;
  sequence: string;
}

export interface Mutation {
  position: number;
  original: string;
  mutated: string;
}

export interface MutationGroup {
  id: string;
  mutations: Mutation[];
  centerPosition: number;
}

export interface Primer {
  name: string;
  sequence: string;
  tm: number;
  type: 'fragment' | 'vector' | 'mutation';
  bindingStart?: number;
  bindingEnd?: number;
  direction?: 'F' | 'R';
  templateSeq?: string;
  typeIisSpan?: [number, number]; // [start, end]
  templateAnchor5?: number; // 0-based index on forward strand where the 5' end of the binding region aligns
}

export interface AssemblyFragment {
  name: string;
  primers: Primer[];
  originalSequence: string;
  bindingVisualizations: BindingVisualization[];
}

export interface BindingVisualization {
  title: string;
  primerF: string;
  primerR: string;
  templateF: string;
  templateR: string;
  offsetF: number;
  offsetR: number;
  prefixF: string;
  suffixF: string;
  prefixR: string;
  suffixR: string;
}

export function computeVisualizations(primers: Primer[], origSeq: string): BindingVisualization[] {
  const visualizations: BindingVisualization[] = [];
  const fwdPrimers = primers.filter(p => p.direction === 'F').sort((a, b) => (a.templateAnchor5 || 0) - (b.templateAnchor5 || 0));
  const revPrimers = primers.filter(p => p.direction === 'R').sort((a, b) => (a.templateAnchor5 || 0) - (b.templateAnchor5 || 0));
  
  for (let j = 0; j < Math.max(fwdPrimers.length, revPrimers.length); j++) {
    const pF = fwdPrimers[j] || fwdPrimers[0];
    const pR = revPrimers[j] || revPrimers[0];
    
    if (!pF || !pR) continue;

    const pF_bindLen = (pF.bindingEnd ?? pF.sequence.length) - (pF.bindingStart ?? 0);
    const pR_bindLen = (pR.bindingEnd ?? pR.sequence.length) - (pR.bindingStart ?? 0);

    const pF_left = pF.templateAnchor5 ?? 0;
    const pF_right = pF_left + pF_bindLen - 1;

    const pR_right = pR.templateAnchor5 ?? 0;
    const pR_left = pR_right - pR_bindLen + 1;

    const vStartF = Math.max(0, pF_left - 10);
    const vEndF = Math.min(origSeq.length, pF_right + 21);
    
    const vStartR = Math.max(0, pR_left - 20);
    const vEndR = Math.min(origSeq.length, pR_right + 11);
    
    visualizations.push({
      title: `${pF.name} & ${pR.name}`,
      primerF: pF.name,
      primerR: pR.name,
      templateF: origSeq.substring(vStartF, vEndF),
      templateR: origSeq.substring(vStartR, vEndR),
      offsetF: pF_left - vStartF,
      offsetR: pR_left - vStartR,
      prefixF: pF.type === 'mutation' ? '... ' : '    ',
      suffixF: ' ...',
      prefixR: '... ',
      suffixR: pR.type === 'mutation' ? ' ...' : '    ',
    });
  }
  return visualizations;
}

export const reverseComplement = (seq: string) => {
  const complement: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', a: 't', t: 'a', c: 'g', g: 'c' };
  return seq.split('').reverse().map(c => complement[c] || c).join('');
};

export const calculateTm = (seq: string, bindingStart: number = 0, bindingEnd: number = seq.length, templateSeq?: string): number => {
  const bindingSeq = seq.substring(bindingStart, bindingEnd);
  let gc = 0;
  let at = 0;
  
  for (let i = 0; i < bindingSeq.length; i++) {
    const char = bindingSeq[i].toUpperCase();
    
    // If we have a genomic template, we check if the primer actually matches it.
    // Mismatched bases (like a silent mutation inside the binding region) "bubble" and do not contribute to Tm!
    if (templateSeq && i < templateSeq.length) {
      const targetChar = templateSeq[i]?.toUpperCase();
      if (char !== targetChar) {
        continue; // This base doesn't bind to the template, so it provides no thermal stability
      }
    }

    if (char === 'G' || char === 'C') gc++;
    if (char === 'A' || char === 'T') at++;
  }

  const len = gc + at; // Only counting bases that actually annealed
  if (len === 0) return 0;
  if (len < 14) {
    return (at * 2) + (gc * 4);
  }
  
  // Simplified nearest neighbor approx that doesn't drop when adding A/T
  // This uses a very simple salt-adjusted formula that is stable:
  const tm = 64.9 + 41 * (gc - 16.4) / len;
  
  // If it's a very long sequence with low GC, Wallace formula drops. 
  // We clamp it or use Marmur-Doty if it drops too low.
  const marmur = 81.5 + 16.6 * Math.log10(0.05) + 41 * (gc / len) - 500 / len;
  
  return Math.max(tm, marmur, (at * 2) + (gc * 4) - (len * 0.5));
};

export function parseSplitSetResult(text: string): SplitSetFragment[] {
  const fragments: SplitSetFragment[] = [];
  const blocks = text.split('>').filter(Boolean);
  
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const header = lines[0];
    const sequence = lines.slice(1).join('').trim().toUpperCase();
    
    const nameMatch = header.match(/^(\S+)/);
    const lengthMatch = header.match(/length=(\d+)/);
    const coordMatch = header.match(/coord=(\d+)\.\.(\d+)/);
    const oh5Match = header.match(/5'-overhang=([A-Z]+)/i);
    const oh3Match = header.match(/3'-overhang=([A-Z]+)/i);
    
    if (nameMatch && lengthMatch && coordMatch && oh5Match && oh3Match) {
      fragments.push({
        name: nameMatch[1],
        length: parseInt(lengthMatch[1], 10),
        coordStart: parseInt(coordMatch[1], 10),
        coordEnd: parseInt(coordMatch[2], 10),
        overhang5: oh5Match[1].toUpperCase(),
        overhang3: oh3Match[1].toUpperCase(),
        sequence,
      });
    }
  }
  
  return fragments;
}

function getOriginalSequence(originalGenome: string, start: number, end: number, isLinear: boolean): string {
  if (start <= end) {
    return originalGenome.substring(start - 1, end);
  } else {
    // Circular wrap
    return originalGenome.substring(start - 1) + originalGenome.substring(0, end);
  }
}

export function findMutations(fragment: SplitSetFragment, originalGenome: string, isLinear: boolean): MutationGroup[] {
  const origSeq = getOriginalSequence(originalGenome.toUpperCase(), fragment.coordStart, fragment.coordEnd, isLinear);
  const mutations: Mutation[] = [];
  
  // Find all mismatches
  for (let i = 0; i < fragment.sequence.length; i++) {
    if (fragment.sequence[i] !== origSeq[i]) {
      mutations.push({
        position: i,
        original: origSeq[i],
        mutated: fragment.sequence[i]
      });
    }
  }
  
  // Filter out mutations in the first 24bp and last 24bp (covered by fragment F/R primers)
  const validMutations = mutations.filter(m => m.position >= 24 && m.position < fragment.sequence.length - 24);
  
  // Group mutations within 15bp of each other
  const groups: MutationGroup[] = [];
  let currentGroup: Mutation[] = [];
  
  for (const mut of validMutations) {
    if (currentGroup.length === 0) {
      currentGroup.push(mut);
    } else {
      const lastMut = currentGroup[currentGroup.length - 1];
      if (mut.position - lastMut.position <= 15) {
        currentGroup.push(mut);
      } else {
        groups.push({
          id: `mut${groups.length + 1}`,
          mutations: [...currentGroup],
          centerPosition: Math.floor((currentGroup[0].position + currentGroup[currentGroup.length - 1].position) / 2)
        });
        currentGroup = [mut];
      }
    }
  }
  
  if (currentGroup.length > 0) {
    groups.push({
      id: `mut${groups.length + 1}`,
      mutations: currentGroup,
      centerPosition: Math.floor((currentGroup[0].position + currentGroup[currentGroup.length - 1].position) / 2)
    });
  }
  
  return groups;
}

export interface PrimerDesignConfig {
  vectorName: string;
  vectorLeft: string; // sequence exactly before insert
  vectorRight: string; // sequence exactly after insert
  restrictionSite: string;
  spacer: string;
}

export function designPrimers(
  fragments: SplitSetFragment[],
  originalGenome: string,
  config: PrimerDesignConfig,
  isLinear: boolean,
  siteAnalyses: SiteAnalysis[] = []
): { vectorPrimers: Primer[], fragmentAssemblies: AssemblyFragment[] } {
  const vecLeft13 = config.vectorLeft.slice(-13).toUpperCase();
  const vecLeft20 = config.vectorLeft.slice(-20).toUpperCase();
  const vecRight13 = config.vectorRight.slice(0, 13).toUpperCase();
  const vecRight20 = config.vectorRight.slice(0, 20).toUpperCase();
  const rs = config.restrictionSite.toUpperCase();
  const spacer = config.spacer.toUpperCase();
  
  const rsSpacer = rs + spacer;
  const rcRsSpacer = reverseComplement(rsSpacer);
  
  const vectorPrimers: Primer[] = [
    {
      name: `${config.vectorName}_F`,
      sequence: rcRsSpacer + vecRight20,
      tm: calculateTm(rcRsSpacer + vecRight20, rcRsSpacer.length),
      type: 'vector',
      direction: 'F',
      typeIisSpan: [0, rcRsSpacer.length]
    },
    {
      name: `${config.vectorName}_R`,
      sequence: rcRsSpacer + reverseComplement(vecLeft20),
      tm: calculateTm(rcRsSpacer + reverseComplement(vecLeft20), rcRsSpacer.length),
      type: 'vector',
      direction: 'R',
      typeIisSpan: [0, rcRsSpacer.length]
    }
  ];

  const mutationsToApply = siteAnalyses.map(site => {
    const mutated = site.userMutation || site.suggestedMutation;
    if (mutated && mutated.length === site.matchSequence.length && mutated.toUpperCase() !== site.matchSequence.toUpperCase()) {
      return { position: site.sitePosition, original: site.matchSequence.toUpperCase(), mutated: mutated.toUpperCase() };
    }
    return null;
  }).filter(Boolean) as { position: number; original: string; mutated: string }[];
  
  const mutatedGenome = applyMutations(originalGenome, mutationsToApply, isLinear);

  const fragmentAssemblies: AssemblyFragment[] = [];

  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    
    const origSeq = getOriginalSequence(originalGenome.toUpperCase(), frag.coordStart, frag.coordEnd, isLinear);
    const mutSeq = getOriginalSequence(mutatedGenome.toUpperCase(), frag.coordStart, frag.coordEnd, isLinear);

    // Find mutations in this fragment to dynamically size the F/R primers
    const allMutations: Mutation[] = [];
    for (let j = 0; j < mutSeq.length; j++) {
      if (mutSeq[j] !== origSeq[j]) {
        allMutations.push({
          position: j,
          original: origSeq[j],
          mutated: mutSeq[j]
        });
      }
    }

    let fBindLen = 24;
    let rBindLen = 24;

    // Extend F primer if mutations are near the 5' end
    const fMutations = allMutations.filter(m => m.position < 40);
    if (fMutations.length > 0) {
      const maxF = Math.max(...fMutations.map(m => m.position));
      if (maxF >= fBindLen - 5) {
        fBindLen = maxF + 8; // ensure some buffer after mutation
      }
    }

    // Extend R primer if mutations are near the 3' end
    const rMutations = allMutations.filter(m => m.position >= mutSeq.length - 40);
    if (rMutations.length > 0) {
      const minR = Math.min(...rMutations.map(m => m.position));
      if (mutSeq.length - minR >= rBindLen - 5) {
        rBindLen = (mutSeq.length - minR) + 8;
      }
    }

    const fSeq = vecLeft13 + rsSpacer + mutSeq.substring(0, fBindLen);
    const fTarget = origSeq.substring(0, fBindLen);
    
    const rSeq = reverseComplement(vecRight13) + rsSpacer + reverseComplement(mutSeq.substring(mutSeq.length - rBindLen));
    const rTarget = reverseComplement(origSeq.substring(origSeq.length - rBindLen));

    const fTargetForTm = origSeq.substring(0, fBindLen + 20);
    const rTargetForTm = reverseComplement(origSeq.substring(Math.max(0, origSeq.length - rBindLen - 20)));

    const fragPrimers: Primer[] = [
      {
        name: `${frag.name}_F`,
        sequence: fSeq,
        tm: calculateTm(fSeq, fSeq.length - fBindLen, fSeq.length, fTargetForTm),
        type: 'fragment',
        bindingStart: fSeq.length - fBindLen,
        bindingEnd: fSeq.length,
        direction: 'F',
        templateSeq: fTargetForTm,
        typeIisSpan: [vecLeft13.length, vecLeft13.length + rsSpacer.length],
        templateAnchor5: 0
      }
    ];

    // Middle mutations
    const midMutations = allMutations.filter(m => m.position >= fBindLen && m.position < mutSeq.length - rBindLen);
    
    const groups: MutationGroup[] = [];
    let currentGroup: Mutation[] = [];
    
    for (const mut of midMutations) {
      if (currentGroup.length === 0) {
        currentGroup.push(mut);
      } else {
        const lastMut = currentGroup[currentGroup.length - 1];
        if (mut.position - lastMut.position <= 15) {
          currentGroup.push(mut);
        } else {
          groups.push({
            id: `mut${groups.length + 1}`,
            mutations: [...currentGroup],
            centerPosition: Math.floor((currentGroup[0].position + currentGroup[currentGroup.length - 1].position) / 2)
          });
          currentGroup = [mut];
        }
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push({
        id: `mut${groups.length + 1}`,
        mutations: currentGroup,
        centerPosition: Math.floor((currentGroup[0].position + currentGroup[currentGroup.length - 1].position) / 2)
      });
    }
    
    groups.forEach(mut => {
      // 25bp centered on mutation center
      let start = mut.centerPosition - 12;
      let end = mut.centerPosition + 13;
      if (start < 0) {
        start = 0;
        end = 25;
      }
      if (end > mutSeq.length) {
        end = mutSeq.length;
        start = end - 25;
      }
      const mutSeqForPrimer = mutSeq.substring(start, end);
      const mutTargetFForTm = origSeq.substring(start, Math.min(origSeq.length, end + 20));
      
      fragPrimers.push({
        name: `${frag.name}_${mut.id}_F`,
        sequence: mutSeqForPrimer,
        tm: calculateTm(mutSeqForPrimer, 0, mutSeqForPrimer.length, mutTargetFForTm),
        type: 'mutation',
        bindingStart: 0,
        bindingEnd: mutSeqForPrimer.length,
        direction: 'F',
        templateSeq: mutTargetFForTm,
        templateAnchor5: start
      });

      const rMutSeq = reverseComplement(mutSeqForPrimer);
      const rMutTargetForTm = reverseComplement(origSeq.substring(Math.max(0, start - 20), end));

      fragPrimers.push({
        name: `${frag.name}_${mut.id}_R`,
        sequence: rMutSeq,
        tm: calculateTm(rMutSeq, 0, rMutSeq.length, rMutTargetForTm),
        type: 'mutation',
        bindingStart: 0,
        bindingEnd: rMutSeq.length,
        direction: 'R',
        templateSeq: rMutTargetForTm,
        templateAnchor5: end - 1
      });
    });

    fragPrimers.push({
      name: `${frag.name}_R`,
      sequence: rSeq,
      tm: calculateTm(rSeq, rSeq.length - rBindLen, rSeq.length, rTargetForTm),
      type: 'fragment',
      bindingStart: rSeq.length - rBindLen,
      bindingEnd: rSeq.length,
      direction: 'R',
      templateSeq: rTargetForTm,
      typeIisSpan: [vecRight13.length, vecRight13.length + rsSpacer.length],
      templateAnchor5: mutSeq.length - 1
    });

    // Create visualizations
    const visualizations = computeVisualizations(fragPrimers, origSeq);

    fragmentAssemblies.push({
      name: frag.name,
      primers: fragPrimers,
      originalSequence: origSeq,
      bindingVisualizations: visualizations
    });
  }

  return { vectorPrimers, fragmentAssemblies };
}
