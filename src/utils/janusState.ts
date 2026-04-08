import {
  calculateDnaMassPerReaction,
  calculatePreparationVolume,
  calculatePremixTransferVolume,
  calculateRemainderVolume,
  calculateWholeReactionCount,
} from './janusMath';
import type {
  AspirationPlate,
  AvailableSource,
  DispensingWellItem,
  ExperimentProject,
  PreparationSummary,
  ProtocolComponent,
  RemainderCalculationResult,
  SourceType,
} from '../types';

const DEFAULT_COLORS = ['#F3000E', '#F25016', '#6596F3', '#83B366', '#D3A4EA', '#EAD094', '#B2DCE2', '#D7EAAC'];

function generateRandomColor(existingColors: string[]): string {
  let color: string;
  do {
    color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  } while (existingColors.includes(color.toUpperCase()));
  return color;
}

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function createProtocolComponent(): ProtocolComponent {
  const colorIndex = idCounter % DEFAULT_COLORS.length;
  const color = colorIndex < DEFAULT_COLORS.length 
    ? DEFAULT_COLORS[colorIndex] 
    : generateRandomColor(DEFAULT_COLORS);
  return {
    id: createId('component'),
    name: '',
    transferVolume: 1,
    color: color,
    deadVolumeMode: 'global',
    customDeadVolume: null,
    subItems: [],
  };
}

export function createAspirationPlate(): AspirationPlate {
  return {
    id: createId('aspiration'),
    name: '',
    kind: 'aspiration',
    labware: 'plate-96',
    wells: {},
  };
}

export function createDefaultProject(): ExperimentProject {
  return {
    experimentName: '',
    globalDeadVolume: 2,
    useGlobalDeadVolume: true,
    protocolComponents: [createProtocolComponent()],
    premixGroups: [],
    aspirationPlates: [],
    dispensingPlate: {
      id: createId('dispensing'),
      name: '',
      kind: 'dispensing',
      labware: 'plate-96',
      wells: {},
    },
    remainderConfig: {
      enabled: false,
      fixedComponentId: null,
      remainderComponentId: null,
      targetReactionVolume: '',
      manualBatchVolume: '',
      dnaConcentration: '',
    },
    mappingSplitGroups: [],
  };
}

export function buildAvailableSources(project: ExperimentProject): AvailableSource[] {
  const itemSources: AvailableSource[] = [];

  project.protocolComponents.forEach((component) => {
    if (component.subItems.length === 0) {
      itemSources.push({
        sourceId: component.id,
        sourceType: 'component',
        displayName: component.name || 'Unnamed component',
        componentId: component.id,
        parentColor: component.color,
        familyId: component.id,
        familyLabel: component.name || 'Unnamed component',
      });
      return;
    }

    component.subItems.forEach((item) => {
      itemSources.push({
        sourceId: item.id,
        sourceType: 'item',
        displayName: item.name,
        componentId: component.id,
        parentColor: component.color,
        familyId: component.id,
        familyLabel: component.name || 'Unnamed component',
      });
    });
  });

  const premixSources: AvailableSource[] = project.premixGroups.map((premix) => ({
    sourceId: premix.id,
    sourceType: 'premix',
    displayName: premix.name || 'Unnamed premix',
    componentId: null,
    parentColor: premix.color,
    familyId: premix.id,
    familyLabel: premix.name || 'Unnamed premix',
  }));

  return [...itemSources, ...premixSources];
}

export function getComponentForSource(
  project: ExperimentProject,
  item: { sourceId: string; sourceType: SourceType; componentId: string | null },
) {
  if (item.sourceType === 'premix') {
    return null;
  }

  return project.protocolComponents.find((component) => component.id === item.componentId) ?? null;
}

export function getSourceTransferVolume(
  project: ExperimentProject,
  item: { sourceId: string; sourceType: SourceType; componentId: string | null },
): number {
  if (item.sourceType === 'premix') {
    const premix = project.premixGroups.find((group) => group.id === item.sourceId);

    if (!premix) {
      return 0;
    }

    return calculatePremixTransferVolume(
      premix.componentIds
        .map((componentId) => project.protocolComponents.find((component) => component.id === componentId)?.transferVolume ?? 0)
        .filter((value) => value > 0),
    );
  }

  return getComponentForSource(project, item)?.transferVolume ?? 0;
}

export function getSourceDeadVolume(
  project: ExperimentProject,
  item: { sourceId: string; sourceType: SourceType; componentId: string | null },
): number {
  const component = getComponentForSource(project, item);

  if (!component) {
    return project.useGlobalDeadVolume ? project.globalDeadVolume : 0;
  }

  if (component.deadVolumeMode === 'custom') {
    return component.customDeadVolume ?? 0;
  }

  return project.useGlobalDeadVolume ? project.globalDeadVolume : 0;
}

function getDispensingUsage(items: DispensingWellItem[]): Map<string, number> {
  return items.reduce((usage, item) => {
    const key = `${item.sourceType}:${item.sourceId}`;
    usage.set(key, (usage.get(key) ?? 0) + 1);
    return usage;
  }, new Map<string, number>());
}

export function buildRemainderCalculation(project: ExperimentProject): RemainderCalculationResult | null {
  const { fixedComponentId, remainderComponentId, targetReactionVolume, manualBatchVolume, dnaConcentration, enabled } =
    project.remainderConfig;

  if (!enabled || !fixedComponentId || !remainderComponentId) {
    return null;
  }

  const fixedComponent = project.protocolComponents.find((component) => component.id === fixedComponentId);

  if (!fixedComponent) {
    return null;
  }

  const targetReactionVolumeNumber = Number(targetReactionVolume);
  const manualBatchVolumeNumber = Number(manualBatchVolume);

  if (targetReactionVolumeNumber <= 0 || manualBatchVolumeNumber < 0) {
    return null;
  }

  const usage = getDispensingUsage(Object.values(project.dispensingPlate.wells).flatMap((well) => well.items));
  const requiredReactionCount =
    usage.get(`component:${fixedComponent.id}`) ??
    Array.from(usage.entries()).find(([key]) => key.endsWith(`:${fixedComponent.id}`))?.[1] ??
    0;
  const componentVolume = fixedComponent.transferVolume;
  const deadVolume = getSourceDeadVolume(project, {
    sourceId: fixedComponent.id,
    sourceType: 'component',
    componentId: fixedComponent.id,
  });
  const wholeReactionCount = calculateWholeReactionCount({
    requiredReactionCount,
    componentVolume,
    deadVolume,
  });
  const remainderVolume = calculateRemainderVolume({
    wholeReactionCount,
    targetReactionVolume: targetReactionVolumeNumber,
    manualBatchVolume: manualBatchVolumeNumber,
  });

  return {
    requiredReactionCount,
    wholeReactionCount,
    componentVolume,
    targetReactionVolume: targetReactionVolumeNumber,
    totalBatchTargetVolume: wholeReactionCount * targetReactionVolumeNumber,
    remainderVolume,
    dnaMassPerReaction:
      dnaConcentration.trim() === ''
        ? null
        : calculateDnaMassPerReaction({
            concentrationNgPerUl: Number(dnaConcentration),
            wholeBatchVolume: manualBatchVolumeNumber,
            wholeReactionCount,
          }),
  };
}

export function findAssignedSource(
  project: ExperimentProject,
  sourceId: string,
  sourceType: SourceType,
): { sourceId: string; sourceType: SourceType; displayName: string; componentId: string | null; parentColor: string } | null {
  const aspirationMatch = project.aspirationPlates
    .flatMap((plate) => Object.values(plate.wells))
    .find((well) => well.sourceId === sourceId && well.sourceType === sourceType);

  if (aspirationMatch) {
    return aspirationMatch;
  }

  return buildAvailableSources(project).find((source) => source.sourceId === sourceId && source.sourceType === sourceType) ?? null;
}

export function buildPreparationSummaries(project: ExperimentProject): PreparationSummary[] {
  const usage = getDispensingUsage(Object.values(project.dispensingPlate.wells).flatMap((well) => well.items));
  const remainderCalculation = buildRemainderCalculation(project);

  return Array.from(usage.entries())
    .map(([usageKey, usageCount]) => {
      const [sourceType, sourceId] = usageKey.split(':') as [SourceType, string];
      const assignedSource = findAssignedSource(project, sourceId, sourceType);

      if (!assignedSource) {
        return null;
      }

      const baseComponentVolume = getSourceTransferVolume(project, assignedSource);
      const deadVolume = getSourceDeadVolume(project, assignedSource);
      const isRemainderDriven =
        remainderCalculation &&
        project.remainderConfig.remainderComponentId &&
        assignedSource.componentId === project.remainderConfig.remainderComponentId;
      const wholeReactionCount = isRemainderDriven
        ? remainderCalculation.wholeReactionCount
        : calculateWholeReactionCount({
            requiredReactionCount: usageCount,
            componentVolume: baseComponentVolume,
            deadVolume,
          });
      const totalPreparationVolume = isRemainderDriven
        ? remainderCalculation.remainderVolume
        : calculatePreparationVolume({
            requiredReactionCount: usageCount,
            componentVolume: baseComponentVolume,
            deadVolume,
          });

      return {
        sourceId,
        sourceType,
        displayName: assignedSource.displayName,
        sourceKind: isRemainderDriven ? 'Remainder-driven' : sourceType === 'premix' ? 'Premix' : 'Plain',
        usageCount,
        componentVolume: baseComponentVolume,
        deadVolume,
        wholeReactionCount,
        totalPreparationVolume,
      } satisfies PreparationSummary;
    })
    .filter((summary): summary is PreparationSummary => summary !== null);
}
