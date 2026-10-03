import section2 from '@server/api/__fixtures__/plexLibrarySection2.json';
import sections from '@server/api/__fixtures__/plexLibrarySections.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@server/lib/settings', () => ({
  getSettings: () => ({
    clientId: 'test-client',
    main: {},
    plex: { autoEmptyTrash: true },
  }),
}));
vi.mock('@server/datasource', () => ({ getRepository: vi.fn() }));
vi.mock('@server/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function setup() {
  const { default: PlexAPI } = await import('@server/api/plexapi');
  const api = new PlexAPI({
    plexToken: 'test-token',
    plexSettings: { name: 'test', ip: '127.0.0.1', port: 32400, libraries: [] },
  });
  (api as unknown as { plexClient: unknown }).plexClient = {
    query: vi.fn(async (url: string) => {
      if (url === '/library/sections') return sections;
      if (url === '/library/sections/2') return section2;
      throw new Error(`unexpected ${url}`);
    }),
  };
  const scanLibrary = vi.spyOn(api, 'scanLibrary').mockResolvedValue();
  const emptyTrash = vi.spyOn(api, 'emptyTrash').mockResolvedValue();
  vi.spyOn(api, 'getAutoEmptyTrashEnabled').mockResolvedValue(false);
  return { api, scanLibrary, emptyTrash };
}

describe('getLibrarySectionPaths', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the section Location paths as Plex reports them', async () => {
    const { api } = await setup();
    expect(await api.getLibrarySectionPaths('2')).toEqual(['/data/tv']);
    expect(await api.getLibrarySectionPaths('3')).toEqual(['O:\\Media\\TV']);
  });

  it('returns [] for an unknown section', async () => {
    const { api } = await setup();
    expect(await api.getLibrarySectionPaths('999')).toEqual([]);
  });
});

describe('removeGhostEntries section guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips scans and the library-wide trash purge for directories Plex cannot see', async () => {
    const { removeGhostEntries } = await import('./PlaceholderCleanup');
    const { api, scanLibrary, emptyTrash } = await setup();

    await removeGhostEntries(api, '2', [
      { directory: '/mnt/elsewhere/tv/Some Show (2026)' },
    ]);

    expect(scanLibrary).not.toHaveBeenCalled();
    expect(emptyTrash).not.toHaveBeenCalled();
  });

  it('still scans a directory inside the section', async () => {
    const { removeGhostEntries } = await import('./PlaceholderCleanup');
    const { api, scanLibrary, emptyTrash } = await setup();

    await removeGhostEntries(api, '2', [
      { directory: '/data/tv/Some Show (2026)' },
    ]);

    expect(scanLibrary).toHaveBeenCalledWith('2', '/data/tv/Some Show (2026)');
    expect(emptyTrash).toHaveBeenCalledTimes(1);
  });
});

describe('removeGhostEntries with a Windows-style section path', () => {
  it('never matches a POSIX directory, so nothing is scanned or purged', async () => {
    const { removeGhostEntries } = await import('./PlaceholderCleanup');
    const { api, scanLibrary, emptyTrash } = await setup();

    await removeGhostEntries(api, '3', [
      { directory: '/data/tv/Some Show (2026)' },
    ]);

    expect(scanLibrary).not.toHaveBeenCalled();
    expect(emptyTrash).not.toHaveBeenCalled();
  });
});
