import { describe, expect, it, vi } from 'vitest';
import type { PlexLibraryItem } from './plexapi';
import PlexAPI from './plexapi';

type GetLibraryContents = (
  id: string,
  opts?: { offset?: number; size?: number }
) => Promise<{ totalSize: number; items: PlexLibraryItem[] }>;

// Calls the real method against a fake `this` so pagination logic is
// exercised without constructing a full PlexAPI instance (settings/DB/HTTP).
const callGetAllLibraryContents = (getLibraryContents: GetLibraryContents) =>
  (
    PlexAPI.prototype.getAllLibraryContents as (
      this: { getLibraryContents: GetLibraryContents },
      id: string
    ) => Promise<PlexLibraryItem[]>
  ).call({ getLibraryContents }, '1');

const item = (ratingKey: string) => ({ ratingKey } as PlexLibraryItem);

describe('getAllLibraryContents pagination', () => {
  it('pages through 500/500/200 for a totalSize of 1200, three calls at offsets 0/500/1000', async () => {
    const totalSize = 1200;
    const getLibraryContents = vi.fn<GetLibraryContents>(
      async (_id, { offset = 0, size = 500 } = {}) => {
        const remaining = Math.max(0, totalSize - offset);
        const count = Math.min(size, remaining);
        return {
          totalSize,
          items: Array.from({ length: count }, (_, i) => item(`${offset + i}`)),
        };
      }
    );

    const items = await callGetAllLibraryContents(getLibraryContents);

    expect(items).toHaveLength(1200);
    expect(getLibraryContents).toHaveBeenCalledTimes(3);
    expect(
      getLibraryContents.mock.calls.map(([, opts]) => opts?.offset)
    ).toEqual([0, 500, 1000]);
  });

  it('returns an empty array for a totalSize of 0', async () => {
    const getLibraryContents = vi.fn<GetLibraryContents>(async () => ({
      totalSize: 0,
      items: [],
    }));

    const items = await callGetAllLibraryContents(getLibraryContents);

    expect(items).toEqual([]);
    expect(getLibraryContents).toHaveBeenCalledTimes(1);
  });

  it('stops without hanging when a page returns empty before totalSize is reached', async () => {
    const getLibraryContents = vi
      .fn<GetLibraryContents>()
      .mockResolvedValueOnce({
        totalSize: 120,
        items: Array.from({ length: 50 }, (_, i) => item(`${i}`)),
      })
      .mockResolvedValueOnce({ totalSize: 120, items: [] });

    const items = await callGetAllLibraryContents(getLibraryContents);

    expect(items).toHaveLength(50);
    expect(getLibraryContents).toHaveBeenCalledTimes(2);
  });
});
