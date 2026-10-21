import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlaceholderEditionColumns1791000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "coming_soon_item" ADD COLUMN "pendingRealRatingKey" varchar NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "coming_soon_item" ADD COLUMN "editionMigrationState" varchar NULL`
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // SQLite does not support DROP COLUMN before 3.35.0; these columns are nullable and harmless to keep.
  }
}
