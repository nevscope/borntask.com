-- CreateTable
CREATE TABLE `Automation` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `onStatusSlug` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `roleSlug` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Automation_tenantId_projectId_idx`(`tenantId`, `projectId`),
    UNIQUE INDEX `Automation_projectId_onStatusSlug_action_key`(`projectId`, `onStatusSlug`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Automation` ADD CONSTRAINT `Automation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Automation` ADD CONSTRAINT `Automation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
