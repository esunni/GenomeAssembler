// Prodigal ORF support.
//
// Parses a Prodigal nucleotide CDS file (`*_cds.fna`) and locates the predicted
// ORFs within a (possibly sub-region) sequence the user is analysing.
//
// Prodigal coordinates are relative to the whole input contig, e.g. a header
// like:
//   >cd-asm1888508v1_4_3 # 2205 # 2726 # 1 # ID=1_3;partial=00;start_type=ATG;...
// gives start=2205, end=2726, strand=+1. The `.fna` body is the gene read 5'→3'
// on its coding strand, so a minus-strand gene is the reverse complement of the
// genomic (plus-strand) slice. We exploit that to find an exact match of an ORF
// inside the pasted sequence and derive the genome offset.

export interface ProdigalOrf {
  id: string;
  genomeStart: number; // 1-based, inclusive (genome coordinates)
  genomeEnd: number; // 1-based, inclusive
  strand: '+' | '-';
  /** Coding-strand nucleotide sequence as written by Prodigal. */
  sequence: string;
  /** Prodigal `partial` flag, e.g. "00", "10", "01", "11". */
  partial: string;
  startType: string;
}

export interface LocatedOrf extends ProdigalOrf {
  /** 0-based start within the pasted sequence (may be negative if clipped). */
  pastedStart: number;
  /** 0-based exclusive end within the pasted sequence (may exceed length). */
  pastedEnd: number;
  /** Visible portion, clamped to [0, length]. */
  visibleStart: number;
  visibleEnd: number;
  /** True when the ORF runs past either edge of the pasted sequence. */
  clipped: boolean;
}

export interface LocationResult {
  located: boolean;
  /** Genome 0-based index that the pasted sequence starts at, or null. */
  offset: number | null;
  /** ORFs that fall (at least partially) within the pasted sequence. */
  orfs: LocatedOrf[];
  /** id of the ORF used as the anchor for location. */
  anchorId: string | null;
}

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };

export function reverseComplement(sequence: string): string {
  let out = '';
  for (let i = sequence.length - 1; i >= 0; i -= 1) {
    out += COMPLEMENT[sequence[i]] ?? 'N';
  }
  return out;
}

function attr(attrs: string, key: string): string {
  const match = attrs.match(new RegExp(`${key}=([^;]*)`));
  return match ? match[1] : '';
}

/**
 * Parses a Prodigal `*_cds.fna` file. Throws when no Prodigal-style headers are
 * found.
 */
export function parseProdigalCds(content: string): ProdigalOrf[] {
  const lines = content.split(/\r?\n/);
  const orfs: ProdigalOrf[] = [];
  let current: ProdigalOrf | null = null;
  let seqParts: string[] = [];

  const flush = () => {
    if (current) {
      current.sequence = seqParts.join('').replace(/\s+/g, '').toUpperCase();
      orfs.push(current);
    }
    current = null;
    seqParts = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('>')) {
      flush();
      // ">id # start # end # strand # attrs"
      const parts = line.slice(1).split('#').map((part) => part.trim());
      if (parts.length < 4) {
        // Not a Prodigal header — keep id only, no coordinates.
        current = null;
        continue;
      }
      const start = Number.parseInt(parts[1], 10);
      const end = Number.parseInt(parts[2], 10);
      const strandRaw = parts[3];
      const attrs = parts[4] ?? '';
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        current = null;
        continue;
      }
      current = {
        id: parts[0],
        genomeStart: start,
        genomeEnd: end,
        strand: strandRaw.startsWith('-') ? '-' : '+',
        sequence: '',
        partial: attr(attrs, 'partial') || '00',
        startType: attr(attrs, 'start_type'),
      };
    } else if (current) {
      seqParts.push(line);
    }
  }
  flush();

  if (orfs.length === 0) {
    throw new Error(
      'No Prodigal CDS records found. Upload the nucleotide CDS file (e.g. *_cds.fna).',
    );
  }
  return orfs;
}

/** The plus-strand genomic sequence expected for an ORF. */
function expectedGenomic(orf: ProdigalOrf): string {
  return orf.strand === '+' ? orf.sequence : reverseComplement(orf.sequence);
}

function buildLocated(pasted: string, orfs: ProdigalOrf[], offset: number): LocatedOrf[] {
  const length = pasted.length;
  const located: LocatedOrf[] = [];
  for (const orf of orfs) {
    const pastedStart = orf.genomeStart - 1 - offset;
    const pastedEnd = orf.genomeEnd - offset; // exclusive
    if (pastedEnd <= 0 || pastedStart >= length) continue; // out of view
    located.push({
      ...orf,
      pastedStart,
      pastedEnd,
      visibleStart: Math.max(0, pastedStart),
      visibleEnd: Math.min(length, pastedEnd),
      clipped: pastedStart < 0 || pastedEnd > length,
    });
  }
  located.sort((a, b) => a.pastedStart - b.pastedStart);
  return located;
}

/**
 * Attempts to locate the ORFs within `pasted`. The pasted sequence is assumed
 * to be an exact (sub)substring of the assembly Prodigal ran on. Returns
 * `located: false` when no confident anchor can be found.
 */
export function locateOrfs(pasted: string, orfs: ProdigalOrf[]): LocationResult {
  const sequence = pasted.toUpperCase();

  // Try the longest ORFs first — longer matches are faster to disambiguate.
  const anchors = [...orfs]
    .filter((orf) => orf.sequence.length >= 12)
    .sort((a, b) => b.sequence.length - a.sequence.length);

  for (const anchor of anchors) {
    const expected = expectedGenomic(anchor);
    const idx = sequence.indexOf(expected);
    if (idx === -1) continue;
    // Reject ambiguous anchors that occur more than once.
    if (sequence.indexOf(expected, idx + 1) !== -1) continue;

    const offset = anchor.genomeStart - 1 - idx;

    // Validate the offset against another ORF fully inside the pasted window.
    let validated = true;
    let sawOther = false;
    for (const other of orfs) {
      if (other === anchor) continue;
      const start = other.genomeStart - 1 - offset;
      const end = other.genomeEnd - offset;
      if (start < 0 || end > sequence.length) continue; // not fully in view
      sawOther = true;
      if (sequence.slice(start, end) !== expectedGenomic(other)) {
        validated = false;
        break;
      }
      break; // one consistent witness is enough
    }

    if (validated || !sawOther) {
      return {
        located: true,
        offset,
        orfs: buildLocated(sequence, orfs, offset),
        anchorId: anchor.id,
      };
    }
  }

  return { located: false, offset: null, orfs: [], anchorId: null };
}
