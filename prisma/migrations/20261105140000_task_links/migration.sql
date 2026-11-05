-- CreateTable
CREATE TABLE `TaskLink` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `fromTaskId` VARCHAR(191) NOT NULL,
    `toTaskId` VARCHAR(191) NOT NULL,
    `kind` ENUM('blocks', 'relates', 'duplicates') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TaskLink_fromTaskId_toTaskId_kind_key`(`fromTaskId`, `toTaskId`, `kind`),
    INDEX `TaskLink_tenantId_toTaskId_idx`(`tenantId`, `toTaskId`),
    INDEX `TaskLink_tenantId_fromTaskId_idx`(`tenantId`, `fromTaskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TaskLink` ADD CONSTRAINT `TaskLink_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskLink` ADD CONSTRAINT `TaskLink_fromTaskId_fkey` FOREIGN KEY (`fromTaskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskLink` ADD CONSTRAINT `TaskLink_toTaskId_fkey` FOREIGN KEY (`toTaskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
