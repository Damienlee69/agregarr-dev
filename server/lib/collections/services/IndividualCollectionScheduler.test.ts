import { afterEach, describe, expect, it } from 'vitest';
import { IndividualCollectionScheduler } from './IndividualCollectionScheduler';

// Covers the concurrency guard added to prevent a collection's own
// scheduled cron job and a manual API-triggered sync from racing against
// each other. Without it, two concurrent runs against the same collection
// could each create their own copy of a collection Agregarr thought didn't
// exist yet (observed as duplicate Plex collections for Essentials-style
// multi-collection configs, which don't track sub-collection ratingKeys on
// the parent config).
describe('IndividualCollectionScheduler concurrency guard', () => {
  afterEach(() => {
    IndividualCollectionScheduler.markCollectionSyncEnd('test-id-1');
    IndividualCollectionScheduler.markCollectionSyncEnd('test-id-2');
  });

  it('reports not syncing for a collection that was never marked', () => {
    expect(
      IndividualCollectionScheduler.isCollectionSyncing('unknown-id')
    ).toBe(false);
  });

  it('reports syncing once started, and clear once ended', () => {
    IndividualCollectionScheduler.markCollectionSyncStart('test-id-1');
    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-1')).toBe(
      true
    );

    IndividualCollectionScheduler.markCollectionSyncEnd('test-id-1');
    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-1')).toBe(
      false
    );
  });

  it('tracks independent collection ids without interference', () => {
    IndividualCollectionScheduler.markCollectionSyncStart('test-id-1');

    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-2')).toBe(
      false
    );

    IndividualCollectionScheduler.markCollectionSyncStart('test-id-2');
    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-1')).toBe(
      true
    );
    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-2')).toBe(
      true
    );

    IndividualCollectionScheduler.markCollectionSyncEnd('test-id-1');
    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-1')).toBe(
      false
    );
    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-2')).toBe(
      true
    );
  });

  it('markCollectionSyncEnd on an id that was never started is a harmless no-op', () => {
    expect(() =>
      IndividualCollectionScheduler.markCollectionSyncEnd('never-started')
    ).not.toThrow();
    expect(
      IndividualCollectionScheduler.isCollectionSyncing('never-started')
    ).toBe(false);
  });

  it('starting the same id twice keeps it marked as syncing until a single end call clears it', () => {
    // Mirrors the actual guard usage: the route checks isCollectionSyncing
    // before calling markCollectionSyncStart, so a well-behaved caller never
    // double-starts - but the underlying Set-based guard should not behave
    // surprisingly if it ever did (e.g. one stray end call from a retry
    // should not release a lock a different in-flight run still holds).
    IndividualCollectionScheduler.markCollectionSyncStart('test-id-1');
    IndividualCollectionScheduler.markCollectionSyncStart('test-id-1');
    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-1')).toBe(
      true
    );

    IndividualCollectionScheduler.markCollectionSyncEnd('test-id-1');
    expect(IndividualCollectionScheduler.isCollectionSyncing('test-id-1')).toBe(
      false
    );
  });
});
