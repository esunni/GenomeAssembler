import {
  calculateMixLoss,
  calculatePreparationVolume,
  calculatePremixTransferVolume,
  calculateWholeReactionCount,
} from './janusMath';
import type {
  AspirationPlate,
  AvailableSource,
  DispensingWellItem,
  ExperimentProject,
  PreparationSummary,
  ProtocolComponent,
  SourceType,
  LabwareId,
} from '../types';

const DEFAULT_COLORS = ['#F3000E', '#F25016', '#6596F3', '#83B366', '#D3A4EA', '#EAD094', '#B2DCE2', '#D7EAAC'];

function generateRandomColor(existingColors: string[]): string {
  let color: string;
  let attempts = 0;
  do {
    color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    attempts++;
    if (attempts > 100) break;
  } while (existingColors.includes(color.toUpperCase()));
  return color;
}

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function createProtocolComponent(existingComponents?: ProtocolComponent[], isEcho?: boolean): ProtocolComponent {
  const existingColors = existingComponents 
    ? existingComponents.map(c => c.color.toUpperCase()) 
    : [];
  
  let color: string;
  if (existingComponents && existingComponents.length < DEFAULT_COLORS.length) {
    // Try to find the first default color that isn't already used
    const availableDefault = DEFAULT_COLORS.find(c => !existingColors.includes(c.toUpperCase()));
    color = availableDefault || generateRandomColor([...existingColors, ...DEFAULT_COLORS]);
  } else {
    color = generateRandomColor([...existingColors, ...DEFAULT_COLORS]);
  }

  return {
    id: createId('component'),
    name: '',
    transferVolume: isEcho ? 25 : 2,
    echoVolumes: isEcho ? { 'protocol-1': 25 } : undefined,
    color: color,
    deadVolumeMode: 'global',
    customDeadVolume: null,
    subItems: [],
  };
}

export function createAspirationPlate(labware: LabwareId = 'plate-96'): AspirationPlate {
  return {
    id: createId('aspiration'),
    name: '',
    kind: 'aspiration',
    labware,
    wells: {},
  };
}

export function createDefaultProject(): ExperimentProject {
  return {
    experimentName: '',
    globalDeadVolume: 30,
    useGlobalDeadVolume: true,
    mixLossEnabled: true,
    protocolComponents: [createProtocolComponent([])],
    aspirationPlates: [],
    dispensingPlate: {
      id: createId('dispensing'),
      name: '',
      kind: 'dispensing',
      labware: 'plate-96',
      wells: {},
    },
    mappingSplitGroups: [],
    echoProtocols: [],
  };
}

export function buildAvailableSources(project: ExperimentProject, isEcho: boolean = false): AvailableSource[] {
  const itemSources: AvailableSource[] = [];
  const seenComponentNames = new Set<string>();
  const seenItemNames = new Set<string>();

  project.protocolComponents.forEach((component) => {
    const compName = component.name.trim();
    if (isEcho && compName) {
      if (seenComponentNames.has(compName)) return;
      seenComponentNames.add(compName);
    }

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
      const itemName = item.name.trim();
      if (isEcho && itemName) {
        if (seenItemNames.has(itemName)) return;
        seenItemNames.add(itemName);
      }

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

  return itemSources;
}

export function getComponentForSource(
  project: ExperimentProject,
  item: { sourceId: string; sourceType: SourceType; componentId: string | null },
) {
  return project.protocolComponents.find((component) => component.id === item.componentId) ?? null;
}

export function getSourceTransferVolume(
  project: ExperimentProject,
  item: { sourceId: string; sourceType: SourceType; componentId: string | null },
  protocolId?: string
): number {
  if (item.sourceType === 'premix') {
    const premix = project.protocolComponents.find((c) => c.id === item.sourceId);

    if (!premix) {
      return 0;
    }

    if (protocolId) {
      if (premix.echoVolumes && protocolId in premix.echoVolumes) {
        return premix.echoVolumes[protocolId];
      }
      if (premix.name) {
        const sameNameComp = project.protocolComponents.find(c => 
          c.isPremix && c.name.trim() === premix.name.trim() && 
          c.echoVolumes && protocolId in c.echoVolumes
        );
        if (sameNameComp) {
          return sameNameComp.echoVolumes![protocolId];
        }
      }
    }
    return premix.transferVolume;
  }

  let component = getComponentForSource(project, item);
  
  if (item.sourceType === 'item' && !component) {
    // Attempt to find component by looking up item in all components
    component = project.protocolComponents.find(c => c.subItems.some(si => si.id === item.sourceId)) ?? null;
  }

  if (protocolId) {
    if (component?.echoVolumes && protocolId in component.echoVolumes) {
      return component.echoVolumes[protocolId];
    }
    if (component && component.name) {
      const sameNameComp = project.protocolComponents.find(c => 
        c.name.trim() === component.name.trim() && 
        c.echoVolumes && protocolId in c.echoVolumes
      );
      if (sameNameComp) {
        return sameNameComp.echoVolumes![protocolId];
      }
    }
    // If it's a subitem, try finding another component that has a subitem with the SAME NAME
    if (item.sourceType === 'item') {
      const subItemName = component?.subItems.find(si => si.id === item.sourceId)?.name.trim();
      if (subItemName) {
        for (const c of project.protocolComponents) {
          if (c.echoVolumes && protocolId in c.echoVolumes && c.subItems.some(si => si.name.trim() === subItemName)) {
            return c.echoVolumes[protocolId];
          }
        }
      }
    }
  }
  return component?.transferVolume ?? 0;
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

export function getDispensingItemProtocolId(project: ExperimentProject, wellName: string): string {
  if (!project.echoProtocols || project.echoProtocols.length === 0) return '';
  const matchingProtocol = project.echoProtocols.find(p => p.name === wellName);
  return matchingProtocol ? matchingProtocol.id : project.echoProtocols[0].id;
}

function getDispensingUsageAndVolume(project: ExperimentProject): {
  usage: Map<string, number>,
  totalVolume: Map<string, number>,
  distinctVolumes: Map<string, Set<number>>
} {
  const usage = new Map<string, number>();
  const totalVolume = new Map<string, number>();
  const distinctVolumes = new Map<string, Set<number>>();

  Object.entries(project.dispensingPlate.wells).forEach(([wellId, well]) => {
    const protocolId = getDispensingItemProtocolId(project, well.wellName);
    
    well.items.forEach(item => {
      const key = `${item.sourceType}:${item.sourceId}`;
      usage.set(key, (usage.get(key) ?? 0) + 1);
      
      const vol = getSourceTransferVolume(project, item, protocolId);
      totalVolume.set(key, (totalVolume.get(key) ?? 0) + vol);
      
      if (!distinctVolumes.has(key)) distinctVolumes.set(key, new Set());
      distinctVolumes.get(key)!.add(vol);
    });
  });

  return { usage, totalVolume, distinctVolumes };
}

export function findAssignedSource(
  project: ExperimentProject,
  sourceId: string,
  sourceType: SourceType,
  isEcho: boolean = false
): { sourceId: string; sourceType: SourceType; displayName: string; componentId: string | null; parentColor: string } | null {
  const aspirationMatch = project.aspirationPlates
    .flatMap((plate) => Object.values(plate.wells))
    .find((well) => well.sourceId === sourceId && well.sourceType === sourceType);

  if (aspirationMatch) {
    return {
      ...aspirationMatch,
      displayName: aspirationMatch.wellLabel ? aspirationMatch.wellLabel : aspirationMatch.displayName,
    };
  }

  return buildAvailableSources(project, isEcho).find((source) => source.sourceId === sourceId && source.sourceType === sourceType) ?? null;
}

export function buildPreparationSummaries(project: ExperimentProject, isEcho: boolean = false): PreparationSummary[] {
  const { usage, totalVolume, distinctVolumes } = getDispensingUsageAndVolume(project);
  
  const summaries: PreparationSummary[] = [];
  const processedSourceKeys = new Set<string>();
  const allDispensingItemsWithWell = Object.values(project.dispensingPlate.wells).flatMap(w => 
    w.items.map(item => ({ ...item, wellName: w.wellName }))
  );

  // 1. Process Premixes
  for (const component of project.protocolComponents) {
    if (!component.isPremix || !component.premixInfo) continue;
    
    const comp1 = project.protocolComponents.find(c => c.id === component.premixInfo!.comp1Id);
    const comp2 = project.protocolComponents.find(c => c.id === component.premixInfo!.comp2Id);
    if (!comp1 || !comp2) continue;

    const relevantItems = allDispensingItemsWithWell.filter(item => 
      item.componentId === comp1.id || item.sourceId === comp1.id ||
      item.componentId === comp2.id || item.sourceId === comp2.id
    );
    const usageCount = relevantItems.length;

    if (usageCount === 0) continue;

    let premixVolSet = new Set<number>();
    let totalPremixVol = 0;
    
    relevantItems.forEach(item => {
      const protocolId = getDispensingItemProtocolId(project, item.wellName);
      const v1 = getSourceTransferVolume(project, { sourceId: comp1.id, sourceType: 'component', componentId: comp1.id }, protocolId);
      const v2 = getSourceTransferVolume(project, { sourceId: comp2.id, sourceType: 'component', componentId: comp2.id }, protocolId);
      const sum = v1 + v2;
      premixVolSet.add(sum);
      totalPremixVol += sum;
    });

    const isVariable = premixVolSet.size > 1;
    const representativeVolume = isVariable ? 0 : [...premixVolSet][0];
    const avgVolume = totalPremixVol / usageCount;
    
    const deadVolume = getSourceDeadVolume(project, { sourceId: component.id, sourceType: 'component', componentId: component.id });
    const mixLoss = calculateMixLoss(usageCount, project.mixLossEnabled);
    
    const mixLossVolume = mixLoss * avgVolume;
    
    const effectiveTotalVol = isEcho ? (totalPremixVol + mixLossVolume) / 1000 : (totalPremixVol + mixLossVolume);
    const totalPreparationVolume = Number((effectiveTotalVol + deadVolume).toFixed(4));
    const wholeReactionCount = usageCount + mixLoss;

    summaries.push({
      sourceId: component.id,
      sourceType: 'component',
      displayName: component.name || 'Unnamed Premix',
      isPremixRow: true,
      parentColor: component.color,
      usageCount,
      componentVolume: isVariable ? ('-' as any) : representativeVolume,
      deadVolume,
      mixLoss,
      wholeReactionCount,
      totalPreparationVolume
    });

    const addChild = (childComp: ProtocolComponent) => {
      let childTotalVol = 0;
      let childVolSet = new Set<number>();
      relevantItems.forEach(item => {
        const protocolId = getDispensingItemProtocolId(project, item.wellName);
        const v = getSourceTransferVolume(project, { sourceId: childComp.id, sourceType: 'component', componentId: childComp.id }, protocolId);
        childTotalVol += v;
        childVolSet.add(v);
      });
      
      const isChildVar = childVolSet.size > 1;
      const childRepVol = isChildVar ? 0 : [...childVolSet][0];
      const childAvgVol = childTotalVol / usageCount;
      const childMixLossVol = mixLoss * childAvgVol;
      
      const childEffectiveTotal = isEcho ? (childTotalVol + childMixLossVol) / 1000 : (childTotalVol + childMixLossVol);
      const childPrepVol = Number(childEffectiveTotal.toFixed(4));

      summaries.push({
        sourceId: childComp.id,
        sourceType: 'component',
        displayName: `↳ ${childComp.name}`,
        isPremixRow: false,
        usageCount,
        componentVolume: isChildVar ? ('-' as any) : childRepVol,
        deadVolume: 0,
        mixLoss: 0,
        wholeReactionCount,
        totalPreparationVolume: childPrepVol
      });

      processedSourceKeys.add(`component:${childComp.id}`);
      childComp.subItems.forEach(si => processedSourceKeys.add(`item:${si.id}`));
    };

    addChild(comp1);
    addChild(comp2);
  }

  // 2. Process Plain Components
  for (const [usageKey, usageCount] of usage.entries()) {
    if (processedSourceKeys.has(usageKey)) continue;

    const [sourceType, sourceId] = usageKey.split(':') as [SourceType, string];
    const assignedSource = findAssignedSource(project, sourceId, sourceType, isEcho);

    if (!assignedSource) continue;

    const vols = distinctVolumes.get(usageKey)!;
    const isVariable = vols.size > 1;
    const representativeVolume = isVariable ? 0 : [...vols][0];
    const totalVol = totalVolume.get(usageKey)!;
    const avgVolume = totalVol / usageCount;

    const deadVolume = getSourceDeadVolume(project, assignedSource);
    const mixLoss = calculateMixLoss(usageCount, project.mixLossEnabled);
    const mixLossVolume = mixLoss * avgVolume;
    
    const wholeReactionCount = usageCount + mixLoss;

    const effectiveTotalVol = isEcho ? (totalVol + mixLossVolume) / 1000 : (totalVol + mixLossVolume);
    const totalPreparationVolume = Number((effectiveTotalVol + deadVolume).toFixed(4));

    summaries.push({
      sourceId,
      sourceType,
      displayName: assignedSource.displayName,
      isPremixRow: false,
      usageCount,
      componentVolume: isVariable ? ('-' as any) : representativeVolume,
      deadVolume,
      mixLoss,
      wholeReactionCount,
      totalPreparationVolume,
    });
  }

  return summaries;
}
