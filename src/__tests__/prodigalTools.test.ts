import { describe, expect, test } from 'vitest';

import {
  locateOrfs,
  parseProdigalCds,
  reverseComplement,
  translateCodon,
} from '../utils/prodigalTools';

// Deterministic, non-repetitive 60 bp "genome" via a simple LCG (so 12-mers are
// unique and can be used as location anchors).
const genome = (() => {
  let state = 123457;
  let out = '';
  for (let i = 0; i < 60; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out += 'ACGT'[(state >>> 16) & 3];
  }
  return out;
})();

// ORF A: + strand, genome 5..16 (1-based). ORF B: - strand, genome 30..41.
const orfA = genome.slice(4, 16);
const orfB = reverseComplement(genome.slice(29, 41));
const cdsFile = [
  '>g_1 # 5 # 16 # 1 # ID=1_1;partial=00;start_type=ATG;gc_cont=0.5',
  orfA,
  '>g_2 # 30 # 41 # -1 # ID=1_2;partial=10;start_type=GTG;gc_cont=0.4',
  orfB,
  '',
].join('\n');

describe('parseProdigalCds', () => {
  test('parses headers, coordinates, strand and metadata', () => {
    const orfs = parseProdigalCds(cdsFile);
    expect(orfs).toHaveLength(2);
    expect(orfs[0]).toMatchObject({
      id: 'g_1',
      genomeStart: 5,
      genomeEnd: 16,
      strand: '+',
      partial: '00',
      startType: 'ATG',
      sequence: orfA,
    });
    expect(orfs[1]).toMatchObject({ genomeStart: 30, genomeEnd: 41, strand: '-', partial: '10' });
  });

  test('throws on a file without Prodigal headers', () => {
    expect(() => parseProdigalCds('>plain\nACGTACGT')).toThrow(/No Prodigal CDS records/);
  });
});

describe('translateCodon', () => {
  test('translates codons, stops and unknowns', () => {
    expect(translateCodon('ATG')).toBe('M');
    expect(translateCodon('ggg')).toBe('G');
    expect(translateCodon('TAA')).toBe('*');
    expect(translateCodon('TANN')).toBe('X');
  });
});

describe('locateOrfs', () => {
  test('locates ORFs in the full genome (offset 0)', () => {
    const orfs = parseProdigalCds(cdsFile);
    const result = locateOrfs(genome, orfs);
    expect(result.located).toBe(true);
    expect(result.offset).toBe(0);
    const a = result.orfs.find((orf) => orf.id === 'g_1');
    expect(a?.pastedStart).toBe(4);
    expect(a?.pastedEnd).toBe(16);
    expect(a?.clipped).toBe(false);
  });

  test('locates ORFs in a sub-region and computes the offset', () => {
    const orfs = parseProdigalCds(cdsFile);
    const pasted = genome.slice(9, 50); // genome positions 10..50
    const result = locateOrfs(pasted, orfs);
    expect(result.located).toBe(true);
    expect(result.offset).toBe(9);

    const b = result.orfs.find((orf) => orf.id === 'g_2');
    expect(b?.pastedStart).toBe(20);
    expect(b?.pastedEnd).toBe(32);
    expect(b?.clipped).toBe(false);

    // ORF A starts before the pasted window → clipped on the left.
    const a = result.orfs.find((orf) => orf.id === 'g_1');
    expect(a?.pastedStart).toBe(-5);
    expect(a?.clipped).toBe(true);
  });

  test('reports not located when no ORF matches the pasted sequence', () => {
    const orfs = parseProdigalCds(cdsFile);
    const unrelated = 'A'.repeat(80);
    const result = locateOrfs(unrelated, orfs);
    expect(result.located).toBe(false);
    expect(result.offset).toBeNull();
    expect(result.orfs).toHaveLength(0);
  });
});
