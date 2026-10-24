import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  collectionConfigs: [] as Record<string, unknown>[],
  overlayConfigs: [] as { libraryId: string }[],
  plexLibraries: [] as { key: string }[],
  missingKeys: new Set<string>(),
}));

vi.mock('@server/lib/settings', async (importOriginal) => {
  const actual = (await importOriginal()) as { getSettings: () => unknown };
  return {
    ...actual,
    getSettings: () => ({
      main: {},
      plex: { ip: '192.0.2.1', collectionConfigs: state.collectionConfigs },
    }),
  };
});

vi.mock('@server/lib/collections/core/CollectionUtilities', () => ({
  getAdminUser: async () => ({ plexToken: 'token' }),
}));

vi.mock('@server/datasource', () => ({
  getRepository: () => ({ find: async () => state.overlayConfigs }),
}));

vi.mock('@server/api/plexapi', () => ({
  default: class {
    async getLibraries() {
      return state.plexLibraries;
    }
    async getMetadataSafe(key: string) {
      return state.missingKeys.has(key)
        ? { status: 'not_found' }
        : { status: 'ok', meta: { type: 'collection' } };
    }
  },
}));

import {
  connectionHint,
  errorText,
  orphanedCollectionKeysCheck,
  plexLibrariesCheck,
} from '@server/lib/healthcheck';

describe('connectionHint', () => {
  it.each([
    [
      'connect ECONNREFUSED 127.0.0.1:8989',
      'localhost',
      'If Agregarr runs in Docker',
    ],
    ['', 'localhost', 'If Agregarr runs in Docker'],
    ['connect ECONNREFUSED 10.0.0.5:8989', 'sonarr', 'Nothing answered'],
    ['getaddrinfo ENOTFOUND sonarr', 'sonarr', "won't resolve"],
    ['timeout of 5000ms exceeded', 'sonarr', 'No reply in time'],
    ['Request failed with status code 401', 'localhost', 'Access denied'],
    ['Request failed with status code 403', 'sonarr', 'reverse proxy'],
    ['Request failed with status code 404', 'sonarr', 'URL base'],
    ['Request failed with status code 500', 'byparr', 'Check its logs'],
    ['self-signed certificate', 'sonarr', "service's certificate"],
    ['something odd', 'sonarr', "Couldn't connect"],
  ])('%s on %s', (msg, host, expected) => {
    expect(connectionHint(msg, host)).toContain(expected);
  });
});

describe('errorText', () => {
  it('falls back to the error code when axios leaves the message empty', () => {
    const err = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
    expect(errorText(err)).toBe('ECONNREFUSED');
  });

  it('adds a fetch cause code without repeating one already in the message', () => {
    const fetchErr = new Error('fetch failed', {
      cause: { code: 'ENOTFOUND' },
    });
    expect(errorText(fetchErr)).toBe('fetch failed ENOTFOUND');
    const axiosErr = Object.assign(
      new Error('connect ECONNREFUSED 10.0.0.5:8989'),
      { code: 'ECONNREFUSED' }
    );
    expect(errorText(axiosErr)).toBe('connect ECONNREFUSED 10.0.0.5:8989');
  });
});

describe('plexLibrariesCheck', () => {
  beforeEach(() => {
    state.plexLibraries = [{ key: '1' }];
    state.collectionConfigs = [];
    state.overlayConfigs = [];
  });

  it('points overlay-only leftovers at Library Configuration', async () => {
    state.overlayConfigs = [{ libraryId: '9' }];
    const r = await plexLibrariesCheck.run();
    expect(r.status).toBe('warning');
    expect(r.message).toContain('Library Configuration');
    expect(r.message).not.toContain('All Collections');
  });

  it('points collection-only leftovers at All Collections', async () => {
    state.collectionConfigs = [{ libraryId: '9' }];
    const r = await plexLibrariesCheck.run();
    expect(r.message).toContain('All Collections');
    expect(r.message).not.toContain('Library Configuration');
  });

  it('names both fixes when both kinds are left over', async () => {
    state.collectionConfigs = [{ libraryId: '9' }];
    state.overlayConfigs = [{ libraryId: '9' }];
    const r = await plexLibrariesCheck.run();
    expect(r.message).toContain('Library Configuration');
    expect(r.message).toContain('All Collections');
  });
});

describe('orphanedCollectionKeysCheck', () => {
  it('says the sync recreates it and how to stop that', async () => {
    state.collectionConfigs = [
      { id: 'a', name: 'Christmas', collectionRatingKey: '55' },
    ];
    state.missingKeys = new Set(['55']);
    const r = await orphanedCollectionKeysCheck.run();
    expect(r.status).toBe('warning');
    expect(r.message).toContain('Christmas');
    expect(r.message).toContain('Next sync puts it back');
    expect(r.message).toContain('All Collections');
  });
});
