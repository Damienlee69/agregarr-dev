import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRepo, mockCache } = vi.hoisted(() => ({
  mockRepo: {
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  },
  mockCache: {
    getIsInitialized: vi.fn(),
    getOverseerrRequests: vi.fn(),
  },
}));

vi.mock('@server/datasource', () => ({
  getRepository: vi.fn(() => mockRepo),
}));
vi.mock('@server/entity/MissingItemRequest', () => ({
  MissingItemRequest: class {},
}));
vi.mock('@server/entity/User', () => ({ User: class {} }));
vi.mock('@server/api/overseerr', () => ({
  default: vi.fn().mockImplementation(function () {
    return {};
  }),
}));
vi.mock('@server/api/themoviedb', () => ({
  default: vi.fn().mockImplementation(function () {
    return {};
  }),
}));
vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@server/lib/settings', () => ({
  getSettings: () => ({
    overseerr: { hostname: 'seerr.local', apiKey: 'key' },
  }),
}));
vi.mock('./MissingItemFilterService', () => ({
  missingItemFilterService: {},
}));
vi.mock('./ServiceUserManager', () => ({
  ServiceUserManager: class {},
}));
vi.mock('./SyncCacheService', () => ({ syncCacheService: mockCache }));

import { AutoRequestService } from './AutoRequestService';

function seed(
  mediaStatus: number,
  opts: { is4k?: boolean; status4k?: number; requestStatus?: string } = {}
) {
  const missingItem = {
    id: 7,
    title: 'Test Movie',
    tmdbId: 101,
    mediaType: 'movie',
    requestStatus: opts.requestStatus ?? 'processing',
    requestedBy: { externalOverseerrId: 202 },
  };
  const where = vi.fn().mockReturnThis();
  mockRepo.createQueryBuilder.mockReturnValue({
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    where,
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([missingItem]),
  });
  mockCache.getIsInitialized.mockReturnValue(true);
  mockCache.getOverseerrRequests.mockReturnValue([
    {
      id: 303,
      type: 'movie',
      status: 5,
      is4k: opts.is4k ?? false,
      requestedBy: { id: 202 },
      media: {
        tmdbId: 101,
        mediaType: 'movie',
        status: mediaStatus,
        status4k: opts.status4k,
      },
    },
  ]);
  return { where };
}

describe('syncMissingItemStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks item available when request media status is AVAILABLE', async () => {
    seed(5);
    await new AutoRequestService().syncMissingItemStatus();
    expect(mockRepo.update).toHaveBeenCalledWith(7, {
      requestStatus: 'available',
      overseerrRequestId: 303,
    });
  });

  it('marks item partially_available when request media status is PARTIALLY_AVAILABLE', async () => {
    seed(4);
    await new AutoRequestService().syncMissingItemStatus();
    expect(mockRepo.update).toHaveBeenCalledWith(7, {
      requestStatus: 'partially_available',
      overseerrRequestId: 303,
    });
  });

  it('uses the 4K media status for a 4K request', async () => {
    seed(5, { is4k: true, status4k: 3 });
    await new AutoRequestService().syncMissingItemStatus();
    expect(mockRepo.update).not.toHaveBeenCalled();

    vi.clearAllMocks();
    seed(3, { is4k: true, status4k: 5 });
    await new AutoRequestService().syncMissingItemStatus();
    expect(mockRepo.update).toHaveBeenCalledWith(7, {
      requestStatus: 'available',
      overseerrRequestId: 303,
    });
  });

  it('keeps re-checking partially available items until they are available', async () => {
    const { where } = seed(5, { requestStatus: 'partially_available' });
    await new AutoRequestService().syncMissingItemStatus();
    expect(where.mock.calls[0][1].statuses).toContain('partially_available');
    expect(mockRepo.update).toHaveBeenCalledWith(7, {
      requestStatus: 'available',
      overseerrRequestId: 303,
    });
  });
});
