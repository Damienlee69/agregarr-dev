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
