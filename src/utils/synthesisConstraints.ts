// Synthesis feasibility analysis.
//
// Gene synthesis vendors cannot reliably produce sequences that contain certain
// structural features. This module flags the regions of a sequence that fall
// OUTSIDE the synthesizable range for each feature.
//
//   Short Tandem Repeat   3–9 bp repeat unit, tandem span must stay ≤ 100 bp
//   Long Repeat           ≥10 bp repeat unit, tandem span must stay ≤ 200 bp
//   Inverted Repeat       hairpin stem (arm) must stay ≤ 100 bp
//   Local GC Content      every 50 bp window must stay within 10–90% GC
//   Homopolymer           a run of the same base must stay ≤ 30 bp
//   Average GC Content    the whole sequence must stay within 25–75% GC

export type ConstraintType =
  | 'shortTandemRepeat'
  | 'longRepeat'
  | 'invertedRepeat'
  | 'localGc'
  | 'homopolymer'
  | 'averageGc';

export interface ConstraintMeta {
  type: ConstraintType;
  label: string;
  /** Highlight colour for this constraint. */
  color: string;
  /** Human readable description of the synthesizable range. */
  range: string;
  /**
   * Priority used when two flagged regions overlap on the same base. The base
   * is coloured using the highest-priority constraint covering it.
   */
  priority: number;
}

export const CONSTRAINTS: Record<ConstraintType, ConstraintMeta> = {
  invertedRepeat: {
    type: 'invertedRepeat',
    label: 'Inverted Repeat (Hairpin)',
    color: '#14b8a6',
    range: 'Stem < 16 bp',
    priority: 5,
  },
  longRepeat: {
    type: 'longRepeat',
    label: 'Long Repeat',
    color: '#8b5cf6',
    range: '≥10 bp unit, ≤ 200 bp (tandem or dispersed)',
    priority: 4,
  },
  shortTandemRepeat: {
    type: 'shortTandemRepeat',
    label: 'Short Tandem Repeat',
    color: '#2563eb',
    range: '3–9 bp unit, ≤ 100 bp total',
    priority: 3,
  },
  homopolymer: {
    type: 'homopolymer',
    label: 'Homopolymer',
    color: '#f59e0b',
    range: 'Same base ≤ 30 bp',
    priority: 2,
  },
  localGc: {
    type: 'localGc',
    label: 'Local GC Content',
    color: '#ef4444',
    range: '10–90% per 50 bp window',
    priority: 1,
  },
  averageGc: {
    type: 'averageGc',
    label: 'Average GC Content',
    color: '#0ea5e9',
    range: '25–75% overall',
    priority: 0,
  },
};

export const CONSTRAINT_ORDER: ConstraintType[] = [
  'shortTandemRepeat',
  'longRepeat',
  'invertedRepeat',
  'localGc',
  'homopolymer',
  'averageGc',
];

// Thresholds (inclusive limits of the synthesizable range).
const STR_UNIT_MIN = 3;
const STR_UNIT_MAX = 9;
const STR_MAX_SPAN = 100;
const LONG_UNIT_MAX = 100;
const LONG_MAX_SPAN = 200;
// Dispersed (non-adjacent) repeats: a substring (≥10 bp) that recurs elsewhere.
// A repeat family is flagged when its total repeated content exceeds 200 bp.
const DISPERSED_SEED = 12;
const DISPERSED_MIN_UNIT = 10;
const DISPERSED_MAX_TOTAL = 200;
const DISPERSED_MAX_OCC = 40;
// Inverted repeats (hairpins). The bar is intentionally low so realistic
// hairpins are surfaced: a paired stem of ≥16 bp (allowing a few mismatches and
// a short loop) is flagged.
const INVERTED_MIN_STEM = 16;
const INVERTED_MAX_LOOP = 30;
const INVERTED_MAX_MISMATCH = 3;
const LOCAL_GC_WINDOW = 50;
const LOCAL_GC_MIN = 0.1;
const LOCAL_GC_MAX = 0.9;
const HOMOPOLYMER_MAX = 30;
const AVG_GC_MIN = 0.25;
const AVG_GC_MAX = 0.75;

export interface SequenceIssue {
  type: ConstraintType;
  /** 0-based inclusive start index. */
  start: number;
  /** 0-based exclusive end index. */
  end: number;
  /** Length of the flagged region in bp. */
  length: number;
  /** Human readable explanation of why this region is not synthesizable. */
  reason: string;
}

export interface ParsedSequence {
  name: string;
  sequence: string;
  length: number;
}

export interface SynthesisReport extends ParsedSequence {
  /** Fraction (0–1) of G/C bases over the whole sequence. */
  gcContent: number;
  issues: SequenceIssue[];
  countsByType: Record<ConstraintType, number>;
  /** True when no constraint is violated. */
  passed: boolean;
}

const VALID_SEQUENCE = /^[ACGTRYSWKMBDHVN]+$/;
const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };

/**
 * Accepts either a FASTA record (one or more `>` headers) or a raw pasted
 * sequence. Whitespace, digits and other layout characters are stripped. Only
 * the first FASTA record is analysed.
 */
export function parseSequenceInput(input: string): ParsedSequence {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Paste a sequence or upload a FASTA file to analyse.');
  }

  let name = 'Pasted sequence';
  let body = trimmed;

  if (trimmed.startsWith('>')) {
    const lines = trimmed.split(/\r?\n/);
    name = lines[0].slice(1).trim() || 'Uploaded sequence';
    // Keep only the first record: stop at the next header line.
    const seqLines: string[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].startsWith('>')) break;
      seqLines.push(lines[i]);
    }
    body = seqLines.join('');
  }

  const sequence = body.replace(/[\s\d]+/g, '').toUpperCase();

  if (sequence.length === 0) {
    throw new Error('No sequence characters were found.');
  }
  if (!VALID_SEQUENCE.test(sequence)) {
    const invalid = Array.from(new Set(sequence.replace(/[ACGTRYSWKMBDHVN]/g, '').split('')));
    throw new Error(`The sequence contains unsupported characters: ${invalid.join(' ')}`);
  }

  return { name, sequence, length: sequence.length };
}

export function gcFraction(sequence: string): number {
  if (sequence.length === 0) return 0;
  let gc = 0;
  for (let i = 0; i < sequence.length; i += 1) {
    const base = sequence[i];
    if (base === 'G' || base === 'C' || base === 'S') gc += 1;
  }
  return gc / sequence.length;
}

/** True when [start, end) repeats with period `d` (i.e. has period d). */
function hasPeriod(sequence: string, start: number, end: number, d: number): boolean {
  for (let i = start; i + d < end; i += 1) {
    if (sequence[i] !== sequence[i + d]) return false;
  }
  return true;
}

/** True when `k` is the smallest period of the block [start, end). */
function isFundamentalPeriod(sequence: string, start: number, end: number, k: number): boolean {
  for (let d = 1; d < k; d += 1) {
    if (hasPeriod(sequence, start, end, d)) return false;
  }
  return true;
}

/**
 * Finds maximal tandem repeats and classifies them as Short Tandem Repeats
 * (3–9 bp unit, span > 100 bp) or Long Repeats (≥10 bp unit, span > 200 bp).
 * Only repeats whose *fundamental* period falls in range are reported, so a
 * homopolymer or dinucleotide run is not mistaken for a 3-bp repeat.
 */
export function findTandemRepeats(sequence: string): SequenceIssue[] {
  const n = sequence.length;
  const issues: SequenceIssue[] = [];

  for (let k = STR_UNIT_MIN; k <= LONG_UNIT_MAX; k += 1) {
    let i = 0;
    while (i < n - k) {
      // Extend the maximal period-k block starting at i.
      let j = i;
      while (j + k < n && sequence[j] === sequence[j + k]) j += 1;

      if (j > i) {
        const end = j + k; // exclusive
        const span = end - i;
        const isShort = k <= STR_UNIT_MAX;
        const maxSpan = isShort ? STR_MAX_SPAN : LONG_MAX_SPAN;

        if (span > maxSpan && isFundamentalPeriod(sequence, i, end, k)) {
          const copies = span / k;
          const type: ConstraintType = isShort ? 'shortTandemRepeat' : 'longRepeat';
          const unit = sequence.slice(i, i + k);
          issues.push({
            type,
            start: i,
            end,
            length: span,
            reason: `${k} bp repeat unit "${unit}" × ${copies.toFixed(1)} → ${span} bp tandem array (max ${maxSpan} bp)`,
          });
        }
        i = j + 1;
      } else {
        i += 1;
      }
    }
  }

  return issues;
}

/** Flags runs of a single identical base longer than 30 bp. */
export function findHomopolymers(sequence: string): SequenceIssue[] {
  const n = sequence.length;
  const issues: SequenceIssue[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && sequence[j] === sequence[i]) j += 1;
    const runLength = j - i;
    if (runLength > HOMOPOLYMER_MAX) {
      issues.push({
        type: 'homopolymer',
        start: i,
        end: j,
        length: runLength,
        reason: `poly-${sequence[i]} run of ${runLength} bp (max ${HOMOPOLYMER_MAX} bp)`,
      });
    }
    i = j;
  }
  return issues;
}

/**
 * Flags any 50 bp window whose GC content falls outside 10–90%. Overlapping
 * out-of-range windows are merged into a single region.
 */
export function findLocalGcExtremes(sequence: string): SequenceIssue[] {
  const n = sequence.length;
  if (n < LOCAL_GC_WINDOW) return [];

  const isGc = (base: string) => base === 'G' || base === 'C' || base === 'S';

  let gc = 0;
  for (let i = 0; i < LOCAL_GC_WINDOW; i += 1) {
    if (isGc(sequence[i])) gc += 1;
  }

  const flagged: { start: number; end: number; min: number; max: number }[] = [];
  const consider = (windowStart: number, gcCount: number) => {
    const fraction = gcCount / LOCAL_GC_WINDOW;
    if (fraction < LOCAL_GC_MIN || fraction > LOCAL_GC_MAX) {
      const start = windowStart;
      const end = windowStart + LOCAL_GC_WINDOW;
      const last = flagged[flagged.length - 1];
      if (last && start <= last.end) {
        last.end = Math.max(last.end, end);
        last.min = Math.min(last.min, fraction);
        last.max = Math.max(last.max, fraction);
      } else {
        flagged.push({ start, end, min: fraction, max: fraction });
      }
    }
  };

  consider(0, gc);
  for (let start = 1; start + LOCAL_GC_WINDOW <= n; start += 1) {
    if (isGc(sequence[start - 1])) gc -= 1;
    if (isGc(sequence[start + LOCAL_GC_WINDOW - 1])) gc += 1;
    consider(start, gc);
  }

  return flagged.map((region) => {
    const low = region.min < LOCAL_GC_MIN;
    const pct = (low ? region.min : region.max) * 100;
    return {
      type: 'localGc' as ConstraintType,
      start: region.start,
      end: region.end,
      length: region.end - region.start,
      reason: `50 bp window GC ${low ? 'as low as' : 'as high as'} ${pct.toFixed(0)}% (allowed 10–90%)`,
    };
  });
}

/**
 * Detects inverted repeats (hairpins). For each loop position the two arms are
 * extended outward while bases pair by Watson–Crick complementarity, tolerating
 * a few isolated mismatches (no more than one in a row). A hairpin is flagged
 * when its paired stem reaches 16 bp. Overlapping hairpins are merged.
 */
export function findInvertedRepeats(sequence: string): SequenceIssue[] {
  const n = sequence.length;
  const raw: { start: number; end: number; matches: number; loop: number }[] = [];

  const pairs = (left: string, right: string) => COMPLEMENT[left] === right;

  for (let p = 1; p < n; p += 1) {
    for (let loop = 0; loop <= INVERTED_MAX_LOOP; loop += 1) {
      // Left arm ends just before p; right arm starts at p + loop.
      const rightStart = p + loop;
      if (rightStart >= n) break;

      let matches = 0;
      let mismatches = 0;
      let consecutive = 0;
      let lastMatch = -1;
      let t = 0;
      while (p - 1 - t >= 0 && rightStart + t < n) {
        if (pairs(sequence[p - 1 - t], sequence[rightStart + t])) {
          matches += 1;
          consecutive = 0;
          lastMatch = t;
        } else {
          mismatches += 1;
          consecutive += 1;
          if (consecutive > 1 || mismatches > INVERTED_MAX_MISMATCH) break;
        }
        t += 1;
      }

      if (matches >= INVERTED_MIN_STEM && lastMatch >= 0) {
        const arm = lastMatch + 1;
        raw.push({ start: p - arm, end: rightStart + arm, matches, loop });
      }
    }
  }

  if (raw.length === 0) return [];

  // Merge overlapping hairpin regions, keeping the strongest stem seen.
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: typeof raw = [];
  for (const region of raw) {
    const last = merged[merged.length - 1];
    if (last && region.start <= last.end) {
      last.end = Math.max(last.end, region.end);
      if (region.matches > last.matches) {
        last.matches = region.matches;
        last.loop = region.loop;
      }
    } else {
      merged.push({ ...region });
    }
  }

  return merged.map((region) => ({
    type: 'invertedRepeat' as ConstraintType,
    start: region.start,
    end: region.end,
    length: region.end - region.start,
    reason: `inverted repeat (hairpin): ${region.matches} bp paired stem, ${region.loop} bp loop`,
  }));
}

/** A k-mer seed is "low complexity" when it is a homopolymer/dinucleotide or a
 *  short tandem unit — those regions are covered by the other detectors. */
function lowComplexitySeed(seed: string): boolean {
  if (new Set(seed).size <= 2) return true;
  return (
    hasPeriod(seed, 0, seed.length, 1) ||
    hasPeriod(seed, 0, seed.length, 2) ||
    hasPeriod(seed, 0, seed.length, 3)
  );
}

/**
 * Detects dispersed (non-adjacent) direct repeats: a substring of ≥10 bp that
 * occurs at two or more separate locations. A repeat family is flagged when its
 * total repeated content (unit length × number of copies) exceeds 200 bp. Each
 * copy is reported so it is highlighted everywhere it appears.
 */
export function findDispersedRepeats(sequence: string): SequenceIssue[] {
  const n = sequence.length;
  const k = DISPERSED_SEED;
  if (n < 2 * k) return [];

  // Index every forward k-mer position.
  const index = new Map<string, number[]>();
  for (let i = 0; i + k <= n; i += 1) {
    const key = sequence.slice(i, i + k);
    const list = index.get(key);
    if (list) list.push(i);
    else index.set(key, [i]);
  }

  // Group maximal repeat occurrences by their (exact) repeated sequence.
  const families = new Map<string, Map<number, number>>(); // unitSeq -> (start -> end)

  for (const [seed, positions] of index) {
    if (positions.length < 2 || positions.length > DISPERSED_MAX_OCC) continue;
    if (lowComplexitySeed(seed)) continue;

    for (let x = 0; x < positions.length; x += 1) {
      for (let y = x + 1; y < positions.length; y += 1) {
        const p = positions[x];
        const q = positions[y];
        if (q - p < k) continue; // overlapping seeds (tandem-like)

        // Extend right (keep the two copies from overlapping).
        let r = k;
        while (q + r < n && sequence[p + r] === sequence[q + r] && p + r < q) r += 1;
        // Extend left.
        let l = 0;
        while (p - l - 1 >= 0 && sequence[p - l - 1] === sequence[q - l - 1] && q - l - 1 >= p + r) {
          l += 1;
        }

        const start1 = p - l;
        const end1 = p + r;
        const start2 = q - l;
        const end2 = q + r;
        const unit = end1 - start1;
        if (unit < DISPERSED_MIN_UNIT) continue;
        if (start2 < end1) continue; // copies must be separate

        const unitSeq = sequence.slice(start1, end1);
        let family = families.get(unitSeq);
        if (!family) {
          family = new Map();
          families.set(unitSeq, family);
        }
        family.set(start1, end1);
        family.set(start2, end2);
      }
    }
  }

  const issues: SequenceIssue[] = [];
  for (const [unitSeq, intervals] of families) {
    const occurrences = intervals.size;
    const unit = unitSeq.length;
    const total = unit * occurrences;
    if (total <= DISPERSED_MAX_TOTAL) continue;
    for (const [start, end] of intervals) {
      issues.push({
        type: 'longRepeat',
        start,
        end,
        length: end - start,
        reason: `dispersed repeat: ${unit} bp unit × ${occurrences} copies (≈${total} bp total, max 200 bp)`,
      });
    }
  }

  return issues;
}

/** Checks the overall GC content of the whole sequence (25–75%). */
export function findAverageGcIssue(sequence: string, gc: number): SequenceIssue | null {
  if (sequence.length === 0) return null;
  if (gc >= AVG_GC_MIN && gc <= AVG_GC_MAX) return null;
  return {
    type: 'averageGc',
    start: 0,
    end: sequence.length,
    length: sequence.length,
    reason: `overall GC ${(gc * 100).toFixed(1)}% (allowed 25–75%)`,
  };
}

/** Runs every constraint and returns a full report. */
export function analyzeSynthesis(parsed: ParsedSequence): SynthesisReport {
  const { sequence } = parsed;
  const gc = gcFraction(sequence);

  const issues: SequenceIssue[] = [
    ...findTandemRepeats(sequence),
    ...findDispersedRepeats(sequence),
    ...findInvertedRepeats(sequence),
    ...findLocalGcExtremes(sequence),
    ...findHomopolymers(sequence),
  ];

  const avgGc = findAverageGcIssue(sequence, gc);
  if (avgGc) issues.push(avgGc);

  // Drop exact duplicate regions (e.g. a tandem array also seen as dispersed).
  const seen = new Set<string>();
  const deduped = issues.filter((issue) => {
    const key = `${issue.type}:${issue.start}:${issue.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => a.start - b.start || a.end - b.end);
  issues.length = 0;
  issues.push(...deduped);

  const countsByType = {
    shortTandemRepeat: 0,
    longRepeat: 0,
    invertedRepeat: 0,
    localGc: 0,
    homopolymer: 0,
    averageGc: 0,
  } as Record<ConstraintType, number>;
  for (const issue of issues) countsByType[issue.type] += 1;

  return {
    ...parsed,
    gcContent: gc,
    issues,
    countsByType,
    passed: issues.length === 0,
  };
}
