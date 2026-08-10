import { CdsRegion } from './mutationTools';

export interface Promoter {
  name: string;
  position: number;
  end: number;
  direction?: 'forward' | 'reverse';
  originalStart?: number;
  originalEnd?: number;
}

export interface SearchWindow {
  start: number;
  end: number;
  reason: 'promoter' | 'intergenic' | 'unannotated' | 'max_length' | 'silent_mutation';
}

/** Strip surrounding separators/whitespace from an extracted promoter name. */
function cleanPromoterName(raw: string): string {
  return raw.replace(/^[\s:=\-–—]+/, '').replace(/[\s:=\-–—]+$/, '').trim();
}

/** Push a promoter, normalising start/end so `position <= end` and tagging direction. */
function pushPromoter(promoters: Promoter[], name: string, start: number, end: number) {
  if (start > end) {
    promoters.push({ name, position: end, end: start, direction: 'reverse', originalStart: start, originalEnd: end });
  } else {
    promoters.push({ name, position: start, end, direction: 'forward', originalStart: start, originalEnd: end });
  }
}

export function parsePromoters(content: string): Promoter[] {
  const promoters: Promoter[] = [];
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  for (const line of lines) {
    // 1) Structured columns: name, start, end separated by commas or tabs.
    const cols = line.split(/,|\t/).map(c => c.trim());
    if (cols.length >= 3) {
      const name = cols[0];
      const start = parseInt(cols[1], 10);
      const end = parseInt(cols[2], 10);
      if (!isNaN(start) && !isNaN(end)) {
        pushPromoter(promoters, name || `Promoter ${promoters.length + 1}`, start, end);
        continue;
      }
    }

    // 2) Free-text line with a "start-end" range, e.g. "T7 promoter: 154-173"
    //    (accepts -, .., –, —, or "to" as the separator). Take the last range on
    //    the line so digits inside the name aren't mistaken for coordinates.
    const rangeRegex = /(\d+)\s*(?:\.\.|-|–|—|to)\s*(\d+)/gi;
    let rangeMatch: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = rangeRegex.exec(line)) !== null) rangeMatch = m;
    if (rangeMatch) {
      const name = cleanPromoterName(line.slice(0, rangeMatch.index)) || `Promoter ${promoters.length + 1}`;
      pushPromoter(promoters, name, parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10));
      continue;
    }

    // 3) Single position, with optional name: "Promoter Pos: 154", "T7 promoter: 154", or a bare "154".
    const posLabel = line.match(/Promoter Pos:\s*(\d+)/i);
    if (posLabel) {
      const pos = parseInt(posLabel[1], 10);
      promoters.push({ name: `Promoter ${promoters.length + 1}`, position: pos, end: pos, direction: 'forward', originalStart: pos, originalEnd: pos });
      continue;
    }
    const single = line.match(/^(.*?)[:=\s-]*\b(\d+)\s*$/);
    if (single) {
      const pos = parseInt(single[2], 10);
      const name = cleanPromoterName(single[1]) || `Promoter ${promoters.length + 1}`;
      promoters.push({ name, position: pos, end: pos, direction: 'forward', originalStart: pos, originalEnd: pos });
    }
  }
  return promoters;
}

function isWindowValidForPromoter(wStart: number, pStart: number, pEnd: number, windowSize: number, sequenceLength: number, isLinear: boolean): boolean {
  const wEnd = wStart + windowSize - 1;
  const pLen = pEnd - pStart + 1;
  
  if (pLen > windowSize) {
    if (wStart >= pStart && wEnd <= pEnd) return true;
    return false;
  } else {
    if (pStart >= wStart && pEnd <= wEnd) return true;
    
    if (!isLinear && wEnd > sequenceLength) {
      const wEndWrapped = wEnd - sequenceLength;
      if (pStart >= wStart && pEnd <= sequenceLength) return true;
      if (pStart >= 1 && pEnd <= wEndWrapped) return true;
    }
    return false;
  }
}

export function calculateSearchWindows(
  sequenceLength: number,
  maxFragmentLength: number,
  cdsRegions: CdsRegion[],
  promoters: Promoter[],
  options: { promoterFirst: boolean; orfConservation: boolean; cutAtSilentMutations?: boolean; mutationSites?: number[], isLinear?: boolean, maxFragmentCount?: number }
): SearchWindow[] {
  const windows: SearchWindow[] = [];
  const WINDOW_SIZE = 30;
  
  const sortedPromoters = [...promoters].sort((a, b) => a.position - b.position);
  const mutations = options.mutationSites ? [...options.mutationSites].sort((a, b) => a - b) : [];
  
  let firstCut = 1;
  let firstReason: SearchWindow['reason'] = 'max_length';
  
  if (!options.isLinear && options.cutAtSilentMutations && mutations.length > 0) {
    firstCut = Math.max(1, mutations[0] - 15);
    firstReason = 'silent_mutation';
  } else {
    // find first cut in [1, maxFragmentLength]
    for (let pos = maxFragmentLength; pos >= 1; pos--) {
      if (options.cutAtSilentMutations) {
        if (mutations.some(m => {
          // Place the mutation near the middle of the 30bp window
          if (pos >= m - 20 && pos <= m - 10) return true;
          if (options.isLinear) return false;
          // Wrap around cases
          if (m - 20 <= 0 && pos >= sequenceLength + (m - 20) && pos <= sequenceLength + (m - 10)) return true;
          if (pos + 10 > sequenceLength && (m >= (pos + 10) % sequenceLength && m <= (pos + 20) % sequenceLength)) return true;
          return false;
        })) {
          firstCut = pos;
          firstReason = 'silent_mutation';
          break;
        }
      }
    }

    if (firstCut === 1 && options.promoterFirst) {
      for (let pos = maxFragmentLength; pos >= 1; pos--) {
        if (sortedPromoters.some(p => isWindowValidForPromoter(pos, p.position, p.end, WINDOW_SIZE, sequenceLength, options.isLinear || false))) {
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
          firstReason = cdsRegions.length === 0 ? 'unannotated' : 'intergenic';
          break;
        }
      }
    }
  }
  
  windows.push({ start: firstCut, end: (firstCut + WINDOW_SIZE - 1 > sequenceLength && !options.isLinear) ? (firstCut + WINDOW_SIZE - 2) % sequenceLength + 1 : Math.min(sequenceLength, firstCut + WINDOW_SIZE - 1), reason: firstReason });
  let currentCut = firstCut;
  
  let loopCount = 0;
  while (true) {
    if (loopCount++ > 10000) break; // safety
    
    const remaining = options.isLinear ? sequenceLength - currentCut + 1 : sequenceLength - currentCut + firstCut;
    if (remaining <= maxFragmentLength) {
      break; 
    }

    const currentWindowCount = windows.length;
    const allowedRemainingWindows = options.maxFragmentCount ? options.maxFragmentCount - currentWindowCount : Infinity;
    
    let nextCut = currentCut + maxFragmentLength;
    let found = false;
    let reason: SearchWindow['reason'] = 'max_length';
    
    // Condition: Fragment >= 800bp means new cut must be >= currentCut + 800
    // Also, we must guarantee we can cover the remaining sequence with the allowed remaining windows.
    // Minimum fragment size to reach the end in `allowedRemainingWindows` steps:
    // nextCut >= currentCut + minRequiredStep
    const minRequiredStep = allowedRemainingWindows > 0 ? Math.ceil(remaining / allowedRemainingWindows) : 800;
    
    // We enforce 800bp minimum safety limit. If minRequiredStep > maxFragmentLength, it means it's mathematically impossible
    // to reach the end in allowedRemainingWindows with this maxFragmentLength. The component should prevent this state.
    const minCut = Math.max(currentCut + 800, currentCut + minRequiredStep);

    if (options.cutAtSilentMutations) {
      for (let pos = nextCut; pos >= minCut; pos--) {
        const actualPos = pos > sequenceLength && !options.isLinear ? pos - sequenceLength : pos;
        if (options.isLinear && pos > sequenceLength) continue;
        
        if (mutations.some(m => {
          // Center the window around the mutation with some flexibility (10-20 bp into the window)
          if (actualPos >= m - 20 && actualPos <= m - 10) return true;
          if (options.isLinear) return false;
          
          // Wrap-around cases
          if (m - 20 <= 0 && actualPos >= sequenceLength + (m - 20) && actualPos <= sequenceLength + (m - 10)) return true;
          if (actualPos + 10 > sequenceLength && (m >= (actualPos + 10) % sequenceLength && m <= (actualPos + 20) % sequenceLength)) return true;
          return false;
        })) {
          nextCut = pos;
          reason = 'silent_mutation';
          found = true;
          break;
        }
      }
    }
    
    if (!found && options.promoterFirst) {
      for (let pos = nextCut; pos >= minCut; pos--) {
        const actualPos = pos > sequenceLength && !options.isLinear ? pos - sequenceLength : pos;
        if (options.isLinear && pos > sequenceLength) continue;
        
        if (sortedPromoters.some(p => isWindowValidForPromoter(actualPos, p.position, p.end, WINDOW_SIZE, sequenceLength, options.isLinear || false))) {
          nextCut = pos;
          reason = 'promoter';
          found = true;
          break;
        }
      }
    }
    
    if (!found && options.orfConservation) {
      for (let pos = nextCut; pos >= minCut; pos--) {
        const actualPos = pos > sequenceLength && !options.isLinear ? pos - sequenceLength : pos;
        if (options.isLinear && pos > sequenceLength) continue;
        
        if (!cdsRegions.some(cds => actualPos >= cds.start && actualPos <= cds.end)) {
          nextCut = pos;
          reason = cdsRegions.length === 0 ? 'unannotated' : 'intergenic';
          found = true;
          break;
        }
      }
    }
    
    // If not found yet, and we HAVE to make a cut to satisfy maxFragmentCount constraint
    // (i.e. nextCut was forced back to minCut, and minCut > currentCut + 800)
    // we may need to override ORF conservation to ensure mathematically possible division
    if (!found && minRequiredStep > 800) {
      nextCut = minCut;
      reason = 'max_length';
      found = true;
    }
    
    const actualCutStart = nextCut > sequenceLength && !options.isLinear ? nextCut - sequenceLength : nextCut;
    windows.push({
      start: actualCutStart,
      end: (actualCutStart + WINDOW_SIZE - 1 > sequenceLength && !options.isLinear) ? (actualCutStart + WINDOW_SIZE - 2) % sequenceLength + 1 : Math.min(sequenceLength, actualCutStart + WINDOW_SIZE - 1),
      reason
    });
    
    currentCut = nextCut;
  }
  
  return windows;
}
