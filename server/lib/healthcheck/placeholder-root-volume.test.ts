import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  settings: undefined as unknown,
  unmounted: new Set<string>(),
}));

vi.mock('@server/lib/settings', async (importOriginal) => {
  const actual = (await importOriginal()) as { getSettings: () => unknown };
  return {
    ...actual,
    getSettings: () => state.settings ?? actual.getSettings(),
  };
});

vi.mock('@server/utils/mountedVolume', () => ({
  isOnContainerRootFs: (p: string) => state.unmounted.has(p),
}));

import { placeholderRootVolumeCheck } from '@server/lib/healthcheck';

const withRoots = (
  movie?: Record<string, string>,
  tv?: Record<string, string>
) => ({
  main: { placeholderMovieRootFolders: movie, placeholderTVRootFolders: tv },
});

describe('placeholderRootVolumeCheck', () => {
  beforeEach(() => {
    state.unmounted = new Set();
  });

  it('skips when no roots are configured', async () => {
    state.settings = withRoots({ '1': '' });
    expect((await placeholderRootVolumeCheck.run()).status).toBe('skipped');
  });

  it('is ok when every root is on a mounted volume', async () => {
    state.settings = withRoots({ '1': '/movies' }, { '2': '/tv' });
    expect((await placeholderRootVolumeCheck.run()).status).toBe('ok');
  });

  it('warns and names a root outside any volume', async () => {
    state.settings = withRoots({ '1': '/movies' }, { '2': '/data' });
    state.unmounted.add('/data');
    const r = await placeholderRootVolumeCheck.run();
    expect(r.status).toBe('warning');
    expect(r.message).toContain('/data');
    expect(r.message).not.toContain('/movies');
  });
});
