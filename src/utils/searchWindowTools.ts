import { CdsRegion } from './mutationTools';

export interface Promoter {
  position: number;
}

export interface SearchWindow {
  start: number;
  end: number;
  reason: 'promoter' | 'intergenic' | 'max_length' | 'silent_mutation';
}

export function parsePromoters(content: string): Promoter[] {
  const promoters: Promoter[] = [];
  const lines = content.split(/\r?\n/).map(line => line.trim());
  for (const line of lines) {
    const match = line.match(/Promoter Pos:\s*(\d+)/i) || line.match(/^(\d+)$/);
    if (match) {
      promoters.push({ position: parseInt(match[1], 10) });
    }
  }
  return promoters;
}

export function calculateSearchWindows(
  sequenceLength: number,
  maxFragmentLength: number,
  cdsRegions: CdsRegion[],
  promoters: Promoter[],
  options: { promoterFirst: boolean; orfConservation: boolean; cutAtSilentMutations?: boolean; mutationSites?: number[] }
): SearchWindow[] {
  const windows: SearchWindow[] = [];
  const WINDOW_SIZE = 30;
  
  const sortedPromoters = [...promoters].sort((a, b) => a.position - b.position);
  const mutations = options.mutationSites ? [...options.mutationSites].sort((a, b) => a - b) : [];
  
  let firstCut = 1;
  let firstReason: SearchWindow['reason'] = 'max_length';
  
  // find first cut in [1, maxFragmentLength]
  for (let pos = maxFragmentLength; pos >= 1; pos--) {
    if (options.cutAtSilentMutations) {
      if (mutations.some(m => pos >= m - 20 && pos <= m - 5)) {
        firstCut = pos;
        firstReason = 'silent_mutation';
        break;
      }
    }
  }

  if (firstCut === 1 && options.promoterFirst) {
    for (let pos = maxFragmentLength; pos >= 1; pos--) {
      if (sortedPromoters.some(p => Math.abs(p.position - pos) <= 50)) {
        firstCut = pos;
        firstReason = 'promoter';
        break;
      }
    }
  }
  if (firstCut === 1 && options.orfConservation) {
    for (let pos = maxFragmentLength; pos >= 1; pos--) {
      if (!cdsRegions.some(cds => pos >= cds.start && pos <= cds.end)) {
        firstCut = pos;
        firstReason = 'intergenic';
        break;
      }
    }
  }
  
  windows.push({ start: firstCut, end: (firstCut + WINDOW_SIZE - 2) % sequenceLength + 1, reason: firstReason });
  let currentCut = firstCut;
  
  let loopCount = 0;
  while (true) {
    if (loopCount++ > 10000) break; // safety
    
    const remaining = sequenceLength - currentCut + firstCut;
    if (remaining <= maxFragmentLength) {
      break; 
    }
    
    let nextCut = currentCut + maxFragmentLength;
    let found = false;
    let reason: SearchWindow['reason'] = 'max_length';
    
    // Condition: Fragment >= 800bp means new cut must be >= currentCut + 800
    // We search backwards from nextCut to currentCut + 800
    const minCut = currentCut + 800;

    if (options.cutAtSilentMutations) {
      for (let pos = nextCut; pos >= minCut; pos--) {
        const actualPos = pos > sequenceLength ? pos - sequenceLength : pos;
        if (mutations.some(m => actualPos >= m - 20 && actualPos <= m - 5)) {
          nextCut = pos;
          reason = 'silent_mutation';
          found = true;
          break;
        }
      }
    }
    
    if (!found && options.promoterFirst) {
      for (let pos = nextCut; pos >= minCut; pos--) {
        const actualPos = pos > sequenceLength ? pos - sequenceLength : pos;
        if (sortedPromoters.some(p => Math.abs(p.position - actualPos) <= 50)) {
          nextCut = pos;
          reason = 'promoter';
          found = true;
          break;
        }
      }
    }
    
    if (!found && options.orfConservation) {
      for (let pos = nextCut; pos >= minCut; pos--) {
        const actualPos = pos > sequenceLength ? pos - sequenceLength : pos;
        if (!cdsRegions.some(cds => actualPos >= cds.start && actualPos <= cds.end)) {
          nextCut = pos;
          reason = 'intergenic';
          found = true;
          break;
        }
      }
    }
    
    const actualCutStart = nextCut > sequenceLength ? nextCut - sequenceLength : nextCut;
    windows.push({
      start: actualCutStart,
      end: (actualCutStart + WINDOW_SIZE - 2) % sequenceLength + 1,
      reason
    });
    
    currentCut = nextCut;
  }
  
  return windows;
}
