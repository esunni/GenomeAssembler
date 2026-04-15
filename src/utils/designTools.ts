export interface TypeIisEnzyme {
  id: string;
  name: string;
  recognitionSite: string;
  cutPattern: string;
}

export interface ParsedCircularFasta {
  name: string;
  sequence: string;
  length: number;
}

export interface EnzymeSite {
  position: number;
  strand: '+' | '-';
  matchSequence: string;
}

export const ENZYMES: TypeIisEnzyme[] = [
  { id: 'bsai-hfv2', name: 'BsaI-HFv2', recognitionSite: 'GGTCTC', cutPattern: 'GGTCTCn^nnnn_' },
  { id: 'bsai', name: 'BsaI', recognitionSite: 'GGTCTC', cutPattern: 'GGTCTCn^nnnn_' },
  { id: 'eco31i', name: 'Eco31I', recognitionSite: 'GGTCTC', cutPattern: 'GGTCTCn^nnnn_' },
  { id: 'bsmbi-v2', name: 'BsmBI-v2', recognitionSite: 'CGTCTC', cutPattern: 'CGTCTCn^nnnn_' },
  { id: 'bsmbi', name: 'BsmBI', recognitionSite: 'CGTCTC', cutPattern: 'CGTCTCn^nnnn_' },
  { id: 'esp3i', name: 'Esp3I', recognitionSite: 'CGTCTC', cutPattern: 'CGTCTCn^nnnn_' },
  { id: 'bbsi', name: 'BbsI', recognitionSite: 'GAAGAC', cutPattern: 'GAAGACnn^nnnn_' },
  { id: 'bbsi-hf', name: 'BbsI-HF', recognitionSite: 'GAAGAC', cutPattern: 'GAAGACnn^nnnn_' },
  { id: 'bpii', name: 'BpiI', recognitionSite: 'GAAGAC', cutPattern: 'GAAGACnn^nnnn_' },
  { id: 'sapi', name: 'SapI', recognitionSite: 'GCTCTTC', cutPattern: 'GCTCTTCn^nnn_' },
  { id: 'lgui', name: 'LguI', recognitionSite: 'GCTCTTC', cutPattern: 'GCTCTTCn^nnn_' },
  { id: 'bspqi', name: 'BspQI', recognitionSite: 'GCTCTTC', cutPattern: 'GCTCTTCn^nnn_' },
  { id: 'bspqi-hf', name: 'BspQI-HF', recognitionSite: 'GCTCTTC', cutPattern: 'GCTCTTCn^nnn_' },
  { id: 'paqci', name: 'PaqCI', recognitionSite: 'CACCTGC', cutPattern: 'CACCTGCnnnn^nnnn_' },
  { id: 'aari', name: 'AarI', recognitionSite: 'CACCTGC', cutPattern: 'CACCTGCnnnn^nnnn_' },
];

const IUPAC_SEQUENCE = /^[ACGTRYSWKMBDHVN]+$/i;

function reverseComplement(sequence: string): string {
  const complements: Record<string, string> = {
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

  return sequence
    .toUpperCase()
    .split('')
    .reverse()
    .map((base) => complements[base] ?? 'N')
    .join('');
}

function sliceSequence(sequence: string, startIndex: number, length: number, isLinear?: boolean): string {
  if (isLinear) {
    return sequence.substring(startIndex, startIndex + length);
  }
  return Array.from({ length }, (_, offset) => sequence[(startIndex + offset) % sequence.length]).join('');
}

export function parseSingleCircularFasta(content: string): ParsedCircularFasta {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerLines = lines.filter((line) => line.startsWith('>'));
  if (headerLines.length !== 1) {
    throw new Error('Please upload a FASTA file with exactly one sequence record.');
  }

  const firstHeaderIndex = lines.findIndex((line) => line.startsWith('>'));
  const header = lines[firstHeaderIndex]?.slice(1).trim() || 'Uploaded sequence';
  const sequence = lines
    .slice(firstHeaderIndex + 1)
    .filter((line) => !line.startsWith('>'))
    .join('')
    .replace(/\s+/g, '')
    .toUpperCase();

  if (sequence.length === 0) {
    throw new Error('The FASTA sequence is empty.');
  }

  if (!IUPAC_SEQUENCE.test(sequence)) {
    throw new Error('The FASTA sequence contains unsupported characters.');
  }

  return {
    name: header,
    sequence,
    length: sequence.length,
  };
}

export function findCircularEnzymeSites(sequence: string, enzyme: TypeIisEnzyme, isLinear?: boolean): EnzymeSite[] {
  const normalizedSequence = sequence.toUpperCase();
  const forwardMotif = enzyme.recognitionSite.toUpperCase();
  const reverseMotif = reverseComplement(forwardMotif);
  const motifLength = forwardMotif.length;
  const sites: EnzymeSite[] = [];

  const maxIndex = isLinear ? normalizedSequence.length - motifLength : normalizedSequence.length - 1;

  for (let index = 0; index <= maxIndex; index += 1) {
    const window = sliceSequence(normalizedSequence, index, motifLength, isLinear);

    if (window === forwardMotif) {
      sites.push({
        position: index + 1,
        strand: '+',
        matchSequence: forwardMotif,
      });
    }

    if (reverseMotif !== forwardMotif && window === reverseMotif) {
      sites.push({
        position: index + 1,
        strand: '-',
        matchSequence: reverseMotif,
      });
    }
  }

  return sites.sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.strand.localeCompare(right.strand);
  });
}
