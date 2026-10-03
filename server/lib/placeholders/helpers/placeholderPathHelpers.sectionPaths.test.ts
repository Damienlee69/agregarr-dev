import { isInsideSectionPaths } from '@server/lib/placeholders/helpers/placeholderPathHelpers';
import { describe, expect, it } from 'vitest';

describe('isInsideSectionPaths', () => {
  it('folds case for a Windows drive pair', () => {
    expect(
      isInsideSectionPaths(String.raw`O:\Media\TV\Show`, [
        String.raw`o:\media\tv`,
      ])
    ).toBe(true);
  });

  it('keeps POSIX comparisons case-sensitive', () => {
    expect(isInsideSectionPaths('/data/TV/Show', ['/data/tv'])).toBe(false);
    expect(isInsideSectionPaths('/data/tv/Show', ['/data/tv'])).toBe(true);
  });

  it('never matches a POSIX directory against a Windows section', () => {
    expect(
      isInsideSectionPaths('/data/tv/Show', [String.raw`O:\Media\TV`])
    ).toBe(false);
  });

  it('does not count the section root itself or a sibling prefix', () => {
    expect(isInsideSectionPaths('/data/tv', ['/data/tv'])).toBe(false);
    expect(isInsideSectionPaths('/data/tvx/Show', ['/data/tv'])).toBe(false);
  });
});
