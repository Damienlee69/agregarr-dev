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
    plex: {
      collectionConfigs: [],
      libraries: [{ key: '4', name: 'Movies', type: 'movie' }],
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
  findRatingKeyByGuid: ReturnType<typeof vi.fn>
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
  const plex = { getMetadata, findRatingKeyByGuid } as unknown as PlexAPI;
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
    const find = vi.fn().mockResolvedValue('200');
    const items = await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockRejectedValue(notFound),
      find
    );
    expect(find).toHaveBeenCalledWith('4', GUID);
    expect(items.map((i) => i.ratingKey)).toEqual(['200']);
  });

  it('keeps the stale key when the guid resolves nothing', async () => {
    const items = await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockRejectedValue(notFound),
      vi.fn().mockResolvedValue(undefined)
    );
    expect(items.map((i) => i.ratingKey)).toEqual(['100']);
  });

  it('keeps the stale key when the guid lookup throws', async () => {
    const items = await run(
      { rating_key: '100', guid: GUID },
      vi.fn().mockRejectedValue(notFound),
      vi.fn().mockRejectedValue(new Error('response code: 500'))
    );
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
});
