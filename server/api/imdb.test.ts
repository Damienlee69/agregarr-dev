import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImdbAPI, { fetchImdbChart, ImdbTopList } from './imdb';

vi.mock('axios', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

// Real GraphQL response captured 24/09/2026 via:
// curl -X POST https://caching.graphql.imdb.com/ -H 'Content-Type: application/json' \
//   -H 'x-imdb-client-name: imdb-web-next' -H 'User-Agent: Mozilla/5.0' \
//   -d '{"query":"query { chartTitles(chart: {chartType: TOP_RATED_TV_SHOWS}, first: 5) { total edges { currentRank node { id titleText { text } releaseYear { year } } } } }"}'
const REAL_GRAPHQL_RESPONSE = {
  data: {
    data: {
      chartTitles: {
        total: 250,
        edges: [
          {
            currentRank: 1,
            node: {
              id: 'tt0903747',
              titleText: { text: 'Breaking Bad' },
              releaseYear: { year: 2008 },
            },
          },
          {
            currentRank: 2,
            node: {
              id: 'tt5491994',
              titleText: { text: 'Planet Earth II' },
              releaseYear: { year: 2016 },
            },
          },
          {
            currentRank: 3,
            node: {
              id: 'tt0795176',
              titleText: { text: 'Planet Earth' },
              releaseYear: { year: 2006 },
            },
          },
          {
            currentRank: 4,
            node: {
              id: 'tt0185906',
              titleText: { text: 'Band of Brothers' },
              releaseYear: { year: 2001 },
            },
          },
          {
            currentRank: 5,
            node: {
              id: 'tt7366338',
              titleText: { text: 'Chernobyl' },
              releaseYear: { year: 2019 },
            },
          },
        ],
      },
    },
  },
};

// Real GraphQL response captured 24/09/2026 via:
// curl -X POST https://caching.graphql.imdb.com/ -H 'Content-Type: application/json' \
//   -H 'x-imdb-client-name: imdb-web-next' -H 'User-Agent: Mozilla/5.0' \
//   -d '{"query":"query { chartTitles(chart: {chartType: TOP_RATED_TV_SHOWS}, first: 2) { total edges { currentRank node { id titleText { text } releaseYear { year } } } } }"}'
const REAL_GRAPHQL_RESPONSE_FIRST_2 = {
  data: {
    data: {
      chartTitles: {
        total: 250,
        edges: [
          {
            currentRank: 1,
            node: {
              id: 'tt0903747',
              titleText: { text: 'Breaking Bad' },
              releaseYear: { year: 2008 },
            },
          },
          {
            currentRank: 2,
            node: {
              id: 'tt5491994',
              titleText: { text: 'Planet Earth II' },
              releaseYear: { year: 2016 },
            },
          },
        ],
      },
    },
  },
};

// Real GraphQL response captured 24/09/2026 via:
// curl -X POST https://caching.graphql.imdb.com/ -H 'Content-Type: application/json' \
//   -H 'x-imdb-client-name: imdb-web-next' -H 'User-Agent: Mozilla/5.0' \
//   -d '{"query":"query { boxOfficeWeekendChart(limit: 3) { entries { title { id titleText { text } releaseYear { year } } } } }"}'
const REAL_BOX_OFFICE_RESPONSE = {
  data: {
    data: {
      boxOfficeWeekendChart: {
        entries: [
          {
            title: {
              id: 'tt35538033',
              titleText: { text: 'Resident Evil' },
              releaseYear: { year: 2026 },
            },
          },
          {
            title: {
              id: 'tt32588798',
              titleText: { text: 'Practical Magic 2' },
              releaseYear: { year: 2026 },
            },
          },
          {
            title: {
              id: 'tt22084616',
              titleText: { text: 'Spider-Man: Brand New Day' },
              releaseYear: { year: 2026 },
            },
          },
        ],
      },
    },
  },
};

describe('fetchImdbChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a mapped chart via GraphQL, preserving rank order and mapping fields', async () => {
    vi.mocked(axios.post).mockResolvedValue(REAL_GRAPHQL_RESPONSE);

    const items = await fetchImdbChart('/chart/toptv/', 5);

    expect(axios.post).toHaveBeenCalledWith(
      'https://caching.graphql.imdb.com/',
      expect.objectContaining({
        query: expect.stringContaining('TOP_RATED_TV_SHOWS'),
      }),
      expect.any(Object)
    );
    expect(items).toEqual([
      { imdbId: 'tt0903747', title: 'Breaking Bad', year: 2008, type: 'tv' },
      {
        imdbId: 'tt5491994',
        title: 'Planet Earth II',
        year: 2016,
        type: 'tv',
      },
      { imdbId: 'tt0795176', title: 'Planet Earth', year: 2006, type: 'tv' },
      {
        imdbId: 'tt0185906',
        title: 'Band of Brothers',
        year: 2001,
        type: 'tv',
      },
      { imdbId: 'tt7366338', title: 'Chernobyl', year: 2019, type: 'tv' },
    ]);
  });

  it('respects the limit', async () => {
    vi.mocked(axios.post).mockResolvedValue(REAL_GRAPHQL_RESPONSE_FIRST_2);

    const items = await fetchImdbChart('/chart/toptv/', 2);

    expect(items).toHaveLength(2);
    expect(items[0].imdbId).toBe('tt0903747');
    expect(items[1].imdbId).toBe('tt5491994');
  });

  it('fetches box office via the boxOfficeWeekendChart query, preserving weekend rank order', async () => {
    vi.mocked(axios.post).mockResolvedValue(REAL_BOX_OFFICE_RESPONSE);

    const items = await fetchImdbChart('/chart/boxoffice/', 3);

    expect(axios.post).toHaveBeenCalledWith(
      'https://caching.graphql.imdb.com/',
      expect.objectContaining({
        query: expect.stringContaining('boxOfficeWeekendChart'),
      }),
      expect.any(Object)
    );
    expect(items).toEqual([
      {
        imdbId: 'tt35538033',
        title: 'Resident Evil',
        year: 2026,
        type: 'movie',
      },
      {
        imdbId: 'tt32588798',
        title: 'Practical Magic 2',
        year: 2026,
        type: 'movie',
      },
      {
        imdbId: 'tt22084616',
        title: 'Spider-Man: Brand New Day',
        year: 2026,
        type: 'movie',
      },
    ]);
  });
});

describe('ImdbAPI.getTopList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes TOP_250_TV through the GraphQL chart fetch', async () => {
    vi.mocked(axios.post).mockResolvedValue(REAL_GRAPHQL_RESPONSE);

    const api = new ImdbAPI();
    const items = await api.getTopList(ImdbTopList.TOP_250_TV, 5);

    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({
      imdbId: 'tt0903747',
      title: 'Breaking Bad',
      year: 2008,
      type: 'tv',
    });
  });
});

describe('fetchImdbChart response validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when the response has no usable data payload', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {}, status: 200 });

    await expect(fetchImdbChart('/chart/toptv/', 5)).rejects.toThrow(
      /no data/i
    );
  });

  it('throws when the chart has zero edges instead of returning []', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { data: { chartTitles: { edges: [] } } },
      status: 200,
    });

    await expect(fetchImdbChart('/chart/toptv/', 5)).rejects.toThrow(
      /returned no items/i
    );
  });

  it('throws instead of silently dropping a row with a missing node', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        data: {
          chartTitles: {
            total: 3,
            edges: [
              {
                currentRank: 1,
                node: {
                  id: 'tt0903747',
                  titleText: { text: 'Breaking Bad' },
                  releaseYear: { year: 2008 },
                },
              },
              { currentRank: 2, node: null },
              {
                currentRank: 3,
                node: {
                  id: 'tt0795176',
                  titleText: { text: 'Planet Earth' },
                  releaseYear: { year: 2006 },
                },
              },
            ],
          },
        },
      },
      status: 200,
    });

    await expect(fetchImdbChart('/chart/toptv/', 5)).rejects.toThrow(
      /incomplete row/i
    );
  });

  it('throws on a GraphQL errors[] response', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        errors: [{ message: 'Value "BOGUS" does not exist in enum' }],
      },
      status: 400,
    });

    await expect(fetchImdbChart('/chart/toptv/', 5)).rejects.toThrow(/BOGUS/);
  });

  it('rejects box office the same way: zero entries throws, not []', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { data: { boxOfficeWeekendChart: { entries: [] } } },
      status: 200,
    });

    await expect(fetchImdbChart('/chart/boxoffice/', 10)).rejects.toThrow(
      /returned no items/i
    );
  });

  it('throws on a gapped/out-of-order rank sequence (e.g. [1, 3])', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        data: {
          chartTitles: {
            total: 2,
            edges: [
              {
                currentRank: 1,
                node: {
                  id: 'tt0903747',
                  titleText: { text: 'Breaking Bad' },
                  releaseYear: { year: 2008 },
                },
              },
              {
                currentRank: 3,
                node: {
                  id: 'tt0795176',
                  titleText: { text: 'Planet Earth' },
                  releaseYear: { year: 2006 },
                },
              },
            ],
          },
        },
      },
      status: 200,
    });

    await expect(fetchImdbChart('/chart/toptv/', 5)).rejects.toThrow(
      /out-of-order or gapped rank/i
    );
  });

  it('throws on a truncated tail (total 250, requested 250, got 249)', async () => {
    const edges = Array.from({ length: 249 }, (_, i) => ({
      currentRank: i + 1,
      node: {
        id: `tt${1000000 + i}`,
        titleText: { text: `Movie ${i + 1}` },
        releaseYear: { year: 2000 },
      },
    }));

    vi.mocked(axios.post).mockResolvedValue({
      data: {
        data: {
          chartTitles: {
            total: 250,
            edges,
          },
        },
      },
      status: 200,
    });

    await expect(fetchImdbChart('/chart/top/', 250)).rejects.toThrow(
      /truncated tail/i
    );
  });
});

describe('Top 250 cache resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the warm cache after a failed refresh instead of clearing it', async () => {
    const api = new ImdbAPI();

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        data: {
          chartTitles: {
            total: 2,
            edges: [
              {
                currentRank: 1,
                node: {
                  id: 'tt1111111',
                  titleText: { text: 'Movie One' },
                  releaseYear: { year: 2000 },
                },
              },
              {
                currentRank: 2,
                node: {
                  id: 'tt2222222',
                  titleText: { text: 'Movie Two' },
                  releaseYear: { year: 2001 },
                },
              },
            ],
          },
        },
      },
      status: 200,
    });

    const first = await api.checkTop250('tt1111111', 'movie');
    expect(first).toEqual({ isTop250: true, rank: 1 });

    // Force the next lookup to attempt a refresh (simulate the 24h TTL expiring).
    (
      api as unknown as { top250LastRefresh: { movies?: number } }
    ).top250LastRefresh.movies = 0;

    // A 200 with zero items - the exact shape that used to be swallowed as [].
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { data: { chartTitles: { edges: [] } } },
      status: 200,
    });

    const second = await api.checkTop250('tt1111111', 'movie');

    // The failed refresh must NOT have cleared the cache built by the first call.
    expect(second).toEqual({ isTop250: true, rank: 1 });
  });
});
