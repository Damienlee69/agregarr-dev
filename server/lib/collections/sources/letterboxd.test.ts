import { LetterboxdCollectionSync } from '@server/lib/collections/sources/letterboxd';
import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@server/lib/settings', () => ({
  getSettings: () => ({ main: {}, plex: {} }),
}));
vi.mock('@server/api/themoviedb', () => ({ default: class {} }));

const fixture = (name: string) =>
  fs.readFileSync(
    path.join(__dirname, '..', 'utils', '__fixtures__', name),
    'utf-8'
  );

describe('parseLetterboxdListHtml on a cloned list', () => {
  const sync = new LetterboxdCollectionSync();

  it('ignores the "Cloned from" sidebar posters', () => {
    const items = sync.parseLetterboxdListHtml(
      fixture('letterboxd-cloned-list-page1.html'),
      9999
    );
    expect(items.map((i) => i.title)).toEqual([
      'Häxan',
      'Day of Wrath',
      'The White Reindeer',
    ]);
  });

  it('returns nothing past the end of the list', () => {
    const items = sync.parseLetterboxdListHtml(
      fixture('letterboxd-cloned-list-past-end.html'),
      9999
    );
    expect(items).toEqual([]);
  });
});
