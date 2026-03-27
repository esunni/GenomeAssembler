import {
  calculateWholeReactionCount,
  calculatePreparationVolume,
  calculatePremixTransferVolume,
  calculateRemainderVolume,
  calculateDnaMassPerReaction,
} from '../utils/janusMath';

describe('janus math', () => {
  test('rounds whole reaction count using component volume and dead volume', () => {
    expect(
      calculateWholeReactionCount({
        requiredReactionCount: 10,
        componentVolume: 2,
        deadVolume: 3,
      }),
    ).toBe(12);
  });

  test('calculates preparation volume from whole reaction count', () => {
    expect(
      calculatePreparationVolume({
        requiredReactionCount: 10,
        componentVolume: 2,
        deadVolume: 3,
      }),
    ).toBe(24);
  });

  test('sums premix transfer volume from grouped components', () => {
    expect(calculatePremixTransferVolume([0.5, 1.25, 2])).toBe(3.75);
  });

  test('calculates remainder volume from total batch volume and manual batch volume', () => {
    expect(
      calculateRemainderVolume({
        wholeReactionCount: 12,
        targetReactionVolume: 10,
        manualBatchVolume: 18,
      }),
    ).toBe(102);
  });

  test('calculates dna mass per reaction when concentration is provided', () => {
    expect(
      calculateDnaMassPerReaction({
        concentrationNgPerUl: 50,
        wholeBatchVolume: 18,
        wholeReactionCount: 12,
      }),
    ).toBeCloseTo(75);
  });
});
