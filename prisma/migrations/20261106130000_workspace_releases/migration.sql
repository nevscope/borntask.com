-- CreateTable
CREATE TABLE `Release` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Release_tenantId_date_idx`(`tenantId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `releaseId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Task_tenantId_releaseId_idx` ON `Task`(`tenantId`, `releaseId`);

-- AddForeignKey
ALTER TABLE `Release` ADD CONSTRAINT `Release_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_releaseId_fkey` FOREIGN KEY (`releaseId`) REFERENCES `Release`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
