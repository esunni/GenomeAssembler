export type DeadVolumeMode = 'global' | 'custom';
export type LabwareId = 'rack-4x6' | 'plate-96' | 'plate-384';
export type SourceType = 'component' | 'item' | 'premix';
export type FillDirection = 'horizontal' | 'vertical';

export interface ComponentSubItem {
  id: string;
  name: string;
}

export interface PremixInfo {
  comp1Id: string;
  comp2Id: string;
}

export interface EchoProtocol {
  id: string;
  name: string;
}

export interface ProtocolComponent {
  id: string;
  name: string;
  transferVolume: number;
  echoVolumes?: Record<string, number>;
  color: string;
  deadVolumeMode: DeadVolumeMode;
  customDeadVolume: number | null;
  subItems: ComponentSubItem[];
  isPremix?: boolean;
  premixInfo?: PremixInfo;
  isPremixComponent?: boolean;
  premixParentId?: string;
}

export interface AspirationWellAssignment {
  sourceId: string;
  sourceType: SourceType;
  displayName: string;
  componentId: string | null;
  parentColor: string;
  wellLabel: string;
}

export interface DispensingWellItem {
  sourceId: string;
  sourceType: SourceType;
  displayName: string;
  componentId: string | null;
  parentColor: string;
}

export interface DispensingWellAssignment {
  wellName: string;
  items: DispensingWellItem[];
}

export interface AspirationPlate {
  id: string;
  name: string;
  kind: 'aspiration';
  labware: LabwareId;
  wells: Record<string, AspirationWellAssignment>;
}

export interface DispensingPlate {
  id: string;
  name: string;
  kind: 'dispensing';
  labware: LabwareId;
  wells: Record<string, DispensingWellAssignment>;
}

export interface MappingSplitGroup {
  id: string;
  plateIds: string[];
}

export interface ExperimentProject {
  experimentName: string;
  globalDeadVolume: number;
  useGlobalDeadVolume: boolean;
  mixLossEnabled: boolean;
  protocolComponents: ProtocolComponent[];
  aspirationPlates: AspirationPlate[];
  dispensingPlate: DispensingPlate;
  mappingSplitGroups: MappingSplitGroup[];
  echoProtocols?: EchoProtocol[];
}

export interface ParsedAspirationRow {
  well: string;
  component: string;
  itemName: string;
  wellLabel: string;
}

export interface GeneratedMappingFile {
  filename: string;
  content: string;
}

export interface AvailableSource {
  sourceId: string;
  sourceType: SourceType;
  displayName: string;
  componentId: string | null;
  parentColor: string;
  familyId: string;
  familyLabel: string;
}

export interface PreparationSummary {
  sourceId: string;
  sourceType: SourceType;
  displayName: string;
  isPremixRow?: boolean;
  parentColor?: string;
  usageCount: number;
  componentVolume: number;
  deadVolume: number;
  mixLoss: number;
  wholeReactionCount: number;
  totalPreparationVolume: number;
}

export interface RemainderCalculationResult {
  requiredReactionCount: number;
  wholeReactionCount: number;
  componentVolume: number;
  targetReactionVolume: number;
  totalBatchTargetVolume: number;
  remainderVolume: number;
  dnaMassPerReaction: number | null;
}
