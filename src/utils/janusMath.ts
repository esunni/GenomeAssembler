export interface WholeReactionCountInput {
  requiredReactionCount: number;
  mixLoss: number;
  componentVolume: number;
  deadVolume: number;
}

export interface RemainderVolumeInput {
  wholeReactionCount: number;
  targetReactionVolume: number;
  manualBatchVolume: number;
}

export interface DnaMassInput {
  concentrationNgPerUl: number;
  wholeBatchVolume: number;
  wholeReactionCount: number;
}

const round = (value: number) => Number(value.toFixed(4));

export function calculateMixLoss(requiredReactionCount: number, enabled: boolean): number {
  if (!enabled || requiredReactionCount <= 0) return 0;
  return Math.max(0.5, Math.floor(requiredReactionCount / 5) * 0.5);
}

export function calculateWholeReactionCount({
  requiredReactionCount,
  mixLoss,
  componentVolume,
  deadVolume,
}: WholeReactionCountInput): number {
  if (requiredReactionCount <= 0 || componentVolume <= 0) {
    return 0;
  }

  return requiredReactionCount + mixLoss + (deadVolume / componentVolume);
}

export function calculatePreparationVolume(input: WholeReactionCountInput): number {
  if (input.requiredReactionCount <= 0 || input.componentVolume <= 0) return 0;
  return round((input.requiredReactionCount + input.mixLoss) * input.componentVolume + input.deadVolume);
}

export function calculatePremixTransferVolume(componentVolumes: number[]): number {
  return round(componentVolumes.reduce((sum, value) => sum + value, 0));
}

export function calculateRemainderVolume({
  wholeReactionCount,
  targetReactionVolume,
  manualBatchVolume,
}: RemainderVolumeInput): number {
  if (wholeReactionCount <= 0 || targetReactionVolume <= 0) {
    return 0;
  }

  return round(Math.max(wholeReactionCount * targetReactionVolume - manualBatchVolume, 0));
}

export function calculateDnaMassPerReaction({
  concentrationNgPerUl,
  wholeBatchVolume,
  wholeReactionCount,
}: DnaMassInput): number | null {
  if (concentrationNgPerUl <= 0 || wholeBatchVolume <= 0 || wholeReactionCount <= 0) {
    return null;
  }

  return round((concentrationNgPerUl * wholeBatchVolume) / wholeReactionCount);
}
