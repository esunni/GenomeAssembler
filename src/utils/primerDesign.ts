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

export const calculateTm = (seq: string): number => {
  let gc = 0;
  let at = 0;
  for (const char of seq.toUpperCase()) {
    if (char === 'G' || char === 'C') gc++;
    if (char === 'A' || char === 'T') at++;
  }
  if (seq.length < 14) {
    return (at * 2) + (gc * 4);
  }
  return 64.9 + 41 * (gc - 16.4) / seq.length;
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
  
  const vectorPrimers: Primer[] = [
    {
      name: `${config.vectorName}_F`,
      sequence: rs + spacer + vecRight20,
      tm: calculateTm(rs + spacer + vecRight20),
      type: 'vector'
    },
    {
      name: `${config.vectorName}_R`,
      sequence: reverseComplement(vecLeft20) + reverseComplement(spacer) + reverseComplement(rs),
      tm: calculateTm(reverseComplement(vecLeft20) + reverseComplement(spacer) + reverseComplement(rs)),
      type: 'vector'
    }
  ];

  const fragmentAssemblies: AssemblyFragment[] = [];

  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    const isFirst = i === 0;
    const isLast = i === fragments.length - 1;
    
    // As per user rule: "All fragments get vector overlap"
    // F primer: vector(13) + RS(6) + spacer(1) + OH(4) + Frag(20)
    const fragFPart = frag.sequence.substring(4, 24);
    const fSeq = vecLeft13 + rs + spacer + frag.overhang5 + fragFPart;
    
    const fragRPart = frag.sequence.substring(frag.sequence.length - 24, frag.sequence.length - 4);
    const rSeq = reverseComplement(vecRight13) + reverseComplement(rs) + reverseComplement(spacer) + reverseComplement(frag.overhang3) + reverseComplement(fragRPart);

    const fragPrimers: Primer[] = [
      {
        name: `${frag.name}_F`,
        sequence: fSeq,
        tm: calculateTm(fSeq),
        type: 'fragment',
        bindingStart: 0,
        bindingEnd: 24,
        direction: 'F'
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
      
      fragPrimers.push({
        name: `${frag.name}_${mut.id}_F`,
        sequence: mutSeq,
        tm: calculateTm(mutSeq),
        type: 'mutation',
        bindingStart: start,
        bindingEnd: end,
        direction: 'F'
      });
      fragPrimers.push({
        name: `${frag.name}_${mut.id}_R`,
        sequence: reverseComplement(mutSeq),
        tm: calculateTm(reverseComplement(mutSeq)),
        type: 'mutation',
        bindingStart: start,
        bindingEnd: end,
        direction: 'R'
      });
    });

    fragPrimers.push({
      name: `${frag.name}_R`,
      sequence: rSeq,
      tm: calculateTm(rSeq),
      type: 'fragment',
      bindingStart: frag.sequence.length - 24,
      bindingEnd: frag.sequence.length,
      direction: 'R'
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
      
      const origContext = frag.sequence.substring(vStart, vEnd);
      
      let visF = "";
      if (pF.type === 'fragment') {
        visF = " ".repeat((pF.bindingStart || 0) - vStart) + pF.sequence.slice(-24);
      } else {
        visF = " ".repeat((pF.bindingStart || 0) - vStart) + pF.sequence;
      }

      let visR = "";
      if (pR.type === 'fragment') {
        visR = " ".repeat((pR.bindingStart || 0) - vStart) + reverseComplement(pR.sequence).substring(0, 24);
      } else {
        visR = " ".repeat((pR.bindingStart || 0) - vStart) + reverseComplement(pR.sequence);
      }
      
      visualizations.push({
        title: `${pF.name} & ${pR.name}`,
        originalDna: origContext,
        primerF: visF,
        primerR: visR,
        offsetF: (pF.bindingStart || 0) - vStart,
        offsetR: (pR.bindingStart || 0) - vStart
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
