import { describe, expect, test } from 'vitest';

import {
  analyzeSynthesis,
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
  const arm = repeat('ACGT', 26).slice(0, 101); // 101 bp arm

  test('flags a hairpin stem longer than 100 bp', () => {
    const hairpin = arm + 'AAAA' + revComp(arm);
    const issues = findInvertedRepeats(hairpin);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('invertedRepeat');
  });

  test('does not flag a stem of 100 bp', () => {
    const shortArm = arm.slice(0, 100);
    const hairpin = shortArm + 'AAAA' + revComp(shortArm);
    expect(findInvertedRepeats(hairpin)).toHaveLength(0);
  });
});

describe('analyzeSynthesis', () => {
  test('passes a benign sequence', () => {
    // A non-repetitive, GC-balanced 180-mer: no homopolymer, no short period,
    // no out-of-range GC window.
    const benign = Array.from(
      { length: 180 },
      (_, i) => 'ACGT'[(i * 3 + Math.floor(i / 4) + (i % 7)) % 4],
    ).join('');
    const report = analyzeSynthesis(parseSequenceInput(benign));
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
