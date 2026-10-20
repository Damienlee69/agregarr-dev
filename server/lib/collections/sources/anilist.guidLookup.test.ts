import type PlexAPI from '@server/api/plexapi';
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
  templateEngine: { processTemplate: (t: string) => t },
}));
vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@server/lib/settings', () => ({
  getSettings: () => ({ plex: { collectionConfigs: [], libraries: [] } }),
}));

import { AnilistCollectionSync } from './anilist';

describe('AniList direct GUID lookup', () => {
  it("doesn't call PlexAPI.findItemByGuid, whose arguments are (libraryId, guid)", async () => {
    const findItemByGuid = vi.fn().mockResolvedValue(undefined);
    const sync = new AnilistCollectionSync() as unknown as {
      plexLookupByGuid: (
        c: PlexAPI,
        p: 'tmdb' | 'imdb' | 'tvdb',
        id: string,
        m: 'movie' | 'tv'
      ) => Promise<unknown>;
    };

    const hit = await sync.plexLookupByGuid(
      { findItemByGuid } as unknown as PlexAPI,
      'tmdb',
      '1001',
      'movie'
    );

    expect(findItemByGuid).not.toHaveBeenCalled();
    expect(hit).toBeNull();
  });
});
