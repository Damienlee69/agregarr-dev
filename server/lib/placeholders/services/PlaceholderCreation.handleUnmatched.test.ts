import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPlexItemsByTitle: vi.fn(),
  removePlaceholder: vi.fn(),
  readPlaceholderMarker: vi.fn(),
  recordUnmatchedPlaceholder: vi.fn(),
  removeGhostEntries: vi.fn(),
}));

vi.mock('@server/lib/collections/core/CollectionUtilities', () => ({
  findPlexItemsByTitle: mocks.findPlexItemsByTitle,
}));
vi.mock('@server/lib/placeholders/placeholderManager', () => ({
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

async function run() {
  const excluded = new Set<number>();
  await handleUnmatchedPlaceholders(
    [item] as never,
    { libraryId: '17' } as never,
    {} as never,
    new Map(),
    excluded,
    new Map([[item.tmdbId, '/data/coming/Spider-Man (2026)/file.mp4']])
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
    expect(mocks.removePlaceholder).not.toHaveBeenCalled();
    expect(mocks.recordUnmatchedPlaceholder).not.toHaveBeenCalled();
    expect(excluded.size).toBe(0);
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
