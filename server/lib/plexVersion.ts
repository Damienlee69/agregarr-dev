import type PlexAPI from '@server/api/plexapi';

// Below this, PMS has actively exploited CVEs (CISA KEV) and no TV editions
export const PLEX_MIN_SUPPORTED_VERSION = '1.43.3';

let serverVersion: string | undefined;

export function setPlexServerVersion(version?: string): void {
  if (version) serverVersion = version;
}

export function plexVersionKnown(): boolean {
  return serverVersion !== undefined;
}

/** Reads the live server version; returns undefined when Plex can't be read. */
export async function fetchPlexVersion(
  plexClient: PlexAPI
): Promise<string | undefined> {
  try {
    const version: string | undefined = (await plexClient.getStatus())
      ?.MediaContainer?.version;
    setPlexServerVersion(version);
    return version;
  } catch {
    return undefined;
  }
}

export async function ensurePlexVersion(plexClient: PlexAPI): Promise<void> {
  if (!serverVersion) await fetchPlexVersion(plexClient);
}

/** False when the version is unknown or unparseable. */
export function plexVersionAtLeast(
  version: string | undefined,
  min: string
): boolean {
  if (!version) return false;
  const want = min.split('.').map(Number);
  const parts = version.split(/[.-]/).slice(0, want.length);
  if (parts.length < want.length || !parts.every((p) => /^\d+$/.test(p)))
    return false;
  const have = parts.map(Number);
  for (let i = 0; i < want.length; i++) {
    if (have[i] !== want[i]) return have[i] > want[i];
  }
  return true;
}

export function plexUnsupportedMessage(version: string): string {
  return `Agregarr supports Plex Media Server ${PLEX_MIN_SUPPORTED_VERSION} and newer. This server is running ${version}, which has security vulnerabilities that are being actively exploited (CISA KEV: CVE-2026-96652, CVE-2026-96654, CVE-2026-96655, CVE-2026-96656). Update Plex as soon as possible.`;
}

export function plexSupportsTvEditions(): boolean {
  return plexVersionAtLeast(serverVersion, PLEX_MIN_SUPPORTED_VERSION);
}
