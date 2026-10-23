import path from 'path';

interface LibraryItem {
  ratingKey: string;
  editionTitle?: string;
  Guid?: { id: string }[];
}

export interface EditionRepointUpdate {
  relativePath: string;
  pendingRealRatingKey: string;
  editionRatingKey?: string;
}

/**
 * Decide the DB update when discovery sees real content for an edition
 * placeholder. Returns null when the matched item is the edition itself
 * (Sonarr reported a download before Plex has the real show).
 */
export function resolveEditionRepoint(
  libraryPath: string,
  markerPlaceholderPath: string,
  tmdbId: number,
  plexItem: { ratingKey: string; editionTitle?: string },
  libraryItems: LibraryItem[] = []
): EditionRepointUpdate | null {
  if (plexItem.editionTitle) return null;

  return {
    // DB rows store paths relative to the library root
    relativePath: path.relative(libraryPath, markerPlaceholderPath),
    pendingRealRatingKey: plexItem.ratingKey,
    editionRatingKey: findTrailerEditionRatingKey(libraryItems, tmdbId),
  };
}

/** The single Trailer edition carrying this TMDB id, or undefined if none or ambiguous. */
export function findTrailerEditionRatingKey(
  libraryItems: LibraryItem[] = [],
  tmdbId: number
): string | undefined {
  const tmdbGuid = `tmdb://${tmdbId}`;
  const editions = libraryItems.filter(
    (i) =>
      i.editionTitle?.toLowerCase() === 'trailer' &&
      i.Guid?.some((g) => g.id === tmdbGuid)
  );
  return editions.length === 1 ? editions[0].ratingKey : undefined;
}
