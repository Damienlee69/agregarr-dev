import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPlexItemsByTitle: vi.fn(),
  removePlaceholder: vi.fn(),
  readPlaceholderMarker: vi.fn(),
  recordUnmatchedPlaceholder: vi.fn(),
  removeGhostEntries: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@server/logger', () => ({
  default: {
    info: mocks.logInfo,
    error: mocks.logError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@server/lib/collections/core/CollectionUtilities', () => ({
  findPlexItemsByTitle: mocks.findPlexItemsByTitle,
}));
vi.mock('@server/lib/placeholders/placeholderManager', async (orig) => ({
  ...(await orig<object>()),
  removePlaceholder: mocks.removePlaceholder,
  readPlaceholderMarker: mocks.readPlaceholderMarker,
}));
vi.mock('@server/lib/placeholders/services/unmatchedPlaceholderCache', () => ({
  recordUnmatchedPlaceholder: mocks.recordUnmatchedPlaceholder,
  clearUnmatchedPlaceholder: vi.fn(),
  filterRecentlyUnmatched: vi.fn(),
}));
vi.mock('@server/lib/placeholders/services/PlaceholderCleanup', () => ({
  removeGhostEntries: mocks.removeGhostEntries,
}));

import { handleUnmatchedPlaceholders } from './PlaceholderCreation';

const item = {
  tmdbId: 969681,
  mediaType: 'movie' as const,
  title: 'Spider-Man: Brand New Day',
  year: 2026,
};
const guidless = {
  ratingKey: '1',
  title: item.title,
  year: 2026,
  hasTmdbGuid: false,
  hasAnyGuid: false,
};

const MOVIE_FILE = '/data/coming/Spider-Man (2026)/file.mp4';

async function run(placeholderPath = MOVIE_FILE, mediaType = 'movie') {
  const excluded = new Set<number>();
  await handleUnmatchedPlaceholders(
    [{ ...item, mediaType }] as never,
    { libraryId: '17' } as never,
    {} as never,
    new Map(),
    excluded,
    new Map([[item.tmdbId, placeholderPath]])
  );
  return excluded;
}

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 3600 * 1000).toISOString();

describe('handleUnmatchedPlaceholders guid-less Plex entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPlexItemsByTitle.mockResolvedValue([guidless]);
  });

  it('keeps a fresh placeholder and does not cache it as unmatched', async () => {
    mocks.readPlaceholderMarker.mockResolvedValue({ createdAt: hoursAgo(0.1) });
    const excluded = await run();
    expect(mocks.readPlaceholderMarker).toHaveBeenCalledWith(
      path.dirname(MOVIE_FILE)
    );
    expect(mocks.logInfo).toHaveBeenCalledWith(
      expect.stringContaining('keeping file on disk'),
      expect.objectContaining({ tmdbId: item.tmdbId })
    );
    expect(mocks.logError).not.toHaveBeenCalled();
    expect(mocks.removePlaceholder).not.toHaveBeenCalled();
    expect(mocks.recordUnmatchedPlaceholder).not.toHaveBeenCalled();
    expect(excluded.size).toBe(0);
  });

  it('deletes when createdAt is in the future (clock skew)', async () => {
    mocks.readPlaceholderMarker.mockResolvedValue({ createdAt: hoursAgo(-5) });
    await run();
    expect(mocks.removePlaceholder).toHaveBeenCalledOnce();
  });

  it('finds the real TV marker beside the trailer file', async () => {
    const actual = await vi.importActual<{
      readPlaceholderMarker: (dir: string) => Promise<unknown>;
    }>('@server/lib/placeholders/placeholderManager');
    mocks.readPlaceholderMarker.mockImplementation(
      actual.readPlaceholderMarker
    );
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-'));
    try {
      const dir = path.join(root, 'Show (2026)', 'Season 00');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.comingsoon'),
        JSON.stringify({ createdAt: hoursAgo(0.1), title: 'Show' })
      );
      const file = path.join(dir, 'S00E00.Trailer.mp4');
      fs.writeFileSync(file, 'x');
      await run(file, 'tv');
      expect(mocks.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('keeping file on disk'),
        expect.anything()
      );
      expect(mocks.removePlaceholder).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('deletes and caches once the placeholder is still guid-less after the grace period', async () => {
    mocks.readPlaceholderMarker.mockResolvedValue({ createdAt: hoursAgo(25) });
    const excluded = await run();
    expect(mocks.removePlaceholder).toHaveBeenCalledOnce();
    expect(mocks.recordUnmatchedPlaceholder).toHaveBeenCalledOnce();
    expect(excluded.has(item.tmdbId)).toBe(true);
  });

  it('deletes when the marker cannot be read', async () => {
    mocks.readPlaceholderMarker.mockResolvedValue(null);
    await run();
    expect(mocks.removePlaceholder).toHaveBeenCalledOnce();
  });

  it('leaves a title match carrying a different tmdb guid alone', async () => {
    mocks.findPlexItemsByTitle.mockResolvedValue([
      { ...guidless, tmdbId: 1, hasTmdbGuid: true, hasAnyGuid: true },
    ]);
    mocks.readPlaceholderMarker.mockResolvedValue({ createdAt: hoursAgo(48) });
    await run();
    expect(mocks.removePlaceholder).not.toHaveBeenCalled();
  });
});
