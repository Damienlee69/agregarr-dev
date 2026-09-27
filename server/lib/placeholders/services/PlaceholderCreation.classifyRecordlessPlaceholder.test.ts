import { describe, expect, it } from 'vitest';
import { classifyRecordlessPlaceholder } from './PlaceholderCreation';

describe('classifyRecordlessPlaceholder', () => {
  it("adopts when the tmdbId is in this sync's creation candidates", () => {
    expect(
      classifyRecordlessPlaceholder({
        inCreationCandidates: true,
        inFullSource: false,
        otherPossibleOwners: 0,
      })
    ).toBe('adopt');
  });

  // Bug this fix closes: filtered out of candidates but still in the full source must adopt, not delete.
  it('adopts when NOT in creation candidates but IS in the full source', () => {
    expect(
      classifyRecordlessPlaceholder({
        inCreationCandidates: false,
        inFullSource: true,
        otherPossibleOwners: 0,
      })
    ).toBe('adopt');
  });

  it('leaves when not in either source but another config could own it', () => {
    expect(
      classifyRecordlessPlaceholder({
        inCreationCandidates: false,
        inFullSource: false,
        otherPossibleOwners: 1,
      })
    ).toBe('leave');
  });

  it('deletes when not in either source and no other possible owner', () => {
    expect(
      classifyRecordlessPlaceholder({
        inCreationCandidates: false,
        inFullSource: false,
        otherPossibleOwners: 0,
      })
    ).toBe('delete');
  });

  it('leaves when full-source membership is unknown, even with no other owner', () => {
    expect(
      classifyRecordlessPlaceholder({
        inCreationCandidates: false,
        inFullSource: undefined,
        otherPossibleOwners: 0,
      })
    ).toBe('leave');
  });
});
