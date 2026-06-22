export interface RestrictionEnzyme {
  id: string;
  name: string;
  recognitionSite: string;
  cutOffset: number;
  isPalindrome: boolean;
}

export interface RestrictionSite {
  id: string;
  enzymeId: string;
  enzymeName: string;
  recognitionStart: number;
  cutPosition: number;
  strand: '+' | '-';
  matchSequence: string;
}

export interface CutFragment {
  index: number;
  start: number;
  end: number;
  length: number;
  sequence: string;
  wraps: boolean;
  leftCut: { enzymeName: string; position: number } | null;
  rightCut: { enzymeName: string; position: number } | null;
}

const IUPAC_TABLE: Record<string, string[]> = {
  A: ['A'],
  C: ['C'],
  G: ['G'],
  T: ['T'],
  R: ['A', 'G'],
  Y: ['C', 'T'],
  S: ['C', 'G'],
  W: ['A', 'T'],
  K: ['G', 'T'],
  M: ['A', 'C'],
  B: ['C', 'G', 'T'],
  D: ['A', 'G', 'T'],
  H: ['A', 'C', 'T'],
  V: ['A', 'C', 'G'],
  N: ['A', 'C', 'G', 'T'],
};

const COMPLEMENT: Record<string, string> = {
  A: 'T',
  C: 'G',
  G: 'C',
  T: 'A',
  R: 'Y',
  Y: 'R',
  S: 'S',
  W: 'W',
  K: 'M',
  M: 'K',
  B: 'V',
  D: 'H',
  H: 'D',
  V: 'B',
  N: 'N',
};

function reverseComplement(sequence: string): string {
  return sequence
    .toUpperCase()
    .split('')
    .reverse()
    .map((base) => COMPLEMENT[base] ?? 'N')
    .join('');
}

function matchesIupac(motifBase: string, sequenceBase: string): boolean {
  const allowed = IUPAC_TABLE[motifBase];
  if (!allowed) return false;
  return allowed.includes(sequenceBase);
}

function defineEnzyme(
  id: string,
  name: string,
  recognitionSite: string,
  cutOffset: number,
): RestrictionEnzyme {
  const upper = recognitionSite.toUpperCase();
  return {
    id,
    name,
    recognitionSite: upper,
    cutOffset,
    isPalindrome: upper === reverseComplement(upper),
  };
}

export const RESTRICTION_ENZYMES: RestrictionEnzyme[] = [
  defineEnzyme('ecori', 'EcoRI', 'GAATTC', 1),
  defineEnzyme('bamhi', 'BamHI', 'GGATCC', 1),
  defineEnzyme('hindiii', 'HindIII', 'AAGCTT', 1),
  defineEnzyme('xhoi', 'XhoI', 'CTCGAG', 1),
  defineEnzyme('sali', 'SalI', 'GTCGAC', 1),
  defineEnzyme('xbai', 'XbaI', 'TCTAGA', 1),
  defineEnzyme('spei', 'SpeI', 'ACTAGT', 1),
  defineEnzyme('nhei', 'NheI', 'GCTAGC', 1),
  defineEnzyme('bglii', 'BglII', 'AGATCT', 1),
  defineEnzyme('ncoi', 'NcoI', 'CCATGG', 1),
  defineEnzyme('ndei', 'NdeI', 'CATATG', 2),
  defineEnzyme('clai', 'ClaI', 'ATCGAT', 2),
  defineEnzyme('mlui', 'MluI', 'ACGCGT', 1),
  defineEnzyme('noti', 'NotI', 'GCGGCCGC', 2),
  defineEnzyme('asci', 'AscI', 'GGCGCGCC', 2),
  defineEnzyme('paci', 'PacI', 'TTAATTAA', 5),
  defineEnzyme('avrii', 'AvrII', 'CCTAGG', 1),
  defineEnzyme('bspei', 'BspEI', 'TCCGGA', 1),
  defineEnzyme('kpni', 'KpnI', 'GGTACC', 5),
  defineEnzyme('saci', 'SacI', 'GAGCTC', 5),
  defineEnzyme('psti', 'PstI', 'CTGCAG', 5),
  defineEnzyme('sphi', 'SphI', 'GCATGC', 5),
  defineEnzyme('apai', 'ApaI', 'GGGCCC', 5),
  defineEnzyme('sbfi', 'SbfI', 'CCTGCAGG', 6),
  defineEnzyme('fsei', 'FseI', 'GGCCGGCC', 6),
  defineEnzyme('ecorv', 'EcoRV', 'GATATC', 3),
  defineEnzyme('smai', 'SmaI', 'CCCGGG', 3),
  defineEnzyme('hpai', 'HpaI', 'GTTAAC', 3),
  defineEnzyme('pvuii', 'PvuII', 'CAGCTG', 3),
  defineEnzyme('stui', 'StuI', 'AGGCCT', 3),
  defineEnzyme('drai', 'DraI', 'TTTAAA', 3),
  defineEnzyme('scai', 'ScaI', 'AGTACT', 3),
  defineEnzyme('sspi', 'SspI', 'AATATT', 3),
  defineEnzyme('pmei', 'PmeI', 'GTTTAAAC', 4),
  defineEnzyme('swai', 'SwaI', 'ATTTAAAT', 4),
];

export const ENZYME_PALETTE = [
  '#e11d48',
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#db2777',
  '#65a30d',
  '#9333ea',
  '#0891b2',
  '#dc2626',
  '#7c3aed',
];

export function getEnzymeColor(enzymeId: string, selectedIds: string[]): string {
  const index = selectedIds.indexOf(enzymeId);
  if (index < 0) return '#64748b';
  return ENZYME_PALETTE[index % ENZYME_PALETTE.length];
}

export interface ParsedFasta {
  name: string;
  sequence: string;
  length: number;
}

const VALID_SEQUENCE = /^[ACGTRYSWKMBDHVN]+$/i;

export function parseFasta(content: string): ParsedFasta {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) => line.startsWith('>'));
  if (headerIndex < 0) {
    throw new Error('FASTA file is missing a header line starting with ">".');
  }

  const header = lines[headerIndex].slice(1).trim() || 'Uploaded sequence';
  const sequence = lines
    .slice(headerIndex + 1)
    .filter((line) => !line.startsWith('>'))
    .join('')
    .replace(/\s+/g, '')
    .toUpperCase();

  if (sequence.length === 0) {
    throw new Error('The FASTA sequence is empty.');
  }
  if (!VALID_SEQUENCE.test(sequence)) {
    throw new Error('The FASTA sequence contains unsupported characters.');
  }

  return { name: header, sequence, length: sequence.length };
}

function sliceWrap(sequence: string, start: number, length: number, isLinear: boolean): string {
  if (isLinear) {
    if (start + length > sequence.length) return '';
    return sequence.substring(start, start + length);
  }
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += sequence[(start + i) % sequence.length];
  }
  return out;
}

function motifMatches(motif: string, window: string): boolean {
  if (motif.length !== window.length) return false;
  for (let i = 0; i < motif.length; i += 1) {
    if (!matchesIupac(motif[i], window[i])) return false;
  }
  return true;
}

export function findRestrictionSites(
  sequence: string,
  enzymes: RestrictionEnzyme[],
  isLinear: boolean,
): RestrictionSite[] {
  const normalized = sequence.toUpperCase();
  const length = normalized.length;
  const sites: RestrictionSite[] = [];

  for (const enzyme of enzymes) {
    const motif = enzyme.recognitionSite;
    const motifLength = motif.length;
    const reverseMotif = reverseComplement(motif);
    const maxIndex = isLinear ? length - motifLength : length - 1;

    for (let index = 0; index <= maxIndex; index += 1) {
      const window = sliceWrap(normalized, index, motifLength, isLinear);
      if (window.length !== motifLength) continue;

      if (motifMatches(motif, window)) {
        const cutPos = ((index + enzyme.cutOffset) % length) + 1;
        sites.push({
          id: `${enzyme.id}-${index + 1}-+`,
          enzymeId: enzyme.id,
          enzymeName: enzyme.name,
          recognitionStart: index + 1,
          cutPosition: cutPos,
          strand: '+',
          matchSequence: window,
        });
      }

      if (!enzyme.isPalindrome && motifMatches(reverseMotif, window)) {
        const reverseCutOffset = motifLength - enzyme.cutOffset;
        const cutPos = ((index + reverseCutOffset) % length) + 1;
        sites.push({
          id: `${enzyme.id}-${index + 1}--`,
          enzymeId: enzyme.id,
          enzymeName: enzyme.name,
          recognitionStart: index + 1,
          cutPosition: cutPos,
          strand: '-',
          matchSequence: window,
        });
      }
    }
  }

  return sites.sort((a, b) => {
    if (a.cutPosition !== b.cutPosition) return a.cutPosition - b.cutPosition;
    return a.enzymeName.localeCompare(b.enzymeName);
  });
}

export function computeFragments(
  sequence: string,
  selectedSites: RestrictionSite[],
  isLinear: boolean,
): CutFragment[] {
  if (selectedSites.length === 0) {
    if (sequence.length === 0) return [];
    return [
      {
        index: 1,
        start: 1,
        end: sequence.length,
        length: sequence.length,
        sequence,
        wraps: false,
        leftCut: null,
        rightCut: null,
      },
    ];
  }

  const length = sequence.length;
  const dedup = new Map<number, RestrictionSite>();
  for (const site of selectedSites) {
    const existing = dedup.get(site.cutPosition);
    if (!existing) dedup.set(site.cutPosition, site);
  }
  const orderedCuts = Array.from(dedup.values()).sort((a, b) => a.cutPosition - b.cutPosition);

  const fragments: CutFragment[] = [];

  if (isLinear) {
    let prevCut: RestrictionSite | null = null;
    let cursor = 1;
    for (const cut of orderedCuts) {
      const end = cut.cutPosition - 1;
      if (end >= cursor) {
        fragments.push({
          index: fragments.length + 1,
          start: cursor,
          end,
          length: end - cursor + 1,
          sequence: sequence.substring(cursor - 1, end),
          wraps: false,
          leftCut: prevCut ? { enzymeName: prevCut.enzymeName, position: prevCut.cutPosition } : null,
          rightCut: { enzymeName: cut.enzymeName, position: cut.cutPosition },
        });
      }
      cursor = cut.cutPosition;
      prevCut = cut;
    }
    if (cursor <= length) {
      fragments.push({
        index: fragments.length + 1,
        start: cursor,
        end: length,
        length: length - cursor + 1,
        sequence: sequence.substring(cursor - 1, length),
        wraps: false,
        leftCut: prevCut ? { enzymeName: prevCut.enzymeName, position: prevCut.cutPosition } : null,
        rightCut: null,
      });
    }
    return fragments;
  }

  for (let i = 0; i < orderedCuts.length; i += 1) {
    const current = orderedCuts[i];
    const next = orderedCuts[(i + 1) % orderedCuts.length];
    const start = current.cutPosition;
    const end = next.cutPosition - 1 < 1 ? length : next.cutPosition - 1;
    const wraps = next.cutPosition <= current.cutPosition;
    let fragSequence: string;
    let fragLength: number;
    if (!wraps) {
      fragSequence = sequence.substring(start - 1, end);
      fragLength = end - start + 1;
    } else {
      fragSequence = sequence.substring(start - 1) + sequence.substring(0, next.cutPosition - 1);
      fragLength = fragSequence.length;
    }
    fragments.push({
      index: i + 1,
      start,
      end: wraps ? next.cutPosition - 1 : end,
      length: fragLength,
      sequence: fragSequence,
      wraps,
      leftCut: { enzymeName: current.enzymeName, position: current.cutPosition },
      rightCut: { enzymeName: next.enzymeName, position: next.cutPosition },
    });
  }
  return fragments;
}

export function fragmentsToFasta(fragments: CutFragment[], sequenceName: string): string {
  const safeName = sequenceName.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.\-]/g, '');
  const lines: string[] = [];
  for (const frag of fragments) {
    const leftLabel = frag.leftCut ? `${frag.leftCut.enzymeName}@${frag.leftCut.position}` : 'start';
    const rightLabel = frag.rightCut ? `${frag.rightCut.enzymeName}@${frag.rightCut.position}` : 'end';
    const wrapTag = frag.wraps ? ' wraps=true' : '';
    lines.push(
      `>${safeName}_fragment_${frag.index} ${leftLabel}..${rightLabel} length=${frag.length}${wrapTag}`,
    );
    for (let i = 0; i < frag.sequence.length; i += 60) {
      lines.push(frag.sequence.substring(i, i + 60));
    }
  }
  return lines.join('\n');
}
