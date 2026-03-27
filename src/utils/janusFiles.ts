import type {
  ExperimentProject,
  GeneratedMappingFile,
  MappingSplitGroup,
  ParsedAspirationRow,
  SourceType,
} from '../types';
import { getSourceTransferVolume } from './janusState';
import { isValidWellId, normalizeWellId } from './plateUtils';

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-');
}

export function createAspirationTemplateCsv(): string {
  return 'well,component,item_name,well_label\nA1,Primer,Mu_F1_F,Primer 1';
}

export function parseAspirationTemplateCsv(content: string): ParsedAspirationRow[] {
  const [headerLine, ...lines] = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!headerLine) {
    return [];
  }

  return lines.map((line) => {
    const [well = '', component = '', itemName = '', wellLabel = ''] = line.split(',').map((value) => value.trim());

    return {
      well: normalizeWellId(well),
      component,
      itemName,
      wellLabel,
    };
  });
}

export function exportProjectJson(project: ExperimentProject): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(content: string): ExperimentProject {
  return JSON.parse(content) as ExperimentProject;
}

function findAspirationLocation(project: ExperimentProject, sourceId: string, sourceType: SourceType) {
  for (const plate of project.aspirationPlates) {
    for (const [wellId, assignment] of Object.entries(plate.wells)) {
      if (assignment.sourceId === sourceId && assignment.sourceType === sourceType) {
        return {
          plate,
          wellId,
          assignment,
        };
      }
    }
  }

  return null;
}

function createCsvLine(values: Array<string | number>): string {
  return values
    .map((value) => {
      const text = String(value);
      return text.includes(',') ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(',');
}

function getEffectiveSplitGroups(project: ExperimentProject): MappingSplitGroup[] {
  if (project.mappingSplitGroups.length > 0) {
    return project.mappingSplitGroups;
  }

  return [
    {
      id: 'group-all',
      plateIds: project.aspirationPlates.map((plate) => plate.id),
    },
  ];
}

export function getMappingExportFilename(
  experimentName: string,
  dispensingName: string,
  aspirationNames: string[] = [],
): string {
  const baseName = `${sanitizeName(experimentName)}_${sanitizeName(dispensingName)}`;
  const fromPart = aspirationNames.length > 0 ? `_from_${aspirationNames.map(sanitizeName).join('-')}` : '';
  return `${baseName}${fromPart}_Janus_mapping_file.csv`;
}

export function generateMappingCsvFiles(project: ExperimentProject): GeneratedMappingFile[] {
  const groups = getEffectiveSplitGroups(project);
  const hasComponentColumn = Object.values(project.dispensingPlate.wells).some((well) => well.wellName.trim() !== '');

  return groups.map((group) => {
    const groupPlateIds = new Set(group.plateIds);
    const rows = Object.entries(project.dispensingPlate.wells).flatMap(([dispensingWellId, dispensingWell]) =>
      dispensingWell.items.flatMap((item) => {
        const location = findAspirationLocation(project, item.sourceId, item.sourceType);

        if (!location || !groupPlateIds.has(location.plate.id)) {
          return [];
        }

        const volume = getSourceTransferVolume(project, item);
        const leadingValues = hasComponentColumn ? [dispensingWell.wellName || dispensingWellId] : [];

        return [
          createCsvLine([
            ...leadingValues,
            location.plate.name,
            location.wellId,
            project.dispensingPlate.name,
            dispensingWellId,
            volume,
          ]),
        ];
      }),
    );
    const header = hasComponentColumn
      ? 'Component,Asp. Rack,Asp. Posi,Dsp. Rack,Dsp. Posi,vol'
      : 'Asp. Rack,Asp. Posi,Dsp. Rack,Dsp. Posi,vol';
    const aspirationNames =
      groups.length > 1
        ? group.plateIds.map((plateId) => project.aspirationPlates.find((plate) => plate.id === plateId)?.name ?? '')
        : [];

    return {
      filename: getMappingExportFilename(project.experimentName, project.dispensingPlate.name, aspirationNames),
      content: [header, ...rows].join('\n'),
    };
  });
}

export function validateMappingExport(project: ExperimentProject): string[] {
  const errors: string[] = [];

  if (project.experimentName.trim() === '') {
    errors.push('Experiment name is required for export.');
  }

  if (project.aspirationPlates.some((plate) => plate.name.trim() === '')) {
    errors.push('Aspiration plate names are required for export.');
  }

  if (project.dispensingPlate.name.trim() === '') {
    errors.push('Dispensing plate name is required for export.');
  }

  const allPlateNames = [...project.aspirationPlates.map((plate) => plate.name.trim()), project.dispensingPlate.name.trim()].filter(Boolean);
  const uniquePlateNames = new Set(allPlateNames);
  if (allPlateNames.length !== uniquePlateNames.size) {
    errors.push('Plate names must be unique.');
  }

  if (project.mappingSplitGroups.length > 0) {
    const knownPlateIds = new Set(project.aspirationPlates.map((plate) => plate.id));
    const assignedPlateIds = project.mappingSplitGroups.flatMap((group) => group.plateIds);
    const uniqueAssignedPlateIds = new Set(assignedPlateIds);
    const hasUnknownPlate = assignedPlateIds.some((plateId) => !knownPlateIds.has(plateId));
    const hasDuplicateAssignment = assignedPlateIds.length !== uniqueAssignedPlateIds.size;
    const missingPlateAssignment = project.aspirationPlates.some((plate) => !uniqueAssignedPlateIds.has(plate.id));

    if (hasUnknownPlate || hasDuplicateAssignment || missingPlateAssignment) {
      errors.push('Mapping split groups must partition the aspiration plates exactly once.');
    }
  }

  const missingSourceReference = Object.values(project.dispensingPlate.wells)
    .flatMap((well) => well.items)
    .some((item) => findAspirationLocation(project, item.sourceId, item.sourceType) === null);

  if (missingSourceReference) {
    errors.push('Every dispensing assignment must reference a source placed on an aspiration plate.');
  }

  return errors;
}

export function validateAspirationTemplateRows(project: ExperimentProject, plateId: string, rows: ParsedAspirationRow[]): string[] {
  const plate = project.aspirationPlates.find((candidate) => candidate.id === plateId);

  if (!plate) {
    return ['Aspiration plate not found.'];
  }

  if (rows.some((row) => !isValidWellId(plate.labware, row.well))) {
    return ['Template rows include wells outside the selected labware.'];
  }

  return [];
}
