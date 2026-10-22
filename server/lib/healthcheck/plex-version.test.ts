import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  version: undefined as string | undefined,
  fail: false,
}));

vi.mock('@server/lib/settings', async (importOriginal) => {
  const actual = (await importOriginal()) as { getSettings: () => unknown };
  return {
    ...actual,
    getSettings: () => ({ plex: { ip: '192.0.2.1' } }),
  };
});

vi.mock('@server/lib/collections/core/CollectionUtilities', () => ({
  getAdminUser: async () => ({ plexToken: 'token' }),
}));

vi.mock('@server/api/plexapi', () => ({
  default: class {
    async getStatus() {
      if (state.fail) throw new Error('ECONNREFUSED');
      return { MediaContainer: { version: state.version } };
    }
  },
}));

import { plexVersionCheck } from '@server/lib/healthcheck';

describe('plexVersionCheck', () => {
  beforeEach(() => {
    state.version = undefined;
    state.fail = false;
  });

  it('errors on a Plex version with known exploited vulnerabilities', async () => {
    state.version = '1.43.2.10162-0a6f2d7a9';
    const r = await plexVersionCheck.run();
    expect(r.status).toBe('error');
    expect(r.message).toContain('CVE-2026-96656');
    expect(r.message).toContain('supports Plex Media Server 1.43.3 and newer');
  });

  it('is ok on a patched Plex version', async () => {
    state.version = '1.43.5.11029-6bf8af3f0';
    expect((await plexVersionCheck.run()).status).toBe('ok');
  });

  it('skips when Plex is unreachable or reports no version', async () => {
    state.fail = true;
    expect((await plexVersionCheck.run()).status).toBe('skipped');
    state.fail = false;
    expect((await plexVersionCheck.run()).status).toBe('skipped');
  });
});
