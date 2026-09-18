import OverseerrAPI from '@server/api/overseerr';
import type { OverseerrSettings } from '@server/lib/settings';

// Regexes Seerr's fork (rubeanie/seerr:ignore-media-regex) needs in
// ignoredPathPatterns so it doesn't mark Agregarr's placeholders as available.
export const SEERR_IGNORE_PATTERNS = [
  String.raw`\{edition-(Trailer|Placeholder|Coming Soon)\}\.mp4$`,
  String.raw`Season 00/S00E00\.Trailer\.mp4$`,
];

export function missingSeerrIgnorePatterns(existing: string[]): string[] {
  return SEERR_IGNORE_PATTERNS.filter((p) => !existing.includes(p));
}

export function mergeSeerrIgnorePatterns(existing: string[]): {
  merged: string[];
  added: string[];
} {
  const added = missingSeerrIgnorePatterns(existing);
  return { merged: [...existing, ...added], added };
}

export interface SeerrIgnorePatternsProbe {
  supported: boolean;
  missing: string[];
  patterns: string[];
}

export interface SeerrIgnorePatternsEnsureResult {
  supported: boolean;
  present: string[];
  added: string[];
  missing: string[];
}

/**
 * Read-only check of Seerr's Ignored Path Patterns support. Never writes.
 */
export async function probeSeerrIgnorePatterns(
  settings: OverseerrSettings
): Promise<SeerrIgnorePatternsProbe | null> {
  const api = new OverseerrAPI(settings);
  const main = await api.getMainSettings();
  if (!main) return null;

  if (main.ignoredPathPatterns === undefined) {
    return { supported: false, missing: [], patterns: [] };
  }

  return {
    supported: true,
    missing: missingSeerrIgnorePatterns(main.ignoredPathPatterns),
    patterns: main.ignoredPathPatterns,
  };
}

/**
 * Ensures Agregarr's placeholder patterns are present in Seerr's Ignored Path
 * Patterns, adding them if missing. Returns null only when Seerr is
 * unreachable.
 */
export async function ensureSeerrIgnorePatterns(
  settings: OverseerrSettings
): Promise<SeerrIgnorePatternsEnsureResult | null> {
  const api = new OverseerrAPI(settings);
  const main = await api.getMainSettings();
  if (!main) return null;

  if (main.ignoredPathPatterns === undefined) {
    return { supported: false, present: [], added: [], missing: [] };
  }

  const { merged, added } = mergeSeerrIgnorePatterns(main.ignoredPathPatterns);
  if (!added.length) {
    return {
      supported: true,
      present: main.ignoredPathPatterns,
      added: [],
      missing: [],
    };
  }

  const saved = await api.setIgnoredPathPatterns(merged);
  if (!saved) return null;

  // Seerr can drop entries server-side (invalid regex); only count what the
  // echoed list actually contains.
  const actuallyAdded = added.filter((p) => saved.includes(p));

  return {
    supported: true,
    present: saved,
    added: actuallyAdded,
    missing: missingSeerrIgnorePatterns(saved),
  };
}
