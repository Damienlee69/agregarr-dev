import type PlexAPI from '@server/api/plexapi';
import { CollectionSyncErrorType } from '@server/lib/collections/core/types';
import type { CollectionConfig } from '@server/lib/settings';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@server/datasource', () => ({ getRepository: vi.fn() }));
vi.mock('@server/api/themoviedb', () => ({ default: class {} }));
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
    plex: { collectionConfigs: [], libraries: [{ key: '1', type: 'movie' }] },
    save: vi.fn(),
  }),
}));

import { LetterboxdCollectionSync } from './letterboxd';

describe('Letterboxd source fetch failure', () => {
  it('reaches the sync result with the real cause', async () => {
    const sync = new LetterboxdCollectionSync();
    vi.spyOn(sync, 'fetchSourceData').mockRejectedValue(
      sync['createSyncError'](
        CollectionSyncErrorType.API_ERROR,
        'Failed to fetch Letterboxd data: solver in backoff'
      )
    );
    const cfg = {
      id: 'c1',
      name: 'Letterboxd List',
      type: 'letterboxd',
      subtype: 'custom_list',
      libraryId: '1',
      isActive: true,
    } as CollectionConfig;

    const result = await sync.processCollections([cfg], {} as PlexAPI, []);

    expect(result.error).toContain('solver in backoff');
    expect(result.created + result.updated).toBe(0);
  });
});
