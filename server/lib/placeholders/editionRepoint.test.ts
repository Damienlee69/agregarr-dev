import { resolveEditionRepoint } from '@server/lib/placeholders/editionRepoint';
import { describe, expect, it } from 'vitest';

// Shapes copied from a live library: marker path is absolute, DB row is relative
const LIB = '/tv';
const MARKER =
  '/tv/Nocturne (2026) [imdb-tt26598805] {edition-Trailer}/Season 00/S00E00.Trailer.mp4';
const DB_ROW =
  'Nocturne (2026) [imdb-tt26598805] {edition-Trailer}/Season 00/S00E00.Trailer.mp4';

const items = [
  {
    ratingKey: '225535',
    editionTitle: 'Trailer',
    Guid: [{ id: 'tmdb://292741' }],
  },
  { ratingKey: '300001', Guid: [{ id: 'tmdb://292741' }] },
  {
    ratingKey: '225539',
    editionTitle: 'Trailer',
    Guid: [{ id: 'tmdb://171802' }],
  },
];

describe('resolveEditionRepoint', () => {
  it('matches the stored relative path and finds the edition key', () => {
    expect(
      resolveEditionRepoint(LIB, MARKER, 292741, { ratingKey: '300001' }, items)
    ).toEqual({
      relativePath: DB_ROW,
      pendingRealRatingKey: '300001',
      editionRatingKey: '225535',
    });
  });

  it('returns null when the matched item is the edition itself', () => {
    expect(
      resolveEditionRepoint(
        LIB,
        MARKER,
        292741,
        { ratingKey: '225535', editionTitle: 'Trailer' },
        items
      )
    ).toBeNull();
  });

  it('leaves the edition key unset when the library has no edition item', () => {
    expect(
      resolveEditionRepoint(LIB, MARKER, 292741, { ratingKey: '300001' }, [])
        ?.editionRatingKey
    ).toBeUndefined();
  });

  it('ignores non-Trailer editions and refuses an ambiguous match', () => {
    const extended = {
      ratingKey: '400001',
      editionTitle: 'Extended',
      Guid: [{ id: 'tmdb://292741' }],
    };
    const real = { ratingKey: '300001' };
    expect(
      resolveEditionRepoint(LIB, MARKER, 292741, real, [extended, ...items])
        ?.editionRatingKey
    ).toBe('225535');
    expect(
      resolveEditionRepoint(LIB, MARKER, 292741, real, [
        ...items,
        { ...items[0], ratingKey: '225999' },
      ])?.editionRatingKey
    ).toBeUndefined();
  });
});
