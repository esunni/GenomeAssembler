import { describe, expect, test } from 'vitest';

import {
  detectAnnotationFormat,
  parseCdsAnnotations,
  parseCodonUsage,
  parseGenbankCds,
  parsePhastestDetails,
} from '../utils/mutationTools';

const GENBANK_SAMPLE = `LOCUS       AB434711                8929 bp    DNA     circular PHG 25-JUN-2013
DEFINITION  Ralstonia phage RSM3 DNA, complete genome.
ACCESSION   AB434711
FEATURES             Location/Qualifiers
     source          1..8929
                     /organism="Ralstonia phage RSM3"
     CDS             1..327
                     /note="ORF1"
                     /codon_start=1
                     /product="hypothetical protein"
                     /protein_id="BAG75133.1"
                     /translation="MSNTQKLTIIAINSRTGVSAKTGRPYSMHEAQCILTEGVADATG
                     VMSEQIKVGRVNVADELKDTVPGDYVADFKLFVSRDGELVARIVGLKALTVSRPAPPA
                     TEKKAA"
     CDS             393..599
                     /product="hypothetical protein"
     CDS             complement(7091..7804)
                     /product="putative replication protein"
ORIGIN
        1 atgtcaaaca cccaaaaact aac
//
`;

const PHASTEST_SAMPLE = `gi|00000000|ref|NC_000000| NZ_CP161901.1 Example genome

CDS_POSITION                       BLAST_HIT
---------------------------------------------------------------
#### region 1 ####
1777979..1778179                   PHAGE_x: Csp; PP_01581; phage; -
complement(1779171..1779926)       Foldase protein PrsA; PP_01583; -
`;

describe('detectAnnotationFormat', () => {
  test('recognizes GenBank flat files', () => {
    expect(detectAnnotationFormat(GENBANK_SAMPLE)).toBe('genbank');
  });

  test('recognizes PHASTEST detail files', () => {
    expect(detectAnnotationFormat(PHASTEST_SAMPLE)).toBe('phastest');
  });
});

describe('parseGenbankCds', () => {
  const regions = parseGenbankCds(GENBANK_SAMPLE);

  test('extracts only CDS features (not source)', () => {
    expect(regions).toHaveLength(3);
  });

  test('parses forward-strand coordinates (1-based inclusive)', () => {
    expect(regions[0]).toMatchObject({ id: 1, start: 1, end: 327, strand: '+' });
    expect(regions[0].product).toBe('hypothetical protein');
  });

  test('parses complement() features as reverse strand with correct span', () => {
    const rev = regions.find((r) => r.strand === '-');
    expect(rev).toMatchObject({ start: 7091, end: 7804, strand: '-' });
    expect(rev?.product).toBe('putative replication protein');
  });

  test('assigns sequential ids sorted by start position', () => {
    expect(regions.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(regions.map((r) => r.start)).toEqual([1, 393, 7091]);
  });
});

describe('parseCodonUsage', () => {
  const header = 'codon,aminoAcid,fraction,frequency,number\n';

  test('accepts single-letter amino acids keyed for lookup', () => {
    const usage = parseCodonUsage(`${header}CTG,L,0.47,51.1,0\nCTA,L,0.04,3.8,0`);
    expect(usage.get('L')).toHaveLength(2);
  });

  test('normalises RNA codons (U) to DNA (T)', () => {
    const usage = parseCodonUsage(`${header}CUG,L,0.47,51.1,0`);
    expect(usage.get('L')?.[0].codon).toBe('CTG');
  });

  test('normalises lower-case amino-acid codes', () => {
    const usage = parseCodonUsage(`${header}ctg,l,0.47,51.1,0`);
    expect(usage.get('L')?.[0].codon).toBe('CTG');
  });

  test('accepts three-letter amino-acid codes', () => {
    const usage = parseCodonUsage(`${header}CUG,Leu,0.47,51.1,0`);
    expect(usage.get('L')?.[0].codon).toBe('CTG');
  });

  test('maps three-letter stop spellings to *', () => {
    const usage = parseCodonUsage(`${header}TAA,Ter,0.61,2.0,0`);
    expect(usage.get('*')?.[0].codon).toBe('TAA');
  });

  test('ranks codons by frequency descending', () => {
    const usage = parseCodonUsage(`${header}CTA,L,0.04,3.8,0\nCTG,L,0.47,51.1,0`);
    expect(usage.get('L')?.map((c) => c.codon)).toEqual(['CTG', 'CTA']);
  });
});

describe('parseCdsAnnotations dispatch', () => {
  test('routes GenBank content to the GenBank parser', () => {
    expect(parseCdsAnnotations(GENBANK_SAMPLE)).toEqual(parseGenbankCds(GENBANK_SAMPLE));
  });

  test('routes PHASTEST content to the PHASTEST parser', () => {
    expect(parseCdsAnnotations(PHASTEST_SAMPLE)).toEqual(parsePhastestDetails(PHASTEST_SAMPLE));
  });
});
