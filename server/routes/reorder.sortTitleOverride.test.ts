import { describe, expect, it } from 'vitest';

import {
  shouldClearSortTitleOverride,
  type ReorderOverrideCandidate,
} from './reorder';

/**
 * A drag posts the whole library, so the override decision has to single out
 * the collection that actually moved. The neighbour case is the one that
 * regressed: dragging A past B cleared C's override as well.
 */
describe('shouldClearSortTitleOverride', () => {
  const promotedWithOverride = (rank: number): ReorderOverrideCandidate => ({
    sortOrderLibrary: rank,
    isLibraryPromoted: true,
    sortTitleOverride: 'ZZZ',
  });

  it('clears the override on the collection whose rank changed', () => {
    expect(
      shouldClearSortTitleOverride(
        promotedWithOverride(3),
        'sortOrderLibrary',
        7
      )
    ).toBe(true);
  });

  it('leaves an untouched overridden neighbour alone', () => {
    // Same rank in and out: this row was only along for the ride because the
    // client posts every promoted collection on a drag.
    expect(
      shouldClearSortTitleOverride(
        promotedWithOverride(5),
        'sortOrderLibrary',
        5
      )
    ).toBe(false);
  });

  it('ignores a collection with no override', () => {
    expect(
      shouldClearSortTitleOverride(
        { sortOrderLibrary: 3, isLibraryPromoted: true },
        'sortOrderLibrary',
        7
      )
    ).toBe(false);
  });

  it('ignores an A-Z collection', () => {
    expect(
      shouldClearSortTitleOverride(
        {
          sortOrderLibrary: 0,
          isLibraryPromoted: false,
          sortTitleOverride: 'ZZZ',
        },
        'sortOrderLibrary',
        4
      )
    ).toBe(false);
  });

  it('ignores a home-screen reorder, which is a different ordering', () => {
    expect(
      shouldClearSortTitleOverride(promotedWithOverride(3), 'sortOrderHome', 7)
    ).toBe(false);
  });
});
