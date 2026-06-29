import { describe, expect, test } from 'vitest';

import {
  analyzeSynthesis,
  findDispersedRepeats,
  findHomopolymers,
  findInvertedRepeats,
  findLocalGcExtremes,
  findTandemRepeats,
  gcFraction,
  parseSequenceInput,
} from '../utils/synthesisConstraints';

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };
const revComp = (seq: string) =>
  seq
    .split('')
    .reverse()
    .map((base) => COMPLEMENT[base])
    .join('');
const repeat = (unit: string, copies: number) => unit.repeat(copies);

// Deterministic non-repetitive sequence generator (LCG).
const mkSeq = (len: number, seed: number) => {
  let state = seed >>> 0;
  let out = '';
  for (let i = 0; i < len; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out += 'ACGT'[(state >>> 16) & 3];
  }
  return out;
};

describe('parseSequenceInput', () => {
  test('parses a FASTA record and uppercases the sequence', () => {
    const parsed = parseSequenceInput('>my gene\nacgt\nTTGG\n');
    expect(parsed.name).toBe('my gene');
    expect(parsed.sequence).toBe('ACGTTTGG');
    expect(parsed.length).toBe(8);
  });

  test('only reads the first FASTA record', () => {
    const parsed = parseSequenceInput('>one\nACGT\n>two\nGGGG');
    expect(parsed.sequence).toBe('ACGT');
  });

  test('strips whitespace and digits from a pasted sequence', () => {
    const parsed = parseSequenceInput('1 acgt\n61 ggtt');
    expect(parsed.sequence).toBe('ACGTGGTT');
    expect(parsed.name).toBe('Pasted sequence');
  });

  test('rejects empty input and unsupported characters', () => {
    expect(() => parseSequenceInput('   ')).toThrow();
    expect(() => parseSequenceInput('ACGTZX')).toThrow(/unsupported characters/);
  });
});

describe('gcFraction', () => {
  test('counts G and C over the full length', () => {
    expect(gcFraction('GGCC')).toBe(1);
    expect(gcFraction('ATAT')).toBe(0);
    expect(gcFraction('ACGT')).toBe(0.5);
  });
});

describe('findHomopolymers', () => {
  test('flags runs longer than 30 bp', () => {
    const seq = `CCCC${'A'.repeat(31)}CCCC`;
    const issues = findHomopolymers(seq);
    expect(issues).toHaveLength(1);
    expect(issues[0].length).toBe(31);
    expect(issues[0].start).toBe(4);
  });

  test('does not flag a run of exactly 30 bp', () => {
    expect(findHomopolymers('A'.repeat(30))).toHaveLength(0);
  });
});

describe('findTandemRepeats', () => {
  test('flags a 3 bp short tandem repeat over 100 bp', () => {
    const issues = findTandemRepeats(repeat('ATG', 40)); // 120 bp
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('shortTandemRepeat');
    expect(issues[0].length).toBe(120);
  });

  test('does not flag a short tandem repeat at or under 100 bp', () => {
    expect(findTandemRepeats(repeat('ATG', 33))).toHaveLength(0); // 99 bp
  });

  test('flags a long (>=10 bp unit) repeat over 200 bp', () => {
    const issues = findTandemRepeats(repeat('ACGTACGTACG', 20)); // 11 bp unit, 220 bp
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('longRepeat');
    expect(issues[0].length).toBe(220);
  });

  test('does not mistake a homopolymer for a tandem repeat', () => {
    expect(findTandemRepeats('A'.repeat(150))).toHaveLength(0);
  });

  test('does not flag a dinucleotide repeat as a short tandem repeat', () => {
    expect(findTandemRepeats(repeat('AT', 80))).toHaveLength(0); // fundamental period 2
  });
});

describe('findLocalGcExtremes', () => {
  test('flags a low-GC 50 bp window', () => {
    const issues = findLocalGcExtremes(repeat('AT', 60)); // GC 0%
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('localGc');
  });

  test('flags a high-GC 50 bp window', () => {
    const issues = findLocalGcExtremes(repeat('GC', 60)); // GC 100%
    expect(issues.length).toBeGreaterThan(0);
  });

  test('does not flag a balanced sequence', () => {
    expect(findLocalGcExtremes(repeat('ACGT', 30))).toHaveLength(0); // GC 50%
  });
});

describe('findInvertedRepeats', () => {
  test('flags a 20 bp perfect hairpin stem', () => {
    const arm = mkSeq(20, 4242);
    const hairpin = arm + 'TTTT' + revComp(arm);
    const issues = findInvertedRepeats(hairpin);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('invertedRepeat');
  });

  test('still flags a hairpin with a single stem mismatch', () => {
    const arm = mkSeq(20, 13);
    const rc = revComp(arm).split('');
    rc[10] = rc[10] === 'A' ? 'C' : 'A'; // one mismatch in the middle
    const hairpin = arm + 'TTTT' + rc.join('');
    expect(findInvertedRepeats(hairpin).length).toBeGreaterThan(0);
  });

  test('does not flag a short 12 bp stem', () => {
    const arm = mkSeq(12, 88);
    const hairpin = arm + 'TTTT' + revComp(arm);
    expect(findInvertedRepeats(hairpin)).toHaveLength(0);
  });
});

describe('findDispersedRepeats', () => {
  test('flags a dispersed repeat whose total content exceeds 200 bp', () => {
    const unit = mkSeq(30, 555);
    let seq = '';
    for (let i = 0; i < 8; i += 1) {
      seq += unit + mkSeq(10, 1000 + i); // distinct spacers between copies
    }
    const issues = findDispersedRepeats(seq);
    expect(issues.length).toBeGreaterThanOrEqual(8);
    expect(issues.every((issue) => issue.type === 'longRepeat')).toBe(true);
    expect(issues[0].reason).toMatch(/dispersed/);
  });

  test('does not flag a small dispersed repeat (≤200 bp total)', () => {
    const unit = mkSeq(20, 321);
    const seq = `${unit}${mkSeq(15, 9)}${unit}${mkSeq(15, 17)}${unit}`; // 3×20 = 60 bp
    expect(findDispersedRepeats(seq)).toHaveLength(0);
  });
});

describe('analyzeSynthesis', () => {
  test('passes a benign sequence', () => {
    // A random, GC-balanced 180-mer: no homopolymer, no repeats, no hairpin,
    // no out-of-range GC.
    const report = analyzeSynthesis(parseSequenceInput(mkSeq(180, 2026)));
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  test('flags average GC content out of range', () => {
    const report = analyzeSynthesis(parseSequenceInput(repeat('AT', 100)));
    expect(report.passed).toBe(false);
    expect(report.countsByType.averageGc).toBe(1);
  });

  test('reports issues sorted by start position', () => {
    const seq = `${'G'.repeat(35)}${repeat('ATC', 40)}`;
    const report = analyzeSynthesis(parseSequenceInput(seq));
    const starts = report.issues.map((issue) => issue.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});
