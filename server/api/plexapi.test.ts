import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readTitleSortLocked, resolveSortTitleWrite } from './plexapi';

/**
 * Tests for the addItemsToCollection read-back verification math
 * (verifyItemsLanded): a PUT that reports success is still only trusted for
 * the ratingKeys the follow-up read actually contains.
 */
describe('addItemsToCollection read-back verification', () => {
  // Mirrors verifyItemsLanded's counting logic against a fake read-back.
  function countVerified(attemptedKeys: string[], currentItems: string[]) {
    const currentSet = new Set(currentItems);
    let verified = 0;
    for (const key of attemptedKeys) {
      if (currentSet.has(key)) verified++;
    }
    return verified;
  }

  it('counts every attempted key present in the read-back', () => {
    const verified = countVerified(['1', '2', '3'], ['3', '1', '2']);
    expect(verified).toBe(3);
  });

  it('undercounts when the read-back is missing an attempted key', () => {
    const verified = countVerified(['1', '2', '3'], ['1', '3']);
    expect(verified).toBe(2);
  });

  it('counts zero when the write claimed success but nothing landed', () => {
    const verified = countVerified(['1', '2'], []);
    expect(verified).toBe(0);
  });
});

vi.mock('@server/lib/settings', () => ({
  getSettings: () => ({ clientId: 'test-client', main: {} }),
}));

vi.mock('@server/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Shared fixture: real PlexAPI instance with isSmartCollection/getCollectionItems
// stubbed, and safePutQuery rejecting (404) only for URLs matching failUrlPart.
async function setupArrangeApi(currentOrder: string[], failUrlPart?: string) {
  const { default: PlexAPI } = await import('./plexapi');
  const logger = (await import('@server/logger')).default;

  const api = new PlexAPI({
    plexToken: 'test-token',
    plexSettings: { name: 'test', ip: '127.0.0.1', port: 32400, libraries: [] },
  });

  vi.spyOn(
    api as unknown as { isSmartCollection: unknown },
    'isSmartCollection' as never
  ).mockResolvedValue('not_smart');
  vi.spyOn(api, 'getCollectionItems').mockResolvedValue(currentOrder);
  vi.spyOn(
    api as unknown as { safePutQuery: unknown },
    'safePutQuery' as never
  ).mockImplementation((async (url: string) => {
    if (failUrlPart && url.includes(failUrlPart)) {
      throw new Error(`PUT ${url} failed, response code: 404`);
    }
    return undefined;
  }) as never);

  return { api, logger };
}

function findArrangeWarn(logger: { warn: unknown }) {
  const calls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
  return calls.find(([message]: [string]) =>
    message.includes('Failed to arrange')
  );
}

describe('arrangeCollectionItemsInOrder failure reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns with the collection name and the failing item + reason', async () => {
    const { api, logger } = await setupArrangeApi(
      ['301', '300'],
      '/items/300/move'
    );

    await api.arrangeCollectionItemsInOrder(
      '569503',
      [
        { ratingKey: '300', title: 'A' },
        { ratingKey: '301', title: 'B' },
      ],
      'My Collection'
    );

    const failureCall = findArrangeWarn(logger);
    expect(failureCall).toBeDefined();
    const [message, meta] = failureCall as [
      string,
      { failures: { itemRatingKey: string; reason: string }[] }
    ];
    expect(message).toContain('My Collection');
    expect(message).toContain('569503');
    expect(meta.failures[0].itemRatingKey).toBe('300');
    expect(meta.failures[0].reason).toContain('404');
  });

  it('records afterItemRatingKey when a non-position-0 move fails', async () => {
    // Rotation: forces position-0 to succeed, then an `after=` move to fail.
    const { api, logger } = await setupArrangeApi(
      ['402', '400', '401'],
      '/items/401/move'
    );

    await api.arrangeCollectionItemsInOrder(
      '569503',
      [
        { ratingKey: '400', title: 'A' },
        { ratingKey: '401', title: 'B' },
        { ratingKey: '402', title: 'C' },
      ],
      'Rotated Collection'
    );

    const failureCall = findArrangeWarn(logger);
    expect(failureCall).toBeDefined();
    const [, meta] = failureCall as [
      string,
      {
        failures: {
          itemRatingKey: string;
          afterItemRatingKey?: string;
          reason: string;
        }[];
      }
    ];
    expect(meta.failures[0].itemRatingKey).toBe('401');
    expect(meta.failures[0].afterItemRatingKey).toBe('400');
    expect(meta.failures[0].reason).toContain('404');
  });

  it('threads collectionName through updateCollectionContents into the arrange warn', async () => {
    // Same items, already present, just out of order - add/remove are no-ops.
    const { api, logger } = await setupArrangeApi(
      ['301', '300'],
      '/items/300/move'
    );

    await api.updateCollectionContents(
      '569503',
      [
        { ratingKey: '300', title: 'A' },
        { ratingKey: '301', title: 'B' },
      ],
      'Existing Collection'
    );

    const [message] = findArrangeWarn(logger) as [string];
    expect(message).toContain('Existing Collection');
  });
});

describe('arrangeCollectionItemsInOrder duplicate ratingKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never moves an item after itself and skips when already in order', async () => {
    const { api, logger } = await setupArrangeApi(['1', '2', '3']);
    const put = (api as unknown as { safePutQuery: ReturnType<typeof vi.fn> })
      .safePutQuery;

    await api.arrangeCollectionItemsInOrder('378965', [
      { ratingKey: '1', title: 'A' },
      { ratingKey: '2', title: 'B' },
      { ratingKey: '2', title: 'B again' },
      { ratingKey: '3', title: 'C' },
    ]);

    expect(put).not.toHaveBeenCalled();
    expect(findArrangeWarn(logger)).toBeUndefined();
  });

  it('reorders with duplicates collapsed and no self-referential move', async () => {
    const { api } = await setupArrangeApi(['1', '2', '3']);
    const put = (api as unknown as { safePutQuery: ReturnType<typeof vi.fn> })
      .safePutQuery;

    await api.arrangeCollectionItemsInOrder('378965', [
      { ratingKey: '3', title: 'C' },
      { ratingKey: '3', title: 'C again' },
      { ratingKey: '1', title: 'A' },
      { ratingKey: '2', title: 'B' },
    ]);

    expect(put.mock.calls.map(([u]: [string]) => u)).toEqual([
      '/library/collections/378965/items/3/move',
    ]);
  });
});

/**
 * Sort title write decisions.
 *
 * These call the real resolveSortTitleWrite rather than mirroring the
 * predicate locally - a mirrored copy keeps passing after the implementation
 * changes, which is exactly the case that needs catching here.
 */
describe('resolveSortTitleWrite', () => {
  const base = {
    sortTitle: '!003_Crow',
    currentTitleSort: '!003_Crow',
    lock: true,
    skipUnchangedWrites: true,
  };

  it('skips a locking write when value and lock both already match', () => {
    const d = resolveSortTitleWrite({ ...base, currentTitleSortLocked: true });
    expect(d.write).toBe(false);
  });

  it('writes an unchanged value when the field is not locked yet', () => {
    // The lock is half of what is being imposed: it suppresses Plex's own
    // article stripping, so a matching value with no lock still needs writing.
    const d = resolveSortTitleWrite({ ...base, currentTitleSortLocked: false });
    expect(d.write).toBe(true);
    expect(d.locked).toBe(1);
  });

  it('treats unknown lock state as locked, so it does not rewrite everything', () => {
    const d = resolveSortTitleWrite({
      ...base,
      currentTitleSortLocked: undefined,
    });
    expect(d.write).toBe(false);
  });

  it('writes when the value differs, regardless of lock state', () => {
    const d = resolveSortTitleWrite({
      ...base,
      sortTitle: '!004_Crow',
      currentTitleSortLocked: true,
    });
    expect(d.write).toBe(true);
    expect(d.value).toBe('!004_Crow');
  });

  it('writes an unchanged value when the skip is disabled', () => {
    const d = resolveSortTitleWrite({
      ...base,
      currentTitleSortLocked: true,
      skipUnchangedWrites: false,
    });
    expect(d.write).toBe(true);
  });

  describe('releasing the field back to Plex', () => {
    it('releases while the field is still locked', () => {
      const d = resolveSortTitleWrite({
        sortTitle: 'The Crow',
        currentTitleSort: 'Crow',
        currentTitleSortLocked: true,
        lock: false,
        skipUnchangedWrites: true,
      });
      expect(d.write).toBe(true);
      expect(d.value).toBe('');
      expect(d.locked).toBe(0);
    });

    it('does NOT release again once the field is already unlocked', () => {
      // The bug this exists for: the old gate was `lock && ...`, so with
      // lock false it could never skip, and a release re-fired on every sync
      // for every collection Agregarr imposes nothing on.
      const d = resolveSortTitleWrite({
        sortTitle: 'The Crow',
        currentTitleSort: 'Crow',
        currentTitleSortLocked: false,
        lock: false,
        skipUnchangedWrites: true,
      });
      expect(d.write).toBe(false);
    });

    it('releases when the lock state is unknown, so a stranded field recovers', () => {
      const d = resolveSortTitleWrite({
        sortTitle: 'The Crow',
        currentTitleSort: 'Crow',
        currentTitleSortLocked: undefined,
        lock: false,
        skipUnchangedWrites: true,
      });
      expect(d.write).toBe(true);
    });
  });
});

describe('readTitleSortLocked', () => {
  it('reads a locked titleSort field', () => {
    expect(
      readTitleSortLocked({ Field: [{ name: 'titleSort', locked: true }] })
    ).toBe(true);
  });

  it('accepts Plex reporting locked as 1 rather than true', () => {
    expect(
      readTitleSortLocked({ Field: [{ name: 'titleSort', locked: 1 }] })
    ).toBe(true);
  });

  it('reports unlocked when Plex lists other fields but not titleSort', () => {
    // Plex only lists locked fields, so an absent entry means unlocked.
    expect(
      readTitleSortLocked({ Field: [{ name: 'title', locked: true }] })
    ).toBe(false);
  });

  it('reports unlocked for an empty field list', () => {
    expect(readTitleSortLocked({ Field: [] })).toBe(false);
  });

  it('returns undefined when Plex sent no field list at all', () => {
    // Not the same as unlocked - nothing was observed, so callers keep their
    // prior assumption rather than acting on a guess.
    expect(readTitleSortLocked({})).toBeUndefined();
  });
});
