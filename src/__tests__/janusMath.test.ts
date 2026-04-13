import {
  calculateWholeReactionCount,
  calculatePreparationVolume,
  calculatePremixTransferVolume,
} from '../utils/janusMath';

describe('janus math', () => {
  test('rounds whole reaction count using component volume and dead volume', () => {
    expect(
      calculateWholeReactionCount({
        requiredReactionCount: 10,
        mixLoss: 1,
        componentVolume: 2,
        deadVolume: 3,
      }),
    ).toBe(12.5);
  });

  test('calculates preparation volume from whole reaction count', () => {
    expect(
      calculatePreparationVolume({
        requiredReactionCount: 10,
        mixLoss: 1,
        componentVolume: 2,
        deadVolume: 3,
      }),
    ).toBe(25);
  });

  test('sums premix transfer volume from grouped components', () => {
    expect(calculatePremixTransferVolume([0.5, 1.25, 2])).toBe(3.75);
  });
});
