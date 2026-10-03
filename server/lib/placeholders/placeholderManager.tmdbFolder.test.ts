import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsState = vi.hoisted(() => ({ enabled: false }));
vi.mock('@server/lib/settings', () => ({
  getSettings: () => ({
    main: { placeholderFolderTmdbId: settingsState.enabled },
  }),
}));

import {
  createPlaceholder,
  resolvePlaceholderPaths,
  scanForMoviePlaceholders,
  wantsTmdbFolderHint,
} from './placeholderManager';

let root: string;
let trailer: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ph-tmdb-'));
  trailer = path.join(root, 'trailer.mp4');
  await fs.writeFile(trailer, 'x');
  root = path.join(root, 'lib');
  await fs.mkdir(root);
  settingsState.enabled = false;
});

afterEach(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

const odyssey = (tmdbId: number) => ({
  tmdbId,
  title: 'The Odyssey',
  year: 2026,
  mediaType: 'movie' as const,
  libraryPath: '/lib',
});

describe('movie placeholder folder tmdb hint', () => {
  it('hint on: same title+year movies get distinct folders, filename unchanged', () => {
    const a = resolvePlaceholderPaths({
      ...odyssey(1368337),
      tmdbFolderHint: true,
    });
    const b = resolvePlaceholderPaths({
      ...odyssey(1698863),
      tmdbFolderHint: true,
    });
    expect(a.folderName).toBe('The Odyssey (2026) {tmdb-1368337}');
    expect(b.folderName).toBe('The Odyssey (2026) {tmdb-1698863}');
    expect(a.markerPath).not.toBe(b.markerPath);
    expect(path.basename(a.destinationPath)).toBe(
      'The Odyssey (2026) {tmdb-1368337} {edition-Trailer}.mp4'
    );
  });

  it('hint off: paths are the legacy ones', () => {
    const a = resolvePlaceholderPaths(odyssey(1368337));
    expect(a.folderName).toBe('The Odyssey (2026)');
    expect(a.destinationPath).toBe(
      path.join(
        '/lib',
        'The Odyssey (2026)',
        'The Odyssey (2026) {tmdb-1368337} {edition-Trailer}.mp4'
      )
    );
  });

  it('wantsTmdbFolderHint follows the setting and ignores TV', async () => {
    const opts = { ...odyssey(1), libraryPath: root };
    expect(await wantsTmdbFolderHint(opts)).toBe(false);
    settingsState.enabled = true;
    expect(await wantsTmdbFolderHint(opts)).toBe(true);
    expect(await wantsTmdbFolderHint({ ...opts, mediaType: 'tv' })).toBe(false);
  });

  it('legacy folder for the same tmdb id is reused when the setting is on', async () => {
    const opts = { ...odyssey(1368337), libraryPath: root };
    await createPlaceholder({ ...opts, trailerPath: trailer });
    settingsState.enabled = true;
    expect(await wantsTmdbFolderHint(opts)).toBe(false);
    expect(await wantsTmdbFolderHint({ ...opts, tmdbId: 1698863 })).toBe(true);
  });

  it('keeps the legacy folder when the existence check fails for a reason other than ENOENT', async () => {
    settingsState.enabled = true;
    const spy = vi
      .spyOn(fs, 'access')
      .mockRejectedValue(
        Object.assign(new Error('denied'), { code: 'EACCES' })
      );
    try {
      expect(
        await wantsTmdbFolderHint({ ...odyssey(1), libraryPath: root })
      ).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('two same-title movies with the hint create two folders and both scan back', async () => {
    for (const id of [1368337, 1698863]) {
      await fs.writeFile(trailer, 'x');
      await createPlaceholder({
        ...odyssey(id),
        libraryPath: root,
        trailerPath: trailer,
        tmdbFolderHint: true,
      });
    }
    expect((await fs.readdir(root)).sort()).toEqual([
      'The Odyssey (2026) {tmdb-1368337}',
      'The Odyssey (2026) {tmdb-1698863}',
    ]);
    const found = await scanForMoviePlaceholders(root);
    expect(found.map((f) => [f.title, f.year, f.tmdbId]).sort()).toEqual([
      ['The Odyssey', 2026, 1368337],
      ['The Odyssey', 2026, 1698863],
    ]);
  });

  it('scan still parses legacy and = hint folders', async () => {
    const dir = path.join(root, 'Old Film (1999) {tmdb=55}');
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, 'Old Film (1999) {tmdb-55} {edition-Trailer}.mp4'),
      'x'
    );
    const legacy = path.join(root, 'Plain (2001)');
    await fs.mkdir(legacy);
    await fs.writeFile(
      path.join(legacy, 'Plain (2001) {tmdb-7} {edition-Trailer}.mp4'),
      'x'
    );
    const found = await scanForMoviePlaceholders(root);
    expect(found.map((f) => [f.title, f.year]).sort()).toEqual([
      ['Old Film', 1999],
      ['Plain', 2001],
    ]);
  });
});
