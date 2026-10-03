import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  root: '',
  trailer: '',
  downloads: 0,
}));

vi.mock('@server/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSettings: () => ({
    main: {
      placeholderFolderTmdbId: true,
      placeholderMovieRootFolders: { '1': state.root },
    },
    plex: { libraries: [] },
  }),
}));

vi.mock('@server/lib/placeholders/trailerDownload', () => ({
  downloadTrailer: async () => {
    state.downloads += 1;
    await fs.writeFile(state.trailer, 'x');
    return state.trailer;
  },
}));

import { createPlaceholderFile } from './PlaceholderCreation';

let base: string;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'ph-create-'));
  state.root = path.join(base, 'lib');
  state.trailer = path.join(base, 'trailer.mp4');
  state.downloads = 0;
  await fs.mkdir(state.root);
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

const movie = {
  tmdbId: 1368337,
  title: 'The Odyssey',
  year: 2026,
  mediaType: 'movie' as const,
};

describe('createPlaceholderFile with the tmdb folder hint', () => {
  it('writes where it checks, so a second sync is a no-op', async () => {
    const first = await createPlaceholderFile(movie as never, '1');
    expect(first).toBe(
      path.join(
        state.root,
        'The Odyssey (2026) {tmdb-1368337}',
        'The Odyssey (2026) {tmdb-1368337} {edition-Trailer}.mp4'
      )
    );
    expect(state.downloads).toBe(1);

    const second = await createPlaceholderFile(movie as never, '1');
    expect(second).toBe(first);
    expect(state.downloads).toBe(1);
    expect(await fs.readdir(state.root)).toEqual([
      'The Odyssey (2026) {tmdb-1368337}',
    ]);
  });
});
