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
}

export interface AssemblyFragment {
  name: string;
  primers: Primer[];
  bindingVisualizations: BindingVisualization[];
}

export interface BindingVisualization {
  title: string;
  originalDna: string;
  primerF: string;
  primerR: string;
  offsetF: number;
  offsetR: number;
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
    if (templateSeq) {
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
  isLinear: boolean
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
      type: 'vector'
    },
    {
      name: `${config.vectorName}_R`,
      sequence: rcRsSpacer + reverseComplement(vecLeft20),
      tm: calculateTm(rcRsSpacer + reverseComplement(vecLeft20), rcRsSpacer.length),
      type: 'vector'
    }
  ];

  const fragmentAssemblies: AssemblyFragment[] = [];

  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    const isFirst = i === 0;
    const isLast = i === fragments.length - 1;
    
    const origSeq = getOriginalSequence(originalGenome.toUpperCase(), frag.coordStart, frag.coordEnd, isLinear);

    const fragFPart = frag.sequence.substring(4, 24);
    const fPrefix = isFirst ? vecLeft13 : '';
    const fSeq = fPrefix + rsSpacer + frag.overhang5 + fragFPart;
    const fTarget = origSeq.substring(0, 24);
    
    const fragRPart = frag.sequence.substring(frag.sequence.length - 24, frag.sequence.length - 4);
    const rPrefix = isLast ? reverseComplement(vecRight13) : '';
    const rSeq = rPrefix + rsSpacer + reverseComplement(frag.overhang3) + reverseComplement(fragRPart);
    const rTarget = reverseComplement(origSeq.substring(origSeq.length - 24, origSeq.length));

    const fragPrimers: Primer[] = [
      {
        name: `${frag.name}_F`,
        sequence: fSeq,
        tm: calculateTm(fSeq, fSeq.length - 24, fSeq.length, fTarget),
        type: 'fragment',
        bindingStart: fSeq.length - 24,
        bindingEnd: fSeq.length,
        direction: 'F',
        templateSeq: fTarget
      }
    ];

    const mutations = findMutations(frag, originalGenome, isLinear);
    
    mutations.forEach(mut => {
      // 25bp centered on mutation center
      let start = mut.centerPosition - 12;
      let end = mut.centerPosition + 13;
      if (start < 0) {
        start = 0;
        end = 25;
      }
      if (end > frag.sequence.length) {
        end = frag.sequence.length;
        start = end - 25;
      }
      const mutSeq = frag.sequence.substring(start, end);
      const mutTargetF = origSeq.substring(start, end);
      
      fragPrimers.push({
        name: `${frag.name}_${mut.id}_F`,
        sequence: mutSeq,
        tm: calculateTm(mutSeq, 0, mutSeq.length, mutTargetF),
        type: 'mutation',
        bindingStart: start,
        bindingEnd: end,
        direction: 'F',
        templateSeq: mutTargetF
      });

      const rMutSeq = reverseComplement(mutSeq);
      const rMutTarget = reverseComplement(mutTargetF);

      fragPrimers.push({
        name: `${frag.name}_${mut.id}_R`,
        sequence: rMutSeq,
        tm: calculateTm(rMutSeq, 0, rMutSeq.length, rMutTarget),
        type: 'mutation',
        bindingStart: start,
        bindingEnd: end,
        direction: 'R',
        templateSeq: rMutTarget
      });
    });

    fragPrimers.push({
      name: `${frag.name}_R`,
      sequence: rSeq,
      tm: calculateTm(rSeq, rSeq.length - 24, rSeq.length, rTarget),
      type: 'fragment',
      bindingStart: rSeq.length - 24,
      bindingEnd: rSeq.length,
      direction: 'R',
      templateSeq: rTarget
    });

    // Create visualizations
    const visualizations: BindingVisualization[] = [];
    
    // Sort primers by position
    const fwdPrimers = fragPrimers.filter(p => p.direction === 'F').sort((a, b) => (a.bindingStart || 0) - (b.bindingStart || 0));
    const revPrimers = fragPrimers.filter(p => p.direction === 'R').sort((a, b) => (a.bindingStart || 0) - (b.bindingStart || 0));
    
    for (let j = 0; j < fwdPrimers.length; j++) {
      const pF = fwdPrimers[j];
      const pR = revPrimers[j];
      
      if (!pF || !pR) continue;

      const vStart = Math.max(0, (pF.bindingStart || 0) - 10);
      const vEnd = Math.min(frag.sequence.length, (pR.bindingEnd || 0) + 10);
      
      visualizations.push({
        title: `${pF.name} & ${pR.name}`,
        originalDna: frag.sequence.substring(vStart, vEnd),
        primerF: pF.name, // We'll compute visual dynamically in UI
        primerR: pR.name, // We'll compute visual dynamically in UI
        offsetF: vStart,
        offsetR: vEnd
      });
    }

    fragmentAssemblies.push({
      name: frag.name,
      primers: fragPrimers,
      bindingVisualizations: visualizations
    });
  }

  return { vectorPrimers, fragmentAssemblies };
}
