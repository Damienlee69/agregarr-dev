import logger from '@server/logger';
import axios from 'axios';

/**
 * IMDb List Item interface
 */
export interface ImdbListItem {
  imdbId: string;
  title: string;
  year?: number;
  type: 'movie' | 'tv';
  tmdbId?: number; // Will be resolved separately
  isEpisode?: boolean; // True if this is an individual episode
  episodeInfo?: {
    episodeTitle?: string;
    season?: number;
    episode?: number;
  };
}

/**
 * IMDb List interface
 */
export interface ImdbList {
  id: string;
  title: string;
  description?: string;
  items: ImdbListItem[];
  totalItems: number;
}

/**
 * IMDb Top Lists enum for predefined lists
 */
export enum ImdbTopList {
  TOP_250_MOVIES = 'top250movies',
  TOP_250_ENGLISH_MOVIES = 'top250englishmovies',
  TOP_250_TV = 'top250tv',
  BOTTOM_100 = 'bottom100',
  POPULAR_MOVIES = 'popularmovies',
  POPULAR_TV = 'populartv',
  MOST_POPULAR_MOVIES = 'mostpopularmovies',
}

/**
 * IMDb Top 250 ranking result
 */
export interface ImdbTop250Result {
  isTop250: boolean;
  rank?: number; // 1-250 if in top 250
}

const IMDB_GRAPHQL_URL = 'https://caching.graphql.imdb.com/';
const IMDB_GRAPHQL_HEADERS = {
  'Content-Type': 'application/json',
  'x-imdb-client-name': 'imdb-web-next',
  'User-Agent': 'Mozilla/5.0',
};

interface ImdbChartConfig {
  expectedType: 'movie' | 'tv';
  graphqlChartType: string;
}

/**
 * Chart path -> chartTitles config. Single source of truth for both the Top
 * 250 ranking cache (getTopList) and the IMDb collection source's predefined
 * lists. Box office uses a different GraphQL query (see fetchImdbChart) and
 * has no entry here.
 */
const IMDB_CHART_CONFIG: Record<string, ImdbChartConfig> = {
  '/chart/top/': {
    expectedType: 'movie',
    graphqlChartType: 'TOP_RATED_MOVIES',
  },
  '/chart/top-english-movies/': {
    expectedType: 'movie',
    graphqlChartType: 'TOP_RATED_ENGLISH_MOVIES',
  },
  '/chart/toptv/': {
    expectedType: 'tv',
    graphqlChartType: 'TOP_RATED_TV_SHOWS',
  },
  '/chart/bottom/': {
    expectedType: 'movie',
    graphqlChartType: 'LOWEST_RATED_MOVIES',
  },
  '/chart/moviemeter/': {
    expectedType: 'movie',
    graphqlChartType: 'MOST_POPULAR_MOVIES',
  },
  '/chart/tvmeter/': {
    expectedType: 'tv',
    graphqlChartType: 'MOST_POPULAR_TV_SHOWS',
  },
};

interface ImdbGraphQLEnvelope<T> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * POST a query to the IMDb GraphQL endpoint and return its `data` payload.
 * Throws on a GraphQL errors[] response and on a 200/4xx with no usable
 * `data` (never returns an empty/partial result silently) - shared by every
 * chart adapter below.
 */
async function postImdbGraphQL<T>(
  query: string,
  chartName: string
): Promise<T> {
  const response = await axios.post<ImdbGraphQLEnvelope<T>>(
    IMDB_GRAPHQL_URL,
    { query },
    {
      timeout: 15000,
      headers: IMDB_GRAPHQL_HEADERS,
      // Surface a GraphQL validation error's message instead of a generic
      // Axios "Request failed with status code 400".
      validateStatus: (status) => status < 500,
    }
  );

  if (response.data?.errors?.length) {
    throw new Error(
      `IMDb GraphQL error fetching ${chartName}: ${response.data.errors
        .map((e) => e.message)
        .join('; ')}`
    );
  }

  if (!response.data?.data) {
    throw new Error(
      `IMDb GraphQL returned no data for ${chartName} (status ${response.status})`
    );
  }

  return response.data.data;
}

interface ChartTitlesData {
  chartTitles?: {
    total?: number;
    edges?: {
      currentRank?: number;
      node?: {
        id?: string;
        titleText?: { text?: string };
        releaseYear?: { year?: number } | null;
      };
    }[];
  };
}

async function fetchChartTitlesViaGraphQL(
  chartType: string,
  expectedType: 'movie' | 'tv',
  limit: number
): Promise<ImdbListItem[]> {
  const requestedFirst = Math.min(limit, 250);
  const query = `query { chartTitles(chart: {chartType: ${chartType}}, first: ${requestedFirst}) { total edges { currentRank node { id titleText { text } releaseYear { year } } } } }`;

  const data = await postImdbGraphQL<ChartTitlesData>(query, chartType);
  const edges = data.chartTitles?.edges;
  const total = data.chartTitles?.total;

  if (!edges || edges.length === 0) {
    throw new Error(`IMDb chart ${chartType} returned no items`);
  }

  if (typeof total !== 'number') {
    throw new Error(`IMDb chart ${chartType} response is missing total`);
  }

  const expectedCount = Math.min(requestedFirst, total);
  if (edges.length !== expectedCount) {
    throw new Error(
      `IMDb chart ${chartType} returned a truncated tail: got ${edges.length} items, expected ${expectedCount} (total=${total})`
    );
  }

  const items: ImdbListItem[] = [];
  for (let index = 0; index < edges.length; index++) {
    const edge = edges[index];
    const { id, titleText, releaseYear } = edge.node ?? {};
    if (!id || !titleText?.text) {
      throw new Error(
        `IMDb chart ${chartType} returned an incomplete row at rank ${
          edge.currentRank ?? 'unknown'
        }`
      );
    }
    if (edge.currentRank !== index + 1) {
      throw new Error(
        `IMDb chart ${chartType} returned an out-of-order or gapped rank: expected ${
          index + 1
        }, got ${edge.currentRank ?? 'unknown'}`
      );
    }
    items.push({
      imdbId: id,
      title: titleText.text,
      year: releaseYear?.year ?? undefined,
      type: expectedType,
    });
    if (items.length >= limit) break;
  }
  return items;
}

interface BoxOfficeData {
  boxOfficeWeekendChart?: {
    entries?: {
      title?: {
        id?: string;
        titleText?: { text?: string };
        releaseYear?: { year?: number } | null;
      };
    }[];
  };
}

// The weekend box office chart is inherently a top-10 list; IMDb ignores any
// higher `limit` and always returns (at most) 10 entries.
const BOX_OFFICE_CHART_SIZE = 10;

async function fetchBoxOfficeChart(limit: number): Promise<ImdbListItem[]> {
  const query = `query { boxOfficeWeekendChart(limit: ${Math.min(
    limit,
    BOX_OFFICE_CHART_SIZE
  )}) { entries { title { id titleText { text } releaseYear { year } } } } }`;

  const data = await postImdbGraphQL<BoxOfficeData>(
    query,
    'boxOfficeWeekendChart'
  );
  const entries = data.boxOfficeWeekendChart?.entries;

  if (!entries || entries.length === 0) {
    throw new Error('IMDb box office chart returned no items');
  }

  const items: ImdbListItem[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { id, titleText, releaseYear } = entries[i].title ?? {};
    if (!id || !titleText?.text) {
      throw new Error(
        `IMDb box office chart returned an incomplete row at position ${i + 1}`
      );
    }
    items.push({
      imdbId: id,
      title: titleText.text,
      year: releaseYear?.year ?? undefined,
      type: 'movie',
    });
    if (items.length >= limit) break;
  }
  return items;
}

/**
 * Fetch an IMDb chart's items by path (e.g. '/chart/top/') via GraphQL.
 *
 * Single shared entry point for both the Top 250 ranking cache and the IMDb
 * collection source's predefined lists.
 */
export async function fetchImdbChart(
  chartPath: string,
  limit: number
): Promise<ImdbListItem[]> {
  if (chartPath === '/chart/boxoffice/') {
    return fetchBoxOfficeChart(limit);
  }

  const config = IMDB_CHART_CONFIG[chartPath];
  if (!config) {
    throw new Error(
      `No GraphQL chart mapping for IMDb chart path: ${chartPath}`
    );
  }

  return fetchChartTitlesViaGraphQL(
    config.graphqlChartType,
    config.expectedType,
    limit
  );
}

/**
 * IMDb API client for fetching lists and popular content
 */
class ImdbAPI {
  // Cache for Top 250 lists (refreshed periodically)
  private top250MoviesCache: Map<string, number> = new Map();
  private top250TvCache: Map<string, number> = new Map();
  private top250LastRefresh: { movies?: number; tv?: number } = {};
  private readonly TOP250_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly TOP250_FAILURE_BACKOFF = 5 * 60 * 1000; // 5 minutes

  /**
   * Get a predefined IMDb top list
   */
  public async getTopList(
    listType: ImdbTopList,
    limit = 50
  ): Promise<ImdbListItem[]> {
    try {
      const chartPath = ImdbAPI.getChartPath(listType);
      return await fetchImdbChart(chartPath, limit);
    } catch (error) {
      logger.error(`Failed to fetch IMDb top list ${listType}:`, {
        label: 'IMDb API',
        error: error instanceof Error ? error.message : 'Unknown error',
        listType,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(
        `Failed to fetch IMDb top list: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private static getChartPath(listType: ImdbTopList): string {
    switch (listType) {
      case ImdbTopList.TOP_250_MOVIES:
        return '/chart/top/';
      case ImdbTopList.TOP_250_ENGLISH_MOVIES:
        return '/chart/top-english-movies/';
      case ImdbTopList.TOP_250_TV:
        return '/chart/toptv/';
      case ImdbTopList.BOTTOM_100:
        return '/chart/bottom/';
      case ImdbTopList.POPULAR_MOVIES:
        return '/chart/moviemeter/';
      case ImdbTopList.POPULAR_TV:
        return '/chart/tvmeter/';
      case ImdbTopList.MOST_POPULAR_MOVIES:
        return '/chart/boxoffice/';
      default:
        throw new Error(`Unknown IMDb top list type: ${listType}`);
    }
  }

  /**
   * Validate if a URL is a valid IMDb list URL
   */
  public static isValidListUrl(url: string): boolean {
    return /imdb\.com\/list\/ls\d+/.test(url);
  }

  /**
   * Get the predefined list label for display
   */
  public static getTopListLabel(listType: ImdbTopList): string {
    switch (listType) {
      case ImdbTopList.TOP_250_MOVIES:
        return 'Top 250 Movies';
      case ImdbTopList.TOP_250_ENGLISH_MOVIES:
        return 'Top 250 English Movies';
      case ImdbTopList.TOP_250_TV:
        return 'Top 250 TV Shows';
      case ImdbTopList.POPULAR_MOVIES:
        return 'Popular Movies';
      case ImdbTopList.POPULAR_TV:
        return 'Popular TV Shows';
      case ImdbTopList.MOST_POPULAR_MOVIES:
        return 'Most Popular Movies';
      default:
        return 'IMDb List';
    }
  }

  /**
   * Refresh Top 250 cache for a specific type
   */
  private async refreshTop250Cache(type: 'movie' | 'tv'): Promise<void> {
    try {
      const listType =
        type === 'movie' ? ImdbTopList.TOP_250_MOVIES : ImdbTopList.TOP_250_TV;

      logger.info(`Refreshing IMDb Top 250 ${type} cache`, {
        label: 'IMDb API',
      });

      const items = await this.getTopList(listType, 250);

      // Build cache map: imdbId -> rank (1-based)
      const cache =
        type === 'movie' ? this.top250MoviesCache : this.top250TvCache;
      cache.clear();

      // index + 1 == currentRank here: fetchChartTitlesViaGraphQL rejects any
      // response with missing rows, out-of-order/gapped ranks, or a truncated
      // tail (edges.length vs total), so positions never have gaps.
      items.forEach((item, index) => {
        cache.set(item.imdbId, index + 1); // Rank is 1-based
      });

      this.top250LastRefresh[type === 'movie' ? 'movies' : 'tv'] = Date.now();

      logger.info(`IMDb Top 250 ${type} cache refreshed`, {
        label: 'IMDb API',
        itemCount: cache.size,
      });
    } catch (error) {
      logger.error(`Failed to refresh IMDb Top 250 ${type} cache`, {
        label: 'IMDb API',
        error: error instanceof Error ? error.message : String(error),
      });
      // Back off on failure so checkTop250 doesn't refetch on every per-item
      // lookup during an outage; the still-warm cache keeps serving reads.
      this.top250LastRefresh[type === 'movie' ? 'movies' : 'tv'] =
        Date.now() - this.TOP250_CACHE_TTL + this.TOP250_FAILURE_BACKOFF;
    }
  }

  /**
   * Check if Top 250 cache needs refresh
   */
  private needsRefresh(type: 'movie' | 'tv'): boolean {
    const lastRefresh =
      this.top250LastRefresh[type === 'movie' ? 'movies' : 'tv'];
    if (!lastRefresh) return true;
    return Date.now() - lastRefresh > this.TOP250_CACHE_TTL;
  }

  /**
   * Check if an IMDb ID is in the Top 250 and get its ranking
   *
   * @param imdbId - IMDb ID (e.g., "tt0111161")
   * @param type - Media type ('movie' or 'tv')
   * @returns Top 250 result with isTop250 flag and optional rank
   */
  public async checkTop250(
    imdbId: string,
    type: 'movie' | 'tv'
  ): Promise<ImdbTop250Result> {
    try {
      // Refresh cache if needed
      if (this.needsRefresh(type)) {
        await this.refreshTop250Cache(type);
      }

      const cache =
        type === 'movie' ? this.top250MoviesCache : this.top250TvCache;
      const rank = cache.get(imdbId);

      if (rank !== undefined) {
        return {
          isTop250: true,
          rank,
        };
      }

      return {
        isTop250: false,
      };
    } catch (error) {
      logger.error(`Failed to check IMDb Top 250 for ${imdbId}`, {
        label: 'IMDb API',
        imdbId,
        type,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return false on error (don't fail overlay rendering)
      return {
        isTop250: false,
      };
    }
  }
}

export default ImdbAPI;
