import { describe, expect, test } from 'vitest';

import { parsePromoters } from '../utils/searchWindowTools';

describe('parsePromoters', () => {
  test('parses comma-separated name,start,end and skips the header row', () => {
    const result = parsePromoters('Name,Start,End\nlac,405,439');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'lac', position: 405, end: 439, direction: 'forward' });
  });

  test('parses tab-separated columns', () => {
    const result = parsePromoters('T7\t154\t173');
    expect(result[0]).toMatchObject({ name: 'T7', position: 154, end: 173 });
  });

  test('parses free-text "name: start-end" (the documented Text example)', () => {
    const result = parsePromoters('T7 promoter: 154-173');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'T7 promoter', position: 154, end: 173, direction: 'forward' });
  });

  test('supports .. and "to" range separators', () => {
    expect(parsePromoters('lac 405..439')[0]).toMatchObject({ name: 'lac', position: 405, end: 439 });
    expect(parsePromoters('lac 405 to 439')[0]).toMatchObject({ name: 'lac', position: 405, end: 439 });
  });

  test('marks a descending range as reverse and preserves original coordinates', () => {
    const result = parsePromoters('araBAD: 173-154');
    expect(result[0]).toMatchObject({
      name: 'araBAD',
      position: 154,
      end: 173,
      direction: 'reverse',
      originalStart: 173,
      originalEnd: 154,
    });
  });

  test('does not mistake a digit inside the name for a coordinate', () => {
    const result = parsePromoters('T7 154-173');
    expect(result[0]).toMatchObject({ name: 'T7', position: 154, end: 173 });
  });

  test('parses a named single position', () => {
    const result = parsePromoters('T7 promoter: 154');
    expect(result[0]).toMatchObject({ name: 'T7 promoter', position: 154, end: 154 });
  });

  test('still supports bare number and "Promoter Pos:" fallbacks', () => {
    expect(parsePromoters('154')[0]).toMatchObject({ position: 154, end: 154 });
    expect(parsePromoters('Promoter Pos: 154')[0]).toMatchObject({ position: 154, end: 154 });
  });

  test('ignores lines with no position', () => {
    expect(parsePromoters('some header text\nregion without numbers')).toHaveLength(0);
  });
});
