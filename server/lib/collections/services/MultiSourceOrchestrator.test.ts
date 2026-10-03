import type { PlexCollection } from '@server/lib/collections/core/types';
import type { MultiSourceCollectionConfig } from '@server/lib/settings';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@server/datasource', () => ({ getRepository: vi.fn() }));
vi.mock('@server/entity/CollectionMetadata', () => ({
  CollectionMetadata: class {},
}));
vi.mock('@server/entity/CollectionMissingItems', () => ({
  CollectionMissingItems: class {},
}));
vi.mock('@server/entity/PosterTemplate', () => ({ PosterTemplate: class {} }));
vi.mock('@server/entity/User', () => ({ User: class {} }));
vi.mock('@server/api/imdbRatings', () => ({ default: class {} }));
vi.mock('@server/lib/cache', () => ({ default: { getCache: vi.fn() } }));
vi.mock('@server/lib/posterStorage', () => ({ generatePoster: vi.fn() }));
vi.mock('@server/lib/collections/services/ServiceUserManager', () => ({
  serviceUserManager: {},
}));
vi.mock('@server/lib/collections/utils/TemplateEngine', () => ({
  templateEngine: {},
}));
vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@server/lib/settings', () => ({
  getSettings: () => ({
    plex: { libraries: [{ key: '4', type: 'movie' }], collectionConfigs: [] },
    save: vi.fn(),
  }),
}));

import { MultiSourceOrchestrator } from './MultiSourceOrchestrator';

type Internals = {
  createOrUpdatePlexCollection: (...a: unknown[]) => Promise<unknown>;
  createOrUpdateCollectionStandardized: (...a: unknown[]) => Promise<unknown>;
  fetchItemsFromSource: (...a: unknown[]) => Promise<unknown>;
  processMultiSourceCollection: (...a: unknown[]) => Promise<{
    error?: string;
    warning?: string;
  }>;
  findExistingMultiSourceCollection: (...a: unknown[]) => PlexCollection | null;
};

const internals = () => new MultiSourceOrchestrator() as unknown as Internals;

const config = (overrides: Partial<MultiSourceCollectionConfig> = {}) =>
  ({
    id: '10',
    name: 'Mix',
    type: 'multi-source',
    libraryId: '4',
    libraryName: 'Movies',
    ...overrides,
  } as MultiSourceCollectionConfig);

describe('multi-source target user label', () => {
  const labelUsed = async (cfg: MultiSourceCollectionConfig) => {
    const o = internals();
    const spy = vi
      .spyOn(o, 'createOrUpdateCollectionStandardized')
      .mockResolvedValue({ created: 0, updated: 0 });
    await o.createOrUpdatePlexCollection([], cfg, {}, []);
    return (spy.mock.calls[0][3] as { customLabel: string }).customLabel;
  };

  it('labels the collection with the target-user label', async () => {
    expect(await labelUsed(config({ targetUserId: '1001' }))).toBe(
      'AgregarrTargetUser_10_1001'
    );
  });

  it('keeps the multi-source label without a target user', async () => {
    expect(await labelUsed(config())).toBe('Agregarrmulti-source10');
  });
});

describe('multi-source lookup of a target-user collection', () => {
  it('finds it by label when the stored ratingKey is stale', () => {
    const collection = {
      ratingKey: '700',
      title: 'Something Else',
      libraryKey: '4',
      labels: ['AgregarrTargetUser_10_1001'],
    } as unknown as PlexCollection;

    const found = internals().findExistingMultiSourceCollection(
      '10',
      'Mix',
      '4',
      [collection],
      '999'
    );

    expect(found?.ratingKey).toBe('700');
  });
});

describe('multi-source run with failing sources', () => {
  const sources = [
    { id: 'source-1', type: 'trakt', resolvedTitle: 'Alpha List' },
    {
      id: 'source-2',
      type: 'imdb',
      customUrl: 'https://example.test/lists/beta',
    },
  ];
  const item = { ratingKey: '1', title: 'One', type: 'movie', tmdbId: 1 };

  const run = async (outcomes: ('ok' | 'fail')[], fetchSource = vi.fn()) => {
    const o = internals();
    outcomes.forEach((x) =>
      x === 'ok'
        ? fetchSource.mockResolvedValueOnce({ items: [item] })
        : fetchSource.mockRejectedValueOnce(new Error('upstream 403'))
    );
    vi.spyOn(o, 'fetchItemsFromSource').mockImplementation(fetchSource);
    const write = vi
      .spyOn(o, 'createOrUpdatePlexCollection')
      .mockResolvedValue({ created: 0, updated: 1 });
    const result = await o.processMultiSourceCollection(
      config({ sources, combineMode: 'list_order' } as never),
      {},
      []
    );
    return { result, write, fetchSource };
  };

  it('updates with the surviving items and reports the failure', async () => {
    const { result, write } = await run(['ok', 'fail']);

    expect(write.mock.calls[0][0]).toEqual([
      expect.objectContaining({ ratingKey: '1' }),
    ]);
    expect(result.error).toBe('1/2 source(s) failed (beta): upstream 403');
  });

  it('reports the failure when every source fails', async () => {
    const { result, write } = await run(['fail', 'fail']);

    expect(write).not.toHaveBeenCalled();
    expect(result.error).toBe(
      '2/2 source(s) failed (Alpha List, beta): upstream 403'
    );
  });

  it('reports nothing when every source succeeds', async () => {
    const { result, write, fetchSource } = await run(['ok', 'ok']);

    expect(fetchSource).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
  });

  it.each([
    ['https://example.test/lists/beta?apikey=SECRET#frag', 'beta'],
    ['not a url?token=SECRET', 'not a url'],
    [`https://example.test/${'x'.repeat(100)}`, 'x'.repeat(60)],
  ])('labels a failed source from %s as %s', async (customUrl, label) => {
    const o = internals();
    vi.spyOn(o, 'fetchItemsFromSource').mockRejectedValue(new Error('down'));
    const result = await o.processMultiSourceCollection(
      config({
        sources: [{ id: 's', type: 'trakt', customUrl }],
        combineMode: 'list_order',
      } as never),
      {},
      []
    );

    expect(result.error).toBe(`1/1 source(s) failed (${label}): down`);
  });

  it('names a source with nothing to label it by its position', async () => {
    const o = internals();
    vi.spyOn(o, 'fetchItemsFromSource').mockRejectedValue(new Error('down'));
    const result = await o.processMultiSourceCollection(
      config({
        sources: [{ id: 's' }, { id: 't' }],
        combineMode: 'list_order',
      } as never),
      {},
      []
    );

    expect(result.error).toBe(
      '2/2 source(s) failed (source 1, source 2): down'
    );
  });

  it('lets fetchItemsFromSource failures propagate', async () => {
    const o = internals() as unknown as {
      getSyncService: (t: string) => unknown;
    } & Internals;
    vi.spyOn(o, 'getSyncService').mockReturnValue({
      fetchSourceData: () => Promise.reject(new Error('boom')),
    });

    await expect(
      o.fetchItemsFromSource(sources[0], config(), {})
    ).rejects.toThrow('boom');
  });
});
