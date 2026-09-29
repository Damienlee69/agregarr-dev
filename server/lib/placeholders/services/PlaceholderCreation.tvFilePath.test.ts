import type PlexAPI from '@server/api/plexapi';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  getTvPlaceholderFilePath,
  hasOwnershipMarker,
} from './PlaceholderCreation';

const FILE = '/plex/tv/Below Deck (2013)/Season 00/S00E00.Trailer.mp4';

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

  it('rejects a real Season 00 special that is not the trailer file', async () => {
    const plex = mockPlex({
      getMetadata: vi.fn(async () => ({
        Media: [
          {
            Part: [
              {
                file: '/plex/tv/Show (2020)/Season 00/Show - S00E01 - Pilot Preview.mkv',
              },
            ],
          },
        ],
      })),
    });
    await expect(
      getTvPlaceholderFilePath(plex, '100', 'Show')
    ).resolves.toBeUndefined();
  });

  it('accepts a Windows-style trailer path', async () => {
    const win = 'O:\\tv\\Below Deck (2013)\\Season 00\\S00E00.Trailer.mp4';
    const plex = mockPlex({
      getMetadata: vi.fn(async () => ({ Media: [{ Part: [{ file: win }] }] })),
    });
    await expect(
      getTvPlaceholderFilePath(plex, '100', 'Below Deck')
    ).resolves.toBe(win);
  });
});

describe('hasOwnershipMarker', () => {
  async function seasonDir(marker?: object) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ph-marker-'));
    await fs.writeFile(path.join(dir, 'S00E00.Trailer.mp4'), 'x');
    if (marker) {
      await fs.writeFile(path.join(dir, '.comingsoon'), JSON.stringify(marker));
    }
    return dir;
  }

  it('accepts a marker with the matching tmdbId', async () => {
    const dir = await seasonDir({ createdAt: 'x', title: 'Show', tmdbId: 5 });
    await expect(hasOwnershipMarker(dir, 5)).resolves.toBe(true);
  });

  it('rejects a trailer-named file with no marker', async () => {
    const dir = await seasonDir();
    await expect(hasOwnershipMarker(dir, 5)).resolves.toBe(false);
  });

  it('rejects a marker belonging to another tmdbId', async () => {
    const dir = await seasonDir({ createdAt: 'x', title: 'Show', tmdbId: 9 });
    await expect(hasOwnershipMarker(dir, 5)).resolves.toBe(false);
  });
});
