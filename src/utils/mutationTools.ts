import { EnzymeSite } from './designTools';

export interface CodonUsage {
  codon: string;
  aminoAcid: string;
  fraction: number;
  frequency: number;
  number: number;
}

export interface CdsRegion {
  id: number;
  start: number;
  end: number;
  strand: '+' | '-';
  product?: string;
}

export interface SiteAnalysis {
  sitePosition: number; // 1-based
  strand: '+' | '-';
  matchSequence: string;
  inCds: boolean;
  cdsId?: number;
  cdsStrand?: '+' | '-';
  readingFrameStart?: number;
  contextCodons: CodonContext[];
  suggestedMutation?: string;
  userMutation?: string;
}

export interface CodonContext {
  codon: string;
  aminoAcid: string;
  isSite: boolean;
  globalStart: number; // 1-based index of first base of this codon in genome
}

export function parseCodonUsage(csvContent: string): Map<string, CodonUsage[]> {
  const lines = csvContent.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const codonMap = new Map<string, CodonUsage[]>();

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 5) {
      const codon = parts[0].trim().toUpperCase();
      const aminoAcid = parts[1].trim();
      const fraction = parseFloat(parts[2]);
      const frequency = parseFloat(parts[3]);
      const number = parseInt(parts[4], 10);

      if (!codonMap.has(aminoAcid)) {
        codonMap.set(aminoAcid, []);
      }
      codonMap.get(aminoAcid)!.push({ codon, aminoAcid, fraction, frequency, number });
    }
  }

  // Sort by frequency descending
  for (const [aa, codons] of codonMap.entries()) {
    codons.sort((a, b) => b.frequency - a.frequency);
  }

  return codonMap;
}

export function parsePhastestDetails(txtContent: string): CdsRegion[] {
  const lines = txtContent.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const cdsRegions: CdsRegion[] = [];
  let idCounter = 1;

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('####') || line.startsWith('CDS_POSITION') || line.startsWith('gi|')) {
      continue;
    }

    const match = line.match(/^(\d+)\.\.(\d+)\s+(.*?)\s+/);
    if (match) {
      cdsRegions.push({
        id: idCounter++,
        start: parseInt(match[1], 10),
        end: parseInt(match[2], 10),
        strand: '+',
        product: match[3],
      });
      continue;
    }

    const compMatch = line.match(/^complement\((\d+)\.\.(\d+)\)\s+(.*?)\s+/);
    if (compMatch) {
      cdsRegions.push({
        id: idCounter++,
        start: parseInt(compMatch[1], 10),
        end: parseInt(compMatch[2], 10),
        strand: '-',
        product: compMatch[3],
      });
    }
  }

  return cdsRegions;
}

const GENETIC_CODE: Record<string, string> = {
  'ATA': 'I', 'ATC': 'I', 'ATT': 'I', 'ATG': 'M',
  'ACA': 'T', 'ACC': 'T', 'ACG': 'T', 'ACT': 'T',
  'AAC': 'N', 'AAT': 'N', 'AAA': 'K', 'AAG': 'K',
  'AGC': 'S', 'AGT': 'S', 'AGA': 'R', 'AGG': 'R',
  'CTA': 'L', 'CTC': 'L', 'CTG': 'L', 'CTT': 'L',
  'CCA': 'P', 'CCC': 'P', 'CCG': 'P', 'CCT': 'P',
  'CAC': 'H', 'CAT': 'H', 'CAA': 'Q', 'CAG': 'Q',
  'CGA': 'R', 'CGC': 'R', 'CGG': 'R', 'CGT': 'R',
  'GTA': 'V', 'GTC': 'V', 'GTG': 'V', 'GTT': 'V',
  'GCA': 'A', 'GCC': 'A', 'GCG': 'A', 'GCT': 'A',
  'GAC': 'D', 'GAT': 'D', 'GAA': 'E', 'GAG': 'E',
  'GGA': 'G', 'GGC': 'G', 'GGG': 'G', 'GGT': 'G',
  'TCA': 'S', 'TCC': 'S', 'TCG': 'S', 'TCT': 'S',
  'TTC': 'F', 'TTT': 'F', 'TTA': 'L', 'TTG': 'L',
  'TAC': 'Y', 'TAT': 'Y', 'TAA': '*', 'TAG': '*',
  'TGC': 'C', 'TGT': 'C', 'TGA': '*', 'TGG': 'W',
};

function getAminoAcid(codon: string): string {
  return GENETIC_CODE[codon.toUpperCase()] || '?';
}

export function analyzeEnzymeSites(
  sites: EnzymeSite[],
  cdsRegions: CdsRegion[],
  genomeSequence: string
): SiteAnalysis[] {
  return sites.map(site => {
    const siteStart = site.position; // 1-based
    const siteEnd = siteStart + site.matchSequence.length - 1;
    
    const overlappingCds = cdsRegions.find(cds => 
      (siteStart >= cds.start && siteStart <= cds.end) ||
      (siteEnd >= cds.start && siteEnd <= cds.end) ||
      (siteStart <= cds.start && siteEnd >= cds.end)
    );

    const analysis: SiteAnalysis = {
      sitePosition: site.position,
      strand: site.strand,
      matchSequence: site.matchSequence,
      inCds: !!overlappingCds,
      contextCodons: []
    };

    if (overlappingCds) {
      analysis.cdsId = overlappingCds.id;
      analysis.cdsStrand = overlappingCds.strand;
      
      let frameStart = overlappingCds.start;
      let offset = (siteStart - frameStart) % 3;
      if (offset < 0) offset += 3;
      
      let firstCodonStart = siteStart - offset;
      
      const startCodonIndex = firstCodonStart - 6;
      const endCodonIndex = firstCodonStart + Math.ceil(site.matchSequence.length / 3) * 3 + 6;
      
      for (let pos = startCodonIndex; pos < endCodonIndex; pos += 3) {
        if (pos >= 1 && pos + 2 <= genomeSequence.length) {
          const codonSeq = genomeSequence.substring(pos - 1, pos + 2);
          const isSite = (pos + 2 >= siteStart && pos <= siteEnd);
          
          analysis.contextCodons.push({
            codon: codonSeq,
            aminoAcid: getAminoAcid(codonSeq),
            isSite,
            globalStart: pos
          });
        }
      }
    }

    return analysis;
  });
}

export function recommendSilentMutations(
  analysis: SiteAnalysis,
  codonUsage: Map<string, CodonUsage[]>
): string {
  if (!analysis.inCds || analysis.contextCodons.length === 0) {
    return 'Intergenic: Any mutation';
  }

  const siteCodons = analysis.contextCodons.filter(c => c.isSite);
  
  for (const codonCtx of siteCodons) {
    const aa = codonCtx.aminoAcid;
    const usage = codonUsage.get(aa);
    if (usage && usage.length > 1) {
      for (const altCodon of usage) {
        if (altCodon.codon !== codonCtx.codon) {
          return `${codonCtx.codon} -> ${altCodon.codon} (${aa})`;
        }
      }
    }
  }

  return 'No silent mutation found';
}

export function applyMutations(
  genomeSequence: string,
  mutations: { position: number; original: string; mutated: string }[]
): string {
  let mutatedSeq = genomeSequence;
  const sortedMutations = [...mutations].sort((a, b) => b.position - a.position);
  
  for (const mut of sortedMutations) {
    const pos = mut.position - 1;
    if (mutatedSeq.substring(pos, pos + mut.original.length) === mut.original) {
      mutatedSeq = mutatedSeq.substring(0, pos) + mut.mutated + mutatedSeq.substring(pos + mut.original.length);
    }
  }
  
  return mutatedSeq;
}
