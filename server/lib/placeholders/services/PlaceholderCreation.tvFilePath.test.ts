import type PlexAPI from '@server/api/plexapi';
import { describe, expect, it, vi } from 'vitest';
import { getTvPlaceholderFilePath } from './PlaceholderCreation';

const FILE = '/plex/tv/Below Deck (2013)/Season 00/Below Deck - S00E01.mp4';

// Shapes probed live: a show's plain metadata has no Children key, seasons and
// episodes only come back from /children.
function mockPlex(overrides: Record<string, unknown> = {}) {
  return {
    getMetadata: vi.fn(async (key: string) =>
      key === '300' ? { Media: [{ Part: [{ file: FILE }] }] } : { title: 'x' }
    ),
    getChildrenMetadata: vi.fn(async (key: string) => {
      if (key === '100') {
        return [
          { index: 1, ratingKey: '201' },
          { index: 0, ratingKey: '200' },
        ];
      }
      if (key === '200') return [{ index: 1, ratingKey: '300' }];
      return [];
    }),
    ...overrides,
  } as unknown as PlexAPI;
}

describe('getTvPlaceholderFilePath', () => {
  it('walks show -> Season 00 -> first episode via /children', async () => {
    const plex = mockPlex();
    await expect(
      getTvPlaceholderFilePath(plex, '100', 'Below Deck')
    ).resolves.toBe(FILE);
    expect(plex.getChildrenMetadata).toHaveBeenCalledWith('100');
    expect(plex.getChildrenMetadata).toHaveBeenCalledWith('200');
  });

  it('returns undefined when there is no Season 00', async () => {
    const plex = mockPlex({
      getChildrenMetadata: vi.fn(async () => [{ index: 1, ratingKey: '201' }]),
    });
    await expect(
      getTvPlaceholderFilePath(plex, '100', 'Below Deck')
    ).resolves.toBeUndefined();
  });

  it('returns undefined when Season 00 has no episodes', async () => {
    const plex = mockPlex({
      getChildrenMetadata: vi.fn(async (key: string) =>
        key === '100' ? [{ index: 0, ratingKey: '200' }] : []
      ),
    });
    await expect(
      getTvPlaceholderFilePath(plex, '100', 'Below Deck')
    ).resolves.toBeUndefined();
  });
});
