import type { OverseerrSettings } from '@server/lib/settings';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockGetMainSettings, mockSetIgnoredPathPatterns } = vi.hoisted(() => ({
  mockGetMainSettings: vi.fn(),
  mockSetIgnoredPathPatterns: vi.fn(),
}));

vi.mock('@server/api/overseerr', () => ({
  // Regular function, not an arrow: `new OverseerrAPI()` needs a constructor
  default: vi.fn().mockImplementation(function () {
    return {
      getMainSettings: mockGetMainSettings,
      setIgnoredPathPatterns: mockSetIgnoredPathPatterns,
    };
  }),
}));

import {
  ensureSeerrIgnorePatterns,
  mergeSeerrIgnorePatterns,
  missingSeerrIgnorePatterns,
  SEERR_IGNORE_PATTERNS,
} from './seerrIgnorePatterns';

describe('missingSeerrIgnorePatterns', () => {
  it('reports both patterns missing from an empty list', () => {
    expect(missingSeerrIgnorePatterns([])).toEqual(SEERR_IGNORE_PATTERNS);
  });

  it('reports nothing missing when both patterns are already present', () => {
    expect(missingSeerrIgnorePatterns(SEERR_IGNORE_PATTERNS)).toEqual([]);
  });

  it('ignores unrelated user patterns', () => {
    const existing = ['^/data/media/.*\\.nfo$'];
    expect(missingSeerrIgnorePatterns(existing)).toEqual(SEERR_IGNORE_PATTERNS);
  });
});

describe('mergeSeerrIgnorePatterns', () => {
  it('appends missing patterns and keeps order', () => {
    const existing = ['^/data/media/.*\\.nfo$'];
    const { merged, added } = mergeSeerrIgnorePatterns(existing);
    expect(merged).toEqual([...existing, ...SEERR_IGNORE_PATTERNS]);
    expect(added).toEqual(SEERR_IGNORE_PATTERNS);
  });

  it('adds nothing when both patterns are already present', () => {
    const existing = ['^/data/media/.*\\.nfo$', ...SEERR_IGNORE_PATTERNS];
    const { merged, added } = mergeSeerrIgnorePatterns(existing);
    expect(merged).toEqual(existing);
    expect(added).toEqual([]);
  });
});

describe('ensureSeerrIgnorePatterns', () => {
  const settings = {} as OverseerrSettings;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not write when both patterns are already present', async () => {
    mockGetMainSettings.mockResolvedValue({
      ignoredPathPatterns: [...SEERR_IGNORE_PATTERNS],
    });

    const result = await ensureSeerrIgnorePatterns(settings);

    expect(mockSetIgnoredPathPatterns).not.toHaveBeenCalled();
    expect(result).toEqual({
      supported: true,
      present: SEERR_IGNORE_PATTERNS,
      added: [],
      missing: [],
    });
  });

  it('posts the merged list, appending the missing pattern in order', async () => {
    const existing = ['^/data/media/.*\\.nfo$', SEERR_IGNORE_PATTERNS[0]];
    const echoed = [...existing, SEERR_IGNORE_PATTERNS[1]];
    mockGetMainSettings.mockResolvedValue({ ignoredPathPatterns: existing });
    mockSetIgnoredPathPatterns.mockResolvedValue(echoed);

    const result = await ensureSeerrIgnorePatterns(settings);

    expect(mockSetIgnoredPathPatterns).toHaveBeenCalledWith(echoed);
    expect(result).toEqual({
      supported: true,
      present: echoed,
      added: [SEERR_IGNORE_PATTERNS[1]],
      missing: [],
    });
  });

  it('reconciles against the echo when Seerr drops one of ours', async () => {
    mockGetMainSettings.mockResolvedValue({ ignoredPathPatterns: [] });
    // Seerr rejects one pattern (e.g. treats it as invalid) and echoes only the other
    mockSetIgnoredPathPatterns.mockResolvedValue([SEERR_IGNORE_PATTERNS[0]]);

    const result = await ensureSeerrIgnorePatterns(settings);

    expect(result?.added).toEqual([SEERR_IGNORE_PATTERNS[0]]);
    expect(result?.missing).toEqual([SEERR_IGNORE_PATTERNS[1]]);
  });

  it('reports unsupported and never posts when ignoredPathPatterns is undefined', async () => {
    mockGetMainSettings.mockResolvedValue({ ignoredPathPatterns: undefined });

    const result = await ensureSeerrIgnorePatterns(settings);

    expect(mockSetIgnoredPathPatterns).not.toHaveBeenCalled();
    expect(result).toEqual({
      supported: false,
      present: [],
      added: [],
      missing: [],
    });
  });
});
