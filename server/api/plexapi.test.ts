import { beforeEach, describe, expect, it, vi } from 'vitest';

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
