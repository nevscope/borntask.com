-- AlterTable
ALTER TABLE `Project` ADD COLUMN `workBreakdown` ENUM('off', 'stories', 'epics_stories') NOT NULL DEFAULT 'off';
ALTER TABLE `Project` ADD COLUMN `storiesNeedApproval` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `planningParentId` VARCHAR(191) NULL;
CREATE INDEX `Task_planningParentId_idx` ON `Task`(`planningParentId`);
ALTER TABLE `Task` ADD CONSTRAINT `Task_planningParentId_fkey` FOREIGN KEY (`planningParentId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
