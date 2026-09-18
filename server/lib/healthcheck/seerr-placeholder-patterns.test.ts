import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ settings: undefined as unknown }));

// Fall back to real settings: TemplateEngine calls getSettings() at import time
vi.mock('@server/lib/settings', async (importOriginal) => {
  const actual = (await importOriginal()) as { getSettings: () => unknown };
  return {
    ...actual,
    getSettings: () => state.settings ?? actual.getSettings(),
  };
});

const { mockProbe, mockEnsure } = vi.hoisted(() => ({
  mockProbe: vi.fn(),
  mockEnsure: vi.fn(),
}));
vi.mock('@server/lib/placeholders/seerrIgnorePatterns', () => ({
  probeSeerrIgnorePatterns: mockProbe,
  ensureSeerrIgnorePatterns: mockEnsure,
}));

import { seerrPlaceholderPatternsCheck } from '@server/lib/healthcheck';

const settingsWith = (
  overseerr: Record<string, unknown> | undefined,
  configs: Record<string, unknown>[]
) => ({
  overseerr,
  plex: { collectionConfigs: configs },
});

const configured = { hostname: 'seerr.local', apiKey: 'key' };

describe('seerrPlaceholderPatternsCheck', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips when Seerr is not configured', async () => {
    state.settings = settingsWith(undefined, [
      { createPlaceholdersForMissing: true },
    ]);
    expect((await seerrPlaceholderPatternsCheck.run()).status).toBe('skipped');
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('skips when no config creates placeholders', async () => {
    state.settings = settingsWith(configured, [
      { createPlaceholdersForMissing: false },
    ]);
    expect((await seerrPlaceholderPatternsCheck.run()).status).toBe('skipped');
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('skips when Seerr is unreachable', async () => {
    state.settings = settingsWith(configured, [
      { createPlaceholdersForMissing: true },
    ]);
    mockProbe.mockResolvedValue(null);
    expect((await seerrPlaceholderPatternsCheck.run()).status).toBe('skipped');
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('skips, not errors, when the probe throws (slow/unreachable Seerr)', async () => {
    state.settings = settingsWith(configured, [
      { createPlaceholdersForMissing: true },
    ]);
    mockProbe.mockRejectedValue(new Error('timeout'));
    expect((await seerrPlaceholderPatternsCheck.run()).status).toBe('skipped');
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('skips an unsupported build when the keep checkbox is off', async () => {
    state.settings = settingsWith(
      { ...configured, keepPlaceholderIgnorePatterns: false },
      [{ createPlaceholdersForMissing: true }]
    );
    mockProbe.mockResolvedValue({
      supported: false,
      missing: [],
      patterns: [],
    });
    expect((await seerrPlaceholderPatternsCheck.run()).status).toBe('skipped');
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('warns on an unsupported build when the keep checkbox is on', async () => {
    state.settings = settingsWith(
      { ...configured, keepPlaceholderIgnorePatterns: true },
      [{ createPlaceholdersForMissing: true }]
    );
    mockProbe.mockResolvedValue({
      supported: false,
      missing: [],
      patterns: [],
    });
    const result = await seerrPlaceholderPatternsCheck.run();
    expect(result.status).toBe('warning');
    expect(result.message).toContain('seerr-team/seerr#2606');
    expect(result.message).toContain('ignore-media-regex');
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('warns when patterns are missing and the keep checkbox is off', async () => {
    state.settings = settingsWith(
      { ...configured, keepPlaceholderIgnorePatterns: false },
      [{ createPlaceholdersForMissing: true }]
    );
    mockProbe.mockResolvedValue({
      supported: true,
      missing: ['some-pattern'],
      patterns: [],
    });
    const result = await seerrPlaceholderPatternsCheck.run();
    expect(result.status).toBe('warning');
    expect(result.message).toContain(
      'Keep placeholder ignore patterns in Seerr'
    );
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('warns Seerr rejected the patterns when missing even with the keep checkbox on', async () => {
    state.settings = settingsWith(
      { ...configured, keepPlaceholderIgnorePatterns: true },
      [{ createPlaceholdersForMissing: true }]
    );
    mockProbe.mockResolvedValue({
      supported: true,
      missing: ['some-pattern'],
      patterns: [],
    });
    const result = await seerrPlaceholderPatternsCheck.run();
    expect(result.status).toBe('warning');
    expect(result.message).toContain('Seerr rejected');
    expect(result.message).toContain('some-pattern');
    expect(result.message).not.toContain(
      'Keep placeholder ignore patterns in Seerr'
    );
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('is healthy when supported and both patterns are present', async () => {
    state.settings = settingsWith(
      { ...configured, keepPlaceholderIgnorePatterns: false },
      [{ createPlaceholdersForMissing: true }]
    );
    mockProbe.mockResolvedValue({ supported: true, missing: [], patterns: [] });
    expect((await seerrPlaceholderPatternsCheck.run()).status).toBe('ok');
    expect(mockEnsure).not.toHaveBeenCalled();
  });
});
