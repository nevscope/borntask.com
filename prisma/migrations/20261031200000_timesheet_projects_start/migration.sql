-- AlterTable
ALTER TABLE `Workspace` ADD COLUMN `timesheetsStartOn` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `acceptsTimesheets` BOOLEAN NOT NULL DEFAULT false;
