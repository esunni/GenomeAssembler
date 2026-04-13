export interface WholeReactionCountInput {
  requiredReactionCount: number;
  mixLoss: number;
  componentVolume: number;
  deadVolume: number;
}

const round = (value: number) => Number(value.toFixed(4));

export function calculateMixLoss(requiredReactionCount: number, enabled: boolean): number {
  if (!enabled || requiredReactionCount <= 1) return 0;
  return Math.max(0.5, Math.floor(requiredReactionCount / 5) * 0.5);
}

export function calculateWholeReactionCount({
  requiredReactionCount,
  mixLoss,
  componentVolume,
}: WholeReactionCountInput): number {
  if (requiredReactionCount <= 0 || componentVolume <= 0) {
    return 0;
  }

  return requiredReactionCount + mixLoss;
}

export function calculatePreparationVolume(input: WholeReactionCountInput): number {
  if (input.requiredReactionCount <= 0 || input.componentVolume <= 0) return 0;
  const wholeReactionCount = calculateWholeReactionCount(input);
  return round(wholeReactionCount * input.componentVolume + input.deadVolume);
}

export function calculatePremixTransferVolume(componentVolumes: number[]): number {
  return round(componentVolumes.reduce((sum, value) => sum + value, 0));
}
