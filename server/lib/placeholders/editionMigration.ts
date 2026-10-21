import { getRepository } from '@server/datasource';
import { PlaceholderItem } from '@server/entity/PlaceholderItem';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import fs from 'fs/promises';
import path from 'path';

let migrationRunning = false;

/**
 * Migrate legacy TV placeholders to edition folders. Moves only the owned
 * placeholder files (S00E00.Trailer.mp4 + .comingsoon), never the entire
 * Season 00 directory — real specials are left in place.
 *
 * Resumable: includes in-progress rows (folder_moved, plex_discovered).
 */
export async function migrateToEditionPlaceholders(): Promise<{
  migrated: number;
  skipped: number;
  errors: number;
}> {
  if (migrationRunning) {
    return { migrated: 0, skipped: 0, errors: 0 };
  }
  migrationRunning = true;

  try {
    return await doMigration();
  } finally {
    migrationRunning = false;
  }
}

async function doMigration(): Promise<{
  migrated: number;
  skipped: number;
  errors: number;
}> {
  const repository = getRepository(PlaceholderItem);
  const settings = getSettings();

  // Include in-progress rows so crashes can resume
  const candidates = await repository
    .createQueryBuilder('item')
    .where('item.mediaType = :type', { type: 'tv' })
    .andWhere(
      '(item.editionMigrationState IS NULL OR item.editionMigrationState IN (:...states))',
      { states: ['pending', 'folder_moved', 'plex_discovered'] }
    )
    .getMany();

  const legacyRows = candidates.filter(
    (row) =>
      !row.placeholderPath.includes('{edition-') ||
      row.editionMigrationState === 'folder_moved' ||
      row.editionMigrationState === 'plex_discovered'
  );

  if (legacyRows.length === 0) {
    return { migrated: 0, skipped: 0, errors: 0 };
  }

  logger.info(`Edition migration: ${legacyRows.length} row(s) to process`, {
    label: 'Edition Migration',
  });

  // Group by (libraryRoot, showFolder) to handle same show in different libraries
  const groupKey = (row: PlaceholderItem): string => {
    const showFolder = path.dirname(path.dirname(row.placeholderPath));
    return `${row.configId}::${showFolder}`;
  };
  const byGroup = new Map<string, PlaceholderItem[]>();
  for (const row of legacyRows) {
    const key = groupKey(row);
    const group = byGroup.get(key) || [];
    group.push(row);
    byGroup.set(key, group);
  }

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [, rows] of byGroup) {
    const firstRow = rows[0];
    const showFolder = path.dirname(path.dirname(firstRow.placeholderPath));

    // Resolve library root — handle multi-source configId suffix
    const baseConfigId = firstRow.configId.replace(/-source-\d+$/, '');
    const config = (settings.plex.collectionConfigs || []).find(
      (c) => c.id === baseConfigId || c.id === firstRow.configId
    );
    const libraryId = config?.libraryId;
    const libraryRoot =
      libraryId && settings.main.placeholderTVRootFolders
        ? settings.main.placeholderTVRootFolders[libraryId]
        : undefined;

    if (!libraryRoot) {
      logger.warn('Edition migration: cannot resolve library root', {
        label: 'Edition Migration',
        showFolder,
        configId: firstRow.configId,
      });
      skipped += rows.length;
      continue;
    }

    const srcShowDir = path.join(libraryRoot, showFolder);
    const editionFolder = `${showFolder} {edition-Trailer}`;
    const dstShowDir = path.join(libraryRoot, editionFolder);
    const state = firstRow.editionMigrationState;

    try {
      // STEP 1: Move only the owned files (not the entire Season 00)
      if (!state || state === 'pending') {
        try {
          await fs.access(dstShowDir);
          logger.warn('Edition migration: destination exists, skipping', {
            label: 'Edition Migration',
            dstShowDir,
          });
          skipped += rows.length;
          continue;
        } catch {
          // Good — doesn't exist
        }

        const dstSeason = path.join(dstShowDir, 'Season 00');
        await fs.mkdir(dstSeason, { recursive: true });

        // Move only the placeholder file and marker — not the whole directory
        const srcFile = path.join(
          srcShowDir,
          'Season 00',
          'S00E00.Trailer.mp4'
        );
        const srcMarker = path.join(srcShowDir, 'Season 00', '.comingsoon');
        const dstFile = path.join(dstSeason, 'S00E00.Trailer.mp4');
        const dstMarker = path.join(dstSeason, '.comingsoon');

        await fs.rename(srcFile, dstFile);
        try {
          await fs.rename(srcMarker, dstMarker);
        } catch {
          /* marker optional */
        }

        // Copy .plexmatch (don't move — the real show may need it)
        try {
          await fs.copyFile(
            path.join(srcShowDir, '.plexmatch'),
            path.join(dstShowDir, '.plexmatch')
          );
        } catch {
          /* may not exist */
        }

        for (const row of rows) {
          await repository.update(row.id, {
            editionMigrationState: 'folder_moved',
          });
        }

        logger.info('Edition migration: files moved', {
          label: 'Edition Migration',
          title: firstRow.title,
          src: srcFile,
          dst: dstFile,
        });
      }

      // STEP 2: Update DB paths
      if (state === 'folder_moved' || !state || state === 'pending') {
        for (const row of rows) {
          const oldShowFolder = path.dirname(path.dirname(row.placeholderPath));
          const newPath = row.placeholderPath.replace(
            oldShowFolder,
            `${oldShowFolder} {edition-Trailer}`
          );
          await repository.update(row.id, {
            placeholderPath: newPath,
            editionMigrationState: 'plex_discovered',
            plexRatingKey: null as unknown as string,
          });
        }
      }

      // STEP 3: Mark complete — Plex discovery picks up the new edition on next scan
      for (const row of rows) {
        await repository.update(row.id, { editionMigrationState: 'completed' });
      }

      migrated += rows.length;
      logger.info('Edition migration: completed', {
        label: 'Edition Migration',
        title: firstRow.title,
        tmdbId: firstRow.tmdbId,
      });
    } catch (error) {
      errors += rows.length;
      logger.error('Edition migration: failed', {
        label: 'Edition Migration',
        showFolder,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { migrated, skipped, errors };
}
