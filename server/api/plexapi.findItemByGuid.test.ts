import { describe, expect, it, vi } from 'vitest';
import type { PlexLibraryItem } from './plexapi';
import PlexAPI from './plexapi';

const GUID = 'plex://movie/aaaaaaaaaaaaaaaaaaaaaaaa';

const call = (query: ReturnType<typeof vi.fn>) =>
  (
    PlexAPI.prototype.findItemByGuid as (
      this: { plexClient: { query: typeof query } },
      libraryId: string,
      guid: string
    ) => Promise<PlexLibraryItem | undefined>
  ).call({ plexClient: { query } }, '4', GUID);

describe('findItemByGuid', () => {
  it('queries the library by encoded guid with guids included', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ MediaContainer: { Metadata: [] } });
    await call(query);
    expect(query).toHaveBeenCalledWith(
      `/library/sections/4/all?guid=${encodeURIComponent(GUID)}&includeGuids=1`
    );
  });

  it('returns the first match', async () => {
    const query = vi.fn().mockResolvedValue({
      MediaContainer: {
        Metadata: [{ ratingKey: '200' }, { ratingKey: '201' }],
      },
    });
    expect((await call(query))?.ratingKey).toBe('200');
  });

  it('returns undefined when nothing matches', async () => {
    const empty = vi.fn().mockResolvedValue({ MediaContainer: { size: 0 } });
    expect(await call(empty)).toBeUndefined();
    const none = vi
      .fn()
      .mockResolvedValue({ MediaContainer: { Metadata: [] } });
    expect(await call(none)).toBeUndefined();
  });
});
