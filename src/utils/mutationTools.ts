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
        analysis.intergenicLabel = `Between CDS ${beforeCds.id} and CDS ${afterCds.id}`;
      } else {
        analysis.intergenicLabel = 'Intergenic region';
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

  // Build the full sequence of the context window
  const origWindow = analysis.contextCodons.map(c => c.codon).join('');
  const siteCodons = analysis.contextCodons.filter(c => c.isSite);
  
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
          
          let broken = false;
          if (analysis.strand === '+') {
            if (!testWindow.toUpperCase().includes(analysis.matchSequence.toUpperCase())) {
              broken = true;
            }
          } else {
            // For reverse strand, we need to check if the reverse complement of testWindow contains the motif
            // Actually, matchSequence is ALWAYS the forward sequence the enzyme recognizes (e.g. GGTCTC). 
            // If the site was on the minus strand, the genome contains GAGACC (the reverse complement).
            // Our testWindow is built from the genome forward strand.
            // So if strand is '-', we just check if testWindow contains the reverse complement of the matchSequence.
            const rcMap: Record<string, string> = {A:'T', T:'A', C:'G', G:'C', a:'t', t:'a', c:'g', g:'c'};
            const rc = analysis.matchSequence.split('').reverse().map(b => rcMap[b] || b).join('');
            if (!testWindow.toUpperCase().includes(rc.toUpperCase())) {
              broken = true;
            }
          }

          if (broken) {
            // Find where the restriction site was in origWindow
            let siteIndexInWindow = -1;
            if (analysis.strand === '+') {
              siteIndexInWindow = origWindow.toUpperCase().indexOf(analysis.matchSequence.toUpperCase());
            } else {
              const rcMap: Record<string, string> = {A:'T', T:'A', C:'G', G:'C', a:'t', t:'a', c:'g', g:'c'};
              const rc = analysis.matchSequence.split('').reverse().map(b => rcMap[b] || b).join('');
              siteIndexInWindow = origWindow.toUpperCase().indexOf(rc.toUpperCase());
            }
            
            if (siteIndexInWindow !== -1) {
              const newSiteSequence = testWindow.substring(siteIndexInWindow, siteIndexInWindow + analysis.matchSequence.length);
              return newSiteSequence;
            }
            return altCodon.codon; // fallback
          }
        }
      }
    }
  }

  return ''; // No silent mutation found
}

export function applyMutations(
  genomeSequence: string,
  mutations: { position: number; original: string; mutated: string }[]
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
      } else {
        // If it was on the reverse strand, the actual genome sequence there is the reverse complement of matchSequence
        const rcMap: Record<string, string> = {A:'T', T:'A', C:'G', G:'C', a:'t', t:'a', c:'g', g:'c'};
        const rc = mut.original.split('').reverse().map(b => rcMap[b] || b).join('');
        if (originalAtPos.toUpperCase() === rc.toUpperCase()) {
          mutatedSeq = mutatedSeq.substring(0, pos) + mut.mutated + mutatedSeq.substring(pos + mut.original.length);
        }
      }
    } else {
      // Handles wrapping around the 0-index origin
      const overflow = (pos + mut.original.length) - mutatedSeq.length;
      originalAtPos = mutatedSeq.substring(pos) + mutatedSeq.substring(0, overflow);
      
      if (originalAtPos.toUpperCase() === mut.original.toUpperCase()) {
        mutatedSeq = mutatedSeq.substring(overflow, pos) + mut.mutated;
      } else {
        const rcMap: Record<string, string> = {A:'T', T:'A', C:'G', G:'C', a:'t', t:'a', c:'g', g:'c'};
        const rc = mut.original.split('').reverse().map(b => rcMap[b] || b).join('');
        if (originalAtPos.toUpperCase() === rc.toUpperCase()) {
          mutatedSeq = mutatedSeq.substring(overflow, pos) + mut.mutated;
        }
      }
    }
  }
  
  return mutatedSeq;
}
