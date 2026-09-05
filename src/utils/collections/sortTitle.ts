/**
 * Client-side mirror of the server's sort title rules
 * (server/lib/collections/core/CollectionUtilities.ts), kept here rather
 * than imported to avoid pulling server code across the client bundle
 * boundary.
 *
 * It lives in one module because it was previously hand-copied into each
 * component that needed it, and the copies drifted: the library list learned
 * to ignore a sort title Agregarr owns while the config form kept showing it,
 * so a demoted collection sorted under V while its Sort Title field still
 * read "ZZZ_Video Games". Anything mirroring the server belongs here, so a
 * server change has exactly one place to land on the client.
 */

// Must match LEADING_ARTICLE_PATTERN / normalizeSortTitleArticle in
// CollectionUtilities.ts.
const LEADING_ARTICLE_PATTERN = /^(The|A|An)\s+(.+)$/i;

// Must stay identical to the copy in CollectionUtilities.ts - see the note
// there on why these are explicit ranges rather than \p{P}.
const LEADING_PUNCTUATION_PATTERN =
  /^[\s\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u00A1\u00BF\u2010-\u2027]+/;

// Must match PROMOTED_SORT_TITLE_RANK_WIDTH in CollectionUtilities.ts. 3
// digits matches Kometa's !010_/!020_ convention; see that constant for why
// the width is an interop contract rather than cosmetics.
export const PROMOTED_SORT_TITLE_RANK_WIDTH = 3;

export type SortTitleArticleMode = 'strip' | 'moveToEnd' | 'off';

/**
 * The name as article handling would file it, mirroring what the server
 * writes to Plex so a list built here cannot disagree with Plex.
 */
export function normalizeArticleForDisplay(
  title: string,
  mode: SortTitleArticleMode | undefined
): string {
  if (!mode || mode === 'off') return title;
  const trimmed = title.replace(LEADING_PUNCTUATION_PATTERN, '') || title;
  const match = LEADING_ARTICLE_PATTERN.exec(trimmed);
  if (!match) return trimmed;
  const [, article, rest] = match;
  return mode === 'moveToEnd' ? `${rest}, ${article}` : rest;
}

/**
 * Mirrors isAgregarrOwnedSortTitle in CollectionUtilities.ts: true where the
 * value in Plex is one Agregarr wrote (and may therefore replace), false
 * where a human typed it in Plex and it has to be left alone.
 *
 * everManaged (everLibraryPromoted) covers the case the other checks cannot
 * see: a value written through a Sort Title override that has since been
 * cleared. Nothing records what that override produced, so "ZZZ_Video Games"
 * is indistinguishable from a human's edit without it.
 */
export function agregarrOwnsSortTitle(
  titleSort: string | undefined,
  name: string,
  articleNormalized: boolean | undefined,
  everManaged: boolean | undefined
): boolean {
  const current = titleSort?.trim();
  if (!current) return true;
  if (current === name.trim()) return true;
  if (/^!\d+_/.test(current)) return true;
  if (articleNormalized === true) return true;
  if (everManaged === true) return true;
  return (['strip', 'moveToEnd'] as const).some(
    (m) => current === normalizeArticleForDisplay(name, m)
  );
}

export const COLLECTION_NAME_SUFFIX = ' Collection';

/**
 * The name a sort title should be built from. Mirrors the server, which
 * keeps a suffix IT added out of the sort key - the suffix is decoration on
 * the title, so sorting off it would file the collection away from where its
 * real name says it belongs. A suffix the collection genuinely has, left
 * alone or stripped, is part of its name and stays.
 */
export function sortKeyForName(
  name: string,
  suffixMode?: 'leave' | 'strip' | 'add'
): string {
  if (suffixMode !== 'add') return name;
  if (!name.endsWith(COLLECTION_NAME_SUFFIX)) return name;
  return name.slice(0, -COLLECTION_NAME_SUFFIX.length).trimEnd() || name;
}
