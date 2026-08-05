import type { CollectionConfig } from '@server/lib/settings';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the modules that trigger TypeORM entity loading
vi.mock('@server/datasource', () => ({ getRepository: vi.fn() }));
vi.mock('@server/entity/User', () => ({ User: class {} }));
vi.mock('@server/lib/collections/utils/TemplateEngine', () => ({
  templateEngine: {},
}));
vi.mock('@server/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const save = vi.fn();
const settings = {
  plex: { collectionConfigs: [] as CollectionConfig[] },
  save,
};

vi.mock('@server/lib/settings', () => ({
  getSettings: () => settings,
}));

import {
  buildPromotedSortTitle,
  clearConfigRatingKey,
  hasAgregarrLabel,
  isMultiCollectionPattern,
  parseTypedRepositionRank,
  PROMOTED_SORT_TITLE_RANK_WIDTH,
} from './CollectionUtilities';

const config = (overrides: Partial<CollectionConfig>): CollectionConfig =>
  ({ id: 'cfg-1', libraryId: '4', ...overrides } as CollectionConfig);

const stored = () =>
  settings.plex.collectionConfigs[0] as CollectionConfig & {
    collectionRatingKeys?: string[];
  };

describe('clearConfigRatingKey', () => {
  beforeEach(() => {
    save.mockClear();
    settings.plex.collectionConfigs = [];
  });

  it('clears a matching singular ratingKey', () => {
    settings.plex.collectionConfigs = [
      config({ collectionRatingKey: '398348' }),
    ];

    clearConfigRatingKey('cfg-1', '4', '398348');

    expect(stored().collectionRatingKey).toBeUndefined();
    expect(save).toHaveBeenCalled();
  });

  it('leaves a singular ratingKey alone when a different key went stale', () => {
    settings.plex.collectionConfigs = [
      config({ collectionRatingKey: '111111' }),
    ];

    clearConfigRatingKey('cfg-1', '4', '398348');

    expect(stored().collectionRatingKey).toBe('111111');
  });

  it('does not write settings when nothing changed', () => {
    settings.plex.collectionConfigs = [
      config({ collectionRatingKey: '111111' }),
    ];

    clearConfigRatingKey('cfg-1', '4', '398348');

    expect(save).not.toHaveBeenCalled();
  });

  it('does not write settings when the stale key is absent from the array', () => {
    settings.plex.collectionConfigs = [
      config({
        collectionRatingKeys: ['111111', '222222'],
      } as Partial<CollectionConfig>),
    ];

    clearConfigRatingKey('cfg-1', '4', '398348');

    expect(save).not.toHaveBeenCalled();
    expect(stored().collectionRatingKeys).toEqual(['111111', '222222']);
  });

  it('removes only the stale key from a multi-collection config', () => {
    // Overseerr per-user configs hold one ratingKey per user. Clearing one
    // dead collection must not discard every other user's collection.
    settings.plex.collectionConfigs = [
      config({
        collectionRatingKeys: ['111111', '398348', '222222'],
      } as Partial<CollectionConfig>),
    ];

    clearConfigRatingKey('cfg-1', '4', '398348');

    expect(stored().collectionRatingKeys).toEqual(['111111', '222222']);
  });

  it('does nothing when the libraryId does not match', () => {
    settings.plex.collectionConfigs = [
      config({ collectionRatingKey: '398348' }),
    ];

    clearConfigRatingKey('cfg-1', '9', '398348');

    expect(stored().collectionRatingKey).toBe('398348');
    expect(save).not.toHaveBeenCalled();
  });

  it('clears the singular key when no stale key is named (legacy callers)', () => {
    settings.plex.collectionConfigs = [
      config({ collectionRatingKey: '398348' }),
    ];

    clearConfigRatingKey('cfg-1', '4');

    expect(stored().collectionRatingKey).toBeUndefined();
  });
});

describe('hasAgregarrLabel', () => {
  it('matches the hyphenated labels parseConfigIdFromLabel rejects', () => {
    // Regression: routing multi-source deletes through parseConfigIdFromLabel
    // silently stopped removing these collections.
    expect(hasAgregarrLabel(['agregarr-multisource-10213'])).toBe(true);
    expect(hasAgregarrLabel(['Agregarr-filtered_hub-10214'])).toBe(true);
  });

  it('matches camel-case labels', () => {
    expect(hasAgregarrLabel(['AgregarrTmdb10213'])).toBe(true);
  });

  it('reads the tag shape Plex returns for raw collections', () => {
    expect(hasAgregarrLabel([{ tag: 'agregarr-multisource-1' }])).toBe(true);
    expect(hasAgregarrLabel([{ tag: 'horror' }])).toBe(false);
  });

  // The whole point: a user collection is refused however plausible it looks.
  // "Same title" and "not a smart collection" are not ownership evidence.
  it('refuses a user collection regardless of title or smart flag', () => {
    expect(hasAgregarrLabel(['favourites'])).toBe(false);
    expect(hasAgregarrLabel([])).toBe(false);
    expect(hasAgregarrLabel(undefined)).toBe(false);
  });
});

describe('isMultiCollectionPattern', () => {
  it('names the two configs that generate more than one collection', () => {
    expect(
      isMultiCollectionPattern({ type: 'overseerr', subtype: 'users' })
    ).toBe(true);
    expect(
      isMultiCollectionPattern({ type: 'tmdb', subtype: 'auto_franchise' })
    ).toBe(true);
  });

  // The presence half: everything else must store its key, or the create path
  // has nothing to recover from.
  it('lets ordinary configs store a key', () => {
    expect(
      isMultiCollectionPattern({ type: 'tmdb', subtype: 'trending' })
    ).toBe(false);
    expect(
      isMultiCollectionPattern({ type: 'overseerr', subtype: 'requests' })
    ).toBe(false);
    expect(isMultiCollectionPattern({ type: 'plex' })).toBe(false);
    expect(isMultiCollectionPattern(undefined)).toBe(false);
  });

  it('does not match on the subtype alone', () => {
    expect(isMultiCollectionPattern({ type: 'plex', subtype: 'users' })).toBe(
      false
    );
  });
});

describe('buildPromotedSortTitle', () => {
  it('zero-pads the rank to the fixed width and prefixes with !', () => {
    expect(buildPromotedSortTitle('Omega Collection', 13)).toBe(
      '!00013_Omega Collection'
    );
    expect(buildPromotedSortTitle('IMDb Popular', 1)).toBe(
      '!00001_IMDb Popular'
    );
  });

  it('clamps negative ranks to 0 rather than producing a malformed prefix', () => {
    expect(buildPromotedSortTitle('Name', -5)).toBe('!00000_Name');
  });

  it('does not truncate ranks that exceed the padding width - it just stops padding', () => {
    const huge = 10 ** PROMOTED_SORT_TITLE_RANK_WIDTH + 23;
    expect(buildPromotedSortTitle('Name', huge)).toBe(`!${huge}_Name`);
  });

  it('never depends on any other collection - same rank always produces the same title', () => {
    // The whole point of positional encoding: unlike an exclamation count
    // (which needs the max across every other promoted collection), a
    // rank's sortTitle is a pure function of its own two arguments.
    expect(buildPromotedSortTitle('Name', 42)).toBe(
      buildPromotedSortTitle('Name', 42)
    );
  });

  it('a promoted title always sorts before its own natural (unprefixed) name', () => {
    const natural = 'Apple Collection';
    const promoted = buildPromotedSortTitle(natural, 1);
    expect([natural, promoted].sort()[0]).toBe(promoted);
  });

  it('theoretical scale: 230 promoted collections sort in exact rank order, mixing regular and pre-existing origins', () => {
    // Simulates a library with 230 promoted collections - the scenario
    // called out for testing. Half are "regular" (Agregarr-built), half
    // are "pre-existing" - buildPromotedSortTitle takes no notion of type
    // at all, so mixing them is not a special case, just two label sets
    // sharing one rank sequence exactly like drag-and-drop already does.
    const total = 230;
    const items = Array.from({ length: total }, (_, i) => {
      const rank = i + 1; // sortOrderLibrary is 1-indexed in practice
      const origin = rank % 2 === 0 ? 'PreExisting' : 'Regular';
      const name = `${origin} Collection ${rank}`;
      return { rank, name, sortTitle: buildPromotedSortTitle(name, rank) };
    });

    const sortedByTitle = [...items].sort((a, b) =>
      a.sortTitle < b.sortTitle ? -1 : a.sortTitle > b.sortTitle ? 1 : 0
    );

    expect(sortedByTitle.map((i) => i.rank)).toEqual(items.map((i) => i.rank));
  });

  it('theoretical scale: adding a 231st promoted collection to a 230-item library changes no existing sortTitle', () => {
    // The concrete failure mode this redesign eliminates: under the old
    // exclamation-count scheme, every existing collection's count was
    // computed relative to the max sortOrderLibrary across the whole
    // library, so adding one more promoted collection at the bottom
    // (raising that max) required rewriting every other collection's
    // sortTitle too. Positional encoding has no such dependency.
    const total = 230;
    const before = Array.from({ length: total }, (_, i) => {
      const rank = i + 1;
      return buildPromotedSortTitle(`Collection ${rank}`, rank);
    });

    // A 231st collection joins at the bottom - nobody else's rank changes.
    const after = Array.from({ length: total }, (_, i) => {
      const rank = i + 1;
      return buildPromotedSortTitle(`Collection ${rank}`, rank);
    });
    buildPromotedSortTitle('Collection 231', total + 1); // the new arrival

    expect(after).toEqual(before);
  });
});

describe('parseTypedRepositionRank', () => {
  it('parses a rank out of exactly what buildPromotedSortTitle would produce for that collection', () => {
    const name = 'IMDb Popular';
    const sortTitle = buildPromotedSortTitle(name, 19);
    expect(parseTypedRepositionRank(sortTitle, name)).toBe(19);
  });

  it('is not fooled by leading zeros - "000019" parses the same as "00019"', () => {
    expect(parseTypedRepositionRank('!000019_Name', 'Name')).toBe(19);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseTypedRepositionRank('  !00019_Name  ', 'Name')).toBe(19);
  });

  it('returns undefined when the name suffix does not match this collection - a literal override, not a reposition', () => {
    expect(
      parseTypedRepositionRank('!00019_Some Other Name', 'IMDb Popular')
    ).toBeUndefined();
  });

  it('returns undefined for arbitrary literal overrides that do not follow the rank format', () => {
    expect(
      parseTypedRepositionRank('0Force This First', 'IMDb Popular')
    ).toBeUndefined();
    expect(parseTypedRepositionRank('', 'IMDb Popular')).toBeUndefined();
    expect(
      parseTypedRepositionRank('IMDb Popular', 'IMDb Popular')
    ).toBeUndefined();
  });

  it('rejects a rank of 0 - ranks are 1-indexed, and 0 has no valid target position', () => {
    expect(parseTypedRepositionRank('!00000_Name', 'Name')).toBeUndefined();
  });

  it('rejects a negative-looking rank - the leading "-" breaks the digit-only match', () => {
    expect(parseTypedRepositionRank('!-5_Name', 'Name')).toBeUndefined();
  });

  it('requires the underscore separator - digits butted against the name are not a match', () => {
    expect(parseTypedRepositionRank('!00019Name', 'Name')).toBeUndefined();
  });

  it('is the exact inverse of buildPromotedSortTitle across a range of ranks', () => {
    const name = 'Some Collection';
    for (const rank of [1, 2, 5, 19, 100, 99999]) {
      const sortTitle = buildPromotedSortTitle(name, rank);
      expect(parseTypedRepositionRank(sortTitle, name)).toBe(rank);
    }
  });
});
