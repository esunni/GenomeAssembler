import type { FillDirection, LabwareId } from '../types';

const LABWARE_LAYOUTS: Record<LabwareId, { label: string; rows: string[]; columns: number[] }> = {
  'rack-4x6': {
    label: '4x6 rack',
    rows: ['A', 'B', 'C', 'D'],
    columns: [1, 2, 3, 4, 5, 6],
  },
  'plate-96': {
    label: '96-well plate',
    rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    columns: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
};

export function getLabwareLabel(labware: LabwareId): string {
  return LABWARE_LAYOUTS[labware].label;
}

export function getWellIds(labware: LabwareId): string[] {
  const layout = LABWARE_LAYOUTS[labware];
  return layout.rows.flatMap((row) => layout.columns.map((column) => `${row}${column}`));
}

export function normalizeWellId(wellId: string): string {
  return wellId.trim().toUpperCase();
}

export function isValidWellId(labware: LabwareId, wellId: string): boolean {
  return getWellIds(labware).includes(normalizeWellId(wellId));
}

export function getSequentialWellIds(
  labware: LabwareId,
  startWellId: string,
  direction: FillDirection,
  count: number,
): string[] {
  if (count <= 0) {
    return [];
  }

  const layout = LABWARE_LAYOUTS[labware];
  const sequence =
    direction === 'horizontal'
      ? layout.rows.flatMap((row) => layout.columns.map((column) => `${row}${column}`))
      : layout.columns.flatMap((column) => layout.rows.map((row) => `${row}${column}`));
  const startIndex = sequence.indexOf(normalizeWellId(startWellId));

  if (startIndex === -1) {
    return [];
  }

  return sequence.slice(startIndex, startIndex + count);
}
