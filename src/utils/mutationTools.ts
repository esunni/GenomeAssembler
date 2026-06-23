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
  intergenicLabel?: string;
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
        id: 0,
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
        id: 0,
        start: parseInt(compMatch[1], 10),
        end: parseInt(compMatch[2], 10),
        strand: '-',
        product: compMatch[3],
      });
    }
  }

  // Sort by start position
  cdsRegions.sort((a, b) => a.start - b.start);

  // Reassign IDs to be sequential
  cdsRegions.forEach((cds, index) => {
    cds.id = index + 1;
  });

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

const COMPLEMENT_MAP: Record<string, string> = {
  A: 'T', T: 'A', C: 'G', G: 'C',
  R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
  B: 'V', V: 'B', D: 'H', H: 'D', N: 'N',
};

export function reverseComplement(sequence: string): string {
  return sequence
    .toUpperCase()
    .split('')
    .reverse()
    .map((base) => COMPLEMENT_MAP[base] ?? 'N')
    .join('');
}

export function analyzeEnzymeSites(
  sites: EnzymeSite[],
  cdsRegions: CdsRegion[],
  genomeSequence: string,
  isLinear?: boolean
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

      if (overlappingCds.strand === '-') {
        // - strand CDS: frame anchored at CDS.end; codons read 5'→3' on the reverse strand,
        // i.e., walk from higher forward positions down by 3 and reverse-complement each triplet.
        const cdsEnd = overlappingCds.end;
        const upOffset = (((cdsEnd - siteEnd) % 3) + 3) % 3;
        const firstCodonLastForward = siteEnd + upOffset; // codon containing siteEnd
        const numCodons = Math.ceil(site.matchSequence.length / 3) + 4;
        let lastForward = firstCodonLastForward + 6; // 2 codons of upstream (gene direction)

        for (let i = 0; i < numCodons; i += 1) {
          const codonStart = lastForward - 2;
          if (codonStart >= 1 && lastForward <= genomeSequence.length) {
            const forwardTriplet = genomeSequence.substring(codonStart - 1, lastForward);
            const codonSeq = reverseComplement(forwardTriplet);
            const isSite = (lastForward >= siteStart && codonStart <= siteEnd);

            analysis.contextCodons.push({
              codon: codonSeq,
              aminoAcid: getAminoAcid(codonSeq),
              isSite,
              globalStart: codonStart,
            });
          }
          lastForward -= 3;
        }
      } else {
        // + strand CDS
        const frameStart = overlappingCds.start;
        let offset = (siteStart - frameStart) % 3;
        if (offset < 0) offset += 3;

        const firstCodonStart = siteStart - offset;
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
              globalStart: pos,
            });
          }
        }
      }
    } else {
      let beforeCds: CdsRegion | undefined;
      let afterCds: CdsRegion | undefined;
      
      for (const cds of cdsRegions) {
        if (cds.end < siteStart) {
          if (!beforeCds || cds.end > beforeCds.end) beforeCds = cds;
        }
        if (cds.start > siteEnd) {
          if (!afterCds || cds.start < afterCds.start) afterCds = cds;
        }
      }
      
      if (!beforeCds && cdsRegions.length > 0) {
        beforeCds = cdsRegions.reduce((prev, curr) => curr.end > prev.end ? curr : prev);
      }
      if (!afterCds && cdsRegions.length > 0) {
        afterCds = cdsRegions.reduce((prev, curr) => curr.start < prev.start ? curr : prev);
      }

      if (beforeCds && afterCds) {
        analysis.intergenicLabel = `CDS ${beforeCds.id} - CDS ${afterCds.id}`;
      } else {
        analysis.intergenicLabel = '';
      }

      // Add context characters for intergenic (no translation)
      const startPos = Math.max(1, siteStart - 5);
      const endPos = Math.min(genomeSequence.length, siteEnd + 5);
      const rawSeq = genomeSequence.substring(startPos - 1, endPos);
      
      // Just put the raw string as one "codon" to be displayed
      analysis.contextCodons.push({
        codon: rawSeq,
        aminoAcid: '',
        isSite: true, // We'll highlight precisely using substring math in the UI
        globalStart: startPos
      });
    }

    return analysis;
  });
}

function getHammingDistance(s1: string, s2: string): number {
  let dist = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) dist++;
  }
  return dist;
}

export function recommendSilentMutations(
  analysis: SiteAnalysis,
  codonUsage: Map<string, CodonUsage[]>
): string {
  if (!analysis.inCds || analysis.contextCodons.length === 0) {
    return ''; // Intergenic: no automatic suggestion
  }

  // Build the full sequence of the context window (in gene direction; for - strand CDS this is the reverse complement of the forward strand window).
  const origWindow = analysis.contextCodons.map(c => c.codon).join('');
  const isReverseStrand = analysis.cdsStrand === '-';
  const targetInWindow = isReverseStrand
    ? reverseComplement(analysis.matchSequence)
    : analysis.matchSequence;

  for (let i = 0; i < analysis.contextCodons.length; i++) {
    const codonCtx = analysis.contextCodons[i];
    if (!codonCtx.isSite) continue;

    const aa = codonCtx.aminoAcid;
    const usage = codonUsage.get(aa);
    if (usage && usage.length > 1) {
      // Sort alternatives by fewest nucleotide changes first, then highest frequency
      const alternatives = [...usage].sort((a, b) => {
        const distA = getHammingDistance(codonCtx.codon, a.codon);
        const distB = getHammingDistance(codonCtx.codon, b.codon);
        if (distA !== distB) return distA - distB;
        return b.frequency - a.frequency;
      });

      for (const altCodon of alternatives) {
        if (altCodon.codon !== codonCtx.codon) {
          // Test if it breaks the restriction site
          const testWindowCodons = [...analysis.contextCodons];
          testWindowCodons[i] = { ...codonCtx, codon: altCodon.codon };
          const testWindow = testWindowCodons.map(c => c.codon).join('');

          if (!testWindow.toUpperCase().includes(targetInWindow.toUpperCase())) {
            // Find where the restriction site was in origWindow
            const siteIndexInWindow = origWindow.toUpperCase().indexOf(targetInWindow.toUpperCase());

            if (siteIndexInWindow !== -1) {
              const newSiteSequence = testWindow.substring(siteIndexInWindow, siteIndexInWindow + targetInWindow.length);
              // For - strand CDS, convert gene-direction replacement back to forward strand for download.
              return isReverseStrand ? reverseComplement(newSiteSequence) : newSiteSequence;
            }
            return isReverseStrand ? reverseComplement(altCodon.codon) : altCodon.codon; // fallback
          }
        }
      }
    }
  }

  return ''; // No silent mutation found
}

export function applyMutations(
  genomeSequence: string,
  mutations: { position: number; original: string; mutated: string }[],
  isLinear?: boolean
): string {
  let mutatedSeq = genomeSequence;
  const sortedMutations = [...mutations].sort((a, b) => b.position - a.position);
  
  for (const mut of sortedMutations) {
    const pos = mut.position - 1; // Convert 1-based to 0-based index
    // Note: since the genome is circular, the site could theoretically wrap around the end.
    // For simplicity, we handle non-wrapping patches or simple wraps:
    let originalAtPos = '';
    if (pos + mut.original.length <= mutatedSeq.length) {
      originalAtPos = mutatedSeq.substring(pos, pos + mut.original.length);
      
      // We do a case-insensitive check because matchSequence might be upper and genome lower (or vice-versa)
      if (originalAtPos.toUpperCase() === mut.original.toUpperCase()) {
        mutatedSeq = mutatedSeq.substring(0, pos) + mut.mutated + mutatedSeq.substring(pos + mut.original.length);
      }
    } else {
      if (isLinear) continue; // Out of bounds on linear
      // Handles wrapping around the 0-index origin
      const overflow = (pos + mut.original.length) - mutatedSeq.length;
      originalAtPos = mutatedSeq.substring(pos) + mutatedSeq.substring(0, overflow);
      
      if (originalAtPos.toUpperCase() === mut.original.toUpperCase()) {
        mutatedSeq = mutatedSeq.substring(overflow, pos) + mut.mutated;
      }
    }
  }
  
  return mutatedSeq;
}
