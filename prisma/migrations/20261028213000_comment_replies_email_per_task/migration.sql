-- AlterTable
ALTER TABLE `User` ADD COLUMN `emailPerTask` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Comment` ADD COLUMN `parentId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Comment_parentId_idx` ON `Comment`(`parentId`);

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Comment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
