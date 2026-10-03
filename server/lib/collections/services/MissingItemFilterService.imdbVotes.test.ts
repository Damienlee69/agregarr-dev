import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRatings: vi.fn(),
  getMovie: vi.fn(),
}));

vi.mock('@server/api/imdbRatings', () => ({
  default: class {
    getRatings = mocks.getRatings;
  },
}));
vi.mock('@server/api/rottentomatoes', () => ({ default: class {} }));
vi.mock('@server/api/themoviedb', () => ({
  default: class {
    getMovie = mocks.getMovie;
  },
}));
vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { MissingItem } from '@server/lib/collections/core/types';
import type { CollectionConfig } from '@server/lib/settings';
import logger from '@server/logger';
import { MissingItemFilterService } from './MissingItemFilterService';

const items = [1, 2, 3, 4].map((tmdbId) => ({
  tmdbId,
  title: `Movie ${tmdbId}`,
  year: 2020,
  mediaType: 'movie',
})) as MissingItem[];

// tmdbId -> [rating, votes]
const data: Record<number, [number | null, number | null]> = {
  1: [8.0, 5000],
  2: [9.0, 12],
  3: [8.5, null],
  4: [6.0, 90000],
};

function makeConfig(overrides: Partial<CollectionConfig>): CollectionConfig {
  return {
    id: 'c',
    name: 'C',
    type: 'tmdb',
    subtype: 'popular',
    libraryId: '1',
    libraryName: 'Movies',
    searchMissingMovies: true,
    searchMissingTV: true,
    ...overrides,
  } as CollectionConfig;
}

async function run(overrides: Partial<CollectionConfig>) {
  const result = await new MissingItemFilterService().filterMissingItems(
    items,
    makeConfig(overrides),
    'test'
  );
  return result.filteredItems.map((i) => i.tmdbId);
}

describe('minimumImdbVotes', () => {
  beforeEach(() => {
    mocks.getMovie.mockReset();
    mocks.getRatings.mockReset();
    mocks.getMovie.mockImplementation(async ({ movieId }) => ({
      imdb_id: `tt${movieId}`,
    }));
    mocks.getRatings.mockImplementation(async (ids: string[]) =>
      ids.map((id) => {
        const [rating, votes] = data[Number(id.slice(2))];
        return { imdbId: id, rating, votes };
      })
    );
  });

  it.each([
    ['unset', {}],
    ['explicit 0', { minimumImdbRating: 0, minimumImdbVotes: 0 }],
  ])('%s makes no TMDB or IMDb calls and drops nothing', async (_n, cfg) => {
    const res = await new MissingItemFilterService().filterMissingItems(
      items,
      makeConfig(cfg),
      'test'
    );
    expect(res.filteredItems.map((i) => i.tmdbId)).toEqual([1, 2, 3, 4]);
    expect(res.lowRatedItems).toEqual([]);
    expect(res.lowVotedItems).toEqual([]);
    expect(mocks.getMovie).not.toHaveBeenCalled();
    expect(mocks.getRatings).not.toHaveBeenCalled();
  });

  it('votes-only: item with no IMDb id is excluded and counted as votes', async () => {
    mocks.getMovie.mockImplementation(async ({ movieId }) => ({
      imdb_id: movieId === 4 ? undefined : `tt${movieId}`,
    }));
    const res = await new MissingItemFilterService().filterMissingItems(
      items,
      makeConfig({ minimumImdbVotes: 1000 }),
      'test'
    );
    expect(res.filteredItems.map((i) => i.tmdbId)).toEqual([1]);
    expect(res.lowVotedItems).toEqual(['Movie 2', 'Movie 3', 'Movie 4']);
    expect(res.lowRatedItems).toEqual([]);
  });

  it('rating set: item with no IMDb id stays attributed to rating', async () => {
    mocks.getMovie.mockImplementation(async ({ movieId }) => ({
      imdb_id: movieId === 4 ? undefined : `tt${movieId}`,
    }));
    const res = await new MissingItemFilterService().filterMissingItems(
      items,
      makeConfig({ minimumImdbRating: 7 }),
      'test'
    );
    expect(res.lowRatedItems).toEqual(['Movie 4']);
    expect(res.lowVotedItems).toEqual([]);
  });

  it('rating-only behaviour is unchanged', async () => {
    expect(await run({ minimumImdbRating: 7 })).toEqual([1, 2, 3]);
  });

  it('drops items below the vote threshold and items with unknown votes', async () => {
    expect(await run({ minimumImdbVotes: 1000 })).toEqual([1, 4]);
  });

  it('combines with the rating threshold', async () => {
    expect(await run({ minimumImdbRating: 7, minimumImdbVotes: 1000 })).toEqual(
      [1]
    );
  });

  it('reports vote drops separately from rating drops', async () => {
    const svc = new MissingItemFilterService();
    const cfg = makeConfig({ minimumImdbVotes: 1000 });
    const res = await svc.filterMissingItems(items, cfg, 'test');
    expect(res.lowRatedItems).toEqual([]);
    expect(res.lowVotedItems).toEqual(['Movie 2', 'Movie 3']);

    const infos = () =>
      vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    vi.mocked(logger.info).mockClear();
    svc.logFilteringSummary(res, cfg, 'test');
    expect(infos()).toContain(
      'Items skipped due to fewer than 1000 IMDb votes'
    );
    expect(infos().join('\n')).not.toContain('due to IMDb rating');
  });

  it('keeps the original rating summary wording when votes are unset', async () => {
    const svc = new MissingItemFilterService();
    const cfg = makeConfig({ minimumImdbRating: 7.5 });
    const res = await svc.filterMissingItems(items, cfg, 'test');
    expect(res.lowVotedItems).toEqual([]);
    vi.mocked(logger.info).mockClear();
    svc.logFilteringSummary(res, cfg, 'test');
    const msgs = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(msgs).toContain('Items skipped due to IMDb rating below 7.5');
    expect(msgs.join('\n')).not.toContain('IMDb votes');
  });
});
