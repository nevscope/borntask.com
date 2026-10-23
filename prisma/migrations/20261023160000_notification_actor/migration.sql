-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `actorId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Notification_actorId_idx` ON `Notification`(`actorId`);
