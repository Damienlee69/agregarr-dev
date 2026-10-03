import type PlexAPI from '@server/api/plexapi';
import type { CollectionConfig } from '@server/lib/settings';
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
  getSettings: () => ({
    globalExclusions: { movies: [555], tv: [], tvdb: [] },
    plex: {
      collectionConfigs: [],
      libraries: [
        { key: '4', name: 'Movies', type: 'movie' },
        { key: '5', name: 'Shows', type: 'show' },
      ],
    },
  }),
}));

import { TautulliCollectionSync } from './tautulli';

const notFound = new Error(
  'Plex Server didnt respond with a valid 2xx status code, response code: 404'
);
const GUID = 'plex://movie/aaaaaaaaaaaaaaaaaaaaaaaa';

const run = async (
  row: Record<string, unknown>,
  getMetadata: ReturnType<typeof vi.fn>,
  findItemByGuid: ReturnType<typeof vi.fn>
) => {
  const sync = new TautulliCollectionSync();
  const config = {
    id: '1',
    name: 'Popular',
    type: 'tautulli',
    subtype: 'most_popular_movies',
    libraryId: '4',
    mediaType: 'movie',
    minimumPlays: 1,
  } as unknown as CollectionConfig;
  const plex = { getMetadata, findItemByGuid } as unknown as PlexAPI;
  const result = await sync.mapSourceDataToItems(
    [
      {
        title: 'Some Movie',
        media_type: 'movie',
        users_watched: 5,
        total_plays: 5,
        ...row,
      },
    ],
    config,
    plex
  );
  return result.items;
};

describe('Tautulli stale rating key', () => {
  it('resolves a stale key through the row guid', async () => {
    const find = vi.fn().mockResolvedValue({
      ratingKey: '200',
      Guid: [{ id: 'tmdb://555' }, { id: 'tvdb://77' }],
    });
    const items = await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockRejectedValue(notFound),
      find
    );
    expect(find).toHaveBeenCalledWith('4', GUID);
    expect(items.map((i) => i.ratingKey)).toEqual(['200']);
    expect(items[0].tmdbId).toBe(555);
    expect(items[0].tvdbId).toBe(77);
  });

  it('keeps the stale key when the guid resolves nothing', async () => {
    const find = vi.fn().mockResolvedValue(undefined);
    const items = await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockRejectedValue(notFound),
      find
    );
    expect(find).toHaveBeenCalledWith('4', GUID);
    expect(items.map((i) => i.ratingKey)).toEqual(['100']);
  });

  it('keeps the stale key when the guid lookup throws', async () => {
    const find = vi.fn().mockRejectedValue(new Error('response code: 500'));
    const items = await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockRejectedValue(notFound),
      find
    );
    expect(find).toHaveBeenCalledWith('4', GUID);
    expect(items.map((i) => i.ratingKey)).toEqual(['100']);
  });

  it('skips without a lookup when a stale row has no guid', async () => {
    const find = vi.fn();
    const items = await run(
      { rating_key: '100' },
      vi.fn().mockRejectedValue(notFound),
      find
    );
    expect(find).not.toHaveBeenCalled();
    expect(items.map((i) => i.ratingKey)).toEqual(['100']);
  });

  it('does no guid lookup for a healthy key', async () => {
    const find = vi.fn();
    const items = await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockResolvedValue({ Guid: [] }),
      find
    );
    expect(find).not.toHaveBeenCalled();
    expect(items.map((i) => i.ratingKey)).toEqual(['100']);
  });

  it('does no guid lookup on a non-404 failure', async () => {
    const find = vi.fn();
    await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockRejectedValue(new Error('response code: 500')),
      find
    );
    expect(find).not.toHaveBeenCalled();
  });

  it('does not resolve TV rows by guid', async () => {
    const find = vi.fn();
    const sync = new TautulliCollectionSync();
    const plex = {
      getMetadata: vi.fn().mockRejectedValue(notFound),
      findItemByGuid: find,
    } as unknown as PlexAPI;
    const result = await sync.mapSourceDataToItems(
      [
        {
          title: 'Some Show',
          media_type: 'episode',
          users_watched: 5,
          total_plays: 5,
          rating_key: '100',
          guid: 'plex://episode/aaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
      {
        id: '2',
        name: 'Popular TV',
        type: 'tautulli',
        subtype: 'most_popular_shows',
        libraryId: '5',
        mediaType: 'tv',
        minimumPlays: 1,
      } as unknown as CollectionConfig,
      plex
    );
    expect(find).not.toHaveBeenCalled();
    expect(result.items.map((i) => i.ratingKey)).toEqual(['100']);
  });

  it('excludes a guid-resolved movie that is globally excluded', async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ ratingKey: '200', Guid: [{ id: 'tmdb://555' }] });
    const items = await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockRejectedValue(notFound),
      find
    );
    const sync = new TautulliCollectionSync() as unknown as {
      applyCommonFiltering: (
        i: unknown[],
        c: unknown
      ) => { filteredItems: unknown[] };
    };
    const { filteredItems } = sync.applyCommonFiltering(items, {
      id: '1',
      name: 'Popular',
    });
    expect(filteredItems).toEqual([]);
  });
});
