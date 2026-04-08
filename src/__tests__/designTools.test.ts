import { describe, expect, test } from 'vitest';

import { ENZYMES, findCircularEnzymeSites, parseSingleCircularFasta } from '../utils/designTools';

describe('design tools', () => {
  test('parses a single FASTA record into a circular genome sequence', () => {
    const parsed = parseSingleCircularFasta('>ExampleGenome\nacgtacgt\nGGTT\n');

    expect(parsed.name).toBe('ExampleGenome');
    expect(parsed.sequence).toBe('ACGTACGTGGTT');
    expect(parsed.length).toBe(12);
  });

  test('rejects FASTA files that contain more than one record', () => {
    expect(() => parseSingleCircularFasta('>first\nACGT\n>second\nTGCA\n')).toThrow(
      'Please upload a FASTA file with exactly one sequence record.',
    );
  });

  test('finds enzyme sites on both strands and across the circular boundary', () => {
    const bsaI = ENZYMES.find((enzyme) => enzyme.id === 'bsai-hfv2');
    expect(bsaI).toBeDefined();

    const sites = findCircularEnzymeSites('TCTCTTTGGTCTCAAAGAGACCAAGG', bsaI!);

    expect(sites).toEqual([
      { position: 8, strand: '+', matchSequence: 'GGTCTC' },
      { position: 17, strand: '-', matchSequence: 'GAGACC' },
      { position: 25, strand: '+', matchSequence: 'GGTCTC' },
    ]);
  });
});
